# Storage API

## GET /api/storage/pools

List all ZFS pools.

**Auth required:** yes

**Response:**

```json
{
  "pools": [
    { "name": "rpool", "size": 499289948160, "used": 74893492224,
      "free": 424396455936, "used_pct": 15, "health": "ONLINE" },
    { "name": "datapool", "size": 11990354000000, "used": 4796141867827,
      "free": 7194212132173, "used_pct": 40, "health": "ONLINE" }
  ]
}
```

The profile command is
`zpool list -Hp -o name,size,alloc,free,capacity,health`: the columns are
named rather than left to `zpool`'s default order, which differs between
OpenZFS releases. The backend splits each line by tabs and maps position
0 → `name`, 1 → `size`, 2 → `used`, 3 → `free`, 4 → `used_pct`,
5 → `health`.

A pool recorded in `config.yaml` also carries what was recorded for it
there: `vdev_type` and `encrypted`. Its `cache_devices` and `log_devices`
are read from the pool itself (`zfs.pool_leaf_devices`, `zpool list -vHP`:
the vdevs under its `cache` and `logs` headings), so a pool created or
imported outside the WebUI shows them too; what `config.yaml` recorded is
used only when ZFS cannot answer. Every pool carries `protected`: `null`, or
why it must not be exported or destroyed (`freedomnas.pool_removal.problem`).

`-p` prints exact byte counts, and the page formats them; a profile whose
command omits `-p` sends `"3.6T"`, which is passed through as the string it
is. A profile that prints fewer columns simply yields fewer keys — `name`
and `size` are the only ones the page needs to draw a pool at all.

**Errors:**

| Code | Detail |
|------|--------|
| 500 | ZFS command failed or profile key missing |

---

## GET /api/storage/datasets

List all ZFS datasets.

**Auth required:** yes

**Response:**

```json
{
  "datasets": [
    {
      "name": "datapool/documents",
      "used": 48964566016,
      "avail": 9576649629696,
      "refer": 48642826240,
      "mountpoint": "/mnt/datapool/documents",
      "protected": null
    }
  ]
}
```

Fields come from the `zfs.dataset_list` profile command,
`zfs list -Hp -o name,used,avail,refer,mountpoint` in every edition: the
sizes are exact byte counts, as numbers (a profile without `-p` sends its
strings unchanged). `protected` is `null`, or why the dataset must not be
moved, renamed or destroyed from the WebUI: it belongs to the pool the
system runs from, is `.freedomnas`, is `legacy` (fstab), mounts on a system
directory — or a dataset inside it does (`freedomnas.datasets.subtree_reason`).

---

## POST /api/storage/datasets

```json
{
  "parent": "datapool",
  "name": "media",
  "mountpoint_mode": "inherit",
  "mountpoint": "",
  "owner": "anna",
  "properties": { "compression": "zstd", "casesensitivity": "mixed" }
}
```

`mountpoint_mode` is `inherit` (default), `path` (then `mountpoint`) or
`none`. `properties` are checked against the edition's catalogue, including
the create-only ones; empty values are left out. Runs
`zfs.dataset_create_with` (`zfs create -o k=v … <dataset>`).

`422` for a parent in the pool the system runs from, a name that is not one
`[A-Za-z0-9][A-Za-z0-9_.:-]*` part, a dataset that exists, a missing parent,
an unknown property or value, or a mountpoint — chosen or inherited — that
is a system directory, already mounted, or a non-empty directory.

The dataset's directory is then given to `owner` (default: the signed-in
account): `directories.owner_set`, `directories.group_set` (the owner's own
group on Linux, `wheel` on FreeBSD) and `directories.mode_set` make it that
account's, mode `0700`, so the shares made of it are that account's alone.
An `owner` with no account is a `422` before anything is created. A dataset
that is not mounted (`mountpoint_mode: none`) has no directory to give, and
a dataset whose directory could not be given is still created: the response
then carries a `warning`.

**Response:** `{ "dataset": "datapool/media", "owner": "anna" }`

---

## GET /api/storage/datasets/{dataset}/dependents

What a change to the dataset touches:

