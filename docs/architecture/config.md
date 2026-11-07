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
| initialized | none, or nothing new | `local` — used as it is |
| initialized | one that brings something | `merged` — the shared sections are taken from the newest |
| initialized, but not matching this system | an initialized one | `reinitialized` — set up again from the newest, accounts kept (see [Boot snapshots](#boot-snapshots-and-a-configuration-that-cannot-be-trusted)) |
| not initialized | an initialized one | `restored` — the newest is copied in (a reinstall), or the one the installer was told to restore (`system.restore_from`; nothing when the installer was told `system.restore: false`), with `system.edition` set to the running edition; users who already exist here get the copy's uid (and their own group the copy's gid); whoever holds those numbers here is moved to free ones first, numbers below 1000 (the system's) are never taken |
| not initialized | none | `none` — the setup wizard runs |

"Newest" is `system.saved_at`, the UTC time `ConfigurationManager.save()`
stamps on every save; a mirrored copy carries the stamp of the save it
copies. The shared sections are taken from the newest external copy however
old it is next to the internal one: an install set up somewhere else (in a
VM, on another machine) and then booted next to the data pool gets its
shares, pools and users even though its own configuration is more recent.
Only what belongs to the pool is taken:

| Taken from the newest copy | Never taken: belongs to this install |
|---------------------------|--------------------------------------|
| `shares` (as they are there) | `system` (edition, SSH, timezone…) |
| `snapshots.policies` | |
| `modules` (per module) | each existing user's entry, admin role included |
| `storage.pools` (added) | `services`, `updates`, `installed_features` |
| users this install does not have, never as administrators | |


**User IDs.** At every boot of an initialized install, a user who exists
on the system gets its real uid and gid written into the configuration,
also when the configuration recorded none, so the copies on the data pools
always carry the numbers the files there are owned by. The reconciler gives
a share's directory its owner's group recursively only when the directory's
owner is that user's uid on this system; when the numbers differ it skips
(`directories.group_set_recursive` skipped, with both uids) instead of
handing the data to whoever holds that number here.

**The network belongs to the machine.** `network` and `system.hostname`
describe the box, not the install: the cards are known by their MAC
addresses. After the table above, an initialized install takes them from
the newest external copy that knows a card present here — in
`network.interfaces_mapping` or an interface's `mac_address` — whether that
copy is newer or older, so every edition booted on the same machine comes
up with the same names and addresses. `state-boot` then prints
`network <pool>` and leaves `network-reapply` in the state directory (the
pool, and the interfaces this install had that the taken network has not).
At that boot the reconciler forgets those interfaces
(`network.connection_forget`) and applies every interface again, also the
ones already configured, then removes the file. A copy that knows none of
the cards here was written on another machine, which may still be running
with those addresses: an install with a network of its own keeps it. A
reinstall (`restored`) takes the whole copy as before, so new hardware gets
the old network on its cards. The configuration is mirrored to the external
copies a few seconds after every save (`shadow.mirror_after_save`, hooked on
`ConfigurationManager.on_save` by the WebUI and by the `reconcile`, `boot-ok`,
`snapshot-run` and `serve` commands; saves close together give one copy), when
the setup wizard finishes, when a configuration is imported, and by the
nightly `freedomnas shadow-sync` as a second chance. A configuration that is
not initialized is never mirrored, so a fresh install cannot overwrite the copy
it would be restored from. Because the shared sections at boot come from the
newest external copy however old it is, a change that never reached the data
pool would be undone at the next boot: that is why every save is mirrored.

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

Beside `config.yaml`, each data pool's `.freedomnas` keeps the NAS's
**identity** in `identity/` (folders 0700, files 0600, root only): the
certificate authority (`tls/ca.pem`, `tls/ca-key.pem`) and the SSH host
keys (`ssh/ssh_host_*_key[.pub]`, from `system.ssh_host_key_dir` in the OS
profile). A mirror adds the files a copy does not have yet, but never
overwrites one that differs: the identity a copy keeps is the one devices
were told to trust, and a system that runs with another (a fresh image's
own CA, an older FreedomNAS that did not know `identity/`) is the one that
is wrong. A reinstall that restores the configuration (`state-boot`, action
`restored`) puts them back in place before the certificate is checked, so
the server certificate is issued again by the same authority and the SSH
service is restarted with the old keys: devices keep trusting the NAS and
SSH clients see the host key they recorded. Passwords are never copied: a
restored system asks for new ones.

### Boot snapshots and a configuration that cannot be trusted

Before anything else, every boot snapshots each external copy as
`<pool>/.freedomnas@boot-YYYYmmdd-HHMMSS`; the newest ten are kept, other
snapshots (taken by hand) are never touched. A copy left without an
initialized configuration (a write cut short, a file emptied) takes back
`config.yaml` and `identity/` from its newest snapshot that has one.

The internal configuration is then checked against the running system. It
is not trusted when

- it records another edition than the one running, or
- the newest external copy knows a network card of this machine (by MAC)
  and keeps an identity this system does not have.

Then `state-boot` answers `reinitialized` (with a `reason` line): the
install is set up again from that copy as a reinstall would be — its
identity put back in place, its shares, modules, pools and policies taken,
the running edition recorded — and the reconcile runs on it. The network
and the hostname follow the usual rule (the copy's when it knows this
machine). Accounts are the exception: those this install knows stay exactly
as they are (roles, groups, passwords), the copy's own are added as
non-administrators. An account whose uid differs from the copy's is given
the copy's uid, and its own group the copy's gid (`users.uid_set`,
`users.gid_set`), because the files on the pool carry those numbers; the
group an edition gives on its own (wheel, gid 0, on FreeBSD) is no
difference. An account or group that holds such a number here is moved first
to the first free number from 1000 that no account of the copy waits for
(`users.uid_set`, `users.group_gid_set`; on FreeBSD the moved account's home
follows); a number below 1000 belongs to the system and is never taken. The
reconciler does the same when it creates a restored account, and when that
moved anything it gives the group shares back again at the end
(`groupshares.restore`, by name), because a group that changed number no
longer owns its directory.

This is what an older FreedomNAS leaves behind: an image whose code predates
`identity/` restores the configuration but runs with a CA of its own; the
next boot with current code sees the identity differ and sets the install
up again with the original one.

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
  edition: null                 # "debian" | "arch" | "artix" | "gentoo" | "void" | "freebsd"
  root_filesystem: null         # reserved field (not actively used)
  saved_at: null                # UTC time of the last save, stamped by save()
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
  policies: []                  # {dataset, hourly, daily, weekly, monthly, recursive}

installed_features: []

services:
  boot: {}                      # service → started at boot or not, from the Services page

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
