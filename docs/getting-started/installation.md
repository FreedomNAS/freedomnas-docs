# Installation (TUI Installer)

The FreedomNAS TUI installer provisions a complete ZFS-on-root system using
Python and the `dialog` tool. It requires no prior OS installation.

!!! warning "Data loss"
    The installer will partition the selected disk. All data on that disk
    will be destroyed. Use a dedicated disk.

## Prerequisites

- Bootable Debian live environment (or any Linux live system)
- FreedomNAS installer package installed (`freedomnas-installer`)
- Internet connection (for `debootstrap` and package download)
- Target disk with at least 16 GB

## Running the Installer

```bash
sudo freedomnas-install
```

The installer runs entirely in dialog TUI — no desktop required.

## Installation Steps

The installer executes these 19 steps automatically, pausing only for
user input where necessary:

### Step 1 — Root check
Verifies the installer is running as root.

### Step 2 — Boot mode detection
Checks `/sys/firmware/efi` to determine UEFI or BIOS/Legacy mode.
This controls how the boot chain is configured (efibootmgr vs Clover).

### Step 3 — Mirror selection
Presents a menu of 14 Debian mirror countries plus a custom URL option.
The selected mirror is used for `debootstrap` and `apt`.

### Step 4 — Hostname
Dialog input box. Letters, digits, and hyphens only. Example: `freedomnas`.

### Step 5 — Disk selection
Lists available disks via `lsblk`. Resolves the selected device to its
`/dev/disk/by-id/` path (stable across reboots).

!!! tip
    Always prefer `/dev/disk/by-id/` paths for ZFS pools. Device names
    like `/dev/sda` are not stable and can change after a reboot.

### Step 6 — Disk partitioning
Uses `sgdisk` to create a **unified 2-partition layout**, identical for
both UEFI and BIOS firmware:

| # | Size | Type | Purpose |
|---|------|------|---------|
| 1 | 512 MiB | EFI System (EF00) | ESP — holds the UKI and boot chain |
| 2 | Remaining | Solaris/ZFS (BF00) | `rpool` |

!!! note "No bpool, no BIOS-boot partition"
    There is no feature-limited `bpool` and no separate 1 MiB BIOS-boot
    partition. The Clover BIOS boot stages (`boot0`/`boot1`) write into the
    MBR gap and the ESP's own boot sector — they need no partition of their
    own. Nothing at boot time reads ZFS directly, so a feature-restricted
    pool has no purpose.

### Step 7 — Partition formatting
Formats the EFI partition (part 1) as FAT32 (`mkfs.vfat -F32 -n EFI`).
The rpool partition is not formatted here — ZFS handles its own on-disk format.

### Step 8 — ZFS pool creation
Creates a single, full-featured `rpool` on partition 2.

Dataset layout:

```
rpool/
├── ROOT/
│   └── debian       canmount=noauto, mountpoint=/    ← bootfs property set
├── home             setuid=off
├── var/
│   └── log          atime=on
└── .freedomnas      canmount=noauto, mountpoint=/etc/freedomnas/state
```

`/boot` is a plain directory inside `rpool/ROOT/debian` — the kernel and
initramfs live in the UKI on the ESP, not in ZFS.

### Step 9 — Base system installation
Runs `debootstrap trixie /mnt` using the selected mirror.

### Step 10 — System configuration
- Writes `/etc/hostname`
- Writes `/etc/hosts`
- Generates `/etc/fstab` (ESP entry only — ZFS is mounted by the initramfs)
- Configures `apt` sources for Debian trixie
- Sets timezone

### Step 11 — Chroot bind mounts
Binds `/dev`, `/dev/pts`, `/proc`, `/sys`, `/run` into `/mnt` for `chroot` use.

### Step 12 — Admin password
Double-prompt password box for the `admin` user. The password is passed to
`chpasswd` via stdin — never in the command string.

### Step 13 — Additional users (optional)
Looping dialog: ask whether to add another user. Each user gets a username,
password (double-prompt), and optional additional groups.

