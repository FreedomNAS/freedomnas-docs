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

The installer executes these 20 steps automatically, pausing only for
user input where necessary:

### Step 1 — Root check
Verifies the installer is running as root.

### Step 2 — Boot mode detection
Checks `/sys/firmware/efi` to determine UEFI or BIOS/Legacy mode.
This controls how partitions and GRUB are configured.

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
Uses `sgdisk` to create the partition layout:

=== "UEFI (4 partitions)"

    | # | Size | Type | Purpose |
    |---|------|------|---------|
    | 1 | 1 MB | BIOS boot | GRUB BIOS fallback |
    | 2 | 512 MB | EFI System | ESP (`/boot/efi`) |
    | 3 | 4 GB | Solaris (ZFS) | `bpool` |
    | 4 | Remaining | Solaris (ZFS) | `rpool` |

=== "BIOS/Legacy (3 partitions)"

    | # | Size | Type | Purpose |
    |---|------|------|---------|
    | 1 | 1 MB | BIOS boot | GRUB embedding |
    | 2 | 4 GB | Solaris (ZFS) | `bpool` |
    | 3 | Remaining | Solaris (ZFS) | `rpool` |

### Step 7 — Partition formatting
Formats the EFI partition as FAT32 (`mkfs.vfat -F32`) on UEFI systems.
ZFS partitions are not formatted here — ZFS handles its own formatting.

### Step 8 — ZFS pool creation
Creates two pools:

- **`bpool`** — boot pool with GRUB-compatible feature set (limited features)
- **`rpool`** — root pool with all features enabled

Dataset layout:

```
rpool/
├── ROOT/
│   └── debian          canmount=noauto, mountpoint=/   ← bootfs
├── home                canmount=on, mountpoint=/home
├── var/
│   └── log             canmount=on
└── .freedomnas         canmount=noauto, mountpoint=/etc/freedomnas/state
```

### Step 9 — Base system installation
Runs `debootstrap trixie /mnt` using the selected mirror.

### Step 10 — System configuration
- Writes `/etc/hostname`
- Writes `/etc/hosts`
- Generates `/etc/fstab` (EFI partition + ZFS entries)
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
`packages/core.json`.

### Step 15 — Bootloader
Installs GRUB:

=== "UEFI"
    ```
    grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=FreedomNAS
    ```

=== "BIOS"
    ```
    grub-install --target=i386-pc /dev/sdX
    ```

Then runs `update-grub` to generate `grub.cfg`.

### Step 16 — bpool import service
Creates a systemd service (or equivalent) to import `bpool` at boot before
the ZFS mount service runs. Required because `bpool` is not imported by the
standard ZFS import scan.

### Step 17 — WebUI startup
Writes `/etc/cron.d/freedomnas-webui` with an `@reboot` entry that launches
`supervisor.sh` — a shell script with a 5-failure circuit breaker that keeps
the WebUI process alive. Works on any init system.

### Step 18 — Save configuration
Writes the initial `config.yaml` to the `.freedomnas` ZFS dataset
(`/etc/freedomnas/state/config.yaml`). This file survives OS reinstallation.

### Step 19 — Cleanup
Unmounts all chroot bind mounts and exports the ZFS pools cleanly.

### Step 20 — Completion
Shows a summary and offers an optional reboot.

## Post-Installation

After rebooting, the WebUI is available at:

```
http://<hostname>:8080
```

Complete the first-run wizard to finish configuration.

[First-run setup guide →](first-run.md)
