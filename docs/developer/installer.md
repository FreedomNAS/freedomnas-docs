# Installer Flow

The `freedomnas-installer` is a Python + dialog TUI that provisions a
complete ZFS-on-root system. It runs before the WebUI exists.

## Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `setup.py` | Orchestrator — defines and executes the 19-step install order |
| `lib/installer_modules.py` | Logger, DialogManager (stderr-correct), Configuration, run_command helper |
| `lib/disk_installer.py` | `lsblk` detection, `/dev/disk/by-id/` resolution, unified 2-partition `sgdisk` layout |
| `lib/zfs_installer.py` | Single `rpool` creation (no bpool), dataset tree, `bootfs` property |
| `lib/system_installer.py` | Boot mode detection, mirror selection (14 countries), hostname, debootstrap, chroot bind mounts |
| `lib/users_installer.py` | Admin double-prompt, additional users loop, `chpasswd` via stdin |
| `lib/packages_installer.py` | `apt install` in chroot, firstboot WebUI supervisor with circuit breaker |
| `lib/bootloader_installer.py` | dracut UKI build, `zz-dracut-uki` hook, efibootmgr (UEFI) or Clover (BIOS) |

## Execution Order

See the [full installation guide](../getting-started/installation.md) for the
complete 20-step flow with details on each step.

## OS Detection

The installer auto-detects the OS using `platform.system()` and
`/etc/os-release`. It **never** asks the user to choose between editions.

## Recovery Mode

When the installer detects an existing ZFS pool with a `.freedomnas` dataset,
it offers disaster recovery:

1. Mount the `.freedomnas` dataset
2. Read `config.yaml`
3. Run `ReconciliationEngine` in `disaster_recovery` mode
4. Apply configuration in the fixed order (hostname → timezone → pools → users → services → shares)

## Boot Chain

`bootloader_installer.py` replaces GRUB with a dracut **Unified Kernel
Image (UKI)** — kernel + initramfs + cmdline bundled into a single PE
binary on the ESP. The load path then splits by firmware:

- **UEFI** — UKI registered directly via `efibootmgr`. No third-party bootloader.
- **BIOS** — vendored **Clover** (release 5173, pinned) provides
  BIOS→UEFI emulation (DUET/BiosBlockIO variant) so the same UKI is
  loaded on legacy hardware.

### UKI paths on the ESP

| File | Purpose |
|------|---------|
| `EFI/Linux/debian-uki.efi` | Active UKI — loaded on every normal boot |
| `EFI/Linux/debian-uki-previous.efi` | Previous UKI — rotated in by `zz-dracut-uki` on kernel update |
| `EFI/Linux/debian-recovery.efi` | Recovery UKI — `ro single`, rebuilt alongside active, never rotated |
| `EFI/FreedomNAS/boot.state` | `tries-left: 3` counter, reset by `zz-dracut-uki` on each new kernel |

### zz-dracut-uki hook

`assets/zz-dracut-uki` is a `dpkg` kernel post-install hook deployed to
`/etc/kernel/postinst.d/`. On every kernel install or update it:

1. Rotates the current UKI to `debian-uki-previous.efi`
2. Records the most recent `pre-update-*` ZFS snapshot name in
   `debian-uki-previous.snapshot` (pairing the old kernel with the
   matching filesystem state for potential rollback)
3. Rebuilds the active UKI via `dracut --force --uefi`
4. Rebuilds the recovery UKI (`ro single`)
5. Resets `boot.state` to `tries-left: 3`

The hook never aborts `dpkg`'s kernel install over a UKI or ZFS failure
— it logs and exits 0.

### Vendored Clover assets (`assets/clover/`)

| File | Role |
|------|------|
| `boot0ss` | MBR bootstrap (first 440 bytes written to disk, partition table preserved) |
| `boot1f32alt` | FAT32 VBR — BPB bytes 3–89 are merged from the original sector |
| `boot7` | DUET BiosBlockIO firmware, deployed to `ESP/boot/` |
| `CLOVERX64.efi` | Clover picker/BDS, deployed to `EFI/CLOVER/` |
| `BOOTX64.efi` | Generic UEFI fallback stub, deployed to `EFI/BOOT/` |

