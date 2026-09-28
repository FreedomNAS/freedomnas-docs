# Configuration Manager

`config.py` manages persistent configuration as YAML on a ZFS dataset.
This configuration survives OS reinstallation and enables cross-OS migration.

## Storage Locations

`<config_dir>` is the OS profile's `paths.config_dir`: `/etc/freedomnas` on
the Linux editions, `/usr/local/etc/freedomnas` on FreeBSD.

| Priority | Path | Notes |
|----------|------|-------|
| Primary | `<config_dir>/state/config.yaml` | Where the `.freedomnas` dataset mounts |
| Active | `<config_dir>/state/config.yaml` | Mounted ZFS dataset `rpool/.freedomnas` |
| Fallback | `<config_dir>/config.yaml` | Backup copy |

The installer writes to `<target root><config_dir>/state/config.yaml`.
Post-install, the ZFS dataset `rpool/.freedomnas` is mounted at
`<config_dir>/state` with `canmount=noauto`; the storage profile's
`create_state_dataset` uses the same directory, and a core test checks the
two agree on every edition.

A pool created by one edition carries that edition's mountpoint on its
`.freedomnas` dataset. When `firstboot.sh` finds it on another edition — a
Debian pool on FreeBSD, say — it sets the dataset's mountpoint to this
edition's `<config_dir>/state` before mounting it.

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

`config.yaml` is **not** the source of truth at runtime — the OS is.
The YAML exists for:

- **Disaster recovery**: reinstall OS, restore from YAML via `ReconciliationEngine`
- **Cross-OS migration**: move from Debian to FreeBSD with the same config

## Atomic Write Pattern

Save operations use a three-step atomic write to prevent corruption:

```
write → config.yaml.tmp   (mode 0o600)
rename config.yaml → config.yaml.backup
rename config.yaml.tmp → config.yaml
```

If the rename fails, the backup is restored automatically.

## Configuration Schema

```yaml
system:
  hostname: "freedomnas"
  timezone: "UTC"
  language: "en_US.UTF-8"
  initialized: false
  initialized_at: null
  initialized_by: null          # "installer" | "webui"
  edition: null                 # "debian" | "arch" | "freebsd"
  root_filesystem: null         # reserved field (not actively used)
  # ssh_enabled: false          # not in the template; written by the setup
  #                             # wizard and POST /api/system/ssh

network:
  interfaces: []
  interfaces_mapping: {}        # MAC → logical_name

users: []

shares:
  smb: []
  nfs: []

storage:
  pools: []
  boot_pool: null               # FreeBSD only

snapshots:
  root: []
  boot: []
  policies: []                  # {dataset, hourly, daily, weekly, monthly}

installed_features: []

updates:
  topgrade:
    configured: false
    auto_snapshot: true
    enabled_steps: []

reporting:
  enabled: false
```

### Example populated config

```yaml
system:
  hostname: "freedomnas"
  timezone: "Europe/Rome"
  initialized: true
  initialized_at: "2026-07-18T10:30:00"
  initialized_by: "installer"
  edition: "debian"
  ssh_enabled: false

network:
  interfaces:
    - logical_name: "eth0"
      mac_address: "00:1a:2b:3c:4d:5e"
      config:
        method: "static"
        ip: "192.168.1.50"
        cidr: 24
        gateway: "192.168.1.1"
        dns: ["1.1.1.1", "8.8.8.8"]
  interfaces_mapping:
    "00:1a:2b:3c:4d:5e": "eth0"

users:
  - username: "admin"
    groups: ["sudo"]
    admin: true                  # in the edition's sudo group; set by the installer and the wizard
  - username: "mario"
    groups: []
    shell: "/bin/bash"

shares:
  smb:
    - name: "Documents"
      path: "/mnt/datapool/documents"
      comment: "Documents"
      acl: "Everyone:R,admin:F"  # what Samba enforces; restored as recorded
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
    - name: "rpool"
      vdev_type: "single"
      ashift: 12
      compression: "lz4"
    - name: "datapool"
      vdev_type: "mirror"
      encrypted: true            # set by /api/setup/initialize when pool.master_passphrase is given
      usb_keyslot_devices: 2     # count only -- never the key material; see the keymgmt.py docs

installed_features:
  - id: "samba-cifs"
    enabled: true
    installed_at: "2026-07-18T10:30:00"

updates:
  topgrade:
    configured: true
    auto_snapshot: true
    enabled_steps: ["system", "containers"]
```

## Key Methods

```python
class ConfigurationManager:
    # System
    def get_hostname() -> str
    def set_hostname(hostname: str)
    def get_timezone() -> str
    def set_timezone(timezone: str)
    def is_initialized() -> bool
    def mark_initialized(edition: str, initialized_by: str)

    # Network
    def get_interface(logical_name: str) -> dict | None
    def add_interface(interface_config: dict)
    def remove_interface(logical_name: str)

    # Users
    def get_user(username: str) -> dict | None
    def add_user(user_config: dict)
    def remove_user(username: str)
    def get_users() -> list

    # Storage
    def get_pool(pool_name: str) -> dict | None
    def add_pool(pool_config: dict)
    def remove_pool(pool_name: str)
    def get_pools() -> list

    # Shares
    def add_smb_share(share_config: dict)
    def remove_smb_share(share_name: str)
    def get_smb_shares() -> list
    def add_nfs_share(share_config: dict)
    def remove_nfs_share(name: str)
    def get_nfs_shares() -> list

    # Snapshots
    def add_root_snapshot(snapshot_name: str, metadata: dict = None)
    def get_root_snapshots() -> list

    # Features
    def add_installed_feature(feature_id: str, enabled: bool, metadata: dict = None)
    def remove_installed_feature(feature_id: str)
    def get_installed_features() -> list

    # Updates
    def is_topgrade_configured() -> bool
    def configure_topgrade(enabled_steps: list[str])

    # Generic
    def get(key: str, default=None) -> Any     # dot-notation: "system.hostname"
    def set(key: str, value: Any)              # dot-notation
    def to_dict() -> dict                      # adds flat smb_shares + nfs_shares aliases
```

## Key Invariants

- `config.yaml` **never** stores plaintext passwords
- Likewise, an encrypted pool's `encrypted`/`usb_keyslot_devices` fields are
  metadata only — the wrapped keys themselves live outside `config.yaml`, in
  `/etc/freedomnas/keyslots/<pool>.json` (see Security)
- File permissions are always `0o600`
- `to_dict()` adds top-level `smb_shares` and `nfs_shares` aliases so the
  `ReconciliationEngine` can address them without nesting into `shares.smb`
- On load, missing keys are merged from `DEFAULT_CONFIG` via deep merge
- Validation runs on both load and save; raises `ConfigurationException` on
  type or structure errors
