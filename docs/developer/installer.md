# Installer Flow

`freedomnas-installer` provisions FreedomNAS onto a dedicated disk, **or**
onto the system that is already running. It is profile-driven end to end:
every OS command — including the chroot invocation — comes from
`freedomnas-profiles` through `freedomnas-core`'s engine.

!!! info "Images are still the primary path"
    Pre-built images from `freedomnas-image-builder` remain the recommended
    way to install (ADR-002). The installer covers what an image cannot:
    hardware that can't be flashed, console/ISO installs, and adopting a
    system that is already running. See ADR-002's 2026-09-04 follow-up,
    which replaced the earlier "parked" status.

## Modes

| Mode | What it does | What it touches |
|------|--------------|-----------------|
| `clean` | Partition, root pool, bootstrap, users, packages, FreedomNAS, boot chain, `config.yaml` | The selected disk — erased completely |
| `inplace` | Installs the missing packages, enables their services, wires the WebUI, records the configuration | The running system's packages and config only |
| `recovery` | `--mode recovery` only: hands the running system's `config.yaml` to the `ReconciliationEngine` | Whatever the reconciler changes |

The menu offers only `clean` and `inplace`. Restoring a FreedomNAS onto a new
system disk is not an installer mode: install, and the first boot restores the
configuration it finds on another pool (see [State and restore](#state-and-restore)).

```sh
sudo freedomnas-install                        # menu-driven
sudo freedomnas-install --mode inplace
sudo freedomnas-install --mode clean --target void
sudo freedomnas-install --dry-run              # print every command, execute none
sudo freedomnas-install --quiet                # steps only, no command output on screen
```

`--dry-run` needs neither root nor a target disk. It is the fastest way to
see exactly what installing a given edition consists of.

## Three engine views

`lib/context.py`'s `ExecutionContext` owns the whole OS-facing surface. Each
step picks the view that matches *whose* profile describes the command and
*where* it has to run:

| View | Profile used | Runs on | Steps |
|------|--------------|---------|-------|
| `host_run()` | the host's | the live system | partitioning, root pool, chroot mounts, ESP mount |
| `stage_run()` | the target's | the live system | bootstrap — the target root is still empty |
| `target_run()` | the target's | inside the target | packages, users, services, boot chain |

`target_run()` is transparently prefixed with the profile's
`chroot.exec_prefix` by `FreedomNASEngine.for_target(os_type, root=...)`. The
same call therefore works against `/mnt` during a clean install and against
`/` during an in-place install — the installer never writes `chroot` itself.

## Module responsibilities

| Module | Responsibility |
|--------|---------------|
| `setup.py` | Mode and edition selection, host-family gate, recovery, cleanup on failure |
| `lib/corelink.py` | Imports freedomnas-core whether it's installed (`freedomnas.*`) or a sibling dev checkout |
| `lib/context.py` | The three engine views, profile access, profile-declared file writing |
| `lib/installer_modules.py` | `Logger`, `DialogManager`, `Configuration`, pure-Python file helpers |
| `lib/disk_installer.py` | Disk menu, partitioning, ESP format — all via `partitioning.*` |
| `lib/zfs_installer.py` | Root pool and dataset tree via `rootpool.*` |
| `lib/system_installer.py` | Firmware detection, prompts, bootstrap, `files.*`, chroot mounts |
| `lib/users_installer.py` | Accounts; passwords through `users.set_password_stdin`. The accounts are made before the packages, so `set_samba_passwords()` runs after them: where `samba.check_installed` succeeds, each account gets the same password in Samba's database (`samba.set_user_password`), without which it cannot open a share |
| `lib/packages_installer.py` | Category selection via `PackageManager`, install, `services.enable`. `PackagesInstaller.disable_ssh()` leaves every clean install with SSH off: `system.ssh_service` is disabled through the init profile (`services.disable_offline` where an init profile defines it — none does yet — otherwise `services.disable`, run with `check=False`, so an init that cannot disable inside a chroot leaves the service as its package set it), which matters where the package enables itself (Debian's `openssh-server`); it is turned on from the WebUI |
| `lib/core_installer.py` | Copies core/profiles/webui/docs into the target, wires first boot. A source counts only if it holds the file that proves it is a real copy (`__init__.py`, `api/main.py`, `index.html`): a removed package leaves `__pycache__` directories behind, and copying that skeleton gave a target whose WebUI could not start. The documentation comes from the installed `<root>/docs` or a built `freedomnas-docs/site`; without one the target has no offline documentation and the installer says so |
| `lib/bootloader_installer.py` | UKI + Clover, or the edition's native loader |
| `lib/state_installer.py` | The installation's `config.yaml` (not initialized) in the state directory on the root filesystem, the `setup-pending` file, and the read-only search of the other pools for a configuration to restore — see [State and restore](#state-and-restore). No `.freedomnas` dataset is created |
| `lib/target_installer.py` | Clean-install orchestration |
| `lib/inplace_installer.py` | In-place orchestration |
| `tests/dryrun_smoke.py` | End-to-end dry run of both modes, no root needed |

## Dataset creation order

`zfs create` mounts a `canmount=on` dataset the moment it exists. Created
together with the boot environment, `home` and `var/log` would be mounted on
the empty altroot, the root dataset then mounted over them, and `zfs mount -a`
would find them already mounted: packages, logs and user homes would all be
written into the root dataset, and at boot the real, empty `home` and
`var/log` would hide them — services failing with *opening log file: No such
file or directory* and users logging in without a home. The boot environment
(`rootpool.create_boot_environment`) is therefore created and mounted first,
and only then the rest (`rootpool.create_datasets`), each mounting on top of
the root dataset. `freedomnas-image-builder/common/zfs-layout.sh` follows the
same order.

## Editions whose Samba ships no smb.conf

Arch, Artix and Gentoo package Samba without `/etc/samba/smb.conf` (Gentoo
installs only `smb.conf.default`), and FreeBSD's `samba416` without
`/usr/local/etc/smb4.conf`; `smbd`, `nmbd` and `winbindd` then exit
with code 1 at every boot, and the installer's `smbpasswd -a` for the
administrator fails ("Can't load smb4.conf"). Their installer profiles declare
`files.samba_conf`: a standalone-server `[global]` section that already
carries the usershare settings the setup wizard would otherwise append.
Debian ships a default `smb.conf` and keeps it. Void's `samba` installs
Samba's example `smb.conf`, with a writable `[homes]` share and `[printers]`:
the Void edition installs `freedomnas-samba-conf` from
[freedomnas-void](packaging.md#freedomnas-void) with Samba (the `void` entry
of `packages/samba-cifs.json`), which puts the same global-only
configuration in its place.

## Editions that package FreedomNAS

`installer_meta.core_packages` names the packages that carry FreedomNAS
itself. Where it is declared — Debian, from the Codeberg registry — the
installer does **not** copy `core`, `profiles` and `webui` out of the live
image: `packages/core.json` lists `freedomnas-core`, `freedomnas-profiles`
and `freedomnas-webui` like any other package, apt installs them with the
rest, and `CoreInstaller` only checks they arrived. Copying over them would
leave apt owning files that no longer match what it installed, and the
system could never be updated with `apt upgrade`.

The check imports the core rather than looking for a directory: a packaged
core lives where that distribution keeps Python modules
(`/usr/lib/python3/dist-packages/freedomnas` on Debian), not under
`/usr/lib/freedomnas/core`, and `<site-packages>/freedomnas-core.pth` is not
written either — there is nothing to point at. `python.import_check` is what
asks; an edition without it falls back to the copied layout.

Every other edition still gets the copy, which is what makes an installation
work with no network and produces exactly what
`freedomnas-image-builder/common/install-core.sh` produces.

## PATH, and why chroot cared

`setup.py` completes the process PATH before anything runs: the host's own
entries keep their order, and any of `/usr/local/sbin`, `/usr/local/bin`,
`/usr/sbin`, `/usr/bin`, `/sbin`, `/bin` it lacks are appended.

This is not housekeeping. `chroot` resolves the command name through the
PATH it inherits, but *after* changing root. The live ISO is Gentoo, where
`/sbin` and `/usr/sbin` are symlinks to `/usr/bin` and are therefore absent
from root's PATH. Installing Debian from it asked the target for
`/usr/bin/useradd`, and Debian keeps the directories apart:

```
Command failed with exit code 127
Command: useradd -m -s /bin/bash -G sudo admin
Stderr: chroot: failed to run command 'useradd': No such file or directory
```

Every other edition hid the problem, because on Arch, Artix and Void
`/usr/sbin` is a symlink to `/usr/bin` and the command was found anyway. It
would have hit `usermod`, `chpasswd`, `zpool` and `update-grub` in the same
way. The WebUI's `firstboot.sh` sets PATH for the same reason — cron's
`@reboot` environment has no sbin either.

A login shell inside the target (`chroot {root} bash -lc …`) would also fix
it, by sourcing the target's `/etc/profile`, but it would send every command
back through a shell that re-parses the values the engine quoted, require
bash in every edition, and leave the host side alone.

## ZFS on Arch and Artix: no DKMS

Arch and Artix install `linux-freedomnas` and `zfs-utils-freedomnas` from the
FreedomNAS pacman repository (see [Repositories](repositories.md)): the
kernel package already carries `zfs.ko` and `spl.ko`, so nothing is compiled
on the NAS. pacstrap and basestrap install no kernel of their own; the core
packages bring `linux-freedomnas`, and its `initramfs` dependency is
satisfied by `dracut`, so mkinitcpio never enters the system.

pacman never runs `/etc/kernel/postinst.d`, so `files.freedomnas_uki_hook`
writes `/etc/pacman.d/hooks/90-freedomnas-uki.hook`, which calls
`zz-dracut-uki` with the version of every kernel a transaction installs or
upgrades (target `usr/lib/modules/*/vmlinuz`). It does nothing while the
script is not there yet, which is the case during the installation itself:
the installer links `zz-dracut-uki` and builds the UKI at the bootloader
step. A second hook, `89-freedomnas-uki-backup.hook`
(`files.freedomnas_uki_backup_hook`), runs `zz-dracut-uki --backup` as a
`PreTransaction` hook on the same target, before the new kernel is
unpacked.

Until 2026-10 the two editions took `zfs-dkms-git` from Chaotic-AUR. Its
`dkms.conf` reaches the top-level `gitrev` target, whose
`scripts/make_gitrev.sh` the package does not ship, so the build exited 2
after compiling the modules, pacman's `dkms` hook reported that as a warning
and exited 0, and the UKI was built without ZFS. `ensure_kernel_modules()`
still repairs and checks such a build for any edition whose profile declares
the `dkms` actions; none does today.

## Disks that already carry a pool

The disk menu shows, next to each disk, the pools found on it
(`partitioning.disk_pools`: libblkid reports every ZFS member device with its
pool's name as label, imported or not). Choosing one is then handled by what
that pool is:

| The disk belongs to | What happens |
|---------------------|--------------|
| An **imported** pool | Refused, back to the menu. The pool is in use — most likely by the system running the installer. Matched by device, not by name, through `rootpool.imported_devices` (`zpool status -LP`), both sides compared as real paths so `/dev/mapper` names and `/dev/dm-N` agree: an exported pool on the target disk may be called `rpool` just like the host's. |
| A pool that is **not imported** — exported, another system's, an older install | A default-no confirmation naming the pool and its devices. Accepted, those devices get `partitioning.labelclear` before `wipe`, and the root pool is created with `-f`. |
| No pool | As before. |

`labelclear` is not redundant with `wipe`: `sgdisk --zap-all` removes the
partition table, not the ZFS labels inside the old partitions. Left there,
they make `zpool create` refuse the new partition, and, where the new layout
does not line up with the old, can surface as ghost pools in later scans such
as `firstboot.sh`'s. FreeBSD declares neither action yet and keeps the old
behaviour.

## Clean install order

Everything is asked first and confirmed once; nothing destructive happens
before that confirmation.

| # | Step | Comes from |
|---|------|------------|
| 1 | Interview — disk, bootstrap method, mirror, hostname, timezone, features, users | `installer_meta`, `packages/MANIFEST.json`, the host's tz database |
| 2 | Single confirmation | — |
| 3 | Partition + format the ESP | `partitioning.*` |
| 4 | A hostid for the installing machine, then root pool, boot environment, root mounted, then the other datasets | `rootpool.hostid_ensure` (host), `rootpool.create`, `create_boot_environment`, `set_bootfs`, `mount_root`, `create_datasets`, `mount_all` |
| 5 | Bootstrap the base system | `bootstrap.<method>` |
| 6 | Write the edition's config files | `files.*` |
| 7 | Bind-mount the chroot | `chroot.mount` |
| 8 | Create users — **before** packages, so PAM/Samba find them | `users.*` |
| 9 | Third-party repositories, packages, the ZFS module check (editions with `dkms.*`), locales, service enablement | `packages/*.json`, `repositories.<category>`, `bootstrap.install_base`, `dkms.*`, `services.enable` |
| 10 | core + profiles + webui, plus the first-boot hook | file I/O + `files.webui_cron` |
| 11 | The installing machine's hostid and the root pool's `zpool.cache` in the target | `rootpool.hostid_install`, `rootpool.cachefile_set`, `rootpool.cachefile_install` |
| 12 | Boot chain | `bootloader.*` |
| 13 | Save `config.yaml` (not initialized) to the state directory, write `setup-pending` = `install` | `ConfigurationManager`, file I/O |
| 14 | Undo the chroot-only policy files, unmount, export the pool | `chroot.finalize`, `chroot.unmount`, `rootpool.export`, `rootpool.export_force` |

Step 11 exists because a pool created with an altroot (`-R`) has
`cachefile=none`: without it the installed system has no
`/etc/zfs/zpool.cache`, the initramfs finds the root pool only by scanning,
and boot services that import from the cache — `zfs-mount` from zfs-dinit,
OpenZFS's `zfs-import-cache` — know nothing about it. The installer points the
pool's `cachefile` at a throwaway file, copies that into the target's
`/etc/zfs/zpool.cache` before the boot chain is built (dracut's `90zfs` module
puts the cache into the initramfs, and so into the UKI), and leaves the host's
own cache alone. Writing to the host's cache instead would be dangerous: an
installation that stops before the export would leave the new pool there, and
the host would import it at its next boot. The export removes the pool from the
throwaway file only.

The hostid goes the same way. A live system without `/etc/hostid` creates
pools as hostid 0, and the installed system then boots with none either —
until something writes one (Debian's `zfsutils` postinst does), after which
its root pool was "last used by another system" and is not imported at boot.
So step 4 runs `zgenhostid` on the installing machine when it has no
`/etc/hostid`, before the pool is created, and step 11 copies that file into
the target, over any a package generated, before the boot chain puts it into
the initramfs and before the export. Every machine flashed with one image
shares that hostid; a pool only compares it with whoever imported it last.

Step 14's export is the one step of the cleanup that must not fail quietly.
A pool left imported keeps the **installer host's** hostid in its label, and
the machine that was just installed then refuses to import its own root pool
at boot with *"pool was previously in use from another system"* — a finished
installation that does not boot.

Before exporting, `rootpool.unmount_target` (`umount -R -l <root>`) lazily
detaches everything still mounted under the target root — the ESP, the state
dataset, whatever a package left behind — since a plain unmount stops at the
first busy mount and the export then finds the pool busy. Arch and Artix also
stop the gpg-agent, dirmngr and keyboxd that `pacman-key` starts on the
target's keyring: once from the host right after `pacstrap -K`, and once inside
the chroot as `chroot.finalize`, for the agents the keyring packages' scriptlets
start there. An agent left running keeps a handle on the pool, and the export
fails.

The exit code is not taken as proof, because the chroot is torn down with
lazy unmounts that may still be settling when the export runs: after each
attempt the pool is looked for in `rootpool.list_pools`. `rootpool.export`
first (it unmounts the pool's own datasets by itself), then a three-second
wait, then `rootpool.export_force`. If the pool is still listed after that,
the completion dialog says so and **does not offer a reboot** — it gives the
`zpool export` command to run first.

The resulting layout — ESP + `rpool/ROOT/<edition>`, no `.freedomnas` —
is deliberately identical to what `freedomnas-image-builder` produces: an
installed machine and a flashed image must look the same to the reconciler
and the WebUI.

## State and restore

Neither install mode creates a `.freedomnas` dataset. A fresh root pool that
carried one would compete with the dataset on a data pool that outlived the
old system, and `firstboot.sh` would have to guess which is the real
configuration.

- **Clean install** — `StateWriter.save(initialized=False)` writes the
  installer's answers (hostname, timezone, users, root pool, features) to
  `config.yaml` in the state directory on the root filesystem, and
  `mark_setup_pending("install")` writes `install` into `setup-pending`.
- **First boot** — `firstboot.sh` imports every pool and mounts the first
  `.freedomnas` holding a `config.yaml` over the state directory. Found: the
  reconciler restores it, and the setup wizard asks only for the
  administrator and SSH (`_finish_restore`). Not found: the setup wizard runs,
  and `shadow.activate` moves the installer's `config.yaml` into the
  `.freedomnas` it creates on the pool the administrator picks.
- **Password** — `setup-pending` holding `install` tells the WebUI
  (`ConfigurationManager.setup_pending_kind()`, `/api/setup/status`
  `password_chosen`) that the administrator chose the password in the
  installer: the wizard accepts it. An image's empty `setup-pending` still
  requires a new one, because an image's password is public.
- **Image mode** (`Configuration.image_mode`, set by freedomnas-image-builder's
  vm-install) writes no `config.yaml` at all and an empty `setup-pending`.

Right after the disk is chosen, `StateWriter.find_restorable()` looks for a
configuration the first boot would restore: every pool `rootpool.list_importable`
reports, except the one on the chosen disk, is imported **read-only** with
`rootpool.probe_import` — `-N -f -o readonly=on -o cachefile=none`, under a
temporary name (`fnasprobe<N>`) and a temporary altroot, so another pool
named `rpool` cannot touch the live system — its `.freedomnas` is mounted,
`config.yaml` read for the hostname and edition, and the pool exported again.
A dialog lists what was found and asks to keep those disks attached.

## In-place install

The mode that matches how the rest of FreedomNAS is delivered: install the
packages, get the system. On a machine already running a supported OS:

1. Package categories are installed with the target's own package manager.
   That operation is idempotent, so only what is actually missing is pulled
   in.
2. Their services are enabled through the **init profile**, so the same code
   works under systemd, OpenRC, runit, s6, dinit and bsd_rc.
3. `firstboot.sh` + `supervisor.sh` are deployed and the cron `@reboot` hook
   is registered.
4. Optionally a FreedomNAS admin account is created; otherwise the system's
   existing accounts are kept.
5. The installation is recorded in `config.yaml` in the state directory, not
   initialized, with `setup-pending`: the setup wizard puts it on a
   `.freedomnas` dataset of the pool you pick there. A system with no pool at
   all keeps it under `/etc/freedomnas/`, initialized.

No disk is partitioned, no boot chain is touched.

## Host/target family limitation

Bootstrapping an OS runs that OS's own tooling, and `debootstrap`,
`pacstrap`, `xbps-install`, `gpart`/`pkg` do not cross the Linux/BSD divide.
The installer therefore offers only editions whose `os_family` matches its
host's:

- a **Linux** installer environment installs Debian, Gentoo, Void, Artix, Arch
- installing **FreeBSD** requires a **FreeBSD** installer environment

This is a data check on `os_family` in `profiles/os/os-{edition}.json`, not a
branch in Python.

## Bootstrap methods

Declared per edition in `installer_meta.bootstrap_methods`, and filtered at
runtime against `installer_meta.bootstrap_tools` — a method whose host-side
binary is missing simply is not offered:

| Method | Command | Needs on the host |
|--------|---------|-------------------|
| native | `debootstrap`, `pacstrap`, `basestrap`, `xbps-install -r` | that bootstrapper |
| tarball | fetch + unpack a rootfs tarball | `curl`/`fetch` and `tar` |

The tarball method takes the distro's own `rootfs.tar.gz` / `base.txz`, or an
exported container rootfs. It is what makes supporting a new edition cheap,
and what lets a Debian live environment install Void.

Every Linux edition installs its kernel firmware package alongside the kernel
(`firmware-linux` on Debian, `linux-firmware` elsewhere), and it has to be
installed **before** the UKI is built: dracut copies the blobs it finds into
the initramfs, so a firmware package added afterwards is invisible to a UKI
that is not rebuilt.

Debian's `debootstrap` line carries `--include=ca-certificates`: the bootstrap
itself downloads with the *host's* trust store, but the fresh chroot has none,
and any mirror that redirects to HTTPS (many do) makes the first `apt-get` in
the target fail with `certificate verify failed`.

Void's `xbps` method copies the repository keys into the target before
`xbps-install -r` runs, because XBPS asks interactively before importing an
unknown key, even with `-y`. Where the keys come from is described under
`bootstrap_files` in the installer profile reference.

## OS-specific file contents

`sources.list`, `fstab`, `hosts`, `rc.conf`, `loader.conf` and the cron hook
are **not** written from Python string literals — they live in the profile's
`files` section, with `{placeholders}` the installer fills in. A file's text
is as distribution-specific as a command is; keeping it in the profile is
what stops `if edition == "debian"` from reappearing in the code.

See [Profile System → Installer Profiles](../profiles/installer-profiles.md)
for the schema.

### Every edition must be able to boot

`bootloader` is the one profile section whose absence is silent: every branch
in `bootloader_installer.py` sits behind a `has()`, so an edition that
declares nothing simply installs no boot chain, finishes successfully, and
produces a machine that cannot start. Arch shipped exactly that.

`tests/test_profile_coverage.py::test_every_edition_installs_a_boot_chain`
now requires each edition to declare `build_uki` (dracut UKI: Debian, Gentoo,
Artix, Void, Arch) or `install_efi_loader` (FreeBSD's own loader). The
coverage test alone cannot catch it — a `has()`-guarded action is optional by
construction, which is precisely the exemption that hid the hole.

### Timezone

The timezone is chosen, never typed: region, then zone, then a confirmation
that shows the current time there. The list comes from the host's own tz
database through `zoneinfo.available_timezones()` — plain data, not an OS
command — and only regions that contain zones are offered, plus `UTC`. The
legacy single-name aliases (`Factory`, `W-SU`, `Eire`) are left out; their
canonical names are in the lists.

A typed name that does not exist would reach the target as an
`/etc/localtime` symlink pointing at nothing, and the first sign of it would
be a clock that is wrong. If the host has no tz database at all, the prompt
falls back to asking for the name.

## Nothing may ask a question

Every command the installer runs has its output captured and its standard
input on `/dev/null` (`_run_safe()` in the engine). A package script that
prompts therefore gets EOF and fails, instead of waiting on a question written
into a pipe nobody is reading while `dialog` owns the screen.

Two profile-side measures keep that from happening at all on Debian, where
`apt-get -y` silences apt but not debconf:

| Measure | Where | What it prevents |
|---------|-------|------------------|
| `env DEBIAN_FRONTEND=noninteractive LC_ALL=C.UTF-8 LANG=C.UTF-8` on the apt commands | `bootstrap.*`, `repositories.*` | debconf falling back to its readline frontend and blocking on stdin; and the host's locale, which does not exist inside a fresh chroot, reaching maintainer scripts |
| `files.policy_rc` → `/usr/sbin/policy-rc.d` returning 101, removed again by `chroot.finalize` | `files`, `chroot` | `invoke-rc.d` starting daemons inside the chroot. A daemon started there inherits the capture pipe and never closes it, so the installer keeps reading long after `dpkg` has exited — the symptom is a `<defunct>` `dpkg` and a frozen installer |

The same pattern is how Debian's own image builders (`live-build`,
`mmdebstrap`) treat a chroot.

## ZFS version skew between host and target

The pool is created by the **installer host's** ZFS — on a Gentoo host, 2.4.x —
but every command a package script runs inside the chroot speaks to that same
2.4.x kernel module with the *target's* userland, and after the reboot the
installed system has to import a pool it did not create.

Debian stable ships 2.3.x, so the Debian edition does not use Debian's ZFS.
Its core packages are `linux-image-freedomnas` and `zfsutils-freedomnas` from
the FreedomNAS Debian registry (see [Packaging](packaging.md)): the kernel
carries the OpenZFS modules of the same build, and the userland is exactly
their version. There is no DKMS step and no `linux-headers` package, so
`binutils` is listed on its own: dracut needs its `objcopy` to build the UKI,
and before the switch it only arrived through the headers' `gcc`.

Debian's kernel is 6.12 while linux-freedomnas follows the newer LTS, so the
firmware comes from backports, where it matches newer hardware:

```
Package: src:firmware-nonfree src:firmware-free
Pin: release n={suite}-backports
Pin-Priority: 990
```

written as `files.apt_pin_firmware`, with the matching `-backports` line in
`files.package_sources`. Backports is `NotAutomatic`, so nothing else on the
system moves to it.

A pool created by 2.4 has three features an older implementation does not know
— `block_cloning_endian`, `dynamic_gang_header`, `physical_rewrite`. They start
`enabled`, not `active`, which an older ZFS can still import; the risk is the
day one of them activates, since `dynamic_gang_header` is not read-only
compatible. Matching the versions avoids the question entirely.

The live ISO makes this the common case rather than a Gentoo-host one: it
carries a single ZFS (2.4.x from `::gentoo`) and creates the pool for every
edition it installs, so each edition has to install a ZFS at least as new —
or the pool has to be created with `-o compatibility=` set to what the
target ships (`/usr/share/zfs/compatibility.d/openzfs-2.3-linux` and so on).

## Recovery mode

`--mode recovery` (command line only) reapplies the running system's
configuration:

1. Load `config.yaml` through `ConfigurationManager`
2. Run `ReconciliationEngine` in `declarative` mode: the system is made to
   match the configuration exactly, in the fixed order (hostname → timezone
   → pools → accounts → services → SSH → shares → removal of accounts); see
   [Reconciliation Engine](../architecture/reconciler.md)

## Boot chain

Which chain is built depends on what the target profile declares, not on an
`if edition ==`:

- `bootloader.build_uki` present → a dracut **Unified Kernel Image** (kernel
  + initramfs + cmdline in one PE binary) on the ESP, plus
  `bootloader.build_uki_recovery` for the `ro single` recovery entry and the
  `zz-dracut-uki` hook so future kernel updates rebuild both. FreedomNAS's
  own dracut modules (`assets/dracut/`, today `91freedomnas-rootwait`, which
  holds the initramfs until the root pool's disks are there — a USB stick
  appears after the zfs module's single import) are copied into the target
  right after the base configuration, before any package: that
  configuration writes the `uki.conf` that enables them, and Debian's
  dracut builds an initramfs as soon as it is configured, failing the
  whole package installation when a module it names is missing. With
  systemd in the initramfs (Debian) the module also creates
  `lib/dracut/need-initqueue` at build time, without which
  `dracut-initqueue.service` never runs, and orders
  `zfs-import-{cache,scan}.service` after it
- otherwise `bootloader.install_efi_loader` → the edition's native loader
  (FreeBSD's reads ZFS directly and needs no UKI)

Then firmware decides the entry point. How the installer's own machine
booted comes from the host profile's `bootloader.firmware_mode`, which prints
`UEFI` or `BIOS` (Linux: whether `/sys/firmware/efi` exists; FreeBSD:
`sysctl machdep.bootmethod`):

- **UEFI** — `bootloader.efi_boot_entry` (`efibootmgr`) registers the loader
- **BIOS** — the vendored **Clover** chain (release 5173, pinned) bridges
  legacy BIOS into UEFI emulation. This is pure byte I/O onto the MBR and the
  ESP's boot sector, so it has no profile entry — the same precedent as
  writing `/etc/fstab`.

On both, the UKI is also copied to the UEFI fallback path
`EFI/BOOT/BOOTX64.efi`. The UKI is itself a UEFI application, so firmware
with no NVRAM entry for the disk — a flashed image, a disk moved to another
machine — starts Linux directly. Clover is used for BIOS boot only and never
runs under UEFI.

### UKI paths on the ESP

| File | Purpose |
|------|---------|
| `EFI/Linux/<edition>-uki.efi` | Active UKI — every normal boot |
| `EFI/Linux/<edition>-uki.kernel` | Kernel version inside the active UKI |
| `EFI/Linux/<edition>-uki-previous.efi` | Rollback UKI — the one the system ran before the last kernel change |
| `EFI/Linux/<edition>-uki-previous.kernel` | Kernel version inside the rollback UKI |
| `EFI/Linux/<edition>-uki-previous.snapshot` | The `pre-update-*` snapshot of the root dataset it pairs with |
| `EFI/Linux/<edition>-recovery.efi` | Recovery UKI — `ro single` |
| `EFI/Linux/<edition>-uki-failed.efi` | A UKI that did not boot and was replaced by the rollback UKI (with its `.kernel`) |
| `EFI/BOOT/BOOTX64.efi` | Copy of the active UKI — what UEFI firmware starts without an NVRAM entry |
| `EFI/FreedomNAS/boot.state` | Automatic rollback state, `key: value` lines (see below) |

The filenames come from `installer_meta.uki_name` /
`installer_meta.uki_recovery_name`.

Building a UKI needs the systemd EFI stub, which dracut looks for at
`/usr/lib/systemd/boot/efi/linuxx64.efi.stub` — a separate package on most
editions, and easy to miss because dracut only complains at the very end of an
install:

| Edition | Provides the stub |
|---------|-------------------|
| Debian | `systemd-boot-efi` |
| Void | `systemd-boot-efistub` |
| Gentoo | `sys-apps/systemd-utils` with `USE="boot kernel-install"` — `boot` alone fails its `REQUIRED_USE` and emerge stops before installing anything |
| Artix | `egummiboot` (Artix `system`), which installs systemd's `linuxx64.efi.stub` at the path dracut looks in |
| Arch | `systemd`, already a dependency |

`EFI/Linux` is created **after** the ESP is mounted. The ESP has just been
formatted, so it is empty; a directory made under `/boot/efi` before the mount
lives on the root dataset and is hidden the moment the ESP goes on top, and
dracut then refuses with `Can't write to /boot/efi/EFI/Linux`.

### zz-dracut-uki hook

`/etc/kernel/postinst.d/zz-dracut-uki` is a symlink to
`<install_root>/profiles/assets/zz-dracut-uki`, so a new freedomnas-profiles
package updates the hook too (installations made before 2026-10-09 have a
copy). It has two modes.

**Backup**, `zz-dracut-uki --backup [<snapshot>]`, before anything is
installed. It copies the active UKI to `-previous.efi` (with its `.kernel`)
and pairs it with `<snapshot>`, or else with the newest `pre-update-*`
snapshot of the root dataset taken after the active UKI was built; with
none, the pairing file is removed and a warning logged. It does nothing
when the rollback slot already holds the running UKI, and refuses when the
running kernel is not the one in the active UKI — the system then booted
from the rollback slot, and that slot is the good one. Called by:

| Caller | When |
|--------|------|
| WebUI update (`bootloader.uki_backup`) | right after the pre-update snapshot, with its name |
| Debian, Gentoo | `/etc/kernel/preinst.d/zz-dracut-uki` (`files.uki_backup_hook`, a symlink: a call from `preinst.d` is a backup) |
| Arch, Artix | pacman `PreTransaction` hook `89-freedomnas-uki-backup.hook` |
| Void | `/etc/kernel.d/pre-install/10-freedomnas-uki-backup` |

**Build**, `zz-dracut-uki <kernel-version>`, after the kernel is installed:

1. Builds nothing while `modinfo -k <version> zfs` fails: the zfs module for
   that kernel is not there yet (DKMS, `@module-rebuild`, Void's
   `linux<series>-zfs`), and a UKI without it cannot import the root pool
2. Builds the new UKI to `<name>.efi.new` and checks with `objcopy` and
   `lsinitrd` that its initramfs carries `zfs.ko`; if not, the new file is
   deleted and the active UKI and `BOOTX64.efi` stay as they are
3. Rotates the active UKI to `-previous.efi` only when no backup ran first
   and the active UKI holds another kernel: a second run for the same
   kernel (Void runs its hooks again once `linux<series>-zfs` is in place)
   rebuilds in place and leaves the rollback slot alone
4. Moves the new UKI into place, writes `<name>.kernel`, and copies it to
   `EFI/BOOT/BOOTX64.efi` — a fallback left behind would boot the old
   kernel against the new kernel's modules
5. Rebuilds the recovery UKI (`ro single freedomnas.autorollback=0`) the
   same way, keeping the old one if the new one fails or has no `zfs.ko`
6. When the kernel changed and a rollback UKI exists, puts `boot.state` in
   `trial` for the new kernel with `tries-left: 3`

A kernel recorded as `failed-kernel` in `boot.state` is not built again
until the rollback record is cleared (the WebUI's notice).

On 2026-10-05 a Void update ran the old hook twice: the first run built a
UKI without `zfs.ko` and the second rotated it into the rollback slot over
the good one. Steps 1–3 are what prevents that now.

### Automatic rollback

A kernel that does not boot is replaced by the rollback UKI without anyone at
the console. Three pieces:

| Piece | Role |
|-------|------|
| `zz-dracut-uki` | Puts `boot.state` in `trial` after activating a new kernel; `--boot-ok`, `--autorollback`, `--state`, `--forget-rollback` for userspace |
| dracut module `92freedomnas-fallback` (`assets/dracut/`, in every UKI through `uki.conf`) | Counts trial boots, falls back, finishes the rollback |
| `python3 -m freedomnas boot-ok` (core `bootstate.py`), run by `firstboot.sh` | Ends the trial once the system has booted, and writes the setting from `config.yaml` (`system.autorollback`) to the ESP |

**Falling back** (in the failing UKI's initramfs, state `trial`, running
kernel = `trial-kernel`): when the initramfs reaches the emergency shell
(dracut's `emergency` hook, which systemd's `dracut-emergency` runs too), or
when a trial boot starts with `tries-left: 0` — the counter is decremented at
every trial boot and only `boot-ok` ends the trial, so three boots that never
reached `firstboot.sh` are enough. It mounts the ESP (the vfat partition that
holds `EFI/Linux/<uki_name>`), copies the active UKI to `-failed.efi`, the
rollback UKI over the active one and over `BOOTX64.efi`, records
`fallback-requested` and reboots (`sysrq b`). Swapping files rather than
setting `BootNext` works the same through an NVRAM entry, the removable path
of a USB stick and Clover on BIOS machines. It refuses when the rollback UKI
holds the same kernel as the one that failed.

**Finishing** (in the restored UKI, state `fallback-requested`): before the
pool is imported — `freedomnas-fallback.service` with systemd in the
initramfs (Debian), the `pre-mount` hook otherwise — it imports the root pool,
renames `<pool>/ROOT/<edition>` to `<edition>-failed-<date>`, clones the paired
`pre-update-*` snapshot back as `<pool>/ROOT/<edition>` (`canmount=noauto`,
`mountpoint=/`), promotes it, sets `bootfs`, exports the pool and records
`rolled-back`. Only the root dataset is touched, never `home`, `var/log` or a
data pool. Without a paired snapshot, or if the clone fails, the kernel is
restored and the system files are left as they are (`fs-rollback: no` or
`failed`).

The systemd service is ordered after `dracut-initqueue.service` and before
`zfs-import-{cache,scan}.service`: binding the import to
`dracut-pre-mount.service` instead made an ordering cycle with OpenZFS's
`zfs-env-bootfs.service`, and systemd broke it by dropping the hook.

One rollback per update: `fallback-requested` and `rolled-back` never fall
back again, and the failed kernel is not rebuilt until the record is
cleared. `freedomnas.autorollback=0` on the command line (the recovery UKI
has it) or `autorollback: no` in `boot.state` turns it off.

`boot.state` keys:

| Key | Written by | Meaning |
|-----|------------|---------|
| `autorollback` | `boot-ok`, WebUI | `yes` / `no` |
| `state` | all | `ok`, `trial`, `fallback-requested`, `rolled-back` |
| `trial-kernel`, `tries-left` | `zz-dracut-uki`, initramfs | the kernel on trial and the boots it has left |
| `failed-kernel`, `restored-kernel`, `reason`, `date`, `snapshot` | initramfs (falling back) | what failed, what came back, why, when, the paired snapshot |
| `fs-rollback`, `failed-dataset` | initramfs (finishing) | `yes`/`no`/`failed`, and the failed root dataset kept |

Kernel versions are what tells the UKIs apart: a rebuild for the same kernel
(a ZFS-only update) never starts a trial. FreeBSD boots its own loader and
has none of this.


dpkg runs `/etc/kernel/postinst.d/` on Debian. pacman does not: on Arch and
Artix the pacman hook `90-freedomnas-uki.hook` (`files.freedomnas_uki_hook`)
calls it with the new kernel's version, so a kernel update never leaves the
UKI on a kernel whose modules pacman has just deleted.

It never aborts `dpkg`'s kernel install over a UKI or ZFS failure — it logs
and exits 0.

The hook is a plain asset shared by every edition, so it holds no pool name,
no edition and no filenames of its own. It reads them from
`/etc/freedomnas/uki.conf`, written by the installer:

```
ROOT_DATASET="tank/ROOT/debian"
UKI_NAME="debian-uki.efi"
UKI_RECOVERY_NAME="debian-recovery.efi"
```

Without a readable config it logs and exits 0 rather than guessing — a wrong
`root=ZFS=` in a rebuilt UKI is an unbootable machine.

### Getting a shell when boot fails

A FreedomNAS appliance has no root password — the admin user has passwordless
sudo instead — and `sulogin`, which every rescue console goes through, refuses
a locked root account with *"the root account is locked"*. Taken literally that
makes the recovery UKI useless: the one path meant for a machine that will not
boot is the one that cannot open.

Two settings undo that, and both are needed because they act at different
stages:

| Stage | Setting | Where |
|-------|---------|-------|
| initramfs (dracut) | `SYSTEMD_SULOGIN_FORCE=1` on the kernel command line — `dracut-emergency` reads it with `getargbool` | `bootloader.build_uki_recovery` |
| real root (systemd) | `Environment=SYSTEMD_SULOGIN_FORCE=1` — systemd does not take it from the command line | `files.rescue_sulogin`, `files.emergency_sulogin` |

Only the **recovery** UKI carries it. A normal boot stays strict, and the
trade-off is the one an appliance already makes: whoever can pick a boot entry
from the firmware menu can reach a root shell — as they could anyway by
replacing a UKI on an unencrypted ESP.

`files.dracut_uki` writes `/etc/dracut.conf.d/uki.conf` with `hostonly="no"`,
which both the installer's first build and every later rebuild pick up. It
matters most on Gentoo, whose `01-gentoo.conf` sets `hostonly="yes"`: inside
a chroot, dracut's "this host" is the installer's machine, not the one being
installed.

The same file:

- names the USB storage, USB host, HID, keyboard, serio and MMC drivers in
  `add_drivers` (dracut 111 installs nothing for its `=drivers/<dir>` lists).
  `$kernel` stays unquoted there: dracut warns about any `"` that follows a
  non-blank character on a `+=` line, and a kernel version has no spaces;
- leaves out `multipath` (`omit_dracutmodules`): libvirt pulls in
  multipath-tools, whose dracut module wants a systemd unit directory the
  other inits do not have, and a NAS never boots over several paths;
- leaves out `drm` on Void, whose base system carries every GPU firmware.

### Vendored Clover assets

| File | Role |
|------|------|
| `boot0ss` | MBR bootstrap (first 440 bytes; partition table preserved) |
| `boot1f32alt` | FAT32 VBR — BPB bytes 3–89 merged from the original sector |
| `boot7` | DUET BiosBlockIO firmware → the file `ESP/boot`, which is what `boot1f32alt` loads |
| `CLOVERX64.efi` | Clover picker/BDS → `EFI/CLOVER/`, started by `boot7` |
| `BOOTX64.efi` | Clover's UEFI stub — **not deployed**: `EFI/BOOT/BOOTX64.efi` holds the UKI |

FAT names are case-insensitive, so a `boot/` directory left on the ESP by an
older installer (which put `boot7` at `boot/boot7`, where nothing loads it)
would block the file; the installer removes it first.

Clover's CPU detection crashes under KVM on an AMD host (#GP reading MSR
`0xC0010061`; with `kvm.ignore_msrs=Y`, a division by zero). That is a VM
artifact, not an image fault: test the BIOS path under TCG with an Intel CPU
model (`-accel tcg -cpu Haswell-v4`).

!!! warning "Do not bump the Clover version without hardware validation"
    Release 5163 is a known regression on some real BIOS hardware
    ([CloverBootloader#740](https://github.com/CloverHackyColor/CloverBootloader/issues/740)).
    Release 5173 is validated; checksums are in `assets/clover/README.md`.

## First boot

`firstboot.sh` and `supervisor.sh` live in `freedomnas-profiles/assets/` and
are shared with the image builder, so both install paths boot identically.
The cron entry comes from the profile (`files.webui_cron`) because not every
OS has an `/etc/cron.d` drop-in directory — FreeBSD's entry is appended to
`/etc/crontab` instead.

On every boot `firstboot.sh` imports pools, unlocks encrypted ones
(`python -m freedomnas unlock-pools`), then either reconciles from an
existing `.freedomnas` config or leaves the WebUI's first-run wizard to take
over, before exec'ing the supervisor.

It sets `PATH` itself, and has to: cron's `@reboot` environment carries
neither `sbin` directory, while `useradd`, `zpool` and `rc-service` all live
in one of them. The supervisor inherits it through the `exec`.

The search for a `.freedomnas` dataset starts at **the pool this system booted
from** (`zfs list -H -o name /`), and only then walks the rest. A NAS can hold
several pools carrying that dataset — an older install, a disk from another
machine — and restoring a foreign configuration would create that machine's
users and start its services here. When the configuration does come from
another pool, the script says so in the log.

## installer_modules.py — base infrastructure

### Logger

Class-level static methods (`Logger.info`, `.warn`, `.error`, `.command`,
`.output`, `.still_running`, `.section`).
Coloured terminal output plus `/var/log/freedomnas-install.log` (falls back
to a tempfile when that path isn't writable). `Logger.command()` prints every
resolved profile command before it runs — and, under `--dry-run`, instead of
running it.

Every command's output is shown and logged **while it runs**:
`ExecutionContext._run` sets the core engine's `output_listener` for the
duration of the call, the engine then runs the command with `Popen` and hands
each line to `Logger.output()` — dimmed and indented on screen (stderr in
yellow), prefixed `|` (stdout) or `!` (stderr) in the log. A command that has
printed nothing for a minute gets a `… still running after Nm` line, so a
long `emerge` or `dracut` is told apart from a hung one. `--quiet` keeps the
screen to the steps and the commands; the log always has everything, the
output of commands that succeeded included.

The exception — and therefore the error dialog — still carries only the last
dozen lines of a failed command, which is where a package manager states why
it gave up; the full output is in the log above it.

### Diagnostics on failure

`lib/diagnostics.py` records what the machine looked like when something went
wrong, **before** `cleanup()` unmounts the target and exports the pool and the
evidence is gone. `collect()` runs when a step of a clean or in-place install
raises, and when the root pool cannot be exported at the end. It writes the
reason, the full Python traceback, and the output of every command in the
host profile's `diagnostics` section (see
[Installer Profiles](../profiles/installer-profiles.md#diagnostics)) to the
screen, to the log, and to
`/var/log/freedomnas-install-diagnostics-<YYYYmmdd-HHMMSS>.txt`. Each command
has 30 s and its failure never hides the others.

### DialogManager

TUI via `dialog` (preferred) or `whiptail`. Selections are captured through a
tempfile, because dialog writes them to stderr.

| Method | Widget |
|--------|--------|
| `msgbox` | OK-only message |
| `yesno` / `defaultno` | Yes/No, the latter defaulting to No |
| `menu` | Scrollable menu — returns the selected tag or `None` |
| `checklist` | Multi-selection — returns a list of tags |
| `inputbox` | Free text |
| `passwordbox` | Hidden input |
| `gauge` | Progress bar |

### Configuration

The mutable state bag passed to every module: mode, target edition and root,
firmware, disk/partitions, pool settings, bootstrap method, hostname,
timezone, mirror, package categories, users. `config.root_dataset` derives
`<pool>/ROOT/<edition>`.

### No subprocess helpers

There is deliberately no `run_command()`/`run_in_chroot()` here any more.
Anything that touches the OS goes through `ExecutionContext`, which resolves
it from a profile. What remains is pure Python file I/O (`write_file`,
`directory_exists`, `file_exists`) — not system commands, and never was.

## Adding an edition

1. `profiles/os/os-<edition>.json` + the per-module fragments
2. `profiles/installer/installer-<edition>.json`
3. Per-edition entries in `profiles/packages/*.json`
4. `python3 tests/dryrun_smoke.py`, or
   `freedomnas-install --dry-run --mode clean --target <edition>`

No Python changes. If one turns out to be necessary, the profile schema is
missing something — extend that instead.
