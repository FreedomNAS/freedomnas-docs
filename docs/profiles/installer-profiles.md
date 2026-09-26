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
| `suite` | Release to bootstrap (`trixie`). **Empty with a `bootstrap.latest_suite` command** means "the newest release": FreeBSD follows whatever the mirror ships last, so its profile names no version |
| `mirror` | Default package mirror. `mirror`, `rootfs_tarball_url` and `extra_tarball_urls` may name `{arch}` and `{suite}`, filled in once the release is known |
| `mirrors` | `{code, label, url}` entries offered in the mirror menu |
| `esp_size` | ESP size **in that partitioner's syntax** — `512MiB` for sgdisk, `512M` for gpart |
| `esp_mountpoint` | Where the ESP is mounted inside the target |
| `bootstrap_methods` | Ordered list, e.g. `["debootstrap", "tarball"]` |
| `bootstrap_tools` | `{method: host binary}` — a method whose binary is missing on the host is filtered out at runtime |
| `rootfs_tarball_url` | Default tarball URL; **empty means "ask"**, which is correct for date-stamped filenames |
| `extra_tarball_urls` | Tarballs unpacked over the rootfs, in order, with the same `fetch_tarball`/`unpack_tarball` commands — for releases split into sets (FreeBSD: `base.txz` has no kernel, `kernel.txz` follows) |
| `chroot_dirs` | Directories created before the chroot mounts |
| `uki_name`, `uki_recovery_name` | UKI filenames on the ESP (UKI-booting editions) |
| `community_maintained` | Marks the edition as community in the installer menu |
| `init_systems` | Init systems the installer offers, default first — only when there is more than one (Artix: `["openrc", "dinit", "runit"]`) |
| `init_packages` | `{init: packages}` passed to the bootstrap command as `{init_packages}` |

## `chroot`

| Key | Variables | Notes |
|-----|-----------|-------|
| `exec_prefix` | `{root}` | **Required** for chroot installs. Prepended as argv to every command run inside the target — `chroot {root}`, or a `systemd-nspawn -D {root}` style prefix |
| `mount` | `{root}` | Command **sequence** binding the pseudo-filesystems |
| `unmount` | `{root}` | Sequence, reverse order, run with `check=False` |
| `finalize` | — | Optional sequence, run **inside the target** before the unmount, with `check=False`. For what only existed to make the chroot behave — Debian removes `/usr/sbin/policy-rc.d` here |

## `partitioning`

Runs on the host, with the host's tools.

| Key | Variables | Notes |
|-----|-----------|-------|
| `list_disks` | — | **Output contract:** one disk per line, `<name> <size-in-bytes> <model...>` |
| `disk_pools` | `{disk}` | Optional. **Output contract:** one device per line, `<device> [<fstype> [<label>]]`, spaces in a label escaped as `\x20` (`lsblk -nrpo NAME,FSTYPE,LABEL`); a `zfs_member` device's label is its pool's name |
| `wipe` / `clear` | `{disk}` | Destroy the old table / create a new one |
| `labelclear` | `{device}` | Optional; clears the ZFS label of an old pool's device before `wipe` |
| `create_esp` | `{disk}`, `{esp_size}` | Partition 1, EFI System |
| `create_bios_boot` | `{disk}` | Optional. A BIOS boot-code partition, created before the root partition but numbered after it (FreeBSD: `freebsd-boot`, index 3, for `gptzfsboot`) |
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
| `create` | `{force}`, `{ashift}`, `{compression}`, `{altroot}`, `{pool_name}`, `{device}` — `{force}` is `-f` only when the chosen disk carried another pool and the admin agreed to destroy it |
| `unmount_target` | `{root}` — optional; lazy recursive unmount of the target root before the export |
| `imported_devices` | — optional; output of `zpool status -LP`, from which the installer maps every device of an imported pool to its name |
| `create_boot_environment` | `{pool_name}`, `{edition}` — command sequence: `ROOT` and `ROOT/<edition>` only |
| `create_datasets` | `{pool_name}`, `{edition}` — command sequence for everything else (`home`, `var`, `var/log`, `.freedomnas`), run **after** `mount_root` |
| `create_state_dataset` | `{pool_name}` |
| `set_bootfs`, `mount_root` | `{pool_name}`, `{edition}` |
| `mount_all`, `unmount_all`, `export_all`, `list_importable`, `list_pools` | — |
| `mount_dataset`, `dataset_exists` | `{dataset}` |
| `export` | `{pool_name}` |
| `cachefile_set` | `{pool_name}`, `{cachefile}` — optional; with `cachefile_install`, gives the target a `zpool.cache` |
| `cachefile_install` | `{cachefile}`, `{root}` — copies it to the target's cache path (Linux: `/etc/zfs/zpool.cache`) |

