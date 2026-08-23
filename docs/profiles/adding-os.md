# Adding a New OS

Adding support for a new OS (e.g. Alpine Linux, NixOS) requires
**zero Python code changes**. You only need JSON files.

!!! note
    Artix Linux and Void Linux are worked examples of steps 1-4 below:
    `artix.json`/`void.json` exist, `MANIFEST.json`'s `supported_editions`
    lists both, and the package category files have matching `artix`/`void`
    sections. Neither is selectable yet, though — `engine.py`'s
    `SUPPORTED_OS` constant (and its OS auto-detection logic) has not been
    extended to recognize them, so this JSON-only groundwork is not yet
    reachable at runtime. That gap is real Python work this guide's
    "zero Python code changes" claim does not cover; it is tracked as
    Phase 3 scaffolding.

## Steps

### 1. Create the OS profile

Create `freedomnas-profiles/{os-name}.json`. Start from an existing profile
(e.g. `arch.json` for Arch-based systems, `debian.json` for Debian-based).

Fill in every category and action. Use the correct commands for the new OS.

```json
{
  "os_name": "Alpine",
  "os_family": "linux",
  "os_version": "3.18+",
  "init_system": "openrc",  ← most common for Alpine

  "users": {
    "create": "adduser -D -u {uid} -G {groups} {username}",
    ...
  },
  "packages": {
    "update": "apk update",
    "install": "apk add {packages}",
    ...
  },
  ...
}
```

!!! warning
    Do NOT add a `services` key to the OS profile. Service commands belong
    in `init/{name}.json`.

### 2. Create or reuse an init profile

If the new OS uses an init system that already has an init profile (e.g.
OpenRC), no new init profile is needed. Set `"init_system": "openrc"` in
the OS profile.

If it uses a new init system, create `init/{name}.json` with the `services`
section for that init system.

### 3. Update MANIFEST.json

Add the new edition name to the `supported_editions` array:

```json
{
  "supported_editions": ["debian", "freebsd", "arch", "alpine"]
}
```

### 4. Update package categories

For each category (`samba-cifs.json`, `nfs.json`, etc.), add the package
and service names for the new OS:

```json
{
  "packages": {
    "debian":  ["samba", "samba-common-bin"],
    "freebsd": ["net/samba419"],
    "arch":    ["samba"],
    "alpine":  ["samba"]          ← add this
  },
  "services": {
    "debian":  ["smbd", "nmbd"],
    "freebsd": ["smbd"],
    "arch":    ["smb"],
    "alpine":  ["samba"]          ← add this
  }
}
```

### 5. Test

Boot the new OS, install FreedomNAS packages, and run through the first-run
wizard selecting the new edition. Verify all commands execute correctly.

## What You Must NOT Do

- Do not add `if os == "alpine"` branches in Python
- Do not hardcode Alpine package names in `package_manager.py`
- Do not modify `engine.py`, `config.py`, or any Python module

All OS-specific knowledge belongs in JSON. The Python layer is OS-agnostic
and must stay that way.
