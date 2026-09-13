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
| `recovery` | Hands an existing `.freedomnas` `config.yaml` to the `ReconciliationEngine` | Whatever the reconciler changes |

`recovery` is offered automatically when an importable pool already carries a
`.freedomnas` dataset.

```sh
sudo freedomnas-install                        # menu-driven
sudo freedomnas-install --mode inplace
sudo freedomnas-install --mode clean --target void
sudo freedomnas-install --dry-run              # print every command, execute none
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
| `lib/users_installer.py` | Accounts; passwords through `users.set_password_stdin` |
| `lib/packages_installer.py` | Category selection via `PackageManager`, install, `services.enable` |
| `lib/core_installer.py` | Copies core/profiles/webui into the target, wires first boot |
| `lib/bootloader_installer.py` | UKI + Clover, or the edition's native loader |
| `lib/state_installer.py` | The `config.yaml` shadow copy on `.freedomnas` |
| `lib/target_installer.py` | Clean-install orchestration |
| `lib/inplace_installer.py` | In-place orchestration |
| `tests/dryrun_smoke.py` | End-to-end dry run of both modes, no root needed |

## Clean install order

Everything is asked first and confirmed once; nothing destructive happens
before that confirmation.

| # | Step | Comes from |
|---|------|------------|
| 1 | Interview — disk, bootstrap method, mirror, hostname, timezone, features, users | `installer_meta`, `packages/MANIFEST.json`, the host's tz database |
| 2 | Single confirmation | — |
| 3 | Partition + format the ESP | `partitioning.*` |
| 4 | Root pool + datasets | `rootpool.*` |
| 5 | Bootstrap the base system | `bootstrap.<method>` |
| 6 | Write the edition's config files | `files.*` |
| 7 | Bind-mount the chroot | `chroot.mount` |
| 8 | Create users — **before** packages, so PAM/Samba find them | `users.*` |
| 9 | Third-party repositories, packages, locales, service enablement | `packages/*.json`, `repositories.<category>`, `bootstrap.install_base`, `services.enable` |
| 10 | core + profiles + webui, plus the first-boot hook | file I/O + `files.webui_cron` |
| 11 | Boot chain | `bootloader.*` |
| 12 | Save `config.yaml` to `.freedomnas` | `ConfigurationManager` |
| 13 | Undo the chroot-only policy files, unmount, export the pool | `chroot.finalize`, `chroot.unmount`, `rootpool.export`, `rootpool.export_force` |

Step 13's export is the one step of the cleanup that must not fail quietly.
A pool left imported keeps the **installer host's** hostid in its label, and
the machine that was just installed then refuses to import its own root pool
at boot with *"pool was previously in use from another system"* — a finished
installation that does not boot.

The exit code is not taken as proof, because the chroot is torn down with
lazy unmounts that may still be settling when the export runs: after each
attempt the pool is looked for in `rootpool.list_pools`. `rootpool.export`
first (it unmounts the pool's own datasets by itself), then a three-second
wait, then `rootpool.export_force`. If the pool is still listed after that,
the completion dialog says so and **does not offer a reboot** — it gives the
`zpool export` command to run first.

The resulting layout — ESP + `rpool/ROOT/<edition>` + `rpool/.freedomnas` —
is deliberately identical to what `freedomnas-image-builder` produces: an
installed machine and a flashed image must look the same to the reconciler
and the WebUI.

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
5. The installation is recorded in `config.yaml`, on the `.freedomnas`
   dataset of a pool you choose — or under `/etc/freedomnas/` if there is no
   pool to host it.

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

Debian stable ships 2.3.x, so the Debian edition takes the whole `zfs-linux`
source package from backports (2.4.3 at the time of writing):

```
Package: src:zfs-linux
Pin: release n={suite}-backports
Pin-Priority: 990
```

written as `files.apt_pin_zfs`, with the matching `-backports` line in
`files.package_sources`. Backports is `NotAutomatic`, so nothing else on the
system moves to it. The kernel stays on stable: `zfs-dkms` 2.4.3 builds against
6.12 and `linux-headers-amd64` pulls the headers for exactly the kernel that
gets installed.

A pool created by 2.4 has three features an older implementation does not know
— `block_cloning_endian`, `dynamic_gang_header`, `physical_rewrite`. They start
`enabled`, not `active`, which an older ZFS can still import; the risk is the
day one of them activates, since `dynamic_gang_header` is not read-only
compatible. Matching the versions avoids the question entirely.

## Recovery mode

When an importable pool carries a `.freedomnas` dataset, the installer
offers recovery instead of installation:

1. Load `config.yaml` through `ConfigurationManager`
2. Run `ReconciliationEngine` in `disaster_recovery` mode
3. Configuration is applied in the fixed order (hostname → timezone → pools →
   users → services → shares)

## Boot chain

Which chain is built depends on what the target profile declares, not on an
`if edition ==`:

- `bootloader.build_uki` present → a dracut **Unified Kernel Image** (kernel
  + initramfs + cmdline in one PE binary) on the ESP, plus
  `bootloader.build_uki_recovery` for the `ro single` recovery entry and the
  `zz-dracut-uki` hook so future kernel updates rebuild both
- otherwise `bootloader.install_efi_loader` → the edition's native loader
  (FreeBSD's reads ZFS directly and needs no UKI)

Then firmware decides the entry point:

- **UEFI** — `bootloader.efi_boot_entry` (`efibootmgr`) registers the loader
- **BIOS** — the vendored **Clover** chain (release 5173, pinned) bridges
  legacy BIOS into UEFI emulation. This is pure byte I/O onto the MBR and the
  ESP's boot sector, so it has no profile entry — the same precedent as
  writing `/etc/fstab`.

### UKI paths on the ESP

| File | Purpose |
|------|---------|
| `EFI/Linux/<edition>-uki.efi` | Active UKI — every normal boot |
| `EFI/Linux/<edition>-uki-previous.efi` | Previous UKI — rotated in by `zz-dracut-uki` |
| `EFI/Linux/<edition>-recovery.efi` | Recovery UKI — `ro single` |
| `EFI/FreedomNAS/boot.state` | `tries-left: 3`, reset on each new kernel |

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
| Artix | **nothing in its own repositories** — dracut's `--uefi` cannot work there without Arch's `extra` (`artix-archlinux-support`) |
| Arch | `systemd`, already a dependency — and Arch boots via GRUB here anyway |

`EFI/Linux` is created **after** the ESP is mounted. The ESP has just been
formatted, so it is empty; a directory made under `/boot/efi` before the mount
lives on the root dataset and is hidden the moment the ESP goes on top, and
dracut then refuses with `Can't write to /boot/efi/EFI/Linux`.

### zz-dracut-uki hook

Deployed to `/etc/kernel/postinst.d/` from `freedomnas-profiles/assets/`. On
every kernel install or update it:

1. Rotates the current UKI to `-previous.efi`
2. Records the most recent `pre-update-*` ZFS snapshot name, pairing the old
   kernel with the matching filesystem state for rollback
3. Rebuilds the active UKI
4. Rebuilds the recovery UKI (`ro single`)
5. Resets `boot.state` to `tries-left: 3`

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

### Vendored Clover assets

| File | Role |
|------|------|
| `boot0ss` | MBR bootstrap (first 440 bytes; partition table preserved) |
| `boot1f32alt` | FAT32 VBR — BPB bytes 3–89 merged from the original sector |
| `boot7` | DUET BiosBlockIO firmware → `ESP/boot/` |
| `CLOVERX64.efi` | Clover picker/BDS → `EFI/CLOVER/` |
| `BOOTX64.efi` | UEFI fallback stub → `EFI/BOOT/` |

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

Class-level static methods (`Logger.info`, `.warn`, `.error`, `.command`).
Coloured terminal output plus `/var/log/freedomnas-install.log` (falls back
to a tempfile when that path isn't writable). `Logger.command()` prints every
resolved profile command before it runs — and, under `--dry-run`, instead of
running it.

The same file handler is attached to the core's `FreedomNAS` logger, so the
**full** stdout and stderr of a command that failed are in the log. The
exception — and therefore the error dialog — carries only the last dozen
lines of each, which is where a package manager states why it gave up.

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
