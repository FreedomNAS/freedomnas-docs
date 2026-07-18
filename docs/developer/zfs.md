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

The installer creates a **single `rpool`** on partition 2. There is no
`bpool`.

!!! note "Why no bpool?"
    `bpool` only existed because GRUB's built-in ZFS reader requires a
    feature-restricted pool. FreedomNAS no longer uses GRUB — the dracut
    UKI lives on the ESP and the kernel's own ZFS driver (loaded from the
    initramfs) mounts root. Nothing at boot time reads ZFS directly, so a
    feature-limited pool serves no purpose.

### rpool

```bash
zpool create \
  -o ashift=12 \
  -O acltype=posixacl \
  -O canmount=off \
  -O compression=lz4 \
  -O dnodesize=auto \
  -O normalization=formD \
  -O relatime=on \
  -O xattr=sa \
  -O mountpoint=/ \
  -R /mnt \
  rpool /dev/disk/by-id/<part2>
```

## Dataset Layout

```
rpool/ROOT              canmount=off    mountpoint=none
rpool/ROOT/debian       canmount=noauto mountpoint=/          ← OS root
rpool/home              setuid=off
rpool/var               canmount=off    mountpoint=/var
rpool/var/log           atime=on
rpool/.freedomnas       canmount=noauto mountpoint=/etc/freedomnas/state
```

Key flags:

- `rpool/ROOT/debian` — `canmount=noauto` prevents auto-mount at import;
  the dracut initramfs mounts it explicitly with the kernel's ZFS driver
- `rpool/.freedomnas` — `canmount=noauto`; mounted only when
  FreedomNAS reads or writes `config.yaml`
- `/boot` is a **plain directory** inside `rpool/ROOT/debian` — the kernel
  and initramfs live in the UKI on the ESP, not in ZFS

## bootfs Property

After creating the datasets, the installer sets:

```bash
zpool set bootfs=rpool/ROOT/debian rpool
```

This is **metadata only** — no boot-time component reads it (the UKI's
cmdline already encodes `root=ZFS=rpool/ROOT/debian`). It is set as a
cheap, conventional way to record which dataset is the intended boot root,
useful for introspection and future tooling.

## Compression

Use `lz4` for all datasets. It is fast enough that it has negligible CPU
overhead on modern hardware, and typically saves 30–50% space.

```bash
zfs set compression=lz4 datapool
zfs set compression=lz4 datapool/documents
```

## Snapshots

### Naming convention

Pre-update snapshots follow this naming convention:

```
<dataset>@pre-update-YYYYMMDD
```

Example: `rpool/ROOT/debian@pre-update-20260718`

Snapshot names must not contain spaces. Use hyphens.

### UKI pairing

The `zz-dracut-uki` kernel post-install hook looks for the most recent
`pre-update-*` snapshot on `rpool/ROOT/debian` and records its name in
`EFI/Linux/debian-uki-previous.snapshot` on the ESP. This pairs the
rotated-out (previous) UKI with the matching filesystem state so a kernel
rollback and a filesystem rollback can be done together.

Always create a `rpool/ROOT/debian@pre-update-*` snapshot **before**
installing a kernel update so the hook has a snapshot to pair with:

```bash
zfs snapshot rpool/ROOT/debian@pre-update-$(date +%Y%m%d)
apt upgrade linux-image-amd64
```

If no `pre-update-*` snapshot exists at the time of the kernel update, the
hook logs a warning and the previous UKI slot is left without a paired
snapshot.
