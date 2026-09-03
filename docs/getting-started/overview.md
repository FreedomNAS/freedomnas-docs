# Overview

## What is FreedomNAS?

FreedomNAS is a Software-Defined Storage Appliance. It provides a WebUI and
an automated installer to turn any compatible UNIX-like machine into a NAS
server — with ZFS storage, SMB/NFS file sharing, user management, container
updates, and more.

Unlike traditional NAS software, FreedomNAS never hardcodes OS-specific
commands in its code. Every syscall is delegated to a JSON translation profile
for the detected operating system. This means the same codebase runs on
Debian, FreeBSD, Arch Linux, and any other UNIX-like OS without modification.

## Installation Paths

There are two ways to install FreedomNAS on a dedicated machine, plus a
WebUI-only path for an already-installed system:

### Option A — Pre-built image (recommended for new systems)

`freedomnas-image-builder` publishes ready-to-flash OS images
(`{edition}.img.zst`) — write one to the target disk and boot it, the same
"flash and go" experience as Raspberry Pi OS. On first boot the image
imports any ZFS pools, unlocks encrypted ones, and either reconciles an
existing `.freedomnas` configuration or launches the first-run wizard.
Debian and FreeBSD images are the primary/official editions; Void and Artix
are early "exotic" community editions still being built out.

Use this if you're installing FreedomNAS from scratch on a dedicated
machine — it's the actively maintained path.

### Option B — TUI Installer (parked, still functional)

The Python + dialog installer handles everything automatically:

- Detects UEFI or BIOS boot mode
- Partitions the target disk
- Creates a single `rpool` (no separate boot pool)
- Installs the base OS via debootstrap
- Configures hostname, timezone, users
- Builds a dracut Unified Kernel Image and registers it via `efibootmgr`
  (UEFI) or vendored Clover (BIOS) — there is no GRUB step
- Sets up the WebUI with automatic restart

This installer is **parked** — superseded by the pre-built-image path
above (ADR-002) — but still works if you need to install onto a live/
running system by hand rather than flashing an image.

[Installer guide →](installation.md)

### Option C — WebUI First-Run (existing system)

If FreedomNAS packages are already installed on a running system, open the
WebUI and complete the first-run wizard. It configures:

- Hostname and timezone
- OS edition (Debian, FreeBSD, Arch…)
- Initial admin setup

Use this after manually installing the `.deb` packages on an existing Debian
system.

[First-run guide →](first-run.md)

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 64-bit x86 | Any modern multi-core |
| RAM | 2 GB | 8 GB+ (ZFS prefers more) |
| Boot disk | 16 GB | 32 GB SSD |
| Data disks | 1 × any | 2+ for redundancy (mirror/RAIDZ) |
| Network | 1 × Ethernet | 1 GbE+ |

## Architecture in Brief

```
WebUI (FastAPI)  →  Core Engine  →  JSON Profiles (merged)  →  OS
                                      os/os-debian.json  (shared base)
                                      + storage/storage-debian.json
                                      + network/network-debian.json
                                      + shares/shares-debian.json
                                      + users/users-debian.json
                                      + init/init-systemd.json
```

The WebUI never calls OS commands directly. Everything routes through the
Core Engine, which translates abstract actions (e.g. "create ZFS snapshot")
into the correct OS-specific command by reading the active JSON profile.

[Full architecture →](../architecture/system-stack.md)
