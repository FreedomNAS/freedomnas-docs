# Package Categories

Package categories map abstract feature IDs to OS-specific package names
and service names. They decouple `config.yaml` from any specific OS.

## MANIFEST.json

```json
{
  "version": "4.0.0",
  "categories": [
    {"id": "core",           "required": true},
    {"id": "samba-cifs",     "required": false},
    {"id": "nfs",            "required": false},
    {"id": "containers",     "required": false},
    {"id": "virtualization", "required": false}
  ],
  "supported_editions": ["debian", "freebsd", "arch", "artix", "void"]
}
```

!!! note
    Every category file (`core.json`, `containers.json`, `nfs.json`,
    `samba-cifs.json`, `virtualization.json`) carries an entry per edition
    listed in `supported_editions`: `debian`, `freebsd`, `arch`, `artix`,
    `void` and `gentoo`. Gentoo's entries use full `category/name` atoms —
    the form Portage expects and the only unambiguous way to name a package
    there.

## Category Structure

**Edition names are top-level keys**, not values nested under a shared
`"packages"`/`"services"` key:

```json
{
  "id": "samba-cifs",
  "debian":  { "packages": ["samba", "samba-common-bin"], "services": ["smbd", "nmbd"], "config_paths": ["/etc/samba/smb.conf"] },
  "freebsd": { "packages": ["samba416"], "services": ["samba_server"], "config_paths": ["/usr/local/etc/smb4.conf"] },
  "arch":    { "packages": ["samba"], "services": ["smbd"], "config_paths": ["/etc/samba/smb.conf"] }
}
```

`PackageManager._load_category()` reads `category[edition]["packages"]` —
the flat alternative (`{"packages": {"debian": [...]}, "services": {"debian": [...]}}`)
is **not** what it reads, even though it looks equally plausible at a glance.

## Available Categories

### `core` (required)

Base system tools needed by FreedomNAS on every edition:
ZFS utilities, Python 3, network tools.

### `samba-cifs`

Samba file sharing server — SMB/CIFS protocol for Windows/macOS/Linux clients.

| OS | Packages | Services |
|----|---------|---------|
| Debian | `samba`, `samba-common-bin` | `smbd`, `nmbd` |
| FreeBSD | `net/samba419` | `smbd` |
| Arch | `samba` | `smb` |

### `nfs`

NFS server — Unix/Linux file sharing protocol.

| OS | Packages | Services |
|----|---------|---------|
| Debian | `nfs-kernel-server` | `nfs-server` |
| FreeBSD | (kernel built-in) | `nfsd` |
| Arch | `nfs-utils` | `nfs-server` |

### `containers`

Docker or Podman container runtime for running containerised applications.

### `virtualization`

KVM/QEMU virtual machines.

## The core's own runtime

`core.json` carries the Python stack the FreedomNAS core and WebUI import, and
it has to be complete per edition: nothing pulls these in by itself. Debian's
`python3-fastapi`, for one, depends on pydantic, starlette, uvicorn and
typing-extensions — **not** on Jinja2, which `api/main.py` needs at import
time.

!!! warning "Debian's `python3-pam` is not the library we import"
    It ships `PAM` — a C extension from 2004, module name in capitals. The
    library `api/deps.py` imports (`import pam`, `pam.pam().authenticate()`)
    is packaged on Debian as **`python3-pampy`**. Installing the
    same-sounding name left the WebUI crash-looping with
    `ModuleNotFoundError: No module named 'pam'` until its supervisor's
    circuit breaker gave up, on an installation that reported no errors at
    all. Void's `python3-pam` really is python-pam (1.8.4) and is correct.

| Module imported | Debian | Gentoo | Arch / Artix | Void | FreeBSD |
|---|---|---|---|---|---|
| interpreter | `python3` | `dev-lang/python` | `python` | `python3` | `python3` |
| `yaml` | `python3-yaml` | `dev-python/pyyaml` | `python-yaml` | `python3-yaml` | `py312-pyyaml` |
| `pam` | `python3-pampy` ⚠️ | `dev-python/python-pam` | `python-pam` | `python3-pam` | `py312-python-pam` |
| `jinja2` | `python3-jinja2` | `dev-python/jinja2` | `python-jinja` | `python3-Jinja2` | `py312-Jinja2` |
| `cryptography` | `python3-cryptography` | `dev-python/cryptography` | `python-cryptography` | `python3-cryptography` | `py312-cryptography` |
| `fastapi` | `python3-fastapi` | `dev-python/fastapi` | `python-fastapi` | `python3-fastapi` | `py312-fastapi` |
| `uvicorn` | `python3-uvicorn` | `dev-python/uvicorn` | `uvicorn` | `python3-uvicorn` | `py312-uvicorn` |
| `websockets` | `python3-websockets` | `dev-python/websockets` | `python-websockets` | `python3-websockets` | `py312-websockets` |

Note the two names that break the pattern: Arch and Artix ship uvicorn
unprefixed, and FreeBSD's prefix tracks its default interpreter, so it moves
with the ports tree.

## How Feature IDs Are Used

`config.yaml` stores feature IDs, not package names:

```yaml
installed_features:
  - id: "samba-cifs"
    enabled: true
    installed_at: "2026-01-15T10:30:00"
```

When FreedomNAS needs to install or verify `samba-cifs`, it:

1. Reads the feature ID from `config.yaml`
2. Looks up `packages/samba-cifs.json`
3. Reads the package list for the current edition
4. Installs/checks those packages via `engine.execute("packages", "install", packages="samba samba-common-bin")`

This is what enables cross-OS migration: reinstall on FreeBSD, and the
installer reads `samba-cifs` → `net/samba419` from the FreeBSD profile.