```json
{
  "dataset": "datapool/media",
  "mountpoint": "/datapool/media", "mountpoint_source": "inherited from datapool",
  "children": ["datapool/media/films"],
  "snapshots": ["datapool/media@daily-2026-09-28"],
  "shares": { "smb": [ … ], "nfs": [ … ] },
  "policies": ["datapool/media"],
  "protected": null
}
```

`shares` are those whose path is the mountpoint or below it.

---

## PUT /api/storage/datasets/{dataset}/mountpoint

```json
{ "mode": "path", "mountpoint": "/srv/media", "update_shares": true }
```

`mode` is `inherit` (`zfs inherit mountpoint`), `path` or `none`. The same
checks as creation apply to the new place. With `update_shares`, the shares
under the old mountpoint are re-created under the new one (SMB: the
usershare is removed — Samba may already have dropped it, since its
directory is gone — and added again; NFS: the export line is replaced).

```json
{ "dataset": "datapool/media", "old": "/datapool/media", "new": "/srv/media",
  "shares": { "moved": ["smb:media"], "left": [], "warnings": [] } }
```

---

## POST /api/storage/datasets/{dataset}/rename

```json
{ "new_name": "datapool/video", "update_shares": true }
```

Within the same pool; the new parent must exist. Snapshot policies of the
dataset and its children are renamed with it. The response is that of the
mountpoint change: an inherited mountpoint moves with the name.

---

## DELETE /api/storage/datasets/{dataset}?confirm=…&recursive=…&remove_shares=…

`confirm` must be the dataset's full name. Without `recursive`, a dataset
with children or snapshots is refused; without `remove_shares`, one with
shares under its mountpoint is refused. A pool's own dataset is never
destroyed here. Its snapshot policies, and its children's, are removed.

```json
{ "dataset": "datapool/media", "removed_shares": ["smb:media"], "warnings": [] }
```

---

## GET /api/storage/snapshots

List all ZFS snapshots.

**Auth required:** yes

**Response:**

```json
{
  "snapshots": [
    {
      "name": "rpool/ROOT/debian@pre-update-20260718",
      "creation": "1784370600",
      "used": "1288490188"
    }
  ]
}
```

From `zfs.snapshot_list`, `zfs list -t snapshot -Hp -o name,creation,used`:
`creation` is seconds since 1970 and `used` a byte count.

---

## POST /api/storage/snapshots

Create a ZFS snapshot and record it in `config.yaml`.

**Auth required:** yes

**Request body:**

```json
{
  "dataset": "rpool/ROOT/debian",
  "snap_name": "pre-update-20260718"
}
```

Both fields are required; `422` is returned if either is missing.

**Behaviour:**

1. `engine.execute("zfs", "snapshot_create", dataset=..., snap_name=...)`
2. `config.add_root_snapshot("rpool/ROOT/debian@pre-update-20260718")`

**Response:**

