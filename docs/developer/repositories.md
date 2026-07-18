# Repository Structure

## Repositories

```
codeberg.org/FreedomNAS/
├── freedomnas-core        Engine + Config + Reconciler + Orchestrator + Modules
├── freedomnas-profiles    JSON translation profiles (OS + init + packages)
├── freedomnas-installer   TUI installer (Python + dialog)
├── freedomnas-webui       FastAPI WebUI + Jinja2 frontend
├── freedomnas-docs        This documentation site
├── freedomnas-debian      Debian APT packaging                 [deferred]
└── freedomnas-iso         ISO build system                     [deferred]
```

## Dependency Graph

Dependencies flow strictly one way. Never introduce a reverse dependency.

```
freedomnas-profiles   (no dependencies)
        │
        ▼
freedomnas-core       (depends on profiles at runtime via profile search paths)
        │
        ├──────────────────────┐
        ▼                      ▼
freedomnas-installer    freedomnas-webui
```

## Repository Scope

When working on a specific repository:

- Do NOT assume you should modify other repositories
- Do NOT move files between repositories without a clear reason
- Each task is scoped to the files explicitly involved

## Implementation Status (2026-06-27)

### freedomnas-core — COMPLETE

| File | Lines | Purpose |
|------|-------|---------|
| `engine.py` | 670 | OS-agnostic command executor |
| `config.py` | 686 | YAML configuration manager |
| `reconcile.py` | 546 | Desired-vs-current diff + apply |
| `orchestrator.py` | 333 | Module lifecycle + heartbeat bus |
| `backup_manager.py` | 276 | ZFS snapshot lifecycle |
| `package_manager.py` | 186 | Abstract package install/remove |
| `modules/storage.py` | 65 | ZFS pool health check |
| `modules/network.py` | 57 | Interface availability check |
| `modules/shares.py` | 81 | SMB/NFS service health check |
| `modules/users.py` | 64 | Configured user existence check |
| `modules/updates.py` | 49 | Topgrade configuration check |

### freedomnas-profiles — COMPLETE

| Type | Files |
|------|-------|
| OS profiles | `debian.json` (138 lines), `arch.json` (116), `freebsd.json` (111) |
| Init profiles | `systemd.json`, `openrc.json`, `runit.json`, `s6.json`, `dinit.json`, `bsd_rc.json` (~16 lines each) |
| Package categories | `MANIFEST.json`, `core.json`, `samba-cifs.json`, `nfs.json`, `containers.json`, `virtualization.json` |

### freedomnas-installer — COMPLETE

| File | Lines | Responsibility |
|------|-------|----------------|
| `setup.py` | 327 | Orchestrator — 20-step install flow |
| `lib/installer_modules.py` | 307 | Logger, DialogManager, Configuration, run_command |
| `lib/disk_installer.py` | 182 | lsblk, sgdisk UEFI/BIOS, mkfs.vfat |
| `lib/zfs_installer.py` | 117 | bpool/rpool creation, dataset layout |
| `lib/system_installer.py` | 209 | Boot mode, mirrors, debootstrap, chroot |
| `lib/users_installer.py` | 163 | Admin password, additional users, chpasswd |
| `lib/packages_installer.py` | 129 | apt in chroot, supervisor.sh |
| `lib/bootloader_installer.py` | 252 | GRUB UEFI/BIOS, update-grub |

### freedomnas-webui — COMPLETE

**Backend:**

| File | Lines | Endpoints |
|------|-------|-----------|
| `api/main.py` | 157 | FastAPI app, 9 page routes, first-run guard middleware |
| `api/deps.py` | 45 | Engine singleton, config singleton, PAM auth |
| `api/routes/system.py` | 78 | `/api/system/*` |
| `api/routes/storage.py` | 84 | `/api/storage/*` |
| `api/routes/network.py` | 65 | `/api/network/interfaces*` |
| `api/routes/users.py` | 68 | `/api/users/*` |
| `api/routes/shares.py` | 170 | `/api/shares/smb*` + `/api/shares/nfs*` |
| `api/routes/updates.py` | 63 | `/api/updates/*` |
| `api/routes/setup.py` | 73 | `/api/setup/*` |
| `websocket/terminal.py` | — | `/ws/updates/terminal` — **not yet created** |

**Frontend:**

| File | Purpose |
|------|---------|
| `frontend/templates/base.html` | Layout: sidebar, topbar, SVG icon sprite |
| `frontend/templates/login.html` | Login page |
| `frontend/templates/setup/wizard.html` | 3-step first-run wizard |
| `frontend/templates/dashboard.html` | Stat cards + module health grid |
| `frontend/templates/storage.html` | ZFS pools/datasets/snapshots |
| `frontend/templates/shares.html` | SMB/NFS shares management |
| `frontend/templates/network.html` | Interface list + IP editing |
| `frontend/templates/users.html` | User table + create/delete |
| `frontend/templates/updates.html` | Update status + streaming terminal |
| `frontend/templates/system.html` | System settings + danger zone |
| `frontend/static/css/main.css` | Complete CSS design system |
| `frontend/static/js/main.js` | Shared utilities: api(), Auth, toast(), Theme, UILevel |
| `frontend/static/js/auth.js` | Login form + PAM credential check |
| `frontend/static/js/setup.js` | Wizard state machine |
| `frontend/static/js/dashboard.js` | System info + module health |
| `frontend/static/js/storage.js` | Pool/dataset/snapshot CRUD |
| `frontend/static/js/shares.js` | SMB/NFS CRUD |
| `frontend/static/js/network.js` | Interface list + IP modal |
| `frontend/static/js/users.js` | User table + create/delete |
| `frontend/static/js/updates.js` | Topgrade runner, status polling |
| `frontend/static/js/terminal.js` | WebSocket terminal: connect, stream lines, display |
| `frontend/static/js/system.js` | Hostname save, reboot/shutdown |
