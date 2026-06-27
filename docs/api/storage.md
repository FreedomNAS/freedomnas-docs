# Storage API

## GET /api/storage/pools

List all ZFS pools.

**Auth required:** yes

**Response:**

```json
[
  {
    "name": "datapool",
    "health": "ONLINE",
    "size": "10.9T",
    "allocated": "2.14T",
    "free": "8.76T"
  }
]
```

---

## GET /api/storage/datasets

List all ZFS datasets.

**Auth required:** yes

**Response:**

```json
[
  {
    "name": "datapool/documents",
    "used": "45.6G",
    "available": "8.71T",
    "mountpoint": "/mnt/datapool/documents",
    "type": "filesystem"
  }
]
```

---

## GET /api/storage/snapshots

List all ZFS snapshots.

**Auth required:** yes

**Response:**

```json
[
  {
    "name": "datapool/documents@pre-update-20260627",
    "creation": "2026-06-27T10:30:00",
    "used": "1.2G"
  }
]
```

---

## POST /api/storage/snapshots

Create a ZFS snapshot.

**Auth required:** yes

**Request body:**

```json
{
  "dataset": "datapool/documents",
  "snapshot_name": "pre-update-20260627"
}
```

**Behaviour:**

```python
engine.execute("zfs", "create_snapshot",
               dataset="datapool/documents",
               snapshot_name="pre-update-20260627")
```

**Response:** `{ "ok": true, "snapshot": "datapool/documents@pre-update-20260627" }`

**Errors:**

| Code | Reason |
|------|--------|
| 400 | Invalid dataset name or snapshot name |
| 500 | ZFS command failed (pool degraded, dataset does not exist) |
