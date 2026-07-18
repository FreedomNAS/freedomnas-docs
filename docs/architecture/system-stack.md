# System Stack

## Architecture Diagram

```
┌──────────────────────────────────────────────────────┐
│                       USER                           │
├──────────────┬───────────────────────┬───────────────┤
│  Installer   │        WebUI          │   fnas-cli    │
│ (dialog TUI) │      (FastAPI)        │  (deferred)   │
├──────────────┴───────────────────────┴───────────────┤
│                   CORE LIBRARY                       │
│  ┌──────────┬──────────┬────────────┬─────────────┐  │
│  │engine.py │config.py │reconcile.py│ modules/*.py │  │
│  └──────────┴──────────┴────────────┴─────────────┘  │
│  ┌──────────────────────────────────────────────────┐ │
│  │         orchestrator.py  (heartbeat + CB)        │ │
│  └──────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│              JSON/YAML TRANSLATOR LAYER              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ debian.json │  │freebsd.json │  │  arch.json  │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
│  ┌──────────────────────────────────────────────────┐ │
│  │  init/ systemd · openrc · runit · s6 · dinit    │ │
│  └──────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│                 KERNEL + FILESYSTEM                  │
│  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │  Root: Btrfs/ZFS │  │  Data: ZFS Pool          │  │
│  │  (OS snapshots)  │  │  (datasets, config)      │  │
│  └──────────────────┘  └──────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## The Golden Rule

!!! warning "Golden Rule — never violate this"
    **Python code must NEVER contain a native system command.**
    Every syscall is read from the JSON profile for the detected OS at runtime.

This rule is non-negotiable. It applies to:

- The core library (`engine.py`, `config.py`, …)
- The WebUI routes (`api/routes/*.py`)
- The installer (`setup.py`, `lib/*.py`)
- Any future component

If a command belongs to a specific OS, it belongs in a JSON profile — not in Python.

## Layers

### User-facing layer

Three interfaces reach FreedomNAS:

| Interface | Technology | Purpose |
|-----------|-----------|---------|
| **WebUI** | FastAPI + Jinja2 + vanilla JS | Daily management via browser |
| **Installer** | Python + `dialog` TUI | Full system provisioning |
| **fnas-cli** | Python CLI (deferred) | Terminal management |

All three communicate with the core library — never directly with the OS.

### Core library

| Module | Responsibility |
|--------|---------------|
| `engine.py` | Translates abstract actions → OS commands via JSON profiles |
| `config.py` | YAML configuration manager — shadow copy on ZFS dataset |
| `reconcile.py` | Diff and apply changes (used by installer) |
| `orchestrator.py` | Module lifecycle, heartbeat bus, circuit breaker |
| `backup_manager.py` | ZFS snapshot lifecycle and scheduling |
| `package_manager.py` | Abstract package install/remove via profiles |
| `modules/*.py` | Health check implementations (storage, network, shares, users, updates) |

### JSON/YAML translator layer

The profile layer has zero Python logic. It is pure data:

- **OS profiles** (`debian.json`, `freebsd.json`, `arch.json`): map abstract
  actions to OS-specific commands for users, network, packages, ZFS, Samba, NFS, system
- **Init profiles** (`init/systemd.json`, `init/openrc.json`, …): map service
  management actions (start, stop, enable, …) for each init system
- **Package categories** (`packages/samba-cifs.json`, …): map feature IDs to
  OS-specific package and service names

### Kernel + filesystem

| Layer | Debian | FreeBSD |
|-------|--------|---------|
| Root filesystem | ZFS (`rpool/ROOT/debian`) | ZFS (Boot Environments via `bectl`) |
| Boot | UKI on ESP via efibootmgr (UEFI) or Clover (BIOS) | Native ZFS boot |
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
│       ├── orchestrator.py
│       └── modules/
├── profiles/               ← freedomnas-profiles package
│   ├── debian.json
│   ├── freebsd.json
│   ├── arch.json
│   ├── init/
│   └── packages/
├── installer/              ← freedomnas-installer package
│   ├── setup.py
│   └── lib/
└── webui/                  ← freedomnas-webui package
    ├── api/
    ├── websocket/
    └── frontend/
```

## Python Import Resolution

The core is importable as `from freedomnas.engine import …` via a `.pth` file:

```
/usr/lib/python3/dist-packages/freedomnas-core.pth
→ /usr/lib/freedomnas/core
```

In development, the engine searches for profiles in this order:

1. `/usr/lib/freedomnas/profiles` (system install)
2. `../../freedomnas-profiles` (sibling repo in dev)
3. `../os_profiles`
4. `./os_profiles`
5. `/opt/freedomnas/lib/os_profiles`