```json
{ "snapshot": "rpool/ROOT/debian@pre-update-20260718" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 422 | `dataset` or `snap_name` missing |
| 500 | ZFS command failed (dataset doesn't exist, pool degraded, etc.) |


---

## `GET /api/storage/devices`

The block devices this machine has, and what is already on them.

**Auth required:** yes

```json
{ "devices": [
  { "name": "/dev/sdb", "parent": "", "size": 2000398934016, "type": "disk",
    "fstype": "", "mountpoint": "", "model": "WDC WD20", "in_use": false, "reserved": false },
  { "name": "/dev/sda1", "parent": "/dev/sda", "size": 500098400256, "type": "part",
    "fstype": "zfs_member", "mountpoint": "", "model": "", "in_use": true, "reserved": false },
  { "name": "/dev/sda2", "parent": "/dev/sda", "size": 8388608, "type": "part",
    "fstype": "", "mountpoint": "", "model": "", "in_use": true, "reserved": true }
] }
```

`reserved` marks the small partition ZFS creates beside its own when it is
given a whole disk (type `6a945a3b-1dd2-11b2-99a6-080020736631`, "Solaris
reserved 1", read from lsblk's `PARTTYPE`): it carries no filesystem, so
without this it would look free.

`in_use` is true when the device carries a filesystem or is mounted, and
for a whole disk when any of its partitions is (lsblk's `PKNAME` names each
partition's disk): the disk of the running system shows no filesystem of
its own, only its partitions do. The pool form and the setup wizard show
those greyed out, so nobody can pick the disk their system is running from.

On Linux this is `lsblk -pbP` (key="value" pairs, which parse without
guessing at column widths). FreeBSD has no lsblk: it answers with
`sysctl -n kern.disks`, so the entries carry names and nothing else.

---

## `POST /api/storage/pools`

Create a pool.

**Auth required:** yes

```json
{
  "name": "datapool",
  "vdev_type": "raidz2",
  "devices": ["/dev/sda", "/dev/sdb", "/dev/sdc", "/dev/sdd"],
  "cache_devices": ["/dev/nvme0n1"],
  "log_devices": [],
  "encrypted": true,
  "master_passphrase": "…"
}
```

`vdev_type` is `""` (stripe), `mirror`, `raidz1`, `raidz2` or `raidz3`.
With `encrypted`, an optional `usb_devices` list writes a `freedomnas.key`
onto each of those sticks; each must be a partition of a removable device
from `GET /api/storage/usb-devices`, and not also a data, cache or log
device (`422` otherwise, and without `encrypted`). Unencrypted pools also
accept `ashift` (default `12`) and `compression` (default `lz4`).

This endpoint backs the **Storage → Create Pool** form
(`storage.js` → `submitPool()`).

This is the one operation in the WebUI that destroys what it touches, so it
is deliberately literal:

| Refused with `422` | Why |
|---|---|
| a name that is not `[A-Za-z][A-Za-z0-9_.:-]*` | ZFS would refuse it later, less clearly |
| an empty device list | nothing to build on |
| the same device in two roles | a disk is data, or cache, or log — not two |
| a device that is not one normalised `/dev/...` path | see below |
| a `vdev_type` other than `""`, `mirror`, `raidz1`, `raidz2`, `raidz3` | see below |
| `encrypted` with a passphrase under 12 characters | |
| a `usb_devices` entry that is not a removable partition, or `usb_devices` without `encrypted` | `freedomnas.key` is written onto a mounted filesystem |

**`-f` is never passed.** A disk that already carries somebody else's pool is
refused by ZFS itself, and that refusal is better coming from ZFS than from a
guess made here — it comes back as `500` with the original message.

That promise needs the device check. Devices and `vdev_type` are `multi_args`:
they are split into several `zpool` arguments, and the engine cannot refuse a
leading `-` there as it does for single values, because the installer passes
`-f` through `rootpool.force` on purpose. So `"-f"` among the devices, or
`"-O mountpoint=/etc mirror"` as the vdev type, used to reach `zpool create`
— and on Linux `zpool` reads options even after the pool name. A device must
now start with `/dev/`, contain no whitespace or control characters, and be
already normalised (no `..`); the vdev type must be one of the five above.
The same check applies to `POST /pools/{pool}/devices` and to the pool in
`POST /api/setup/initialize`.

After the pool exists: cache and log are attached, the shadow dataset
`<pool>/.freedomnas` is created, and the pool is recorded in `config.yaml`.
A cache device that fails to attach does not fail the request — the pool is
already there — and comes back in `warnings`.

---

## `GET /api/storage/usb-devices`

The partitions of removable devices, where a pool's `freedomnas.key` can be
written (`media.list_removable`):

```json
{ "devices": ["/dev/sdh1"] }
```

---

## `GET /api/storage/pools/importable`

The pools `zpool import` finds on the attached disks (`zfs.pool_importable`),
one entry per pool:

```json
{ "pools": [
  { "name": "naspool", "id": "11200611346329343249", "state": "ONLINE",
    "status": "The pool was last accessed by another system.",
    "action": "The pool can be imported using its name or numeric identifier and the '-f' flag.",
    "foreign": true, "importable": true }
] }
```

`foreign` means the pool was last used by another host and needs `force`;
`importable` is false for a pool that is not `ONLINE` or `DEGRADED`.

---

## `POST /api/storage/pools/import/inspect`

Look at a pool without changing it. The pool is imported read-only, without
mounting, under a temporary name (`zpool import -N -t -o readonly=on`), read,
and exported again — even the host that last used it stays recorded as it
was.

```json
{
  "pool_id": "11200611346329343249",
  "name": "tank",
  "force": false,
  "mountpoint": "/mnt/tank",
  "passphrases": { "": "…", "secret": "…" }
}
```

For a pool encrypted by FreedomNAS (raw key, keyslots on the pool) add

```json
{ "keyslot_unlock": { "method": "usb" } }
{ "keyslot_unlock": { "method": "file", "key": "<freedomnas.key, base64>" } }
{ "keyslot_unlock": { "method": "passphrase", "passphrase": "…" } }
```

Only `pool_id` is required. `name` imports it under another name,
`mountpoint` projects a new mountpoint for the pool's own dataset,
`passphrases` maps encryption roots (relative to the pool, `""` for the pool
itself) to their passphrases, which reach `zfs load-key` on stdin.

The report:

| Field | Meaning |
|---|---|
| `pool` | the listing entry, plus `final_name` |
| `datasets` | each dataset with the mountpoint it would get, `canmount`, `used`, `encrypted`, `locked` |
| `refused` | why this is another system's root; not empty = cannot be imported |
| `conflicts` | datasets that would mount on a system directory, an occupied mount point or a non-empty directory |
| `encryption_roots` | per root: `keyformat`, `unlocked`, `unlock_methods` (`usb`, `file`, `passphrase` when the pool carries keyslots), `error`, and `blocking` when that error stops an import |
| `config_locked` | its `.freedomnas` is still locked, so its configuration was not read |
| `root_mountpoint`, `current_root_mountpoint` | where the pool's dataset would mount, and where it mounts now |
| `name_taken` | a pool with `final_name` is already imported |
| `freedomnas` | the pool has a `.freedomnas` dataset |
| `shares` | from its `config.yaml`: SMB and NFS shares whose path is on this pool, with the path translated to the new mountpoint, the users an SMB share needs, and `exists_here` |
| `users` | the accounts of its `config.yaml` plus those the shares name: `uid`, `groups`, `admin`, `exists_here`, `uid_taken`, `groups_here` |
| `config_error` | why its `config.yaml` could not be read |

`422` for a pool of another system without `force`, an unknown id, a pool
that is not importable, or a system directory as `mountpoint`.

---

## `POST /api/storage/pools/import`

Import the pool for good. Takes the same fields as `inspect`, plus:

```json
{
  "smb": ["media"],
  "nfs": ["media-nfs"],
  "users": [{ "username": "carla", "password": "…", "admin": false }]
}
```

The pool is inspected again first, and the import is refused with `422` if
it holds another system's root, its name is taken, a dataset would mount
somewhere it must not, a passphrase is missing or wrong, a chosen SMB share
needs a user that does not exist here and has no password in `users`, or a
password breaks the rules of `POST /api/users/`.

Then, in order:

1. `zpool import -N` by id under the final name (`-f` only with `force`)
2. the keys: passphrase roots with their passphrase, FreedomNAS roots through `keyslot_unlock`; roots with another kind of key and no keyslots stay locked and come back in `warnings`
3. `zfs set mountpoint=` on the pool if `mountpoint` differs from its own
4. the datasets with `canmount=on` that are not mounted yet (`zfs.mount_pool_auto` — never `.freedomnas`, whose `canmount=noauto` would put it over this system's configuration)
5. the pool's `config.yaml` is copied to `config.yaml.imported` beside it, before this system's copy is mirrored over it
6. `<pool>/.freedomnas` is created if missing, and the pool recorded in `config.yaml` with `imported: true`
7. the users: same uid as on the other system when it is free here, only the groups that exist here, this edition's administrator group only with `admin`; created like `POST /api/users/`, rollback included
8. the shares, through the same code as `POST /api/shares/smb` and `/nfs`; one whose name is already used here is left alone

A failure in steps 1–5 gives the pool its mountpoint back and exports it
again. Users and shares that fail do not undo the import: they come back in
`warnings`.

```json
{ "pool": "tank", "users": ["carla"], "shares": ["smb:media", "nfs:media-nfs"],
  "kept_config": "tank/.freedomnas:config.yaml.imported", "adopted_keyslots": false,
  "warnings": [] }
