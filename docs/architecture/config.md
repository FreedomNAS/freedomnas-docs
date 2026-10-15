# Configuration Manager

`config.py` manages persistent configuration as YAML on ZFS datasets.
This configuration survives OS reinstallation and enables cross-OS migration.

## Storage Locations

`<config_dir>` is the OS profile's `paths.config_dir`: `/etc/freedomnas` on
the Linux editions, `/usr/local/etc/freedomnas` on FreeBSD.

| Copy | Dataset | Mountpoint | Role |
|------|---------|------------|------|
| Internal | `<root pool>/.freedomnas` | `<config_dir>/state` | This install's own configuration: the one in use |
| External | `<data pool>/.freedomnas` | `<config_dir>/shared` | Portable copy on every other pool that has the dataset |
| Fallback | — | `<config_dir>/config.yaml` | A system whose root is not on ZFS |

Both are `canmount=noauto`. Only the internal one is ever mounted at
`<config_dir>/state`; an external one is mounted for a moment at a temporary
directory to be read or written, and its own mountpoint is never used — the
two never compete for the state directory.

The installer writes `<target root><config_dir>/state/config.yaml` on the
root filesystem, not initialized, and creates no dataset. At every boot
`firstboot.sh` runs `freedomnas state-boot` (`shadow.boot`), which:

1. creates the internal dataset if it is missing (the first boot, or a
   system set up before it existed), moves what the state directory holds
   into it and mounts it there. A system that served its state from a data
   pool's dataset has that one unmounted and turned into an external copy:
   nothing is destroyed. The internal dataset gets the ZFS user property
   `org.freedomnas:role=internal`;
2. gives every other pool's `.freedomnas` the external mountpoint, except
   the root pool of another install (see below);
3. decides where the configuration comes from:

| Internal | External | Action |
|----------|----------|--------|
| initialized | none newer | `local` — used as it is |
| initialized | a newer one | `merged` — the shared sections are taken from the newest |
| not initialized | an initialized one | `restored` — the newest is copied in (a reinstall), with `system.edition` set to the running edition and, for users who already exist here, this system's uid and gid |
| not initialized | none | `none` — the setup wizard runs |

"Newer" is `system.saved_at`, the UTC time `ConfigurationManager.save()`
stamps on every save; a mirrored copy carries the stamp of the save it
copies. An external copy newer than the internal one was written by another
install sharing the pool — another edition on another disk of the same
machine. From it only what belongs to the pool is taken:

| Taken from the newer copy | Never taken: belongs to this install |
|---------------------------|--------------------------------------|
| `shares` (as they are there) | `system` (hostname, edition, SSH, timezone…) |
| `snapshots.policies` | `network` (interfaces are bound to MACs) |
| `modules` (per module) | each existing user's entry, admin role included |
| `storage.pools` (added) | `services`, `updates`, `installed_features` |
| users this install does not have, never as administrators | |

A copy written before `saved_at` existed is always older, so it is never
merged. The configuration is mirrored to the external copies by the
nightly `freedomnas shadow-sync`, when the setup wizard finishes, and when a
configuration is imported (`shadow.sync`).

The setup wizard's "pool that keeps the configuration" is now the pool that
gets the external copy (see [`/api/setup/initialize`](../api/setup.md)).

To find it, `firstboot.sh` imports every pool with `zpool import -a -N -f
-o cachefile=none`. The `-f` is what lets a reinstall restore: the data
pool was last used by the old system, under another hostid, and nobody
exported it. Nothing is mounted by the import, nothing is written to the
cachefile, and every pool imported that way is exported again unless the
configuration needs it: a pool with an external copy, a pool named in
`storage.pools`, or the pool of a module (`modules.<id>.pool`).

**Another install's root pool.** Two editions on two disks of the same
machine each see the other's root pool. A pool whose `.freedomnas` carries
`org.freedomnas:role=internal`, or that has a `bootfs`, is another install's
root: its `.freedomnas` is that install's truth, so it is never read as a
copy, never written by `shadow.sync`, its mountpoint is never changed, and
it is always exported again. Configuration passes between the two installs
only through the external copies on the data pools.

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

modules: {}                     # community modules' own sections, by module id

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
    groups: []
    admin: true                  # never a group name: joins the running edition's users.sudo_group
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

    # Community modules
    def get_module_config(module_id: str) -> dict          # a copy of modules.<id>, {} if none
    def set_module_config(module_id: str, section: dict)   # replace modules.<id> and save

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
  `/etc/freedomnas/keyslots/<pool>.json` and in the pool's
  `org.freedomnas:keyslots` property (see Security)
- File permissions are always `0o600`
- `to_dict()` adds top-level `smb_shares` and `nfs_shares` aliases so the
  `ReconciliationEngine` can address them without nesting into `shares.smb`
- On load, missing keys are merged from `DEFAULT_CONFIG` via deep merge
- An administrator is `admin: true`, never a group name: on load and in
  `add_user()` (`normalize_user`) any edition's `users.sudo_group` — every
  `users/users-*.json`, `known_admin_groups()` — is removed from `groups`
  and turns into `admin: true`, so a file written on Debian (`sudo`) reads
  the same on Gentoo (`wheel`)
- Every save stamps `system.saved_at` (UTC)
- Validation runs on both load and save; raises `ConfigurationException` on
  type or structure errors
