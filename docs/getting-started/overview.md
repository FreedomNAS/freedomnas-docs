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
Every run of build-images publishes an image for each edition it can
flash: Debian and FreeBSD, the official editions, and the community editions
Arch, Void, Gentoo and Artix (one image each for OpenRC, dinit and runit).

Use this if you're installing FreedomNAS from scratch on a dedicated
machine — it's the actively maintained path.

### Option B — Installer (clean install)

The profile-driven installer, run from any live/rescue environment of the
same OS family as the edition you want:

- Detects UEFI or BIOS boot mode
- Partitions the target disk and creates a single root pool (`rpool` unless
  you name it otherwise; no boot pool)
- Installs the base OS with the edition's own bootstrapper, or from a
  rootfs tarball
- Configures hostname, timezone, users, and the optional features
  (Samba, NFS, containers, …) you select
- Builds a dracut Unified Kernel Image and registers it via `efibootmgr`
  (UEFI) or vendored Clover (BIOS) — there is no GRUB step; FreeBSD uses
  its own native loader instead
- Installs FreedomNAS itself and sets up the WebUI with automatic restart

Use it when flashing an image isn't an option — hardware that can't be
flashed, or a console/ISO install.

[Installer guide →](installation.md)

### Option B2 — Installer (in-place)

Already running a supported OS? The same installer can turn *that* system
into a FreedomNAS without touching a disk: it installs the missing
packages, enables their services through the init profile, wires up the
WebUI, and records the configuration for later disaster recovery.

```bash
sudo freedomnas-install --mode inplace
```

### Option C — WebUI First-Run (existing system)

If FreedomNAS packages are already installed on a running system, open the
WebUI and complete the first-run wizard. It configures:

- Hostname and timezone
- OS edition — preselected from what the engine detected

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
