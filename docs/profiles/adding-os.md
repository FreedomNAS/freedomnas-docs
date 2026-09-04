# Adding a New OS

Adding support for a new OS (e.g. Alpine Linux, NixOS) requires
**almost zero Python code changes** — one line, see step 5. Everything
else is JSON files, split per module (2026-09-02) — see
[OS Profiles](os-profiles.md) if you haven't already.

!!! note
    Artix Linux and Void Linux are worked examples of steps 1-4 below:
    Debian, FreeBSD, Arch, Gentoo, Artix and Void all ship complete
    profiles — shared `os/` fragment, per-module fragments, package
    category sections — and all are reachable at runtime. Gentoo is the
    most recent addition and the worked example to copy: it is the one
    edition whose install is a rootfs tarball (stage3) from end to end.

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

Two entries in `engine.py`, and they are the only Python in the whole
procedure:

1. `_DISTRO_IDS` — map the distribution's `/etc/os-release` `ID` (and any
   derivative id that should reuse the same profile) to the profile name.
   **This is the actual gate**: without it, auto-detection refuses the OS.
2. `SUPPORTED_OS` — add the name so error messages list it.

Matching on `ID` rather than searching the file for a substring is what
keeps a derivative from silently inheriting its parent's profile — Artix
declares `ID_LIKE=arch` but needs its own OpenRC profile, not Arch's.

### 6. (Optional) Make it installable

Steps 1–5 make FreedomNAS *run* on the new OS. To let
`freedomnas-install` also *install* it, add
`installer/installer-{os-name}.json` — see
[Installer Profiles](installer-profiles.md). Copy `installer-void.json` if
your OS has no bootstrapper reachable from other distributions: it uses the
rootfs-tarball method, which needs only `curl` and `tar` on the installer
host.

Remember the family rule: an installer environment can only bootstrap
editions with the same `os_family`.

### 7. Test

Run `FreedomNASEngine(os_override="{os-name}")` and call `engine.execute()`
for each category/action to verify substitution. If you added an installer
fragment, check the whole install resolves without touching a disk:

```bash
sudo freedomnas-install --dry-run --mode clean --target {os-name}
```

Then boot the new OS, install FreedomNAS packages, and run through the
first-run wizard selecting the new edition.

## What You Must NOT Do

- Do not add `if os == "alpine"` branches in Python
- Do not hardcode Alpine package names in `package_manager.py`
- Do not modify `config.py`, or add OS-specific logic to `engine.py` beyond
  the two table entries in step 5
- Do not use the flat `{"packages": {"debian": [...]}}` structure for
  package categories — edition names are top-level keys (see step 4);
  `PackageManager._load_category()` does not read that format

All OS-specific knowledge belongs in JSON. The Python layer is OS-agnostic
and must stay that way.
