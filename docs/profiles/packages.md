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
  "supported_editions": ["debian", "freebsd", "arch"]
}
```

## Category Structure

```json
{
  "category_id": "samba-cifs",
  "category_name": "Samba/CIFS",
  "packages": {
    "debian":  ["samba", "samba-common-bin"],
    "freebsd": ["net/samba419"],
    "arch":    ["samba"]
  },
  "services": {
    "debian":  ["smbd", "nmbd"],
    "freebsd": ["smbd"],
    "arch":    ["smb"]
  }
}
```

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
