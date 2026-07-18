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