```

`adopted_keyslots` is true when the keyslots of a FreedomNAS encrypted pool
were copied to this system's keyslot directory, so it unlocks at boot.

---

## `GET /api/storage/pools/{pool}/removal`

What exporting or destroying the pool takes along:

```json
{ "pool": "tank", "protected": null,
  "datasets": ["tank", "tank/.freedomnas", "tank/media"],
  "encrypted": true, "keyslots": true,
  "shares": { "smb": [ … ], "nfs": [ … ] },
  "policies": ["tank/media"] }
```

`shares` are those under any of its datasets' mountpoints.

---

## `POST /api/storage/pools/{pool}/export`

```json
{ "remove_shares": true }
```

`zpool export` (`zfs.pool_export`), never `-f`. Refused with `422` for the
pool the system runs from, the pool whose `.freedomnas` serves the live
configuration, a pool with a dataset mounted on a system directory or through
fstab, and — without `remove_shares` — a pool with shares on it. After the
export: its shares (if asked), its snapshot policies and its `config.yaml`
entry are removed; its keyslot file stays. A busy dataset makes ZFS refuse:
`500` with ZFS's message, and nothing else changes.

```json
{ "pool": "tank", "action": "export", "forgot_keyslots": false,
  "removed_shares": ["smb:media"], "warnings": [] }
