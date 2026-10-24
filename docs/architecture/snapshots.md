# Scheduled Work

Cron decides *when*, `config.yaml` decides *what*, and
`freedomnas-core/snapshots.py` does the work.

## Why cron

The scheduler computes nothing about time: four cron entries, one per
interval, each calling

```
python3 -m freedomnas snapshot-run --interval <hourly|daily|weekly|monthly>
```

Cron is the part of the system whose job is knowing what time it is, and it
already carries the WebUI's `@reboot` entry, so this needs no new mechanism
and works the same on systemd, OpenRC, runit, s6, dinit and bsd_rc. The
entries come from `files.scheduled_jobs` in each edition's installer profile —
`/etc/cron.d/freedomnas` where there is a drop-in directory, and
appended to `/etc/crontab` on FreeBSD.

A run with no matching policy does nothing and exits 0.

## The policy

```yaml
snapshots:
  policies:
    - dataset: tank/home
      hourly: 24
      daily: 7
      weekly: 4
      monthly: 12
```

Each number is *how many to keep*, not how many to take. Zero — or an
interval left out — means that interval is not taken at all.

## The one rule

**Only snapshots the scheduler created are ever destroyed.**

They are named `freedomnas-<interval>-<YYYYmmdd-HHMMSS>`, and retention only
ever looks at names matching that prefix for that dataset and that interval.
A snapshot taken by hand, one taken by the update terminal (`pre-update-*`),
one belonging to another dataset or another interval cannot be pruned by a
retention count someone lowered.

The timestamp is last and fixed-width, so sorting the names alphabetically
sorts them by age: retention finds the oldest without asking ZFS for creation
times, and without parsing dates in six different formats.

## Failure

A dataset that cannot be snapshotted — gone, unmounted, pool exported — is
reported and the remaining policies still run. Nothing that fails to snapshot
is ever pruned, because pruning happens only after a successful create.

## Where it is not

The WebUI writes policies (`PUT /api/storage/snapshot-policies/{dataset}`)
and never runs the scheduler itself: a WebUI that is down must not mean
snapshots that stop.


## The shadow copy (`shadow-sync`)

The configuration is mirrored a few seconds after every save (see
[the configuration](config.md)); the same cron file carries one more job,
nightly, as a second chance:

```
30 3 * * *  root  python3 -m freedomnas shadow-sync
```

`config.yaml` is a backup of the system state, and a backup that lives only
on the OS disk is not one. Every pool gets a `<pool>/.freedomnas` dataset —
the installer makes it for the root pool, `shadow.ensure_dataset()` makes it
when a data pool is created — and `shadow-sync` mirrors the live
configuration into each of them.

That is what makes the disaster-recovery path real: the OS disk dies, a fresh
install goes onto a blank disk, and `firstboot.sh` finds the appliance's
identity — hostname, users, shares, snapshot policies — waiting on the data
pool.

All the copies carry the same `mountpoint=/etc/freedomnas/state`, and only
one can be mounted there at a time, so mirroring mounts each of the others
somewhere else for a moment:

```
mount -o zfsutil -t zfs <pool>/.freedomnas /tmp/freedomnas-shadow.XXXX
```

the same mechanism the initramfs uses to mount the root dataset at
`/sysroot` while its property says `/`. The pool the configuration is
currently served from is identified through `zfs list -H -o name
/etc/freedomnas/state` and skipped — it is the source, and copying a file
onto itself would truncate it.
