# Installation (Installer)

!!! info "Pre-built images are the recommended path"
    Flashing a pre-built image from `freedomnas-image-builder` is the
    primary way to install FreedomNAS (ADR-002) — flash and go, no
    questions asked. Use the installer described here when an image is not
    an option: hardware that can't be flashed, a console/ISO install, or a
    machine that already runs a supported OS and should be turned into a
    NAS in place.

    The Debian and FreeBSD images come with root locked and a default administrator,
    `admin` with password `freedomnas`, for the WebUI and the console.
    Change the password after the first sign-in.

The installer is profile-driven: every OS command it runs comes from
`freedomnas-profiles` through `freedomnas-core`'s engine. It therefore
installs **any edition its host can bootstrap**, not just Debian.

## Modes

| Mode | What it does | What it touches |
|------|--------------|-----------------|
| **Clean install** | Provisions an edition onto a dedicated disk | The selected disk — erased completely |
| **In-place install** | Turns the running system into a FreedomNAS | Packages, services and config only |

**Reinstalling a FreedomNAS** needs no special mode. Install onto the new
system disk and leave the data disks attached: right after you choose the disk,
the installer tells you which pools hold a FreedomNAS configuration, and the
first boot of the new system restores it — users, shares, network and
settings — through the [Reconciliation Engine](../architecture/reconciler.md).
The setup wizard then asks only for the administrator and SSH.

!!! warning "Data loss (clean install only)"
    A clean install partitions the selected disk. Everything on it is
    destroyed. Use a dedicated disk.

## Which editions can be installed

Bootstrapping an OS runs that OS's own tooling, which does not cross the
Linux/BSD divide. The installer offers only editions whose family matches
the environment it is running in:

| Installer environment | Can install |
|-----------------------|-------------|
| Linux live/rescue | Debian, Gentoo, Void, Artix, Arch |
| FreeBSD live/rescue | FreeBSD |

Within a family, an edition whose native bootstrapper isn't present on the
host is installed from a **rootfs tarball** instead — see below.

## The live ISO

`freedomnas-live.iso`, built by `freedomnas-image-builder/live/build.sh`, is
the Linux installer environment with everything already on it: ZFS,
`dialog`, the installer, and the bootstrap tools of the other editions. It
boots on UEFI and BIOS, from optical media or written to a USB stick:

```bash
sudo dd if=freedomnas-live.iso of=/dev/sdX bs=4M status=progress conv=fsync
```

Root is logged in automatically on the first console and
`freedomnas-install` starts by itself; quitting it leaves a shell, where
`freedomnas-install` runs it again. The network comes up over DHCP. SSH is
installed but not started, because root has no password — set one with
`passwd` and run `rc-service sshd start` to install remotely.

What the ISO offers for each edition:

| Edition | Bootstrap |
|---------|-----------|
| Debian | `debootstrap`, or tarball |
| Void | `xbps-install` (Void's static build), or tarball |
| Gentoo | stage3 tarball |
| Arch | `pacstrap`, or tarball |
| Artix | `pacstrap`, or tarball |

The pool is created by the ISO's ZFS (2.4), whichever edition is being
installed — see [ZFS version skew](../developer/installer.md#zfs-version-skew-between-host-and-target).

### FreeBSD

FreeBSD installs need FreeBSD's own tools (`gpart`, `pkg`, its `zpool`), so
they have their own ISO: `freedomnas-live-freebsd.iso`, built by
`freedomnas-image-builder/freebsd/live.sh` from the newest FreeBSD release.
It boots on UEFI and BIOS, from optical media or written to a USB stick the
same way, and behaves like the Linux one: root is logged in on the first
console, where `freedomnas-install` starts by itself, and on the serial
console; the network comes up over DHCP. The system runs from the read-only
ISO, with `/tmp` and `/var` in memory.

For machines that cannot take a flashed image, it is the way to install the
FreeBSD edition. Every run of build-images publishes it in the `images-<n>`
release, next to the Linux live ISO and the images, and the FreeBSD image is
installed from it.

## Prerequisites

- A live/rescue environment of the right family: the FreedomNAS live ISO, or
  any Linux distribution for the Linux editions; the FreedomNAS FreeBSD live
  ISO, or any FreeBSD system, for FreeBSD
- `freedomnas-installer`, plus its hard dependencies **`freedomnas-core`**
  and **`freedomnas-profiles`**
- `dialog` (or `whiptail`), and the host tools the edition needs —
  `gdisk`, `dosfstools`, ZFS user-space tools, `curl`, optionally
  `debootstrap`
- An internet connection
- A target disk of at least 16 GB (clean install)

## Running the installer

```bash
sudo freedomnas-install                        # menu-driven
sudo freedomnas-install --mode inplace         # skip the mode menu
sudo freedomnas-install --mode clean --target void
sudo freedomnas-install --dry-run              # print every command, run none
sudo freedomnas-install --quiet                # steps only, no command output
```

`--dry-run` needs neither root nor a disk: it resolves and prints every
command the run would execute. It is the safest way to see what an install
will actually do before committing to it.

While it installs, the installer shows the output of every command as it
runs (package downloads, compilation, the UKI build), and a `still running`
line when a command has been silent for a minute. Everything also goes to
`/var/log/freedomnas-install.log`. When a step fails, the installer first
saves what the machine looked like — the error with its traceback, the
running processes, what is still inside the target, mounts, pools, kernel
messages, free space — on screen, in the log and in
`/var/log/freedomnas-install-diagnostics-<date>.txt`, then cleans up. Attach
that file when reporting a failed installation.

---

## Clean install

Everything is asked first, confirmed once, and only then executed. Nothing
destructive happens before the confirmation screen.

### Phase 1 — Interview

| Question | Notes |
|----------|-------|
| Edition | Only editions this host can bootstrap; community editions are marked |
| Notice | Some editions warn before the first question — Gentoo compiles part of the system (always OpenZFS, more with Virtualization or Containers) and can take an hour or more on a modest CPU |
| Disk | Listed by the profile's `list_disks`; resolved to a stable `/dev/disk/by-id/` path where the platform has one |
| Bootstrap method | Native bootstrapper or rootfs tarball — only methods whose tool exists on the host |
| Mirror | From the edition's own mirror list, or a custom URL |
| Hostname, timezone | Defaults `freedomnas` / `UTC` |
| Optional features | Samba/CIFS, NFS, containers, virtualization — from `packages/MANIFEST.json` |
| Administrator | Username plus a double-prompt password (minimum 8 characters) |
| Additional users | Optional, each with optional administrative access |

Firmware (UEFI vs BIOS) is detected, never asked.

### Phase 2 — Execution

#### 1. Partitioning

A **unified 2-partition layout**, identical for UEFI and BIOS:

| # | Size | Type | Purpose |
|---|------|------|---------|
| 1 | 1 GiB | EFI System | ESP — holds the UKI and boot chain |
| 2 | Remaining | ZFS | the root pool |

!!! note "No bpool, no BIOS-boot partition"
    There is no feature-limited `bpool` and no separate 1 MiB BIOS-boot
    partition. Clover's BIOS stages write into the MBR gap and the ESP's own
    boot sector — they need no partition of their own. Nothing at boot time
    reads ZFS with a restricted feature set, so a second pool has no purpose.

Partition 1 is then formatted FAT32 with the label `EFI`.

#### 2. Root pool

A single, full-featured pool on partition 2, named `rpool` unless another
name is chosen (the flashable images use `<edition>pool`, see
[Packaging](../developer/packaging.md)):

```
rpool/
├── ROOT/
│   └── <edition>    canmount=noauto, mountpoint=/    ← bootfs
├── home             setuid=off
└── var/
    └── log          atime=on
```

There is no `.freedomnas` dataset yet: the first boot creates it on the root
pool and, if another pool carries a FreedomNAS configuration, restores it.

`/boot` is a plain directory inside `rpool/ROOT/<edition>` — the kernel and
initramfs live in the UKI on the ESP, not in ZFS.

#### 3. Bootstrap

| Method | What runs | Needs on the host |
|--------|-----------|-------------------|
| native | `debootstrap`, `pacstrap`, `basestrap`, `xbps-install -r` | that bootstrapper |
| tarball | fetch + unpack a rootfs tarball | `curl`/`fetch` and `tar` |

The tarball can be the distro's own `rootfs.tar.gz` / `base.txz`, or an
exported container rootfs. Where the distro's filename is date-stamped, the
installer asks for the URL rather than guessing.

#### 4. Configuration files

Written from the edition's profile: hostname, `hosts`, `fstab` (the ESP by
UUID where the platform can report one), the package sources, timezone —
and on FreeBSD `rc.conf` and `loader.conf` instead. Their *contents* live in
the profile, not in the installer's Python.

#### 5. Chroot

The pseudo-filesystems the edition declares are bind-mounted into the target
and `/etc/resolv.conf` is copied in, so the chroot has working DNS.

#### 6. Users

Created **before** packages, so PAM and Samba find the accounts already there
when those services are first configured. Passwords are piped to stdin —
never in a command line, never in the log.

#### 7. Packages and services

The selected categories are installed with the target's own package manager,
then their services are enabled through the **init profile** — the same code
path under systemd, OpenRC, runit, s6, dinit or bsd_rc.

#### 8. FreedomNAS itself

`freedomnas-core`, `freedomnas-profiles` and `freedomnas-webui` are copied
into the target under its `install_root` (`/usr/lib/freedomnas/` on Linux, `/usr/local/lib/freedomnas/` on FreeBSD), together with `firstboot.sh`,
`supervisor.sh` and the cron `@reboot` hook that starts the WebUI.

#### 9. Boot chain

Built around a **dracut Unified Kernel Image (UKI)** — one PE binary
bundling kernel, initramfs and cmdline — for editions that need it;
FreeBSD's own loader reads ZFS directly and is installed instead.

=== "UEFI"

    1. The ESP is mounted at `<target>/boot/efi`
    2. `dracut` builds the UKI inside the chroot:
       ```
       dracut --force --uefi \
           --kernel-cmdline "root=ZFS=rpool/ROOT/<edition> rw" \
           /boot/efi/EFI/Linux/<edition>-uki.efi <kernel-version>
       ```
       plus a recovery UKI with `ro single`
    3. `efibootmgr` registers the UKI as a UEFI boot entry, and the UKI is
       copied to the fallback path `EFI/BOOT/BOOTX64.efi`
    4. The `zz-dracut-uki` hook is linked into `/etc/kernel/postinst.d/` so
       future kernel updates rebuild both UKIs automatically, and the
       package manager's pre-install hook backs up the running UKI first

=== "BIOS/Legacy"

    1–2. Identical to UEFI: same UKI, same path, same hook
    3. **Clover** (vendored, release 5173) bridges BIOS → UEFI emulation → UKI:
        - `boot0ss` (440 bytes) into the MBR bootstrap area, partition table preserved
        - `boot1f32alt` into the ESP's VBR, merging the original FAT32 BPB (bytes 3–89)
        - `boot7` (DUET/BiosBlockIO) → the file `ESP/boot`
        - `CLOVERX64.efi` → `EFI/CLOVER/`
        - `config.plist` → `EFI/CLOVER/`, loading the UKI with `Timeout=0`
          and `IgnoreNVRAMBoot=true`

**ESP contents afterwards:**

```
ESP/
├── EFI/
│   ├── Linux/
│   │   ├── <edition>-uki.efi          ← active UKI
│   │   ├── <edition>-uki-previous.efi ← rotated in by zz-dracut-uki later
│   │   └── <edition>-recovery.efi     ← recovery UKI (ro single)
│   ├── CLOVER/                        ← BIOS only
│   │   ├── CLOVERX64.efi
│   │   └── config.plist
│   ├── BOOT/
│   │   └── BOOTX64.efi                ← copy of the active UKI
│   └── FreedomNAS/
│       └── boot.state                 ← tries-left counter
└── boot                               ← BIOS only: boot7
```

!!! note "Clover version is pinned"
    The vendored Clover binaries are fixed at release 5173. Release 5163 is
    a known regression on some hardware. Do not bump the version without
    re-running hardware validation — see `assets/clover/README.md`.

#### 10. Save the configuration

The installer's answers — hostname, timezone, users, the root pool and the
installed features — go to `config.yaml` in the state directory
(`/etc/freedomnas/state/`, `/usr/local/etc/freedomnas/state/` on FreeBSD), and
the system is left waiting for the setup wizard. On the first boot this
`config.yaml` moves into the root pool's `.freedomnas` dataset; then either a
configuration found on another pool is restored into it, or the wizard runs
and copies it to the pool you pick. That copy is what survives a
reinstallation. The wizard accepts the
administrator password you chose in the installer.

#### 11. Cleanup and reboot

The ESP and every bind mount are unmounted, the pool is exported cleanly, and
a summary is shown with an optional reboot.

---

## In-place install

For a machine that already runs a supported OS. Nothing is partitioned,
nothing is bootstrapped, and the boot chain is left alone.

1. Choose the optional features to install.
2. Optionally create a dedicated FreedomNAS administrator account — or keep
   the accounts the system already has.
3. Confirm.

The pool that keeps a copy of the configuration is chosen afterwards, in
the WebUI's setup wizard; the configuration itself moves to the root pool's
`.freedomnas` at the first boot. A system with no ZFS pool keeps the
configuration under `/etc/freedomnas/`.

The installer then installs the missing packages with the system's own
package manager (the operation is idempotent, so only what's missing is
pulled in), enables their services through the init profile, deploys
`firstboot.sh` + `supervisor.sh` with the cron `@reboot` hook, and writes
`config.yaml`.

### Trying FreedomNAS on an existing Debian

On Debian 13 (trixie), one package sets up the FreedomNAS repository and its
signing key, so nothing has to be typed by hand but these lines:

```bash
curl -LO https://codeberg.org/api/packages/FreedomNAS/debian/pool/trixie/main/freedomnas-repository_1.0_all.deb
sudo apt install ./freedomnas-repository_1.0_all.deb
sudo apt update
sudo apt install freedomnas-installer
sudo freedomnas-install --mode inplace
```

The downloaded file can also be opened with the desktop's package installer
instead of the second line. It follows the releases; the same package under
`pool/trixie/dev/` follows the development snapshots.

The WebUI starts at the next boot, or immediately with:

```bash
/usr/lib/freedomnas/webui/bin/firstboot.sh &        # Linux
/usr/local/lib/freedomnas/webui/bin/firstboot.sh &  # FreeBSD
```

---

## Post-installation

After rebooting, the WebUI is available at:

```
https://<hostname>:8080
```

Complete the first-run wizard to finish configuration.

[First-run setup guide →](first-run.md)