```

---

## `DELETE /api/storage/pools/{pool}?confirm=…&remove_shares=…`

`zpool destroy` (`zfs.pool_destroy`), never `-f`. `confirm` must be the
pool's name. The same refusals and clean-up as the export, and the pool's
keyslot file is removed too (`forgot_keyslots`).

---

## `POST /api/storage/pools/{pool}/devices`

Attach a cache (L2ARC) or log (SLOG) device to a pool that already exists.

**Auth required:** yes

```json
{ "role": "cache", "devices": ["/dev/disk/by-id/ata-SSD_xxx"] }
```

`role` is `cache` or `log`; anything else is `422`, and so is a device that
is not a `/dev/...` path (see [creating a pool](#post-apistoragepools)).
Several devices in one call become one `zpool add`.

Neither kind holds data, which is why they are attached **after** the pool
exists — the same endpoint serves "add the SSD I just bought" and "choose an
SSD while creating the pool", because creation attaches them straight
afterwards. An SSD that will not attach is reported and the pool is left as
it was.

The devices are recorded in `config.yaml` and come back in
`GET /api/storage/pools`, which `zpool list` alone does not report.

---

## `DELETE /api/storage/pools/{pool}/devices?device=…`

Detach one again. No data is lost: a cache or log device holds none.

The device is a **query parameter, not a path segment** — `/dev/disk/by-id/…`
inside a path loses its leading slash, and `zpool remove` would be handed a
relative name meaning something else entirely.

ZFS itself decides what may be removed: it accepts cache, log, spares and
some data vdevs, and refuses the rest. That refusal comes back as `500` with
its own message, which is the right place for it to come from.

---

## `GET /api/storage/properties`

The ZFS properties this edition supports, as a catalogue.

**Auth required:** yes

The catalogue lives in the profile (`zfs_properties` in
`storage/storage-<edition>.json`), because which properties exist and which
values they take is an edition's business: `xattr=sa` and `acltype=posix` are
Linux, `aclmode` and `aclinherit` are FreeBSD.

```json
{ "properties": {
  "compression": {
    "level": "assisted",
    "type": "enum",
    "values": ["off", "on", "lz4", "zstd", "…"],
    "default": "lz4",
    "help": "Transparent compression. lz4 is nearly free; …"
  },
  "dedup": { "level": "expert", "…": "…" },
  "casesensitivity": { "level": "expert", "create_only": true, "…": "…" }
} }
```

`level` is the UI level the property belongs to — `assisted`, `advanced` or
`expert`. **The API always returns everything**; it is the WebUI that hides
what is above the level in use, so a client that knows what it is doing is
never locked out of its own storage.

`create_only` marks what can only be chosen when the dataset is made
(`casesensitivity`, `normalization`); those are refused by the `PUT`.

---

## `GET /api/storage/datasets/{dataset}/properties`

What one dataset has those properties set to, and where each value comes
from (`local`, `default`, `inherited from …`). Properties outside the
catalogue are filtered out.

```json
{ "dataset": "tank/home",
  "properties": {
    "compression": { "value": "lz4", "source": "local" },
    "recordsize":  { "value": "131072", "source": "default" }
  } }
