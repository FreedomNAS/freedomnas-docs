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
├── pages                    Public project website (static HTML + CSS), at freedomnas.codeberg.page
├── freedomnas-deb           .deb packages, published to Codeberg's Debian registry by CI
├── freedomnas-arch          Arch/Artix PKGBUILDs and the scripts that publish them to Codeberg's Arch registry
├── linux-freedomnas         Arch/Artix kernel with the OpenZFS modules built in
├── freedomnas-void          FreedomNAS packages for Void, OpenZFS modules for Void's own kernel and the Samba configuration, a signed xbps repository built on Codeberg's hosted runners
├── freedomnas-freebsd       FreeBSD pkg repository (built with pkg create, signed catalogue)
├── freedomnas-module-template Starting point for a community module
├── freedomnas-containers    Containers community module (package freedomnas-module-containers)
├── freedomnas-proxy         Reverse proxy community module, Caddy (package freedomnas-module-proxy)
├── freedomnas-module-vm     Virtual machines community module, libvirt and vm-bhyve (package freedomnas-module-vm)
├── freedomnas-specs         Specifications and plans (private)
├── pihole-ftl-freebsd       Fork of Pi-hole FTL where the FreeBSD patches are made
└── pihole-core-freebsd      Fork of Pi-hole's core scripts, the same

codeberg.org/sarahmeow86/
├── zfs-dinit                ZFS services for dinit, runit and s6 on Artix (checked out as artix-zfs)
└── zfs-openrc               ZFS services for OpenRC on Artix

