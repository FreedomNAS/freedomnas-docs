# Profile System Overview

The profile system is the translation layer between FreedomNAS's abstract
actions and OS-specific shell commands.

## What Profiles Are

Profiles are JSON files. They contain nothing but command strings.

- **No logic** — no `if`, no loops, no conditions
- **No OS detection** — profiles don't detect the environment
- **No side effects** — profiles don't execute anything
- **Pure mapping** — abstract action name → shell command string

The engine reads a profile and substitutes template variables into command
strings. The shell runs the resulting command.

!!! note "Split per module (2026-09-02)"
    A profile used to be one monolithic file per OS (`debian.json`,
    `freebsd.json`, ...). It's now assembled at engine startup from a
    shared base fragment plus one fragment per module, so that adding a
    module — including a third-party/community one — never requires
    editing another module's file. See [OS Profiles](os-profiles.md) for
    the current layout and [Architecture → Orchestrator](../architecture/orchestrator.md)
    for how modules themselves are discovered.

## Profile Types

| Type | Location | Purpose |
|------|----------|---------|
| Shared OS fragment | `os/os-debian.json`, `os/os-freebsd.json`, `os/os-arch.json` (`os-artix.json`, `os-void.json` also exist as Phase 3 scaffolding — see [OS Profiles](os-profiles.md)) | Primitives no module owns: packages, bootloader, system info |
| Per-module fragment | `storage/storage-<os>.json`, `network/network-<os>.json`, `shares/shares-<os>.json`, `users/users-<os>.json` | One file per module per OS — the categories that module owns |
| Init profile | `init/init-systemd.json`, `init/init-openrc.json`, … | Maps service management commands for one init system |
| Installer fragment | `installer/installer-debian.json`, … | How an edition gets *installed*: partitioning, root pool, bootstrap, chroot, config-file contents — read only by `freedomnas-installer`, see [Installer Profiles](installer-profiles.md) |
| Package category | `packages/samba-cifs.json`, … | Maps abstract feature IDs to OS-specific package names — **not** the same thing as the per-module fragments above, see [Package Categories](packages.md) |
| Manifest | `packages/MANIFEST.json` | Declares all available package categories |

## How the Engine Uses Profiles

```
engine.execute("samba", "create_share", share_name="docs", path="/mnt/data/docs", ...)
         │
         ▼
  Load os/os-debian.json (detected OS) as the base
         │
         ▼
  Scan every other profiles/ subdirectory (storage/, network/, shares/,
  users/, any installed community module's own directory) and merge in
  {dir}/{dir}-debian.json when present — one dict.update() per fragment
         │
         ▼
  Merge init/init-systemd.json's "services" section in last
         │
         ▼
  Find: samba.create_share = "net usershare add {share_name} {path} '' everyone:F guest_ok={guest_ok}"
         │
         ▼
  Substitute: "net usershare add docs /mnt/data/docs '' everyone:F guest_ok=n"
         │
         ▼
  subprocess.run(["net", "usershare", "add", "docs", ...], shell=False)
```

Each fragment owns its own top-level category key(s) — `storage/` owns
`zfs`/`media`/`btrfs`, `shares/` owns `samba`/`nfs`, and so on — so merging
is a plain `dict.update()` per fragment, with nothing to resolve.

## Why This Design

### Adding a new OS requires (almost) zero Python changes

To support Alpine Linux, create `os/os-alpine.json` plus an `alpine`
fragment in each module directory that needs one, then add its
`/etc/os-release` id to `engine.py`'s `_DISTRO_IDS` map and its name to
`SUPPORTED_OS`. No branching, no new classes — see
[Adding a New OS](adding-os.md).

### Adding a new module is purely additive

A module (core or community) ships `modules/<id>/{module.py,manifest.json}`
plus `profiles/<id>/<id>-<os>.json` for each OS it supports. The engine's
directory scan and the WebUI's module discovery both pick it up
automatically — no existing file needs to change. See
[Architecture → Orchestrator](../architecture/orchestrator.md) for the
module-loading side of this.

### Cross-OS migration is possible

`config.yaml` stores abstract feature IDs (`samba-cifs`), not package names.
When reinstalling on a different OS, the profile provides the correct packages.

### Commands are auditable and replaceable

Every command FreedomNAS ever runs is visible in JSON files. Changing a
command (e.g. switching from `nmcli` to `ip` for network config) requires
editing one JSON file — not searching Python code.

## Quick Links

- [OS Profiles](os-profiles.md) — full profile structure and category reference
- [Init Profiles](init-profiles.md) — service management commands
- [Installer Profiles](installer-profiles.md) — how an edition is installed
- [Package Categories](packages.md) — feature-to-package mapping
- [Adding a New OS](adding-os.md) — step-by-step guide