## `bootstrap`

Described by the **target's** profile, executed **on the host** — the target
root is still empty at that point. The exceptions are `update_cache`,
`install_base` and `locale_gen`, which run inside the chroot.

| Key | Variables | Notes |
|-----|-----------|-------|
| *native method* | `{arch}`, `{suite}`, `{root}`, `{mirror}`, `{bootstrap_dir}` | Key name must match its entry in `bootstrap_methods`; may be a command sequence |
| `fetch_tarball` | `{url}`, `{output}` | `curl` on Linux, `fetch` on FreeBSD |
| `latest_suite` | `{arch}` | Optional. Prints the newest release; FreeBSD picks the newest `N.M-RELEASE` on download.freebsd.org that has a `kernel.txz`. When it prints nothing the installer asks |
| `unpack_tarball` | `{tarball}`, `{root}` | |
| `update_cache` | — | In-target |
| `install_base` | `{package_list}` | Space-separated; the recommends-free variant |
| `locale_gen` | — | Optional |

## `bootstrap_files`

Files a native bootstrapper reads **on the host** before the target root holds
anything. The installer renders them into a temporary directory, passes its
path to the bootstrap command as `{bootstrap_dir}`, and deletes it afterwards.
`path` is relative to that directory; `content` takes `{mirror}`, `{arch}`,
`{suite}`, `{root}` and `{bootstrap_dir}`.

This is what lets pacstrap install Arch or Artix from a host that is not Arch
— the live ISO in particular — without touching the host's `/etc`:

```json
"bootstrap": {
  "pacstrap": [
    "install -d -m 700 {bootstrap_dir}/gnupg",
    "pacman-key --config {bootstrap_dir}/pacman.conf --init",
    "pacman-key --config {bootstrap_dir}/pacman.conf --populate archlinux",
    "pacstrap -K -M -C {bootstrap_dir}/pacman.conf {root} base linux linux-firmware",
    "gpgconf --homedir {bootstrap_dir}/gnupg --kill all"
  ]
},
"bootstrap_files": {
  "pacman_conf": {
    "path": "pacman.conf",
    "content": "[options]\nGPGDir = {bootstrap_dir}/gnupg\n...\n[core]\nServer = {mirror}/$repo/os/$arch\n"
  }
}
```

`GPGDir` has to exist before `pacman-key` runs: `pacman-conf` refuses a path
that does not resolve, and `pacman-key --init` reports it but still exits 0.
`-M` keeps pacstrap from copying a host mirrorlist that a non-Arch host does
not have, so the installed system gets its mirror from `files.pacman_mirrorlist`.

On Artix, `base openrc` is not enough: `base`'s dependencies default to the
dinit providers, and pacman installs dinit alongside OpenRC unless
`elogind-openrc` is named too.

## `repositories`

Optional. Third-party package repositories a feature category needs, keyed by
the category name from `packages/MANIFEST.json`. The installer runs the entry
for each selected category inside the target, between two cache refreshes, and
skips the step entirely on editions that declare none.

Debian's `core` entry adds FreedomNAS's own APT repository — the Codeberg
package registry that carries `freedomnas-core`, `-profiles`, `-webui`,
`-installer` and `topgrade` — by fetching its signing key and writing a
`sources.list.d` file. It is a command sequence rather than a `files` entry
on purpose: the first `apt-get update` runs before this step, and a sources
file whose key is not there yet would make it complain.

```json
"repositories": {
  "containers": [
    "env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl",
    "install -m 0755 -d /etc/apt/keyrings",
    "curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc",
    "chmod a+r /etc/apt/keyrings/docker.asc",
    "printf 'Types: deb\\nURIs: …\\nSuites: {suite}\\nArchitectures: {arch}\\n…' > /etc/apt/sources.list.d/docker.sources"
  ]
}
```

`{suite}` and `{arch}` are the ones the installer actually bootstrapped with,
not values re-derived inside the target.

Debian and the two pacman editions need one today:

- Debian's `containers`: Docker Inc. ships `docker-ce` and `containerd.io`
  from its own repository.
