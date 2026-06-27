# Configuration Manager

`config.py` manages persistent configuration as YAML on a ZFS dataset.
This configuration survives OS reinstallation and enables cross-OS migration.

## Storage Locations

| Priority | Path | When used |
|----------|------|-----------|
| Primary | `/mnt/zpool/.freedomnas/config.yaml` | Runtime (ZFS dataset mounted) |
| Fallback | `/etc/freedomnas/config.yaml` | During install, before pool is mounted |

The ZFS dataset is mounted at `/etc/freedomnas/state` with `canmount=noauto`.

## Shadow-Copy Pattern

The configuration is a **shadow backup** of the real system state.

```
Change request (WebUI / installer)
         │
         ▼
  1. Apply to OS (engine.execute)   ← OS is the source of truth
         │
         ▼
  2. Persist to config.yaml         ← YAML is the backup copy
```

`config.yaml` is **not** the source of truth at runtime. The OS is.
The YAML exists only for:

- **Disaster recovery**: reinstall OS, restore from YAML
- **Cross-OS migration**: move from Debian to FreeBSD with the same config

## Atomic Write

Configuration changes never corrupt the file:

```
write → /etc/freedomnas/state/config.yaml.tmp
rename config.yaml → config.yaml.backup
rename config.yaml.tmp → config.yaml
chmod 0o600
```

## Configuration Schema

```yaml
system:
  hostname: "freedomnas"
  timezone: "UTC"
  language: "en_US.UTF-8"
  initialized: true
  initialized_at: "2026-01-15T10:30:00"
  initialized_by: "installer"     # "installer" | "webui"
  edition: "debian"               # "debian" | "arch" | "freebsd"
  root_filesystem: "btrfs"        # "btrfs" | "zfs"

network:
  interfaces:
    - logical_name: "fnas_lan"
      mac_address: "00:1a:2b:3c:4d:5e"
      role: "LAN_MAIN"
      config:
        method: "static"
        ip: "192.168.1.50"
        cidr: 24
        gateway: "192.168.1.1"
        dns: ["1.1.1.1", "8.8.8.8"]
  interfaces_mapping:
    "00:1a:2b:3c:4d:5e": "fnas_lan"

users:
  - username: "admin"
    uid: 1000
    gid: 1000
    groups: ["sudo", "samba"]
    shell: "/bin/bash"

shares:
  smb:
    - name: "Documents"
      path: "/mnt/datapool/documents"
      read_only: false
      valid_users: ["admin"]
      guest_ok: false
  nfs:
    - name: "backup"
      path: "/mnt/datapool/backup"
      allowed_hosts: "192.168.1.0/24"
      options: "rw,sync,no_subtree_check"

storage:
  pools:
    - name: "datapool"
      vdev_type: "raidz2"
      ashift: 12
      compression: "lz4"
  boot_pool: "bpool"

installed_features:
  - id: "samba-cifs"
    enabled: true
    installed_at: "2026-01-15T10:30:00"
  - id: "nfs"
    enabled: true
    installed_at: "2026-01-15T10:30:00"

updates:
  topgrade:
    configured: true
    auto_snapshot: true
    enabled_steps: ["system", "containers", "firmware"]

reporting:
  enabled: false
```

## Key Invariants

- `config.yaml` **never** stores plaintext passwords
- File permissions are always `0o600` (root read-only)
- `is_initialized()` returns `True` only after `mark_initialized()` has been called
- `to_dict()` includes flat `smb_shares` and `nfs_shares` aliases for convenience