```

---

## `PUT /api/storage/datasets/{dataset}/properties`

Change one or more. The body is a flat mapping:

```json
{ "compression": "zstd", "quota": "100G" }
```

Every value is validated against the catalogue before anything runs: an
unknown property, a value outside an enum, a malformed size or a
`create_only` property all return `422` and **nothing is applied**.

Each accepted property is then set with `zfs.dataset_set`. If some succeed
and others fail the response is `207` with both lists — ZFS applies them one
at a time and there is no way to roll back the ones that already took.

```json
{ "dataset": "tank/home", "applied": ["compression"], "failed": [] }
```

---

## `GET /api/storage/snapshot-policies`

The scheduled-snapshot policies, as stored in `config.yaml`.

**Auth required:** yes

**Response:**

```json
{ "policies": [
  { "dataset": "tank/home", "hourly": 24, "daily": 7, "weekly": 4, "monthly": 0 }
] }
```

---

## `PUT /api/storage/snapshot-policies/{dataset}`

Set how many snapshots of each interval to keep for one dataset. The dataset
goes in the path with its slashes intact (`/api/storage/snapshot-policies/tank/home`).

**Auth required:** yes

**Request:**

```json
{ "hourly": 24, "daily": 7, "weekly": 4, "monthly": 12 }
```

An interval left out counts as `0`, meaning "do not take these". The route
writes the policy and nothing else — cron runs
`freedomnas snapshot-run --interval <interval>` and the scheduler in core
takes and prunes. Nothing here talks to ZFS, so a policy can be set for a
dataset that is temporarily unavailable.

**Errors:**

| Code | Detail |
|------|--------|
| 422 | a count is not a whole number, or every count is zero (remove the policy instead) |

---

## `DELETE /api/storage/snapshot-policies/{dataset}`

Stop taking scheduled snapshots of a dataset. **Existing snapshots are left
alone** — the scheduler only ever destroys what it is still asked to manage.

**Auth required:** yes

**Errors:**

| Code | Detail |
|------|--------|
| 404 | no policy for that dataset |

## `GET /api/storage/disks/`

Every disk `smartctl --scan` finds, read with `smartctl -a -j -n standby`
(a disk in standby is not woken up) and matched to the pools that use it
(`zpool status -LP`, through `list_devices` for partitions).

```json
{
  "available": true,
  "disks": [
    {
      "name": "sda",
      "path": "/dev/sda",
      "pools": ["tank"],
      "model": "ST9500325AS",
      "serial": "S2W518DB",
      "size": 500107862016,
      "kind": "HDD",
      "protocol": "ATA",
      "health": "warning",
      "reasons": ["25 reallocated sectors", "24 transfer (CRC) errors: check the cable"],
      "temperature": 31,
      "power_on_hours": 14391,
      "counters": {"reallocated": 25, "reported_uncorrect": 5269, "pending": 0,
                   "offline_uncorrectable": 0, "crc_errors": 24},
      "last_test": {"type": "Short offline", "status": "Completed without error",
                    "passed": true, "hours": 13611},
      "test_running": null,
      "error_count": 4885,
      "attributes": [{"id": 5, "name": "Reallocated_Sector_Ct", "value": 99, "worst": 99,
                      "thresh": 36, "raw": "25", "when_failed": ""}]
    }
  ]
}
```

`health` is `ok`, `warning`, `failing`, `standby` or `unknown` (no SMART
data); `reasons` says why. `kind` is `HDD`, `SSD` or `NVMe`. For an NVMe,
`counters` holds `percentage_used`, `media_errors` and `available_spare`.
`test_running` is `{"remaining_percent": N}` while a self-test runs. When
`smartctl` is not installed the answer is `{"available": false, "disks": []}`.

## `POST /api/storage/disks/{disk}/test`

```json
{"type": "short"}
```

Starts a SMART self-test (`short` or `long`) on a disk `smartctl --scan`
lists, by its name (`sda`, `nvme0`). Any other disk is a 404, any other type
a 400.

