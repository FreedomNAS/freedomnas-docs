# Storage (ZFS)

The Storage page manages ZFS pools, datasets, and snapshots.

## Pools Tab

Lists all ZFS pools as cards with their health status, a usage bar, size,
used and free space. Pool data comes from `zpool list`, plus the cache and
log devices recorded in `config.yaml`.

| Field | Description |
|-------|-------------|
| Name | Pool name (e.g. `datapool`) |
| Health | `ONLINE`, `DEGRADED`, `FAULTED`, `UNAVAIL` |
| Size | Total raw capacity |
| Used | Used space |
| Free | Available space |

The dashboard does not yet reflect pool health: check it here.

### Creating a Pool

1. Click **Create Pool** (top right of the Storage page)
2. Fill in the form:

| Field | Description |
|-------|-------------|
| **Pool Name** | A letter, then letters, digits, `_ . : -` |
| **Layout** | Single / stripe, Mirror, RAIDZ1, RAIDZ2 (default), RAIDZ3 |
| **Data Devices** | Checkbox list from `GET /api/storage/devices`; devices that carry a filesystem or are mounted are greyed out |
| **Cache device (L2ARC)** | Optional SSD read cache |
| **Log device (SLOG)** | Optional, **Advanced** level and above — only helps synchronous writes (NFS, databases) |
| **Encrypt this pool** | ZFS native encryption; asks for a **Master Passphrase** of at least 12 characters |

3. Tick **I understand the selected devices will be erased** and click
   **Create Pool**; a final confirmation lists the devices to be destroyed

The API call is `POST /api/storage/pools` — see
[Storage API](../api/storage.md). After the pool exists, the cache/log
devices are attached, the `<pool>/.freedomnas` shadow dataset is created and
the pool is recorded in `config.yaml`.

!!! warning "Data loss"
    Everything on the selected data devices is destroyed. `-f` is never
    passed, so ZFS itself refuses a disk that already belongs to another pool.

!!! note "Encryption from the WebUI"
    The form creates the passphrase keyslot only. The USB keyslot
    (`usb_devices`) is accepted by the API but has no field in the form yet.
    See [Encrypted Pools](../developer/zfs.md#encrypted-pools) for the design.

### Cache and Log Devices

!!! info "Advanced level required"
    Visible at **Advanced** UI level and above.

Each pool card lists its attached cache (L2ARC) and log (SLOG) devices.
**Add cache or log device** attaches one to an existing pool; the **×** next
to a device detaches it. Neither kind holds data, so detaching loses nothing.

## Datasets Tab

Lists all ZFS datasets with used, available and referenced space and their
mountpoint. Data comes from `zfs list -Hp`.

!!! note
    The sizes on this tab, and the creation time and size on the Snapshots
    tab, are shown as the raw numbers ZFS prints with `-p` — bytes, and
    seconds since 1970 — until the page learns to format them as it does
    for pools.

At **Advanced** level and above, each row has a **Properties** button that
edits the dataset's ZFS properties (compression, quota, …). The catalogue
comes from the edition's profile; expert-only properties appear only at
**Expert** level.

## Snapshots Tab

!!! info "Advanced level required"
    The Snapshots tab is only visible at **Advanced** UI level and above.

Lists all ZFS snapshots with their creation time and used space.

### Creating a Snapshot

!!! info "Advanced level required"
    The snapshot creation button is only visible at **Advanced** UI level and above.

1. Click **Create Snapshot** (top right of the Storage page)
2. Enter the dataset path (e.g. `datapool/documents`) and a **Snapshot Name**
3. Click **Create Snapshot**

The API call: `POST /api/storage/snapshots`

```json
{
  "dataset": "datapool/documents",
  "snap_name": "pre-update-20260627"
}
```

### Snapshot Naming Convention

FreedomNAS uses this naming pattern for automatic pre-update snapshots,
taken recursively on the system's pool and every pool recorded in
`config.yaml`, so each of their datasets gets one:

```
<dataset>@pre-update-YYYYmmdd-HHMMSS
```

Scheduled snapshots are named `freedomnas-<interval>-<YYYYmmdd-HHMMSS>` — see
[Scheduled Work](../architecture/snapshots.md).

For manual snapshots, use any descriptive name without spaces.

## ZFS Best Practices

- **Device names may change**: the Create Pool form lists disks as
  `/dev/sdX`, and ZFS finds its disks by their labels, so a pool still
  imports when the names move. From the shell, prefer `/dev/disk/by-id/`
- **Use compression**: `lz4` is the recommended default (fast, transparent)
- **Set `ashift=12`** for modern drives (4K sector alignment)
- **For redundancy**: mirror (2 drives) or RAIDZ2 (4+ drives)
- **No separate boot pool**: there is no `bpool` — that existed only for GRUB
  compatibility and was removed when the boot chain moved to a dracut UKI.
  `rpool` alone holds both the OS and its boot environments

!!! tip
    **Create ZFS snapshot before updating** (Updates → Configure) snapshots
    the system's pool and your data pools, recursively, before `topgrade`
    runs — see [Updates](updates.md#pre-update-snapshots).
