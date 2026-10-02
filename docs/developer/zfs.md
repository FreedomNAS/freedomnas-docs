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

## Growing the root pool on a flashed image

An image is a few GB and is usually written to a larger disk. At every boot
`firstboot.sh` runs `python3 -m freedomnas grow-root-pool` before anything
else: it extends the root pool's partition into the free space that follows
it and tells ZFS the device grew (`zpool online -e`). It only touches the
case every image ships — a root pool on a single partition — and does
nothing when less than 64 MiB is free between the end of the partition and
the start of the next one, or the end of the disk if none follows. A disk
where another partition sits right after the root pool's (a workstation
with a swap or data partition behind it) is therefore left alone, even when
the disk has free space elsewhere. A mirror, a raidz or a pool of several
devices was laid out by someone and is left alone. A failure is logged and
the boot carries on.

The device is passed to `zpool online -e` exactly as the pool names it
(`zpool list -vHP`, without `-L`): a pool imported from `/dev/disk/by-id`
knows its device by that path, not by the `/dev/nvme0n1p2` it resolves to,
and `zpool online` does not recognise the resolved name.

The commands are the storage profile's:

| Key | Linux | FreeBSD |
|-----|-------|---------|
| `dataset_at_path` | `zfs list -H -o name {path}` | same |
| `pool_leaf_devices` | `zpool list -vHP <pool>` | same |
| `partition_of` | `lsblk` → disk, partition number, start, size | `glabel status` + `geom part list` → the same four |
| `disk_size` | `lsblk -bdnro SIZE` | `diskinfo` |
| `partition_offsets` | `lsblk -bnrpo START,TYPE` → byte offset of every partition on the disk | `geom part list` → the same |
| `partition_grow` | `sfdisk --relocate gpt-bak-std`, `sfdisk -N <n>` with `, +`, `partx -u` | `gpart recover`, `gpart resize -i <n>` |
| `pool_expand` | `zpool online -e <pool> <device>` | same |

The Linux commands are verified on a loop device and on a flashed Artix
image (a 10 GB image on a 20 GB disk boots with a 20 GB pool), and growing a
pool that knows its device by a `/dev/disk/by-partuuid` path on a loop
device; the FreeBSD ones are not tested yet.

## Importing an existing pool

`freedomnas.pool_import` backs **Storage → Import Pool**
(`/api/storage/pools/import*`).

**Look, then import.** `inspect()` imports the pool with
`zpool import -N -t -o readonly=on -o cachefile=none <id> fnasimport<pid>`:
unmounted, read-only, under a temporary name that is not written to the
pool, and not in the cache file. It reads the datasets (`zfs.dataset_tree`,
one `zfs get -rHp` of mountpoint, canmount, encryption, keys and used),
loads the keys it is given, reads `.freedomnas/config.yaml` if there is one,
and exports the pool again in a `finally`. `import_pool()` then imports by
numeric id, so it is the pool that was looked at.

**What is refused.** Another system's root: a dataset with mountpoint `/`
(except the pool's own dataset with `canmount=off`), or a dataset whose own
(`local`/`received`) mountpoint is under `/usr`, `/etc`, `/boot`, `/var`,
`/home` and the other system directories with `canmount` `on` or `noauto`.
`.freedomnas` is exempt: its mountpoint is this system's state directory by
design. Such a pool is never imported read-write.

**What is a conflict.** A dataset that would be mounted (`canmount=on`) on a
system directory only by inheritance, on something already mounted, or on a
non-empty directory — OpenZFS on Linux mounts over a non-empty directory and
would hide what is there. Mountpoints are projected before import: renaming
the pool moves a default mountpoint (`/<pool>`), a new mountpoint for the
pool's dataset moves every dataset that inherits it.

**Mounting.** `zfs set mountpoint=` mounts the datasets it moves by itself,
so `zfs.mount_pool_auto` mounts only datasets with `canmount=on`, a real
mountpoint and `mounted=no`. The generic `mount_pool` would also mount
`.freedomnas` (`canmount=noauto`) — over this system's configuration.
If mounting fails, the pool's mountpoint is set back (`zfs set` of the old
value, or `zfs inherit` if it was inherited) and the pool exported: a failed
import leaves the pool as it found it.