### Step 14 — Package installation
Runs `apt install` inside the chroot for all core packages defined in
`packages/core.json`. This includes `dracut` and `linux-image-amd64`,
which are required by step 15.

### Step 15 — Boot chain

The boot chain is built around a **dracut Unified Kernel Image (UKI)** —
a single PE binary (`debian-uki.efi`) that bundles the kernel, initramfs,
and kernel command line. How it is loaded depends on firmware:

=== "UEFI"

    1. ESP is mounted at `/mnt/boot/efi`
    2. `dracut` is invoked inside the chroot to build the UKI:
       ```
       dracut --force --uefi \
           --kernel-cmdline "root=ZFS=rpool/ROOT/debian rw" \
           /boot/efi/EFI/Linux/debian-uki.efi <kernel-version>
       ```
    3. `efibootmgr` registers the UKI as a UEFI boot entry:
       ```
       efibootmgr --create --disk <disk> --part 1 \
           --loader "\EFI\Linux\debian-uki.efi" --label "FreedomNAS"
       ```
    4. The `zz-dracut-uki` post-install hook is deployed to
       `/etc/kernel/postinst.d/` so future kernel updates rebuild the UKI
       automatically.

=== "BIOS/Legacy"

    1. ESP is mounted at `/mnt/boot/efi`
    2. `dracut` builds the UKI exactly as in UEFI mode (same file, same path)
    3. The `zz-dracut-uki` hook is deployed
    4. **Clover** (vendored, release 5173) bridges BIOS → UEFI emulation → UKI:
        - `boot0ss` (440 bytes) is written to the disk's MBR bootstrap area,
          preserving the partition table
        - `boot1f32alt` is written to the ESP's VBR, merging the original
          FAT32 BPB (bytes 3–89) so the volume stays valid
        - `boot7` (DUET/BiosBlockIO firmware) is copied to `ESP/boot/`
        - `CLOVERX64.efi` is copied to `EFI/CLOVER/`
        - `BOOTX64.efi` is copied to `EFI/BOOT/` (generic UEFI fallback)
        - `config.plist` is written to `EFI/CLOVER/` — configures
          Clover to load `\EFI\Linux\debian-uki.efi` with `Timeout=0`
          and `IgnoreNVRAMBoot=true`

**ESP contents after step 15:**

```
ESP/
├── EFI/
│   ├── Linux/
│   │   ├── debian-uki.efi          ← active UKI
│   │   ├── debian-uki-previous.efi ← previous UKI (populated by zz-dracut-uki on later updates)
│   │   └── debian-recovery.efi    ← recovery UKI (ro single, built alongside active)
│   ├── CLOVER/                     ← BIOS only
│   │   ├── CLOVERX64.efi
│   │   └── config.plist
│   ├── BOOT/                       ← BIOS only
│   │   └── BOOTX64.efi
│   └── FreedomNAS/
│       └── boot.state              ← tries-left counter (set by zz-dracut-uki)
└── boot/                           ← BIOS only
    └── boot7
```

!!! note "Clover version is pinned"
    The vendored Clover binaries are fixed at release 5173. Release 5163
    is a known regression on some hardware. Do not bump the version without
    re-running hardware validation. See `assets/clover/README.md`.

### Step 16 — Firstboot WebUI service
Writes the WebUI supervisor script and an `@reboot` cron entry so the
WebUI starts automatically after the first boot. The supervisor uses a
5-failure circuit breaker:

```bash
uvicorn api.main:app --host 0.0.0.0 --port 8080
```

### Step 17 — Save configuration
Writes the initial `config.yaml` to the `.freedomnas` ZFS dataset
(`/etc/freedomnas/state/config.yaml`). This file survives OS reinstallation.

### Step 18 — Cleanup
Unmounts the ESP (`/mnt/boot/efi`), all chroot bind mounts, and exports
the ZFS pools cleanly.

### Step 19 — Completion
Shows a summary (hostname, username) and offers an optional reboot.

## Post-Installation

After rebooting, the WebUI is available at:

```
http://<hostname>:8080
```

Complete the first-run wizard to finish configuration.

[First-run setup guide →](first-run.md)
