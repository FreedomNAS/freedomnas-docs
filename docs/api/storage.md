# Storage API

## GET /api/storage/pools

List all ZFS pools.

**Auth required:** yes

**Response:**

```json
{
  "pools": [
    { "name": "rpool", "size": "465G" },
    { "name": "datapool", "size": "10.9T" }
  ]
}
```

The fields returned depend on the `zfs.pool_list` command in the active OS profile.
The backend splits each output line by tabs and maps position 0 → `name`,
position 1 → `size`.

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
      "used": "45.6G",
      "avail": "8.71T",
      "refer": "45.3G",
      "mountpoint": "/mnt/datapool/documents"
    }
  ]
}
```

Fields come from the `zfs.dataset_list` profile command (typically
`zfs list -H -o name,used,avail,refer,mountpoint`).

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
      "creation": "2026-07-18T10:30:00",
      "used": "1.2G"
    }
  ]
}
```

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

## `POST /api/storage/pools/{pool}/devices`

Attach a cache (L2ARC) or log (SLOG) device to a pool that already exists.

**Auth required:** yes

```json
{ "role": "cache", "devices": ["/dev/disk/by-id/ata-SSD_xxx"] }
```

`role` is `cache` or `log`; anything else is `422`. Several devices in one
call become one `zpool add`.

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
