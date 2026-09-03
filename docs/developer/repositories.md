# Repository Structure

## Repositories

```
codeberg.org/FreedomNAS/
├── freedomnas-core          Engine + Config + Reconciler + Orchestrator + Modules
├── freedomnas-profiles      JSON translation profiles (OS + init + packages)
├── freedomnas-installer     TUI installer (Python + dialog)          [PARKED]
├── freedomnas-image-builder Pre-built OS images — primary install path
├── freedomnas-webui         FastAPI WebUI + Jinja2 frontend
├── freedomnas-docs          This documentation site
├── freedomnas-debian        Debian APT packaging                 [deferred]
└── freedomnas-iso           ISO build system                     [deferred]
```

`freedomnas-installer` is parked — superseded by `freedomnas-image-builder`
(ADR-002, `IMAGE-BASED-INSTALLATION.md`). It is still functional (prints a
startup warning) but not the recommended install path; see
[Installer Flow](installer.md).

## Dependency Graph

Dependencies flow strictly one way. Never introduce a reverse dependency.

```
freedomnas-profiles   (no dependencies)
        │
        ▼
freedomnas-core       (depends on profiles at runtime via profile search paths)
        │
        ├──────────────────┬──────────────────────┐
        ▼                  ▼                       ▼
freedomnas-installer  freedomnas-webui   freedomnas-image-builder
   [PARKED]
```

`freedomnas-image-builder` doesn't import `freedomnas-core` at Python level
— its `build.sh` scripts install the packaged core/profiles into the image
non-interactively, the same way the (parked) installer does.

## Repository Scope

When working on a specific repository:

- Do NOT assume you should modify other repositories
- Do NOT move files between repositories without a clear reason
- Each task is scoped to the files explicitly involved

## Implementation Status (2026-06-27)

### freedomnas-core — COMPLETE

| File | Lines | Purpose |
|------|-------|---------|
| `engine.py` | 670 | OS-agnostic command executor — profile loader (base `os/` fragment + per-module merge) |
| `config.py` | 686 | YAML configuration manager |
| `reconcile.py` | 546 | Desired-vs-current diff + apply |
| `keymgmt.py` | 451 | Encrypted-pool keyslots (USB + Master Passphrase, independently wrapped); `python -m freedomnas unlock-pools` |
| `orchestrator.py` | 333 | Module lifecycle + heartbeat bus |
| `module_loader.py` | 145 | Manifest-driven module discovery/registration; first real caller of `Orchestrator`, via `python -m freedomnas serve` |
| `backup_manager.py` | 276 | ZFS snapshot lifecycle |
| `package_manager.py` | 186 | Abstract package install/remove |
| `modules/storage/` | 71 (`module.py`) | ZFS pool health check — `{module.py, manifest.json, __init__.py}` |
| `modules/network/` | 57 (`module.py`) | Interface availability check — same layout |
| `modules/shares/` | 81 (`module.py`) | SMB/NFS service health check — same layout |
| `modules/users/` | 64 (`module.py`) | Configured user existence check — same layout |
| `modules/updates/` | 49 (`module.py`) | Topgrade configuration check — same layout, no dedicated profile fragment |

**Module/plugin refactor (2026-09-02):** `modules/` moved from flat `.py`
files to `modules/<name>/{module.py, manifest.json, __init__.py}`,
discovered at runtime instead of hand-imported — see
[Orchestrator](../architecture/orchestrator.md). This is what makes a
community module purely additive: its own repo/`.deb`, zero edits to
`freedomnas-core`, `freedomnas-profiles`, or `freedomnas-webui`.

### freedomnas-profiles — COMPLETE (Debian/FreeBSD/Arch); Void/Artix scaffolded

Split per module (2026-09-02) — see [Profile System Overview](../profiles/overview.md).

| Type | Files |
|------|-------|
| Shared OS fragments | `os/os-debian.json`, `os/os-arch.json`, `os/os-freebsd.json` — packages, bootloader, system, `os_name`/`os_family`/`os_version`/`init_system` |
| Per-module fragments | `storage/storage-<os>.json` (zfs incl. encrypted-pool actions, media, btrfs), `network/network-<os>.json`, `shares/shares-<os>.json` (samba, nfs), `users/users-<os>.json` — one file per module per OS |
| OS fragments (Phase 3, not runtime-reachable) | `os/os-artix.json`, `os/os-void.json` plus matching `artix`/`void` fragments in every module directory — profile scaffolding only; `engine.py`'s `SUPPORTED_OS` still only lists `debian`/`freebsd`/`arch`, so these are not loadable yet |
| Init profiles | `init/init-systemd.json`, `init/init-openrc.json`, `init/init-runit.json`, `init/init-s6.json`, `init/init-dinit.json`, `init/init-bsd_rc.json` (renamed from `init/<name>.json`, ~16 lines each) |
| Package categories | `packages/MANIFEST.json`, `core.json`, `samba-cifs.json`, `nfs.json`, `containers.json`, `virtualization.json` — untouched by the module split, see [Package Categories](../profiles/packages.md) |

### freedomnas-installer — COMPLETE, PARKED

Functional and unchanged in shape, but superseded — see the note above and
[Installer Flow](installer.md).

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
| `api/main.py` | 157 | FastAPI app, 9 page routes, first-run guard middleware, mounts community-module routes discovered below |
| `api/module_discovery.py` | 121 | Community-module WebUI discovery — mirrors `module_loader.py` but only for modules with a `webui` manifest block; core routes/templates are untouched |
| `api/deps.py` | 45 | Engine singleton, config singleton, PAM auth |
| `api/routes/system.py` | 78 | `/api/system/*` |
| `api/routes/storage.py` | 84 | `/api/storage/*` |
| `api/routes/network.py` | 65 | `/api/network/interfaces*` |
| `api/routes/users.py` | 68 | `/api/users/*` |
| `api/routes/shares.py` | 170 | `/api/shares/smb*` + `/api/shares/nfs*` |
| `api/routes/updates.py` | 63 | `/api/updates/*` |
| `api/routes/setup.py` | 136 | `/api/setup/*`, including the optional encrypted-`pool` field on `POST /api/setup/initialize` |
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
| `frontend/static/js/storage.js` | Pool/dataset listing + snapshot CRUD (no pool-creation UI; see `keymgmt.py`/`setup.py` for how pools are created) |
| `frontend/static/js/shares.js` | SMB/NFS CRUD |
| `frontend/static/js/network.js` | Interface list + IP modal |
| `frontend/static/js/users.js` | User table + create/delete |
| `frontend/static/js/updates.js` | Topgrade runner, status polling |
| `frontend/static/js/terminal.js` | WebSocket terminal: connect, stream lines, display |
| `frontend/static/js/system.js` | Hostname save, reboot/shutdown |
