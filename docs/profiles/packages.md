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
