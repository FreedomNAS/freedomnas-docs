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

There are two ways to install FreedomNAS:

### Option A — TUI Installer (recommended for new systems)

The Python + dialog installer handles everything automatically:

- Detects UEFI or BIOS boot mode
- Partitions the target disk
- Creates ZFS pools (bpool + rpool)
- Installs the base OS via debootstrap
- Configures hostname, timezone, users
- Installs GRUB bootloader
- Sets up the WebUI with automatic restart

Use this if you're installing FreedomNAS from scratch on a dedicated machine.

[Installer guide →](installation.md)

### Option B — WebUI First-Run (existing system)

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
WebUI (FastAPI)  →  Core Engine  →  JSON Profile  →  OS
                                      debian.json
                                      freebsd.json
                                      arch.json
```

The WebUI never calls OS commands directly. Everything routes through the
Core Engine, which translates abstract actions (e.g. "create ZFS snapshot")
into the correct OS-specific command by reading the active JSON profile.

[Full architecture →](../architecture/system-stack.md)