- Arch's and Artix's `core`: ZFS comes from [Chaotic-AUR](https://aur.chaotic.cx),
  whose `zfs-dkms-git` and `zfs-utils-git` build the DKMS module against the
  upstream kernel rather than only `linux-lts`, and ship the dracut module the
  UKI needs. The entry is Chaotic-AUR's own procedure — `pacman-key --recv-key`
  and `--lsign-key` for its key, `pacman -U` of `chaotic-keyring` and
  `chaotic-mirrorlist`, a `[chaotic-aur]` section appended to `pacman.conf`
  unless it is already there — followed by `gpgconf --kill all` on the
  target's keyring, so no `dirmngr` is left holding the root dataset busy when
  the pool is exported. On Artix, `chaotic-keyring`'s dependency
  `archlinux-keyring` comes from `galaxy`.

## `pkgbuild`

Optional. How the edition builds a package from a PKGBUILD repository, for the
`{name, git}` entries a category lists under `pkgbuilds` in `packages/*.json` —
the AUR is just one git host among others. `install` is a command sequence run
inside the target with `{package_name}` and `{git_url}`, after the repository
packages and before services are enabled. An edition that lists PKGBUILD
repositories without declaring `pkgbuild.install` stops the installation with
an error rather than skipping them.

Artix uses it for the ZFS service scripts, since Chaotic-AUR's ZFS ships
systemd units only:

| Init | Repository | Services it provides |
|------|------------|----------------------|
| OpenRC | `https://aur.archlinux.org/zfs-openrc.git` | `zfs-import`, `zfs-mount`, `zfs-load-key`, `zfs-share`, `zfs-zed` |
| dinit | `https://codeberg.org/sarahmeow86/zfs-dinit.git` | `zfs-mount`, `zfs-zvol`, `zfs-share`, `zed` |

`makepkg` refuses to run as root, so the sequence installs `git` and
`base-devel`, creates a `freedomnas-build` system user, clones and builds as
that user, installs the result with `pacman -U` and removes the user again.
Both packages depend on the `-git` ZFS, which is why the package list names it.

## `dkms`

Optional, declared by Arch and Artix. Three actions run in the target after
the packages, once per kernel that has a module tree:

| Key | Notes |
|-----|-------|
| `module_present` | `modinfo -k {kernel_version} -n zfs`. Prints the module's path; empty output means the module is not installed, whatever the exit code says. |
| `fix_gitrev` | Writes an empty `scripts/make_gitrev.sh` into every `/usr/src/zfs-*/` that has a `scripts` directory and does not have the file — the one thing `zfs-dkms-git` forgets to ship, and without which its DKMS build exits non-zero after compiling the module. |
| `autoinstall` | `dkms autoinstall -k {kernel_version}`, the rebuild after the repair. |

If the module is still missing afterwards the installation stops with an
error: pacman's `dkms` hook reports a failed build as a warning and exits 0,
so without this check the UKI is built without ZFS and the machine cannot
boot. See [the installer's own page](../developer/installer.md) for the whole
story. Each action is behind its own `has()`, so an edition that does not
build ZFS with DKMS declares none of them.

## Choosing the init system

An edition that can boot with more than one init lists them in
`installer_meta.init_systems`; the first is the default, and the installer asks
right after the edition is chosen. The choice rebuilds the target engine with
that init (`FreedomNASEngine.for_target(init_system=...)`), so service commands
come from `init/init-<name>-<edition>.json` where that exists and
`init/init-<name>.json` otherwise, and it selects:

- `installer_meta.init_packages[<name>]`, passed to the bootstrap command as
  `{init_packages}` — on Artix `openrc elogind-openrc`,
  `dinit elogind-dinit` or `runit elogind-runit`. Naming the elogind
  provider matters: `base` alone lets pacman pick dinit's providers, and
  OpenRC then conflicts with them.
- the `init.<name>` block of each category in `packages/*.json` — see
  [Package Manager](../architecture/package-manager.md).

An in-place install does not ask: it installs for the init the running system
actually uses.

Enabling a service happens inside the chroot of a system that has not booted,
so `services.enable_offline` is used instead of `services.enable` when the init
profile declares it, and a category's `early_services` go through
`services.enable_early` first (OpenRC: `sysinit`, where `zfs-import` and
`zfs-mount` belong). dinit needs it — plain `dinitctl enable` asks the running
daemon — and gets `dinitctl --offline enable {service_name}`; OpenRC's
`rc-update add` already works offline, and so does runit, whose whole
enable step is a symlink.

runit on Artix has no `early_services`: `zfs-runit` installs
`/etc/rc/sysinit/57-zfs-mount` itself, between `55-remount-root` and
`60-mount-all`, so pools are imported and mounted as soon as the package
is there — the same place `lvm2-runit` and `cryptsetup-runit` use.

## `python`

| Key | Notes |
|-----|-------|
| `site_dir` | Run in the target; prints the directory its `python3` loads `.pth` files from. The installer writes `freedomnas-core.pth` there, for `python3 -m freedomnas` by hand — the services set `PYTHONPATH` themselves. |

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
    "content": "@reboot root {install_root}/webui/bin/firstboot.sh …\n"
  }
}
```

| Key | Meaning |
|-----|---------|
| `path` | Absolute path **inside the target** |
| `content` | Template — filled with hostname, fqdn, domain, timezone, mirror, suite, arch, esp_device, esp_spec, pool_name, edition, and on every entry `install_root` and `config_dir` from the target's OS profile `paths` |
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
