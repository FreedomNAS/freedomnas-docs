# Package Manager

`package_manager.py` is the abstraction layer between FreedomNAS feature
IDs and OS-specific package names. It reads JSON category files from the
`freedomnas-profiles/packages/` directory and exposes them as a structured
API — it never calls `apt` or `pkg` directly.

## Two implementations

Like the [engine](engine.md#two-implementations), it exists twice:
`package_manager_py.py` (pure Python, the reference) and
`package_manager_native.py` (the Python side of `nim/src/fnas/packages.nim`,
where MANIFEST.json and category JSON reading/querying run instead).
`package_manager.py` picks between them — `FREEDOMNAS_PACKAGES`, following
`FREEDOMNAS_ENGINE` when unset — and `tests/test_package_manager_parity.py`
holds them to identical behaviour, against the real
`freedomnas-profiles/packages/` tree rather than a throwaway fixture: the
manifest/category shape *is* the contract.

Unlike every other ported module, the native side opens no engine handle:
this is pure, read-only JSON navigation with no `engine.execute()` call
anywhere in it, so it works under either engine backend, or with none open
yet. Resolving the default `packages_dir` (installed path, then the dev-tree
sibling checkout) stays in Python on both sides — it depends on where the
*Python module* lives, which has no Nim equivalent, the same reasoning that
keeps the profile search path out of the engine's own Nim side.

## Class Overview

```python
class PackageManager:
    def __init__(packages_dir=None)
```

The `packages_dir` search order:

1. Constructor argument (explicit path)
2. `/usr/lib/freedomnas/profiles/packages` — system install
3. `../../freedomnas-profiles/packages` — sibling repo in dev tree

Raises `FileNotFoundError` if no packages directory is found.

## Directory Structure

```
profiles/packages/
├── MANIFEST.json          ← category index
├── core.json
├── samba-cifs.json
├── nfs.json
├── docker.json
└── ...
```

### MANIFEST.json

```json
{
  "version": "1.0",
  "supported_editions": ["debian", "freebsd", "arch"],
  "categories": [
    { "id": "core",       "name": "Core System",    "required": true,  "file": "core.json" },
    { "id": "samba-cifs", "name": "SMB File Shares", "required": false, "file": "samba-cifs.json" },
    { "id": "nfs",        "name": "NFS Exports",     "required": false, "file": "nfs.json" }
  ]
}
```

### Category file (e.g. `samba-cifs.json`)

```json
{
  "id": "samba-cifs",
  "debian": {
    "packages":     ["samba", "samba-common-bin"],
    "services":     ["smbd", "nmbd"],
    "config_paths": ["/etc/samba/smb.conf", "/etc/samba/lmhosts"]
  },
  "freebsd": {
    "packages":     ["net/samba419"],
    "services":     ["samba_server"],
    "config_paths": ["/usr/local/etc/smb4.conf"]
  },
  "arch": {
    "packages":     ["samba"],
    "services":     ["smb", "nmb"],
    "config_paths": ["/etc/samba/smb.conf"]
  }
}
```

Services that must be up before the rest — importing and mounting pools —
go under `early_services` instead of `services`; the installer enables them
first, through the init profile's `enable_early` where it has one (OpenRC:
the `sysinit` runlevel).

An edition may also list `pkgbuilds` — `{"name", "git"}` PKGBUILD
repositories the installer clones and builds after the repository packages,
through the installer profile's `pkgbuild.install`.

Where an edition ships service scripts as separate packages per init — Artix's
`openssh-openrc` and `openssh-dinit` — the per-init parts go under
`init.<name>`, and are added to the edition-level lists when that init is
asked for. Service names live there too, because they differ (`smb` under
OpenRC, `smbd`/`nmbd`/`winbindd` under dinit):

```json
"artix": {
  "packages": ["samba", "samba-support-tools"],
  "init": {
    "openrc": { "packages": ["samba-openrc"], "services": ["smb"] },
    "dinit":  { "packages": ["samba-dinit"],  "services": ["smbd", "nmbd", "winbindd"] }
  }
}
```

## Public API

```python
pm = PackageManager()

# Query categories
pm.get_categories()               # → list of category metadata dicts from MANIFEST
pm.get_required_categories()      # → list of required category IDs
pm.get_optional_categories()      # → list of optional category IDs
pm.get_category_info("samba-cifs") # → single category metadata dict

# Query packages / services / configs for an OS edition
pm.get_packages_for_os("samba-cifs", "debian")   # → ["samba", "samba-common-bin"]
pm.get_services_for_os("samba-cifs", "debian")   # → ["smbd", "nmbd"]
pm.get_services_for_os("samba-cifs", "artix", "dinit")  # → ["smbd", "nmbd", "winbindd"]
pm.get_early_services_for_os("core", "gentoo")          # → ["zfs-import", "zfs-mount"]
pm.get_pkgbuilds_for_os("core", "artix", "dinit")
# → [{"name": "zfs-dinit", "git": "https://codeberg.org/sarahmeow86/zfs-dinit.git"}]
pm.get_config_paths("samba-cifs", "debian")       # → ["/etc/samba/smb.conf", ...]

# Bulk query
pm.get_all_packages_for_os("debian", categories=["samba-cifs", "nfs"])
# → {"samba-cifs": [...], "nfs": [...]}

# Validation
pm.validate_category("samba-cifs")   # → True / False
pm.validate_edition("debian")         # → True / False
```

## Role in Installation

During `install_packages()` (installer step 14), `PackagesInstaller` reads
`packages/core.json` to get the list of packages to install inside the
chroot:

```python
pm = PackageManager()
pkgs = pm.get_packages_for_os("core", self.config.os_edition)
run_in_chroot(["apt-get", "install", "-y"] + pkgs)
```

`get_config_paths()` names the files a category owns (`smb.conf`,
`/etc/exports`, …). Nothing consumes it today: FreedomNAS restores a system by
re-applying the desired state from `config.yaml`, not by putting saved files
back.

## Category Caching

Category JSON files are loaded lazily on first access and cached in
`self.categories`. Subsequent calls to `get_packages_for_os()` for the same
category do not re-read the file.
