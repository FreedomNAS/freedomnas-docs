# System Stack

## Architecture Diagram

```
┌──────────────────────────────────────────────────────┐
│  Image Builder (offline, CI) → flash → USER           │
├──────────────┬───────────────────────┬───────────────┤
│  Installer   │        WebUI          │   fnas-cli    │
│(profile-driven)│    (FastAPI)        │  (deferred)   │
├──────────────┴───────────────────────┴───────────────┤
│                   CORE LIBRARY                       │
│  ┌──────────┬──────────┬────────────┬─────────────┐  │
│  │engine.py │config.py │reconcile.py│ keymgmt.py  │  │
│  └──────────┴──────────┴────────────┴─────────────┘  │
│  ┌──────────────────────────────────────────────────┐ │
│  │  module_loader.py → orchestrator.py (heartbeat)  │ │
│  │  modules/{storage,network,shares,users,updates}/ │ │
│  └──────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│              JSON/YAML TRANSLATOR LAYER              │
│  ┌─────────────┐  ┌──────────────────────────────┐  │
│  │  os/os-*.json│  │ storage/ · network/ · shares/ │  │
│  │ (shared base)│  │ users/ — per-module fragments │  │
│  └─────────────┘  └──────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐ │
│  │  installer/ installer-*.json (install-time only) │ │
│  └──────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐ │
│  │  init/ init-systemd · init-openrc · init-runit …│ │
│  └──────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│                 KERNEL + FILESYSTEM                  │
│  ┌──────────────────────┐  ┌────────────────────────┐│
│  │  Root: ZFS (rpool)   │  │  Data: ZFS Pool        ││
│  │  UKI on ESP (dracut) │  │  (datasets, config)    ││
│  └──────────────────────┘  └────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

The primary install path is a pre-built, flashable image from
`freedomnas-image-builder` (bootable on both UEFI and BIOS from the same
file) — see [Getting Started → Installation](../getting-started/installation.md).
The installer is the secondary path, for hardware that can't be flashed,
console/ISO installs, and turning an already-running system into a NAS
in place. It is profile-driven end to end — see
[Installer Flow](../developer/installer.md).

## The Golden Rule

!!! warning "Golden Rule — never violate this"
    **Python code must NEVER contain a native system command.**
    Every syscall is read from the JSON profile for the detected OS at runtime.

This rule is non-negotiable. It applies to:

- The core library (`engine.py`, `config.py`, …)
- The WebUI routes (`api/routes/*.py`)
- The installer (`setup.py`, `lib/*.py`) — commands *and* OS-specific
  file contents both come from profiles
- Any future component

If a command belongs to a specific OS, it belongs in a JSON profile — not in Python.

## Layers

### User-facing layer

Three interfaces reach FreedomNAS:

| Interface | Technology | Purpose |
|-----------|-----------|---------|
| **WebUI** | FastAPI + Jinja2 + vanilla JS | Daily management via browser |
| **Installer** | Python + `dialog` TUI, profile-driven — clean install or in-place | Full system provisioning |
| **fnas-cli** | Python CLI (deferred) | Terminal management |

All three communicate with the core library — never directly with the OS.

### Core library

| Module | Responsibility |
|--------|---------------|
| `engine.py` | Translates abstract actions → OS commands via JSON profiles |
| `config.py` | YAML configuration manager — shadow copy on ZFS dataset |
| `reconcile.py` | Diff and apply changes (installer recovery mode, firstboot) |
| `orchestrator.py` | Module lifecycle, heartbeat bus, circuit breaker |
| `module_loader.py` | Manifest-driven module discovery + registration — see [Orchestrator](orchestrator.md) |
| `package_manager.py` | Abstract package install/remove via profiles |
| `tls.py` | The WebUI's self-signed certificate, created once at first boot |
| `keymgmt.py` | Encrypted-pool keyslot wrapping/unwrapping and boot-time unlock |
| `modules/<name>/module.py` | Health check implementations (storage, network, shares, users, updates), each in its own `modules/<name>/` subpackage with a `manifest.json` |

### JSON/YAML translator layer

The profile layer has zero Python logic. It is pure data, split per module
(2026-09-02) — see [Profile System Overview](../profiles/overview.md):

- **Shared OS fragment** (`os/os-debian.json`, `os/os-freebsd.json`, `os/os-arch.json`):
  primitives no module owns — packages, bootloader, system info
- **Per-module fragments** (`storage/storage-<os>.json`, `network/network-<os>.json`,
  `shares/shares-<os>.json`, `users/users-<os>.json`): each module's own
  commands — ZFS/media/properties, network, Samba/NFS, users respectively
- **Init profiles** (`init/init-systemd.json`, `init/init-openrc.json`, …): map service
  management actions (start, stop, enable, …) for each init system
- **Package categories** (`packages/samba-cifs.json`, …): map feature IDs to
  OS-specific package and service names — a different thing from the
  per-module fragments above, see [Package Categories](../profiles/packages.md)

### Kernel + filesystem

| Layer | Debian | FreeBSD |
|-------|--------|---------|
| Root filesystem | ZFS (`rpool/ROOT/debian`) | ZFS (Boot Environments via `bectl`) |
| Boot | UKI on ESP via efibootmgr (UEFI) or Clover (BIOS) — both from the same image, see [Installation](../getting-started/installation.md) | Native ZFS-aware boot (`gptzfsboot`/`loader.efi`), no UKI/Clover needed |
| Data pool | ZFS (datapool) | ZFS (datapool) |
| Config persistence | ZFS dataset `.freedomnas` | ZFS dataset `.freedomnas` |

## Installed Filesystem Layout

```
/usr/lib/freedomnas/
├── core/                   ← freedomnas-core package
│   └── freedomnas/
│       ├── engine.py
│       ├── config.py
│       ├── reconcile.py
│       ├── keymgmt.py
│       ├── orchestrator.py
│       ├── module_loader.py
│       └── modules/
│           ├── storage/  {module.py, manifest.json, __init__.py}
│           ├── network/  (same layout)
│           ├── shares/   (same layout)
│           ├── users/    (same layout)
│           └── updates/  (same layout)
├── profiles/               ← freedomnas-profiles package
│   ├── os/          os-debian.json, os-freebsd.json, os-arch.json, …
│   ├── storage/      storage-<os>.json
│   ├── network/      network-<os>.json
│   ├── shares/        shares-<os>.json
│   ├── users/         users-<os>.json
│   ├── installer/    installer-<os>.json — partitioning, rootpool,
│   │                  bootstrap, chroot, file contents
│   ├── assets/       boot-chain assets (Clover, zz-dracut-uki) and
│   │                  boot-time scripts (firstboot.sh, supervisor.sh) —
│   │                  shared by the installer and freedomnas-image-builder
│   ├── init/          init-systemd.json, init-openrc.json, …
│   └── packages/
├── installer/              ← freedomnas-installer package
│   ├── setup.py
│   └── lib/           context.py + the per-step modules
└── webui/                  ← freedomnas-webui package
    ├── api/
    │   └── module_discovery.py   community-module WebUI mounting
    ├── websocket/
    └── frontend/
```

`freedomnas-image-builder` isn't installed onto the appliance itself — it
vendors `freedomnas-core`/`freedomnas-profiles`/`freedomnas-webui` wholesale
into the pre-built image at build time. See
[Getting Started → Installation](../getting-started/installation.md).

## Python Import Resolution

The core lives in `/usr/lib/freedomnas/core`, on no interpreter's default
path. Everything FreedomNAS starts puts it there itself: `firstboot.sh`,
`supervisor.sh` (and so the WebUI) and the scheduled jobs in cron all set
`PYTHONPATH=/usr/lib/freedomnas/core`. That holds on every edition and across
Python upgrades — site-packages is `/usr/lib/python3/dist-packages` only on
Debian, and elsewhere its name carries the Python version.

For running `python3 -m freedomnas` by hand, the installer also writes
`freedomnas-core.pth` into the directory the target's own `python3` reports
(`python.site_dir` in the installer profile), and the packages do the same:
`dh_python3` on Debian, `python_domodule` in the Gentoo overlay. After a
Python upgrade on a rolling edition that file may be left in the old
directory; the services are unaffected.

In development, the engine searches for profiles in this order:

1. `/usr/lib/freedomnas/profiles` (system install)
2. `../../freedomnas-profiles` (sibling repo in dev)
3. `../os_profiles`
4. `./os_profiles`
5. `/opt/freedomnas/lib/os_profiles`
