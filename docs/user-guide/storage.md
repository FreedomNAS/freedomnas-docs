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
| **USB keys** | With encryption: the USB sticks plugged into the NAS. A `freedomnas.key` file is written onto each ticked one (what is already there stays). With one plugged in at boot the pool unlocks by itself; without, the Master Passphrase is asked on the console |

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
    Only partitions of removable USB devices are offered, and a stick must
    hold a filesystem the NAS can write (FAT32 works on every edition).
    Anyone holding a stick can unlock the pool: keep a spare away from the
    NAS. The keyslots are also recorded on the pool, so the pool can be
    imported and unlocked on another FreedomNAS — see
    [Encrypted Pools](../developer/zfs.md#encrypted-pools).

### Importing a Pool

**Import Pool** brings in a pool that already exists on an attached disk:
the data pool of another FreedomNAS, or a pool some other system made.

1. Choose the pool from the list. A pool marked **other system** was last
   used by another machine: tick the confirmation that it is not in use
   there any more.
2. Click **Check**. The pool is imported read-only for a moment and exported
   again — nothing on it changes. The report shows each dataset and where it
   would mount.
3. Adjust what the report asks for, then **Check** again:
    - **Name on this system** — needed when a pool with that name is
      already here.
    - **Mountpoint** — where the pool's own dataset mounts; the datasets
      that inherit it follow. For a pool not made by FreedomNAS, check it:
      changing it runs `zfs set mountpoint=` on the pool.
    - **Passphrase** — one field per encryption root. A wrong passphrase is
      reported here, before anything is imported.
    - **Unlock — encrypted by FreedomNAS** — for FreedomNAS's own encrypted
      pools: its **USB key plugged into this NAS**, the **freedomnas.key
      file** chosen from your computer, or its **Master Passphrase**. After
      the import this system can unlock the pool at boot like one created
      here. Its shares and users appear once it is unlocked. A pool
      encrypted with another kind of raw key can be imported, but stays
      locked.
4. For a FreedomNAS pool, its shares are listed, ticked. The users they need
   that do not exist here are listed too, each with a password field:
   passwords are never stored in the configuration, so each needs a new one.
   **Administrator, as on the other system** gives the account this
   system's administrator group; it is off unless you tick it.
5. Click **Import** and confirm.

A pool that holds another system's root — a dataset that mounts on `/` or
on `/usr`, `/etc`, `/boot` and the like — cannot be imported: it would mount
over this system's own directories. A dataset that only inherits such a
mountpoint is resolved by choosing another mountpoint for the pool.

After the import the pool is recorded in `config.yaml`, so it is imported
again at every boot. The imported pool's own configuration is kept beside
this system's copy as `.freedomnas/config.yaml.imported`.

### Exporting and Deleting a Pool

!!! info "Advanced level required"
    Visible at **Advanced** UI level and above.

Each pool card has **Export** and **Delete pool**:

- **Export** takes the pool off this system (`zpool export`). Its data stays
  on the disks and it is no longer imported at boot; **Import Pool** brings
  it back, here or on another system. An encrypted pool keeps its keyslots
  here, and a copy travels with the pool.
- **Delete pool** destroys it and everything on it (`zpool destroy`) — type
  its name to confirm. An encrypted pool's keyslots are removed, so its USB
  key opens nothing any more.

Both list the pool's datasets first. Shares on the pool go only if you tick
**Remove these shares too**, otherwise the action is refused; its snapshot
schedules are removed, and so is its entry in `config.yaml`. `-f` is never
used: if something still uses a dataset, ZFS refuses and says so.

Instead of the buttons, a card explains why a pool must stay: it is the pool
the system runs from, it holds the configuration this system is using, or a
dataset in it mounts on a system directory or through `/etc/fstab` — the same
rule as the **system** badge on the Datasets tab.

### Cache and Log Devices

!!! info "Advanced level required"
    Visible at **Advanced** UI level and above.

Each pool card lists its attached cache (L2ARC) and log (SLOG) devices, as
the pool itself reports them — also for a pool created or imported outside
the WebUI.
**Add cache or log device** opens a window: choose the role — **Cache
(L2ARC)**, an SSD used as a read cache, or **Log (SLOG)**, which only helps
synchronous writes (NFS, databases) — and the device from the list of disks
and partitions, where those already in use are greyed out — including the
small "ZFS reserved" partition ZFS leaves on every disk it was given whole. Tick **I
understand the selected device will be erased** and confirm: everything on
the device is destroyed. The **×** next to an attached device detaches it.
Neither kind holds data, so detaching loses nothing.

### Pool Details and Devices

!!! info "Advanced level required"
    Visible at **Advanced** UI level and above. At the Assisted level a pool is
    created and imported with the defaults and nothing else is shown.

**Details and devices** on a pool card opens the pool's own page:

- its state, and — when something is wrong — ZFS's own explanation of the
  problem and of what to do about it;
- the last scrub or resilver, or its progress while it runs (the page
  refreshes itself every few seconds until it is done), and how many data
  errors ZFS knows of;
- every vdev, grouped by role (data, special, dedup, log, cache, hot
  spares), with each device's state and read/write/checksum error counts.

The buttons above the tables act on the whole pool:

| Button | What it does |
|--------|--------------|
| **Start scrub** / **Pause scrub** / **Stop scrub** | Read every block and repair what a redundant copy allows |
| **Start TRIM** / **Stop TRIM** | Tell SSDs which blocks are free |
| **Clear errors** | Reset the error counters after the cause has been fixed |
| **Add vdevs** | Add data, special, dedup or spare vdevs (see below) |
| **History** | Every command ever run on the pool, newest first |

Each device has an **Actions…** menu: **Take offline** / **Bring online**,
**Replace…** (by a free disk, or by the new disk put in the same place),
**Attach a mirror…** (turns a single disk into a mirror, or adds a copy to a
mirror), **Detach** (a mirror member), **Expand to full size** (after a
smaller disk was replaced by a bigger one), **Clear errors**, and **Remove
from pool** for top-level vdevs, spares, cache and log devices. Replacing or
attaching erases the new disk and starts a resilver. When ZFS refuses — for
example removing a data vdev from a pool with RAID-Z vdevs, or detaching the
last copy of the data — its own message is shown.

**Add vdevs** lists the free disks; for each one choose **Data vdev 1–4**,
**Special (metadata)**, **Dedup table** or **Hot spare**. Data vdevs use the
layout chosen above the list; special and dedup vdevs become a mirror when
they get two or more disks. A data vdev usually cannot be removed again, so
match the redundancy of the vdevs already in the pool. The same per-disk
choice appears in **Create Pool** at the Advanced level, to create a pool with
several data vdevs and special, dedup or spare vdevs in one go; leaving every
disk on **Not used** creates the usual single-vdev pool.

!!! warning "Expert level"
    At the **Expert** level the pool page also offers **Pool properties**
    (autotrim, autoexpand, autoreplace, comment, failmode, listsnapshots,
    delegation, multihost, compatibility), **Initialize free space**,
    **Create** / **Discard checkpoint** (the whole pool can be rewound to it at
    the next import), **Upgrade features** and **New GUID**, plus **Take
    offline until reboot** for a device and internal events in the history.
    Upgrade and New GUID are refused on the pool the system boots from: the
    boot loader or the initramfs might no longer find it.

## Datasets Tab

Lists all ZFS datasets with used, available and referenced space and their
mountpoint. Data comes from `zfs list -Hp`.

!!! note
    The creation time and size on the Snapshots tab are still shown as the
    raw numbers ZFS prints with `-p` — seconds since 1970, and bytes.

### Creating a Dataset

**Create Dataset** (every UI level) asks for:

| Field | Description |
|-------|-------------|
| **Inside** | The pool or dataset it goes in |
| **Name** | A letter or digit, then letters, digits, `_ . : -` |
| **Mountpoint** | **Inherit from the parent** (shown: parent's mountpoint + name), **This path**, or **Not mounted** |
| **compression**, **quota** | Optional; left empty they are inherited |
| **casesensitivity**, **normalization** | **Expert** level; they can only be set now, at creation. `casesensitivity=insensitive` or `mixed` suits shares used from Windows |

A mountpoint is refused when it is a system directory (`/usr`, `/etc`,
`/home`, …), something already mounted, or a directory holding files.

### Mountpoint, Rename, Delete

!!! info "Advanced level required"
    These buttons, like **Properties**, are visible at **Advanced** UI level
    and above.

- **Mountpoint** moves a dataset: inherit it from the parent again, a path,
  or not mounted. Children that inherit it move along. If shares live under
  it, **Point them at the new place** (ticked) re-creates them at the new
  path; untick it and they keep the old path — Samba drops a share whose
  directory is gone, so they stop working until you fix them.
- **Rename** gives a dataset another name within its pool; another parent
  moves it there. An inherited mountpoint moves with the name (shares can
  follow, as above); a mountpoint of its own stays. Snapshot schedules
  follow the new name.
- **Delete** destroys the dataset: type its full name to confirm. Child
  datasets and snapshots go only if you tick **Also destroy …**; shares
  under it are removed only if you tick **Remove these shares too** —
  otherwise the deletion is refused. Its snapshot schedules are removed.

Some datasets show a **system** badge and no buttons. Hover the badge for the
reason: they belong to the pool the system runs from, hold the FreedomNAS
configuration (`.freedomnas`), are mounted through `/etc/fstab` (`legacy`),
mount on a system directory such as `/home` or `/var/lib/…`, or contain a
dataset that does — moving or deleting them could leave the system unable
to start.

**Properties** edits the dataset's ZFS properties (compression, quota, …).
The catalogue comes from the edition's profile; expert-only properties
appear only at **Expert** level, and those that can only be set at creation
are not offered.

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

## Disks Tab

The health of every disk in the system, read with `smartctl` (from
`smartmontools`, installed with FreedomNAS on every edition) — the pools tab
says whether ZFS is happy, this one says whether the hardware under it is.

Each disk gets one verdict:

| Badge | Meaning |
|-------|---------|
| **OK** | SMART reports nothing worrying |
| **Attention** | Signs of wear: reallocated, pending or unreadable sectors, errors the disk could not correct, transfer (CRC) errors — often a bad cable — entries in the disk's error log, a failed last self-test, or a worn NVMe |
| **Failing** | The disk's own SMART check fails, an attribute is below its failure threshold, or an NVMe raises a critical warning or runs out of spare capacity |
| **Asleep** | The disk is in standby; FreedomNAS does not wake it up just to read it |
| **No SMART data** | The disk, or the USB adapter it sits behind, does not report SMART |

Every level shows the verdict, model, size, serial, the pool the disk
belongs to, its temperature and how many hours it has been powered on, with
a plain hint when a disk needs attention.

*Advanced level* adds why the verdict is what it is, the last self-test,
and a **Short self-test** button (about two minutes; the disk stays usable).

*Expert level* adds a **Long self-test** (reads the whole surface, can take
hours) and the full table of SMART attributes with the number of errors in
the disk's log.

If `smartmontools` is missing — a system installed before it was added —
the tab says so instead of failing. The API is described in
[Storage API](../api/storage.md#get-apistoragedisks).

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