**Encryption.** Passphrase roots are unlocked with
`zfs load-key -L prompt <root>`, the passphrase on stdin. FreedomNAS's own
encrypted pools (raw key) are unlocked through the keyslots recorded on the
pool — USB key, `freedomnas.key` file or Master Passphrase, see
[Encrypted Pools](#encrypted-pools). A raw or hex key with no keyslots on
the pool cannot be unlocked here, and the pool is imported locked. While
`.freedomnas` is locked its configuration is not read (`config_locked`):
the shares and users appear once the pool is unlocked.

Tested live on loop devices (a plain pool with a new mountpoint, another
system's root, a passphrase-encrypted pool with a wrong and a right
passphrase, a FreedomNAS pool with an SMB and an NFS share and a user) both
through the API and by driving the dialog with Playwright. FreeBSD commands
are untested.

## Building images next to the host's pools

The image builders create the image's pool under a temporary name,
`zpool create -t fnasbuild-<edition>-<pid>`, and never run `zfs mount -a`.
The image keeps the name it is meant to have (`rpool`), while the build host
— which may well have an `rpool` of its own — never sees two pools with the
same name or mounts anything but the image's datasets.

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
   `usb_devices`. The API accepts only partitions of removable devices
   (`GET /api/storage/usb-devices`), and only for an encrypted pool: the
   file is written onto a mounted filesystem, so any other partition would
   be mounted read-write.
4. Records the same keyslots on the pool itself, in the ZFS user property
   `org.freedomnas:keyslots` of the pool's dataset (base64 of the keyslot
   JSON, about 1 KB; user properties hold up to 8 KB).

**Why the keyslots are also on the pool.** The file on the boot device is
lost with the boot device, and a pool moved to another system leaves it
behind: with the file alone, neither the USB key nor the Master Passphrase
can open the pool anywhere else. ZFS properties are not encrypted, so the
copy can be read while the pool is locked — the same model as a LUKS
header on its own disk. The slots hold only wrapped copies of the key. The
cost: whoever takes the data disks alone, without the boot disk, can try to
guess the Master Passphrase offline — against scrypt (about 32 MiB per
attempt) and a passphrase of at least 12 characters. The USB slot is
wrapped with 32 random bytes and cannot be guessed. Whoever takes the whole
NAS had the boot disk anyway.

Pools created before this carry no copy: `PoolUnlocker` writes it
(`keymgmt.publish_keyslots`) the first time it unlocks them at boot, where
the keyslot file is.

**Importing a FreedomNAS encrypted pool.** `pool_import` reads the property
of each encryption root whose key is not a passphrase, and offers the
unlock methods its slots allow: the USB key plugged into the NAS
(`PoolUnlocker.find_usb_key`), the `freedomnas.key` file uploaded from the
browser (its bytes, base64, in `keyslot_unlock.key`), or the Master
Passphrase. The key is unwrapped on the server and loaded with
`keymgmt.load_raw_key` (tmpfs file, shredded). After the import,
`keymgmt.adopt_keyslots` writes the slots to this system's keyslot
directory under the pool's new name — never over an existing file — so the
boot-time unlock works for the pool from then on.

The read side, `keymgmt.PoolUnlocker`, is what `python -m freedomnas
unlock-pools` runs at boot (called from `firstboot.sh`, right after `zpool
import -a -N -f` and before the disaster-recovery `reconcile` call — a pool
must be unlocked before its datasets can mount). It tries the USB key first
(scans removable partitions via the `media` profile category for a
`freedomnas.key` file, mounts read-only), then falls back to a TTY
passphrase prompt on `/dev/console` (local echo disabled), retrying for up
to `--tty-timeout` seconds (default 300). If nobody answers in time,
`unlock-pools` **fails open**: it logs a warning and returns non-zero, but
boot continues to the WebUI with the pool left locked, rather than blocking
indefinitely. The timeout bounds the wait for input itself, so a console
nobody sits at fails open too — see [Security](../architecture/security.md).
Once unlocked, only the pool's datasets with `canmount=on` are mounted
(`zfs.mount_pool_auto`): `mount_pool` would also mount `.freedomnas`, whose
mountpoint is this system's state directory.

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
    form collects the Master Passphrase and, optionally, the USB sticks that
    get `freedomnas.key`; the first-run wizard has no pool step at all. See [Storage](../user-guide/storage.md#creating-a-pool) and
    [First-Run Setup](../getting-started/first-run.md).

## Snapshots

### Naming convention

Pre-update snapshots follow this naming convention:

```
<dataset>@pre-update-YYYYmmdd-HHMMSS
```

Example: `rpool/ROOT/debian@pre-update-20260718-093012`. The update terminal
takes them recursively on the root pool and every recorded pool, so every
dataset — the root dataset included — gets one.

Snapshot names must not contain spaces. Use hyphens.

### UKI pairing

The `zz-dracut-uki` kernel post-install hook looks for the most recent
`pre-update-*` snapshot on `rpool/ROOT/debian` and records its name in
`EFI/Linux/debian-uki-previous.snapshot` on the ESP. This pairs the
rotated-out (previous) UKI with the matching filesystem state so a kernel
rollback and a filesystem rollback can be done together.

Updates run from the WebUI take that snapshot themselves, before the
kernel is installed. Updating by hand, take it first:

```bash
zfs snapshot -r rpool@pre-update-$(date +%Y%m%d-%H%M%S)
apt upgrade
```

If no `pre-update-*` snapshot exists at the time of the kernel update, the
hook logs a warning and the previous UKI slot is left without a paired
snapshot.
