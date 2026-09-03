# Adding a New OS

Adding support for a new OS (e.g. Alpine Linux, NixOS) requires
**almost zero Python code changes** — one line, see step 5. Everything
else is JSON files, split per module (2026-09-02) — see
[OS Profiles](os-profiles.md) if you haven't already.

!!! note
    Artix Linux and Void Linux are worked examples of steps 1-4 below:
    `os/os-artix.json`/`os/os-void.json` exist, along with matching
    `artix-<os>.json`/`void-<os>.json` fragments in every module directory,
    `MANIFEST.json`'s `supported_editions` lists both, and the package
    category files have matching `artix`/`void` sections. Neither is
    selectable yet, though — `engine.py`'s `SUPPORTED_OS` constant (and its
    OS auto-detection logic) has not been extended to recognize them, so
    this JSON-only groundwork is not yet reachable at runtime (step 5,
    below). That gap is tracked as Phase 3 scaffolding.

## Steps

### 1. Create the shared OS fragment

Create `freedomnas-profiles/os/os-{os-name}.json`. Start from an existing
one (e.g. `os-arch.json` for Arch-based systems, `os-debian.json` for
Debian-based). Fill in the primitives no module owns: `packages`,
`bootloader`, `system`, plus `os_name`/`os_family`/`os_version`/`init_system`.

```json
{
  "os_name": "Alpine",
  "os_family": "linux",
  "os_version": "3.18+",
  "init_system": "openrc",  ← most common for Alpine

  "packages": {
    "update": "apk update",
    "install": "apk add {packages}",
    ...
  },
  "bootloader": { ... },
  "system": { ... }
}
```

### 2. Create a fragment in every module directory that needs one

For each of `storage/`, `network/`, `shares/`, `users/` (and any installed
community module's own directory), add `<dir>-{os-name}.json` containing
just the categories that module owns — see
[OS Profiles' "Where Each Category Lives"](os-profiles.md#where-each-category-lives)
table. E.g. `storage/storage-alpine.json`:

```json
{
  "zfs": {
    "create": "adduser -D -u {uid} -G {groups} {username}",
    ...
  },
  "media": { ... }
}
```

!!! warning
    Do NOT add a `services` key to any fragment above. Service commands
    belong in `init/init-{name}.json`.

### 3. Create or reuse an init profile

If the new OS uses an init system that already has an init profile (e.g.
OpenRC), no new init profile is needed. Set `"init_system": "openrc"` in
`os/os-{os-name}.json`.

If it uses a new init system, create `init/init-{name}.json` with the
`services` section for that init system.

### 4. Update MANIFEST.json and package categories

Add the new edition name to `packages/MANIFEST.json`'s `supported_editions`
array:

```json
{
  "supported_editions": ["debian", "freebsd", "arch", "alpine"]
}
```

For each category file (`packages/samba-cifs.json`, `packages/nfs.json`,
etc.), add a top-level key named for the new edition, containing `packages`,
`services`, and `config_paths` — **edition names are top-level keys**, not
values nested under a shared `"packages"`/`"services"` key:

```json
{
  "id": "samba-cifs",
  "debian":  { "packages": ["samba", "samba-common-bin"], "services": ["smbd", "nmbd"], "config_paths": [...] },
  "freebsd": { "packages": ["samba416"], "services": ["samba_server"], "config_paths": [...] },
  "arch":    { "packages": ["samba"], "services": ["smbd"], "config_paths": [...] },
  "alpine":  { "packages": ["samba"], "services": ["samba"], "config_paths": [...] }   ← add this
}
```

### 5. Wire the edition into the engine

Add `"{os-name}"` to `engine.py`'s `SUPPORTED_OS` list. This is the one
Python change in the whole procedure — the profile files alone aren't
enough to make a new edition reachable (this is exactly the gap Artix/Void
are stuck behind today).

### 6. Test

Run `FreedomNASEngine(os_override="{os-name}")` and call `engine.execute()`
for each category/action to verify substitution, then boot the new OS,
install FreedomNAS packages, and run through the first-run wizard selecting
the new edition.

## What You Must NOT Do

- Do not add `if os == "alpine"` branches in Python
- Do not hardcode Alpine package names in `package_manager.py`
- Do not modify `config.py`, or add OS-specific logic to `engine.py` beyond
  the one-line `SUPPORTED_OS` addition in step 5
- Do not use the flat `{"packages": {"debian": [...]}}` structure for
  package categories — edition names are top-level keys (see step 4);
  `PackageManager._load_category()` does not read that format

All OS-specific knowledge belongs in JSON. The Python layer is OS-agnostic
and must stay that way.
