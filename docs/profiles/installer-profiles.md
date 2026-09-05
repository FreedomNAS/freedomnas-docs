# Installer Profiles

`profiles/installer/installer-{edition}.json` describes how an edition gets
**installed**. It is an ordinary profile fragment as far as the engine is
concerned — same directory scan, same merge — and is read only by
`freedomnas-installer`; the WebUI and the runtime modules never touch it.

An edition without one still *runs* FreedomNAS perfectly well. It simply
never appears in the installer's menu.

```
profiles/installer/
├── installer-debian.json
├── installer-gentoo.json    (community)
├── installer-void.json      (community)
├── installer-artix.json     (community)
├── installer-arch.json      (community)
└── installer-freebsd.json
```

## `installer_meta`

Data, not commands — read with `get_profile_value("installer_meta", key)`.

| Key | Meaning |
|-----|---------|
| `arch` | Architecture passed to the bootstrapper (`amd64`, `x86_64`) |
| `suite` | Release to bootstrap (`trixie`, `14.2-RELEASE`) |
| `mirror` | Default package mirror |
| `mirrors` | `{code, label, url}` entries offered in the mirror menu |
| `esp_size` | ESP size **in that partitioner's syntax** — `512MiB` for sgdisk, `512M` for gpart |
| `esp_mountpoint` | Where the ESP is mounted inside the target |
| `bootstrap_methods` | Ordered list, e.g. `["debootstrap", "tarball"]` |
| `bootstrap_tools` | `{method: host binary}` — a method whose binary is missing on the host is filtered out at runtime |
| `rootfs_tarball_url` | Default tarball URL; **empty means "ask"**, which is correct for date-stamped filenames |
| `chroot_dirs` | Directories created before the chroot mounts |
| `uki_name`, `uki_recovery_name` | UKI filenames on the ESP (UKI-booting editions) |
| `community_maintained` | Marks the edition as community in the installer menu |

## `chroot`

| Key | Variables | Notes |
|-----|-----------|-------|
| `exec_prefix` | `{root}` | **Required** for chroot installs. Prepended as argv to every command run inside the target — `chroot {root}`, or a `systemd-nspawn -D {root}` style prefix |
| `mount` | `{root}` | Command **sequence** binding the pseudo-filesystems |
| `unmount` | `{root}` | Sequence, reverse order, run with `check=False` |

## `partitioning`

Runs on the host, with the host's tools.

| Key | Variables | Notes |
|-----|-----------|-------|
| `list_disks` | — | **Output contract:** one disk per line, `<name> <size-in-bytes> <model...>` |
| `wipe` / `clear` | `{disk}` | Destroy the old table / create a new one |
| `create_esp` | `{disk}`, `{esp_size}` | Partition 1, EFI System |
| `create_root` | `{disk}` | Partition 2, rest of the disk |
| `probe` / `settle` | `{disk}` | Optional — omit on platforms without an equivalent |
| `format_esp` | `{device}` | FAT32, label `EFI` |
| `esp_uuid` | `{device}` | Optional; lets `fstab` mount the ESP by UUID |
| `mount_esp` / `unmount` | `{device}`, `{mountpoint}` | |

## `rootpool`

The FreedomNAS **root** pool. Deliberately separate from the `zfs` category,
which the storage module owns for data pools.

| Key | Variables |
|-----|-----------|
| `create` | `{ashift}`, `{compression}`, `{altroot}`, `{pool_name}`, `{device}` |
| `create_datasets` | `{pool_name}`, `{edition}` — a command **sequence** |
| `create_state_dataset` | `{pool_name}` |
| `set_bootfs`, `mount_root` | `{pool_name}`, `{edition}` |
| `mount_all`, `unmount_all`, `export_all`, `list_importable`, `list_pools` | — |
| `mount_dataset`, `dataset_exists` | `{dataset}` |
| `export` | `{pool_name}` |

## `bootstrap`

Described by the **target's** profile, executed **on the host** — the target
root is still empty at that point. The exceptions are `update_cache`,
`install_base` and `locale_gen`, which run inside the chroot.

| Key | Variables | Notes |
|-----|-----------|-------|
| *native method* | `{arch}`, `{suite}`, `{root}`, `{mirror}` | Key name must match its entry in `bootstrap_methods` |
| `fetch_tarball` | `{url}`, `{output}` | `curl` on Linux, `fetch` on FreeBSD |
| `unpack_tarball` | `{tarball}`, `{root}` | |
| `update_cache` | — | In-target |
| `install_base` | `{package_list}` | Space-separated; the recommends-free variant |
| `locale_gen` | — | Optional |

## `files`

The **contents** of OS-specific files. A distro's `sources.list` or `rc.conf`
is as edition-specific as a command is, which is why it belongs here and not
in the installer's Python.

```json
"files": {
  "package_sources": {
    "path": "/etc/apt/sources.list",
    "content": "deb {mirror} {suite} main contrib non-free non-free-firmware\n"
  },
  "localtime_link": {
    "path": "/etc/localtime",
    "symlink_to": "/usr/share/zoneinfo/{timezone}"
  },
  "webui_cron": {
    "path": "/etc/crontab",
    "append": true,
    "content": "@reboot root /usr/lib/freedomnas/webui/bin/firstboot.sh …\n"
  }
}
```

| Key | Meaning |
|-----|---------|
| `path` | Absolute path **inside the target** |
| `content` | Template — filled with hostname, fqdn, domain, timezone, mirror, suite, arch, esp_device, esp_spec, pool_name, edition |
| `symlink_to` | Makes the entry a symlink rather than a file |
| `mode` | Decimal mode (420 = 0o644); default 0o644 |
| `append` | Append instead of overwrite, skipping if already present — for editions with no drop-in directory (FreeBSD has no `/etc/cron.d`) |
| `inplace` | Also write this file during an in-place install. Reserved for additive drop-ins (a `package.accept_keywords` entry, say) — a running system must never have its hostname or fstab rewritten under it |

Every entry is written during the configuration step except `webui_cron`,
which is written together with the scripts it points at. An in-place install
writes only the entries marked `inplace`.

## Writing one

Copy the closest existing fragment:

- **has a bootstrapper reachable from other distros** → start from
  `installer-debian.json`
- **only ships a rootfs tarball** → start from `installer-void.json`, or
  `installer-gentoo.json` for the fuller worked example (stage3, plus
  Portage's `make.conf`, `package.use` and binary host written as profile
  file contents)
- **native ZFS boot, BSD tooling** → start from `installer-freebsd.json`

Then check the whole install resolves without touching a disk:

```bash
sudo freedomnas-install --dry-run --mode clean --target <edition>
# or, from a freedomnas-installer checkout:
python3 tests/dryrun_smoke.py
```

Every command the installer would run is printed, resolved against your
fragment. No Python change should ever be required — if one is, the schema
is missing something and that is what should be extended.