!!! warning "Do not bump the Clover version without hardware validation"
    Release 5163 is a known regression on some real BIOS hardware
    ([CloverBootloader#740](https://github.com/CloverHackyColor/CloverBootloader/issues/740)).
    Release 5173 is validated. Checksums are recorded in
    `assets/clover/README.md`.

## Supervisor Script

`packages_installer.py` writes `supervisor.sh` to `/usr/lib/freedomnas/webui/`:

```bash
#!/bin/sh
FAILURES=0
MAX_FAILURES=5

while true; do
    cd /usr/lib/freedomnas/webui
    uvicorn api.main:app --host 0.0.0.0 --port 8080
    EXIT_CODE=$?

    if [ "$EXIT_CODE" -eq 0 ]; then
        FAILURES=0
        continue
    fi

    FAILURES=$((FAILURES + 1))
    echo "$(date): WebUI exited with code $EXIT_CODE (failure $FAILURES/$MAX_FAILURES)"

    if [ "$FAILURES" -ge "$MAX_FAILURES" ]; then
        echo "$(date): Circuit breaker triggered — supervisor stopping"
        exit 1
    fi

    sleep 5
done
```

And writes `/etc/cron.d/freedomnas-webui`:

```
@reboot root /usr/lib/freedomnas/webui/supervisor.sh >> /var/log/freedomnas-webui.log 2>&1
```

## installer_modules.py — Base Infrastructure

`lib/installer_modules.py` provides the building blocks used by every other
installer module.

### Logger

Class-level static methods (`Logger.info`, `Logger.warn`, `Logger.error`).
Writes coloured output to the terminal and simultaneously to
`/var/log/freedomnas-install.log` (falls back to a tempfile if the path is
not writable).

### DialogManager

TUI dialogs via `dialog` (preferred) or `whiptail` (auto-detected fallback).
All output is captured via a temporary file — dialog writes the user's selection
to stderr, which cannot be `subprocess.PIPE`-captured reliably across all versions.

| Method | Widget |
|--------|--------|
| `msgbox(title, text, h, w)` | OK-only message |
| `yesno(title, text, h, w)` | Yes/No — returns `bool` |
| `defaultno(title, text, h, w)` | Yes/No defaulting to No |
| `menu(title, text, items, h, w, list_h)` | Scrollable menu — returns selected tag or `None` |
| `inputbox(title, text, init_text, h, w)` | Free text input — returns `str` or `None` |
| `passwordbox(title, text, h, w)` | Hidden password input |
| `gauge(title, text, percent, h, w)` | Progress bar (non-interactive) |

### Configuration

Mutable state bag shared across all installer modules via constructor
injection. Fields set during the install flow:

| Field | Set by | Example |
|-------|--------|---------|
| `os_edition` | `FreedomNASInstaller.__init__` | `"debian"` |
| `boot_mode` | `SystemInstaller.detect_boot_mode` | `"UEFI"` / `"BIOS"` |
| `disk` / `disk_by_id` | `DiskInstaller.select_disk` | `/dev/sda`, `/dev/disk/by-id/…` |
| `part1` / `part2` | `DiskInstaller.partition_disk` | `/dev/sda1`, `/dev/sda2` |
| `pool_name` | hardcoded | `"rpool"` |
| `hostname` | `SystemInstaller.prompt_hostname` | `"freedomnas"` |
| `debian_mirror` | `SystemInstaller.select_mirror` | `"http://deb.debian.org/debian"` |
| `username` | hardcoded | `"admin"` |
| `user_password` | `UsersInstaller.get_admin_password` | (never logged) |
| `additional_users` | `UsersInstaller.prompt_additional_users` | list of `{username, password, sudo}` |

### Subprocess helpers

```python
run_command(args, check=True, timeout=300)      # shell=False only
run_in_chroot(args, chroot_dir="/mnt", ...)     # prepends ["chroot", chroot_dir]
write_file(path, content, mode=0o644)           # creates parent dirs
```

`run_command` logs every invocation (`RUN: <command>`) and re-raises with a
human-readable error on failure.

## SystemInstaller Details

`lib/system_installer.py` — steps 2–3 and 9–11.

- **14 Debian mirrors** hardcoded, plus a "Custom URL" option
- `install_base_system()` runs `debootstrap --arch=amd64 trixie /mnt <mirror>`; installs
  `debootstrap` first if not present
- `configure_system()` writes:
  - `/mnt/etc/hostname`
  - `/mnt/etc/hosts` (includes FQDN as `hostname.local`)
  - `/mnt/etc/fstab` (ESP mount only — ZFS mounted by initramfs, not fstab)
  - `/mnt/etc/apt/sources.list` (trixie main contrib non-free non-free-firmware)
  - `/mnt/etc/timezone` + symlink `/etc/localtime`
- `setup_chroot()` bind-mounts `/dev`, `/dev/pts`, `/proc`, `/sys`, `/run`
  and copies `/etc/resolv.conf` for DNS inside the chroot

## UsersInstaller Details

`lib/users_installer.py` — steps 12–13.

- Admin password: double-prompt loop, minimum 8 characters
- Additional users: looping yesno until the user declines; each gets a
  sudo-access prompt and a double-prompt password
- `create_users_in_chroot()` creates accounts with `useradd -m -s /bin/bash`,
  sets group membership with `usermod -aG`, and sets passwords via
  `chroot /mnt chpasswd` with `input="{username}:{password}\n"` — the
  password is **never in the command string or args list**

## PackagesInstaller Details

`lib/packages_installer.py` — steps 14 and 16.

`_BASE_PACKAGES` includes these key packages:

| Package | Purpose |
|---------|---------|
| `linux-image-amd64` | Kernel — triggers `zz-dracut-uki` post-install hook |
| `zfsutils-linux`, `zfs-zed` | ZFS user-space tools |
| `zfs-dracut` | dracut module for ZFS root in the UKI |
| `dracut` | UKI builder |
| `efibootmgr` | UEFI boot entry management |
| `dosfstools` | `mkfs.vfat` for the ESP |
| `python3-fastapi`, `python3-uvicorn` | WebUI runtime |
| `python3-pam` | PAM authentication for the WebUI |
| `samba`, `nfs-kernel-server` | File sharing services |
| `topgrade` | Update manager |

After `apt-get install`, attempts `pip3 install freedomnas-core` (non-fatal).

## DialogManager Notes

- All dialog calls use a tempfile to capture stderr output (dialog writes the
  user's selection to stderr, not stdout)
- No `shell=True` in any `run_command` call
- Passwords are collected with `--passwordbox` and never logged
