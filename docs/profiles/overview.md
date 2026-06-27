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

## Profile Types

| Type | Location | Purpose |
|------|----------|---------|
| OS profile | `debian.json`, `freebsd.json`, `arch.json` | Maps all actions for one OS |
| Init profile | `init/systemd.json`, `init/openrc.json`, … | Maps service management commands for one init system |
| Package category | `packages/samba-cifs.json`, … | Maps abstract feature IDs to OS-specific package names |
| Manifest | `packages/MANIFEST.json` | Declares all available categories |

## How the Engine Uses Profiles

```
engine.execute("samba", "create_share", share_name="docs", path="/mnt/data/docs", ...)
         │
         ▼
  Load debian.json (detected OS)
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

## Why This Design

### Adding a new OS requires zero Python changes

To support Alpine Linux, create `alpine.json` and map every action.
No Python code changes. No branching. No new classes.

### Cross-OS migration is possible

`config.yaml` stores abstract feature IDs (`samba-cifs`), not package names.
When reinstalling on a different OS, the profile provides the correct packages.

### Commands are auditable and replaceable

Every command FreedomNAS ever runs is visible in JSON files. Changing a
command (e.g. switching from `nmcli` to `ip` for network config) requires
editing one JSON file — not searching Python code.

## Quick Links

- [OS Profiles](os-profiles.md) — full OS profile structure and examples
- [Init Profiles](init-profiles.md) — service management commands
- [Package Categories](packages.md) — feature-to-package mapping
- [Adding a New OS](adding-os.md) — step-by-step guide
