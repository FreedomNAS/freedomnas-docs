# Repository Structure

## Repositories

```
codeberg.org/FreedomNAS/
├── freedomnas-core          Engine + Config + Reconciler + Orchestrator + Modules
├── freedomnas-profiles      JSON translation profiles (OS + init + installer + packages)
├── freedomnas-installer     Profile-driven installer (clean + in-place)
├── freedomnas-image-builder Pre-built OS images (primary install path) + live installer ISO
├── freedomnas-webui         FastAPI WebUI + Jinja2 frontend
├── freedomnas-overlay       Gentoo ebuilds (app-nas category)
├── freedomnas-docs          This documentation site
├── freedomnas-website       Public project website (static HTML + CSS)
└── freedomnas-debian        Debian APT packaging                 [deferred]

codeberg.org/sarahmeow86/
└── zfs-dinit                dinit services for ZFS on Artix (checked out as artix-zfs)
```

`zfs-dinit` is not a FreedomNAS repository, but the Artix edition depends on
it: when Artix is installed with dinit, the installer clones it into the target
and builds it with `makepkg`, the way it builds `zfs-openrc` from the AUR for
OpenRC.

`freedomnas-image-builder` produces the primary install path (ADR-002).
`freedomnas-installer` is the secondary one, for hardware that can't be
flashed, console/ISO installs, and in-place installs onto a running system
— rewritten profile-driven per ADR-002's 2026-09-04 follow-up; see
[Installer Flow](installer.md). The two repos stay separate: the image
builder is not refactored to call the installer, and both produce the same
on-disk layout deliberately.

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
```

`freedomnas-image-builder` doesn't import `freedomnas-core` at Python level
— its `build.sh` scripts install the packaged core/profiles into the image
non-interactively, the same way the installer does.

## Repository Scope

When working on a specific repository:

- Do NOT assume you should modify other repositories
- Do NOT move files between repositories without a clear reason
- Each task is scoped to the files explicitly involved

## Implementation Status (2026-06-27)

### freedomnas-core — COMPLETE

| File | Lines | Purpose |
|------|-------|---------|
| `engine.py` | 78 | Backend switch: `FREEDOMNAS_ENGINE` picks Python or Nim, exception classes are shared |
| `engine_py.py` | 891 | OS-agnostic command executor in pure Python — profile loader (base `os/` fragment + per-module merge); the reference implementation |
| `engine_native.py` | 332 | The same API over the Nim engine; see [Core Engine](../architecture/engine.md#two-implementations) |
| `nim/src/fnas/` | 1560 | The Nim core: detection, profile merge, formatting, shlex, execution, and a PyYAML-compatible reader/writer for config.yaml |
| `nim/src/freedomnas_native.nim` | 160 | nimpy exports, GIL released around every command |
| `nim/src/freedomnas_cli.nim` | 190 | `freedomnas status`, `check`, `config show\|check\|path` and `version`, no interpreter needed |
| `config.py` | 65 | Backend switch: `FREEDOMNAS_CONFIG`, following `FREEDOMNAS_ENGINE` when unset |
| `config_py.py` | 738 | YAML configuration manager on PyYAML — the reference implementation |
| `config_native.py` | 150 | The same manager with the YAML end in Nim; see [Configuration Manager](../architecture/config.md#two-implementations) |
| `reconcile.py` | 546 | Desired-vs-current diff + apply |
| `keymgmt.py` | 451 | Encrypted-pool keyslots (USB + Master Passphrase, independently wrapped); `python -m freedomnas unlock-pools` |
| `orchestrator.py` | 333 | Module lifecycle + heartbeat bus |
| `module_loader.py` | 145 | Manifest-driven module discovery/registration; first real caller of `Orchestrator`, via `python -m freedomnas serve` |
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
| Per-module fragments | `storage/storage-<os>.json` (zfs incl. encrypted-pool, cache/log and property actions, media, zfs_properties), `network/network-<os>.json`, `shares/shares-<os>.json` (samba, nfs), `users/users-<os>.json` — one file per module per OS |
| Community OS fragments | `os/os-gentoo.json`, `os/os-artix.json`, `os/os-void.json` plus matching fragments in every module directory — all reachable at runtime since 2026-09-04 (`_DISTRO_IDS` + `SUPPORTED_OS` in `engine.py`) |
| Init profiles | `init/init-systemd.json`, `init/init-openrc.json`, `init/init-runit.json`, `init/init-s6.json`, `init/init-dinit.json`, `init/init-bsd_rc.json` (renamed from `init/<name>.json`, ~16 lines each) |
| Package categories | `packages/MANIFEST.json`, `core.json`, `samba-cifs.json`, `nfs.json`, `containers.json`, `virtualization.json` — untouched by the module split, see [Package Categories](../profiles/packages.md) |
| Installer fragments | `installer/installer-debian.json`, `-gentoo.json`, `-void.json`, `-artix.json`, `-arch.json`, `-freebsd.json` — read only by `freedomnas-installer`, see [Installer Profiles](../profiles/installer-profiles.md) |

### freedomnas-installer — REWRITTEN, profile-driven (2026-09-04)

Two modes (`clean`, `inplace`) plus `recovery`. No OS-specific command and no
OS-specific file content remains in its Python — see
[Installer Flow](installer.md).

| File | Responsibility |
|------|----------------|
| `setup.py` | Mode/edition selection, host-family gate, recovery |
| `lib/corelink.py` | freedomnas-core import shim (installed vs dev checkout) |
| `lib/context.py` | ExecutionContext — host/stage/target engines, profile-declared files |
| `lib/installer_modules.py` | Logger, DialogManager, Configuration, file I/O |
| `lib/disk_installer.py` | Disk menu, partitioning, ESP format via `partitioning.*` |
| `lib/zfs_installer.py` | Root pool and dataset tree via `rootpool.*` |
| `lib/system_installer.py` | Firmware, prompts, bootstrap, `files.*`, chroot mounts |
| `lib/users_installer.py` | Accounts; passwords via `users.set_password_stdin` |
| `lib/packages_installer.py` | Category selection, install, `services.enable` |
| `lib/core_installer.py` | core/profiles/webui into the target + first-boot wiring |
| `lib/bootloader_installer.py` | UKI + Clover, or the edition's native loader |
| `lib/state_installer.py` | `config.yaml` shadow copy on `.freedomnas` |
| `lib/target_installer.py` | Clean-install orchestration |
| `lib/inplace_installer.py` | In-place orchestration |
| `tests/dryrun_smoke.py` | End-to-end dry run of both modes, no root needed |

### freedomnas-webui — COMPLETE

**Backend:**

| File | Lines | Endpoints |
|------|-------|-----------|
| `api/main.py` | 221 | FastAPI app, 10 page routes, first-run guard middleware, mounts community-module routes discovered below |
| `api/module_discovery.py` | 120 | Community-module WebUI discovery — mirrors `module_loader.py` but only for modules with a `webui` manifest block; core routes/templates are untouched |
| `api/deps.py` | 129 | Engine singleton, config singleton, PAM auth, administrator check |
| `api/routes/system.py` | 148 | `/api/system/*` |
| `api/routes/storage.py` | 427 | `/api/storage/*` — pools (incl. creation and cache/log devices), datasets, properties, snapshots, snapshot policies |
| `api/routes/network.py` | 65 | `/api/network/interfaces*` |
| `api/routes/users.py` | 121 | `/api/users/*` |
| `api/routes/shares.py` | 170 | `/api/shares/smb*` + `/api/shares/nfs*` |
| `api/routes/updates.py` | 126 | `/api/updates/*` |
| `api/routes/setup.py` | 191 | `/api/setup/*` — `detected_edition` in status, edition validated against the detected OS, optional encrypted-`pool` field on `POST /api/setup/initialize` |
| `websocket/terminal.py` | 171 | `/ws/updates/terminal` — first-frame auth, administrator only, Topgrade streaming |

**Frontend:**

| File | Purpose |
|------|---------|
| `frontend/templates/base.html` | Layout: sidebar, topbar, SVG icon sprite |
| `frontend/templates/index.html` | Redirect to `/dashboard/` |
| `frontend/templates/auth.html` | Login page |
| `frontend/templates/setup.html` | 3-step first-run wizard |
| `frontend/templates/dashboard.html` | Stat cards + module health grid |
| `frontend/templates/storage.html` | ZFS pools (create, cache/log), datasets, properties, snapshots |
| `frontend/templates/shares.html` | SMB/NFS shares management |
| `frontend/templates/network.html` | Interface list + IP editing |
| `frontend/templates/users.html` | User table + create/delete |
| `frontend/templates/updates.html` | Update status + streaming terminal |
| `frontend/templates/system.html` | System settings + danger zone |
| `frontend/static/css/main.css` | Complete CSS design system |
| `frontend/static/js/main.js` | Shared utilities: api(), Auth, toast(), Theme, UILevel |
| `frontend/static/js/auth.js` | Login form + PAM credential check |
| `frontend/static/js/setup.js` | Wizard state machine, detected-edition preselection |
| `frontend/static/js/dashboard.js` | System info + module health |
| `frontend/static/js/storage.js` | Pool creation, cache/log attach/detach, dataset properties, snapshot creation |
| `frontend/static/js/shares.js` | SMB/NFS CRUD |
| `frontend/static/js/network.js` | Interface list + IP modal |
| `frontend/static/js/users.js` | User table + create/delete |
| `frontend/static/js/updates.js` | Topgrade runner, status polling, WebSocket terminal |
| `frontend/static/js/system.js` | Hostname save, reboot/shutdown |
