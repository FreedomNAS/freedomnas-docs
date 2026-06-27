# Storage (ZFS)

The Storage page manages ZFS pools, datasets, and snapshots.

## Pools Tab

Lists all ZFS pools with their health status, total size, allocated space,
and free space. Pool data comes from `zpool list`.

| Column | Description |
|--------|-------------|
| Name | Pool name (e.g. `datapool`) |
| Health | `ONLINE`, `DEGRADED`, `FAULTED`, `UNAVAIL` |
| Size | Total raw capacity |
| Allocated | Used space |
| Free | Available space |

A red health badge triggers an alert in the module health grid on the dashboard.

## Datasets Tab

Lists all ZFS datasets with used space, available space, mountpoint, and type
(`filesystem` or `volume`). Data comes from `zfs list`.

## Snapshots Tab

Lists all ZFS snapshots with their creation time and used space.

### Creating a Snapshot

!!! info "Advanced level required"
    The snapshot creation button is only visible at **Advanced** UI level and above.

1. Go to **Storage → Snapshots**
2. Click **+ Create Snapshot**
3. Enter the dataset path (e.g. `datapool/documents`) and a snapshot name
4. Click **Create**

The API call: `POST /api/storage/snapshots`

```json
{
  "dataset": "datapool/documents",
  "snapshot_name": "pre-update-20260627"
}
```

### Snapshot Naming Convention

FreedomNAS uses this naming pattern for automatic pre-update snapshots:

```
<dataset>@pre-update-YYYYMMDD
```

For manual snapshots, use any descriptive name without spaces.

## ZFS Best Practices

- **Never use `/dev/sdX` paths** for pool creation — use `/dev/disk/by-id/`
- **Use compression**: `lz4` is the recommended default (fast, transparent)
- **Set `ashift=12`** for modern drives (4K sector alignment)
- **For redundancy**: mirror (2 drives) or RAIDZ2 (4+ drives)
- **Data pool** (`rpool`) and **boot pool** (`bpool`) are separate:
  `bpool` uses a limited feature set for GRUB compatibility

!!! tip
    Enable **auto-snapshot before updates** in the Updates page. This creates
    a ZFS snapshot of your datasets before running `topgrade`, giving you a
    rollback point if anything goes wrong.
