# ZFS Best Practices

## Pool Creation

### Always use `/dev/disk/by-id/`

Never use `/dev/sdX` device names for pool creation. Device names are not
stable across reboots or hardware changes.

```bash
# Wrong
zpool create datapool /dev/sdb /dev/sdc

# Correct
zpool create datapool \
  /dev/disk/by-id/ata-WDC_WD10EFRX-68FYTN0_WD-WCC4J... \
  /dev/disk/by-id/ata-WDC_WD10EFRX-68FYTN0_WD-WCC4K...
```

### ashift=12

Always set `ashift=12` for modern drives (4K sector alignment).
This cannot be changed after pool creation.

```bash
zpool create -o ashift=12 datapool ...
```

## Pool Layout (Installer)

The installer creates two pools:

### bpool (boot pool)

- Uses the GRUB-compatible feature set (limited features)
- GRUB cannot boot from all ZFS features — bpool must stay compatible
- Contains only `/boot`

```bash
zpool create \
  -o ashift=12 \
  -o cachefile=/etc/zfs/zpool.cache \
  -O compression=lz4 \
  -O acltype=posixacl \
  -O xattr=sa \
  -O relatime=on \
  -O canmount=off \
  -O mountpoint=/boot \
  -R /mnt \
  bpool PART3
```

### rpool (root pool)

- All ZFS features enabled
- Contains OS, home, logs, and the `.freedomnas` config dataset

```bash
zpool create \
  -o ashift=12 \
  -O compression=lz4 \
  -O acltype=posixacl \
  -O xattr=sa \
  -O dnodesize=auto \
  -O normalization=formD \
  -O relatime=on \
  -O canmount=off \
  -O mountpoint=/ \
  -R /mnt \
  rpool PART4
```

## Dataset Layout

```
rpool/ROOT/debian    canmount=noauto   mountpoint=/        ← bootfs
rpool/home           canmount=on       mountpoint=/home
rpool/var/log        canmount=on       mountpoint=/var/log
rpool/.freedomnas    canmount=noauto   mountpoint=/etc/freedomnas/state
```

Key flags:
- `rpool/ROOT/debian` — `canmount=noauto` prevents auto-mount at import; mount is controlled by initramfs
- `rpool/.freedomnas` — `canmount=noauto`; mounted only when config needs to be read/written

## bootfs Flag

After creating the root pool and ROOT/debian dataset:

```bash
zpool set bootfs=rpool/ROOT/debian rpool
```

GRUB reads this flag to know which dataset to boot from.

## Compression

Use `lz4` for all datasets. It is fast enough that it has negligible CPU
overhead on modern hardware, and typically saves 30-50% space.

```bash
zfs set compression=lz4 datapool
zfs set compression=lz4 datapool/documents
```

## Snapshots

Pre-update snapshots follow this naming convention:

```
<pool>@pre-update-YYYYMMDD
```

Example: `datapool@pre-update-20260627`

Snapshot names must not contain spaces. Use hyphens.

## bpool Import Service

The installer creates a service to import `bpool` at boot:

```ini
[Unit]
Description=Import bpool ZFS pool
Before=zfs-mount.service
After=systemd-udev-settle.service

[Service]
Type=oneshot
ExecStart=/sbin/zpool import -N -o cachefile=none bpool

[Install]
WantedBy=multi-user.target
```

This is required because `bpool` is not in the standard ZFS import scan
(it has a non-standard feature set).
