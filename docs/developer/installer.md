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
| 1 | Interview — disk, bootstrap method, mirror, hostname, timezone, features, users | `installer_meta`, `packages/MANIFEST.json` |
| 2 | Single confirmation | — |
| 3 | Partition + format the ESP | `partitioning.*` |
| 4 | Root pool + datasets | `rootpool.*` |
| 5 | Bootstrap the base system | `bootstrap.<method>` |
| 6 | Write the edition's config files | `files.*` |
| 7 | Bind-mount the chroot | `chroot.mount` |
| 8 | Create users — **before** packages, so PAM/Samba find them | `users.*` |
| 9 | Packages, locales, service enablement | `packages/*.json`, `bootstrap.install_base`, `services.enable` |
| 10 | core + profiles + webui, plus the first-boot hook | file I/O + `files.webui_cron` |
| 11 | Boot chain | `bootloader.*` |
| 12 | Save `config.yaml` to `.freedomnas` | `ConfigurationManager` |
| 13 | Unmount, export the pool | `chroot.unmount`, `rootpool.export` |

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

- a **Linux** installer environment installs Debian, Void, Artix, Arch
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

## OS-specific file contents

`sources.list`, `fstab`, `hosts`, `rc.conf`, `loader.conf` and the cron hook
are **not** written from Python string literals — they live in the profile's
`files` section, with `{placeholders}` the installer fills in. A file's text
is as distribution-specific as a command is; keeping it in the profile is
what stops `if edition == "debian"` from reappearing in the code.

See [Profile System → Installer Profiles](../profiles/installer-profiles.md)
for the schema.

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

## installer_modules.py — base infrastructure

### Logger

Class-level static methods (`Logger.info`, `.warn`, `.error`, `.command`).
Coloured terminal output plus `/var/log/freedomnas-install.log` (falls back
to a tempfile when that path isn't writable). `Logger.command()` prints every
resolved profile command before it runs — and, under `--dry-run`, instead of
running it.

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
