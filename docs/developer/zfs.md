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

## Encrypted Pools

Data pools (not `rpool`) can be created with ZFS native encryption
(`-O encryption=aes-256-gcm -O keyformat=raw`). ZFS native encryption only
supports **one active key per encryption root** — there is no LUKS-style
multi-keyslot mechanism built into ZFS itself. FreedomNAS works around this
in `freedomnas-core/keymgmt.py`, not by hand-rolling `zfs` calls.

**Never** create an encrypted pool with a raw `engine.execute("zfs",
"pool_create_encrypted", ...)` call and then manage the key yourself. Always
go through `freedomnas.keymgmt.PoolProvisioner.create_encrypted_pool(...)`,
which:

1. Generates a random 32-byte raw ZFS key and creates the pool via the
   engine — the key is written only to a `0600` tmpfs file under
   `/run/freedomnas/` referenced by `-L file://...`, never passed as a
   process argument.
2. Wraps that same raw key **twice**, into two independent keyslots at
   `/etc/freedomnas/keyslots/<pool>.json`: once with the operator's Master
   Passphrase, once with a freshly generated random USB key. Wrapping is
   `scrypt` (KDF) + `AES-256-GCM` (AEAD) via `cryptography.hazmat.primitives
   .ciphers.aead.AESGCM` — the stdlib has no AES, so `cryptography>=41.0` is
   a hard dependency of `freedomnas-core`. Each slot has its own salt and
   nonce, so compromising one slot's secret never exposes the other slot or
   the pool key, and a tampered slot fails AEAD authentication rather than
   silently unwrapping to garbage.
3. Writes the USB key as `freedomnas.key` onto every device passed in
   `usb_devices`.

The read side, `keymgmt.PoolUnlocker`, is what `python -m freedomnas
unlock-pools` runs at boot (called from `firstboot.sh`, right after `zpool
import -a -N` and before the disaster-recovery `reconcile` call — a pool
must be unlocked before its datasets can mount). It tries the USB key first
(scans removable partitions via the `media` profile category for a
`freedomnas.key` file, mounts read-only), then falls back to a TTY
passphrase prompt on `/dev/console` (local echo disabled), retrying for up
to `--tty-timeout` seconds (default 300). If nobody answers in time,
`unlock-pools` **fails open**: it logs a warning and returns non-zero, but
boot continues to the WebUI with the pool left locked, rather than blocking
indefinitely.

**Never** wrap or unwrap a keyslot with anything other than
`keymgmt.wrap_key()`/`unwrap_key()`. No XOR, no unauthenticated ciphers, no
hand-rolled KDFs — an unauthenticated wrap can't detect a tampered keyslot
file, and a weak KDF makes offline brute-forcing of the Master Passphrase
cheap.

Converting an *existing* unencrypted pool to encrypted is not supported —
`PoolProvisioner` only handles pool creation, and the reconciler does not
support pool modification at all (see the reconciler's constraints).

!!! note "Where encrypted pools are created"
    Both `POST /api/storage/pools` (the **Storage → Create Pool** form, with
    **Encrypt this pool** ticked) and the optional `pool` field of
    `POST /api/setup/initialize` go through `PoolProvisioner`. The Storage
    form only collects the Master Passphrase — the USB keyslot's
    `usb_devices` is API-only — and the first-run wizard has no pool step at
    all. See [Storage](../user-guide/storage.md#creating-a-pool) and
    [First-Run Setup](../getting-started/first-run.md).

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