github.com/FreedomNAS/
└── freedomnas-image         Showcase: the images' release downloads, filled by build-images
```

The two Pi-hole forks are where a FreeBSD change is written and tested;
the FreeBSD port builds Pi-hole from upstream's release tarballs with those
changes as patches (`ports/dns/pihole-ftl`, `ports/dns/pihole` in
freedomnas-freebsd, see [Packaging](packaging.md)).

`zfs-dinit` and `zfs-openrc` are not FreedomNAS repositories, but the Artix
edition depends on them: freedomnas-arch builds `zfs-dinit`, `zfs-runit`,
`zfs-s6` and `zfs-openrc` from them and publishes them in the FreedomNAS
pacman repository, from which the installer takes the one for the chosen
init.

`freedomnas-arch` holds the Arch PKGBUILDs of FreedomNAS's components
(core, profiles, webui, installer, docs), which used to sit in their own
repositories and now build from a branch with snapshot versions
(`0.9.12+<commit date and time>.<commit>`), of the two community modules
(`freedomnas-module-containers`, `freedomnas-module-proxy`) and of the
binaries the official repositories lack (`caddy-bin`, `lego-bin`,
`topgrade-bin`), and the scripts
and workflow that build and publish every Arch package. `linux-freedomnas`
has a repository of its own: Arch's `linux-lts` with the OpenZFS modules
built into the same package, plus `zfs-utils-freedomnas` at the matching
version, so the Arch and Artix editions run without DKMS the way Proxmox
does; freedomnas-arch's workflow clones it. freedomnas-arch publishes a
signed pacman repository of its own to Codeberg's generic registry
(`.../generic/freedomnas-arch/<dev|main>`), built with `repo-add`: Codeberg's
Arch registry cuts each package's file list at 65535 bytes inside the `.db`,
and the kernel's longer list made pacman reject the whole repository. The module template keeps its own PKGBUILD, since a module author
copies it with the rest of the scaffolding.

`pages` is the website and has to carry that name for Codeberg Pages to
serve it at the root of <https://freedomnas.codeberg.page/>. Both it and
this documentation publish themselves on every push to `dev`: a workflow on
the self-hosted runner hands the files to `git-pages/action`, and the
documentation lands at <https://freedomnas.codeberg.page/freedomnas-docs/>.

`freedomnas-image-builder` produces the primary install path (ADR-002).
`freedomnas-installer` is the secondary one, for hardware that can't be
flashed, console/ISO installs, and in-place installs onto a running system
— rewritten profile-driven per ADR-002's 2026-09-04 follow-up; see
[Installer Flow](installer.md). The image builder does not repeat the
installer's work: every image, Linux and FreeBSD, is made by running
freedomnas-installer in its image mode inside the edition's live ISO under
QEMU (`common/vm-install.sh`), with an empty raw image as the target disk,
so an image and an installed system have the same on-disk layout by
construction.

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

`freedomnas-image-builder` doesn't import `freedomnas-core` at Python level:
its `build.sh` scripts drive the installer in a VM, and the installer puts
core, profiles and WebUI into the image.

## Repository Scope

When working on a specific repository:

- Do NOT assume you should modify other repositories
- Do NOT move files between repositories without a clear reason
- Each task is scoped to the files explicitly involved

## What each repository holds

The tables below list each file with its length and the first sentence of
its own docstring, as of 2026-10-31; the files say more.

### freedomnas-core

| File | Lines | Purpose |
|------|-------|---------|
| `__main__.py` | 620 | python -m freedomnas — FreedomNAS Core diagnostic CLI. |
| `bootenv.py` | 337 | Boot environments: whole copies of the system that the boot loader can start. |
| `bootstate.py` | 147 | Automatic rollback after a kernel update that does not boot. |
| `config.py` | 910 | FreedomNAS Configuration Manager |
| `datasets.py` | 428 | Creating, moving, renaming and destroying datasets from the Datasets tab. |
| `delegation.py` | 100 | Delegated ZFS permissions (`zfs allow` / `zfs unallow`): which users and groups may run which zfs subcommands on a dataset without being root. |
| `engine.py` | 1000 | FreedomNAS Core Engine - Universal OS Abstraction Layer |
| `groupshares.py` | 263 | Shares used by a group of accounts. |
| `grow.py` | 83 | Growing the root pool to the disk it was flashed onto. |
| `keymgmt.py` | 594 | FreedomNAS ZFS Encryption Key Management |
| `module_loader.py` | 158 | FreedomNAS Module Loader — manifest-driven discovery and registration. |
| `monitoring.py` | 79 | Read-only views of what ZFS is doing: the event log, per-vdev I/O and the ARC. |
| `netconfig.py` | 321 | How one network interface gets its addresses: IPv4 by DHCP or static, IPv6 automatic, static or off, DNS servers and search domains, MTU. |
| `netnames.py` | 116 | FreedomNAS names for the physical network interfaces: fnas_lan1, fnas_lan2…, the same on every edition, tied to each card's MAC address. |
| `offline_restore.py` | 90 | The part of a restore a system can take before it ever runs: the installer calls it inside the chroot of the system it installs, with a data pool's copy of the configurat… |
| `orchestrator.py` | 376 | FreedomNAS Orchestrator — Module lifecycle management with heartbeat monitoring. |
| `package_manager.py` | 274 | FreedomNAS Package Manager — Load and manage OS-specific package definitions. |
| `paths.py` | 85 | Where FreedomNAS keeps its files. |
| `pool_import.py` | 591 | Bringing in a pool that already exists: another FreedomNAS's data pool, or a pool some other system made. |
| `pool_removal.py` | 82 | Exporting and destroying a pool from the Pools tab. |
| `pools.py` | 242 | Pool composition: the devices that are not where the data lives. |
| `reconcile.py` | 1416 | FreedomNAS Reconciliation Engine |
| `replication.py` | 323 | Local ZFS replication: zfs send \| zfs receive between pools of this system, or into and out of a stream file. |
| `restoring.py` | 130 | The restore lock: while a restored or reinitialized configuration is being applied, `<state>/restoring.json` exists and the WebUI serves only the page that follows it. |
| `shadow.py` | 925 | The configuration's two kinds of `.freedomnas` dataset. |
| `snapshots.py` | 226 | Scheduled ZFS snapshots with retention. |
| `tls.py` | 269 | The WebUI's TLS material. |
| `usershares.py` | 72 | Samba usershares: the [global] settings and the directory they live in. |
| `wireguard.py` | 152 | WireGuard VPN: one interface on the NAS (fnas_wg1) and the devices allowed to connect to it, each with its own key pair. |
| `modules/network/module.py` | 79 | NetworkModule — lifecycle and health monitoring for network interfaces. |
| `modules/shares/module.py` | 105 | SharesModule — lifecycle and health monitoring for SMB and NFS services. |
| `modules/storage/module.py` | 77 | StorageModule — lifecycle and health monitoring for ZFS pools. |
| `modules/updates/module.py` | 58 | UpdatesModule — tracks update configuration state. |
| `modules/users/module.py` | 73 | UsersModule — lifecycle check that users declared in config exist on the OS. |

`modules/<name>/` holds `module.py`, `manifest.json` and `__init__.py`:
modules are discovered at runtime, not imported by hand — see
[Orchestrator](../architecture/orchestrator.md). That is what makes a
community module purely additive: its own repository and package, no edit
to `freedomnas-core`, `freedomnas-profiles` or `freedomnas-webui`.

### freedomnas-profiles

Split per module — see [Profile System Overview](../profiles/overview.md).
Every edition — Debian, FreeBSD, Arch, Gentoo, Artix, Void — has its
fragment in every directory.

| Type | Files |
|------|-------|
| OS fragments | `os/os-<edition>.json` — packages, bootloader, system, `os_name`/`os_family`/`os_version`/`init_system` |
| Per-module fragments | `storage/storage-<edition>.json` (zfs, directories, media), `network/network-<edition>.json`, `shares/shares-<edition>.json` (samba, nfs), `users/users-<edition>.json` |
| Init profiles | `init/init-systemd.json`, `init-openrc.json`, `init-runit.json`, `init-s6.json`, `init-dinit.json`, `init-bsd_rc.json` |
| Package categories | `packages/MANIFEST.json` and one file per category — see [Package Categories](../profiles/packages.md) |
| Installer fragments | `installer/installer-<edition>.json` — read only by `freedomnas-installer`, see [Installer Profiles](../profiles/installer-profiles.md) |
| Assets | `assets/` — `firstboot.sh`, `supervisor.sh`, the dracut modules, `zz-dracut-uki`, Clover, runitctl and `freedomnas-rc-service` |

### freedomnas-installer

Two modes (`clean`, `inplace`) plus `recovery`. No OS-specific command and no
OS-specific file content remains in its Python — see
[Installer Flow](installer.md).

| File | Lines | Purpose |
|------|-------|---------|
| `setup.py` | 349 | FreedomNAS Installer — entry point. |
| `lib/bootloader_installer.py` | 388 | FreedomNAS Installer — boot chain. |
| `lib/context.py` | 373 | FreedomNAS Installer — execution context. |
| `lib/core_installer.py` | 248 | FreedomNAS Installer — deploying FreedomNAS itself into the target. |
| `lib/corelink.py` | 117 | FreedomNAS Installer — freedomnas-core import shim. |
| `lib/diagnostics.py` | 64 | FreedomNAS Installer — what the machine looked like when something failed. |
| `lib/disk_installer.py` | 313 | FreedomNAS Installer — Disk detection, partitioning, and formatting. |
| `lib/inplace_installer.py` | 222 | FreedomNAS Installer — install onto the system that is already running. |
| `lib/installer_modules.py` | 410 | FreedomNAS Installer — Base infrastructure. |
| `lib/packages_installer.py` | 341 | FreedomNAS Installer — package selection and installation. |
| `lib/state_installer.py` | 318 | FreedomNAS Installer — persisting the installation to config.yaml. |
| `lib/system_installer.py` | 492 | FreedomNAS Installer — base system provisioning. |
| `lib/target_installer.py` | 267 | FreedomNAS Installer — clean install onto a dedicated disk. |
| `lib/users_installer.py` | 219 | FreedomNAS Installer — user creation. |
| `lib/zfs_installer.py` | 293 | FreedomNAS Installer — root pool and dataset creation. |

### freedomnas-webui

**Backend:**

| File | Lines | Purpose |
|------|-------|---------|
| `api/deps.py` | 245 | Shared FastAPI dependencies: engine singleton, config singleton, PAM auth. |
| `api/main.py` | 331 | FreedomNAS WebUI — FastAPI application entry point. |
| `api/module_discovery.py` | 161 | Discovery for community modules' WebUI integration. |
| `api/restart.py` | 71 | Restarting the WebUI after FreedomNAS itself was updated. |
| `api/routes/account.py` | 114 | /api/account/* — what any account may do for itself, administrator or not. |
| `api/routes/disks.py` | 254 | /api/storage/disks/* — the health of the physical disks, from SMART. |
| `api/routes/network.py` | 439 | /api/network/* — network interface listing and static IP configuration. |
| `api/routes/plugins.py` | 252 | /api/plugins/* — community modules installed from the edition's package repository. |
| `api/routes/restore.py` | 67 | /api/restore/* — the restore page's two calls, open without signing in: while a restore runs the accounts may not have their passwords yet. |
| `api/routes/services.py` | 106 | /api/services/* — the system's services, through the init profile. |
| `api/routes/setup.py` | 329 | /api/setup/* — first-run wizard (spec §7.2). |
| `api/routes/shares.py` | 350 | /api/shares/* — SMB and NFS share management. |
| `api/routes/storage.py` | 1707 | /api/storage/* — ZFS pool, dataset and snapshot management. |
| `api/routes/system.py` | 414 | /api/system/* — system identity, status, and power management. |
| `api/routes/updates.py` | 142 | /api/updates/* — update management via Topgrade. |
| `api/routes/users.py` | 293 | /api/users/* — OS user management. |
| `api/serve.py` | 178 | The WebUI's listener: one port for https:// and for the plain http:// a browser tries first. |
| `websocket/terminal.py` | 306 | /ws/updates/terminal — WebSocket endpoint that streams topgrade output. |

**Tests** (`python3 -m pytest tests/`, needs `fastapi`, `uvicorn`, `websockets`
and the sibling `freedomnas-core` and `freedomnas-profiles` checkouts — not
`httpx`, not `python-pam`; `.forgejo/workflows/tests.yml` runs them on every
push to `dev` and `main`):

| File | Covers |
|------|--------|
| `tests/conftest.py` | The WebUI, served for real by uvicorn, in front of a recording engine and a fake PAM. |
| `tests/test_account.py` | /api/account/* — what every account sees and does for itself, administrator or not. |
| `tests/test_auth.py` | Authentication (PAM), authorisation (the admin group) and the first-run guard. |
| `tests/test_datasets.py` | /api/storage/datasets* — create, move, rename and destroy datasets, and keep the shares and snapshot policies that depend on them in step. |
| `tests/test_disks.py` | /api/storage/disks/* — disk health from SMART, and self-tests. |
| `tests/test_module_discovery.py` | Community modules: which ones get mounted, and which are skipped without breaking the rest. |
| `tests/test_monitoring_api.py` | /api/storage — delegations, events, iostat, ARC. |
| `tests/test_network.py` | /api/network/* — interfaces and static addresses. |
| `tests/test_pages.py` | Page routes, static files and the placeholders for later phases. |
| `tests/test_plugins.py` | /api/plugins/* — community modules from the package repository. |
| `tests/test_pool_admin.py` | /api/storage/pools/{pool}/… — status, maintenance, devices, vdevs, properties. |
| `tests/test_pool_import.py` | /api/storage/pools/import* — look at a pool first, then bring it in with the shares and users it carries; never mount another system's root over this one. |
| `tests/test_pool_removal.py` | /api/storage/pools/{pool} export and destroy — never the system's pool or the one serving the configuration; shares go only when asked. |
| `tests/test_replication_api.py` | /api/storage/replication/* — local send/receive jobs. |
| `tests/test_restart.py` | api/restart.py — the fingerprint of the installed trees and the marker for supervisor.sh. |
| `tests/test_restore.py` | While the restore lock exists the WebUI serves only the restore page and its two open calls; a finished restore with errors is left with Continue. |
| `tests/test_serve.py` | One port for https:// and for plain http://, which is sent to https:// on the same host, port and path. |
| `tests/test_services.py` | /api/services/* — every service of the init, its state and the boot choice. |
| `tests/test_setup.py` | /api/setup/* — the first-run wizard, reachable before anything else is. |
| `tests/test_shares.py` | /api/shares/* — Samba usershares and NFS exports. |
| `tests/test_snapshot_admin.py` | /api/storage — volumes, dataset administration, snapshots, holds, diffs, bookmarks. |
| `tests/test_storage.py` | /api/storage/* — pools, datasets, snapshots, properties and pool devices. |
| `tests/test_system.py` | /api/system/* — identity, power, and the configuration export/import. |
| `tests/test_terminal.py` | /ws/updates/terminal — the one door that starts a system update. |
| `tests/test_updates.py` | /api/updates/* — the pending-update count and the topgrade configuration. |
| `tests/test_users.py` | /api/users/* — what reaches the engine, and what never does. |

**Frontend:** `frontend/templates/` holds one template per page plus
`base.html`, `frontend/static/css/main.css` the design system and
`frontend/static/js/` one script per page plus `main.js`; see
[Frontend JavaScript Modules](frontend.md) and [WebUI Internals](webui.md).
