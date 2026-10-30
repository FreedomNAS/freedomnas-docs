# Packaging

FreedomNAS is five components, each packaged for every edition from the
same checkouts, plus a kernel for the Arch, Artix and Debian editions.

| Component | Contents | Installed at |
|-----------|----------|--------------|
| `freedomnas-profiles` | the JSON profiles and shared assets | `<root>/profiles` |
| `freedomnas-core` | engine, config, reconciler, CLI | `<root>/core/freedomnas`, on `sys.path` through `freedomnas-core.pth` |
| `freedomnas-docs` | this documentation, built for offline reading | `<root>/docs` |
| `freedomnas-webui` | FastAPI app, frontend, `VERSION` | `<root>/webui` |
| `freedomnas-installer` | the profile-driven installer | `<root>/installer` |

`<root>` is `paths.install_root` in the edition's OS profile:
`/usr/lib/freedomnas` on Linux, `/usr/local/lib/freedomnas` on FreeBSD.
`freedomnas-webui` depends on `freedomnas-docs`, so every system with the
WebUI has the documentation of its own version at `/docs/`.

## Where each format is built

| Format | Repository | Built by | Published to |
|--------|------------|----------|--------------|
| `.deb` | freedomnas-deb | `bin/build-freedomnas-debs.sh` from each component's `debian/` | Codeberg's Debian registry |
| Arch / Artix | freedomnas-arch | `bin/build.sh` in an Arch container, PKGBUILDs cloning the components at a branch | Codeberg's Arch registry |
| Void (ZFS modules, Samba configuration) | freedomnas-void | `bin/build-kmod.sh` in a Void container, Void's `zfs` DKMS source against Void's kernel; `bin/build-samba-conf.sh` | a signed xbps repository in Codeberg's generic registry |
| FreeBSD `pkg` | freedomnas-freebsd | `ci/build-in-vm.sh`: `bin/build-freedomnas-pkgs.sh` inside FreeBSD's own VM image under QEMU, staging directories handed to `pkg create`; the ports under `ports/` (Pi-hole: `dns/pihole-ftl`, `dns/pihole`) by `bin/build-ports.sh`, against a sparse checkout of the ports tree on the FreeBSD repository's quarterly branch, with their dependencies installed as packages; then a flat catalogue signed by `pkg repo` | a signed pkg repository in Codeberg's generic registry, `freedomnas-freebsd/<major>-<main\|dev>` |
| Gentoo | freedomnas-overlay | release ebuilds (`X.Y.Z`, the tag's archive tarball, `~amd64`) and live `9999` ebuilds tracking `dev`; one file serves both | the overlay itself |
| Images, live ISOs | freedomnas-image-builder | `common/install-core.sh` from the sibling checkouts; Artix images by `common/vm-install.sh` | release downloads |
| Installer copy | freedomnas-installer | `lib/core_installer.py`, from the installed layout or the checkouts | — |

The Debian, Arch and FreeBSD registries are filled by Forgejo workflows
(`publish-packages.yml` in each repository), with the organisation's
`PACKAGE_REGISTRY_USER` and `PACKAGE_REGISTRY_TOKEN`. On Debian and Arch the
FreedomNAS packages and the community modules are built on Codeberg's own
runners (`codeberg-medium`), so they are published even when the
self-hosted runner is off; a small `kernel-check` job on `codeberg-tiny-lazy`
looks for the kernel's version in the registry, and only a missing kernel is
built on the self-hosted runner (`runs-on: docker`), where its ccache lives
(on Arch after the packages job, since both rewrite the pacman database).
Void is built entirely on Codeberg's runners. The
FreeBSD one runs on the host like build-images (QEMU needs KVM), needs
freedomnas-image-builder's FreeBSD driver checked out beside it, and signs
with the `FREEBSD_SIGNING_KEY` secret; its public key is
`freedomnas-freebsd/keys/freedomnas.pub`, also written by
`installer-freebsd.json`. Releases: `ref: main` builds the newest `vX.Y.Z`
tag into `15-main`; dev runs (also nightly) build snapshots,
`X.Y.Z.<commit stamp>`, into `15-dev`. On Gentoo the overlay's nightly
`autobump` workflow adds the `X.Y.Z` ebuilds and their Manifest to `main`, its
only branch, once the `vX.Y.Z` tags exist (see its README); run it by hand
from the overlay's Actions tab to have them right away.

### Registry quota

Codeberg gives the organisation 1.5 GB for packages, and a kernel with its
headers takes about 245 MB on Arch and 305 MB on Debian (its modules carry
about six times the BTF, for reasons not yet found). After publishing, each
workflow runs `bin/prune-registry.py`, which deletes superseded versions:

| Registry | Kept |
|----------|------|
| Debian | the 2 newest versions of every package, and the 2 newest kernels (`linux-image-<kver>` with its headers) |
| Arch | the newest version of every package: pacman installs nothing else, and the rolling editions have no use for an older kernel |

Snapshots (`0.9.12+<date>...`) and releases are counted apart, so snapshots
never push a release out. `DRY_RUN=1 bin/prune-registry.py` lists what would
go. Debian's firmware comes from `trixie-backports` rather than a package of
our own: `linux-firmware` alone is 660 MB.

### Images installed in a VM

The Artix, Debian, Void, Gentoo and FreeBSD images (`artix/build.sh <openrc|dinit|runit> [image] [size]`,
`<edition>/build.sh [image] [size]`) are
not assembled on the build host: `common/vm-install.sh` boots the live ISO
in QEMU with an empty raw image as its only disk and a second disc labelled
`FNASSEED`. The live ISO's `.bash_profile` finds that disc and runs its
`run.sh` instead of the menus: it puts the checkouts' core, profiles,
WebUI (with its `VERSION`), installer and the built documentation in place
of the ISO's, waits for the network and runs `drive_install.py`, which
answers every installer dialog from `seed.env` and stops on any question it
does not know. It runs the installer in image mode: the image gets the
shipped administrator (`admin` / `freedomnas`) and SSH off, but no
`.freedomnas` and no configuration, so its first boot lands in the setup
wizard, which makes its owner choose a password and the pool that keeps the
configuration ([First-Run Setup](../getting-started/first-run.md)).
Each image names its root pool after its edition — `debianpool`,
`voidpool`, `gentoopool`, `freebsdpool` — and the Artix images, built once
per init, add the init's initial: `artixopool`, `artixdpool`, `artixrpool`
(`FNAS_POOL_NAME` overrides it). Two images on two disks of one machine
then never carry two pools of the same name: the initramfs imports the
root pool by name and stops when it finds two. The installer keeps asking
for the name, with `rpool` proposed. The host shows the serial console as it is written, so a CI
job's log carries the whole installation (`FNAS_VM_SERIAL_STDOUT=0` keeps
it in the file only), reads `vm-install: RESULT ok` from it and compresses
the image. The image is exactly what the installer produces
on real hardware, and the host imports no pool and needs no pacman: only
QEMU (with KVM) and xorriso. A build takes about six minutes; the 10 GB
image compresses to about 2.4 GB. The OpenRC, dinit and runit images all
boot, and their first-boot reconcile finishes with no failure.

The FreeBSD image is installed the same way from the FreeBSD live ISO
(`freebsd/live.sh`, `FNAS_FREEBSD_LIVE_ISO`): its `.profile` runs the
`FNASSEED` disc's `run.sh`, which on FreeBSD keeps the ISO's own FreedomNAS
(the root is read-only, and CI builds that ISO from the same checkouts in the
same run), installs onto `/dev/vtbd0` from `/tmp`, and copies its output to
the serial line. FreedomNAS itself comes from the freedomnas-freebsd pkg
repository, so the build also proves that repository. FreeBSD's own VM
image, which the live ISO and the FreeBSD packages are built in, is kept in
`FNAS_CACHE_DIR` on the runner instead of being downloaded every run.

The Gentoo image installs from a stage3, whose filename is date-stamped, so
the installer would ask for its URL: `gentoo/build.sh` reads Gentoo's
`latest-stage3-amd64-openrc.txt` pointer and passes the newest one as
`FNAS_ROOTFS_URL` (set it to pin another). OpenZFS is compiled for
gentoo-kernel-bin inside the VM, so this image takes the longest. The
chroot gets its own tmpfs `/run` (`installer-gentoo.json`
`chroot.mount`): with the live system's `/run`, `net-misc/openssh`'s
post-install restart of sshd started the live system's sshd from the
target, which kept the root pool busy and failed the export. The `chroot`
section is the *host's* profile, so this applies to every edition the
Gentoo live ISO installs, not only Gentoo; that `/run` starts empty, and
`/run/lock` is created right after it, because Samba's `smbpasswd` keeps its
locks there (without it the Void image's installation stopped at
`smbpasswd -a`).

## Community modules

A community module lives in a repository of its own (freedomnas-containers
is the first, built from freedomnas-module-template) and is packaged by the
same repositories as the core: freedomnas-deb, freedomnas-arch,
freedomnas-void and freedomnas-freebsd each clone it beside the components
(freedomnas-freebsd passes it to the FreeBSD VM build as `MODULES`), and
freedomnas-overlay has an ebuild for it. Its package is named `freedomnas-module-<id>`
(`app-nas/freedomnas-module-<id>` on Gentoo), where `<id>` is the module's
`id` in `manifest.json`: the [Plugins page](../user-guide/plugins.md) finds
modules by that name in the edition's repository and shows the package's
short description, so keep it one clear sentence.

| | Built from | Version |
|-|-----------|---------|
| `dev` | the module's `dev` branch | its own `debian/changelog` base plus the commit stamp, as for the components |
| `main` | the module's own newest `vX.Y.Z` tag | that base |

A module has versions of its own, not FreedomNAS's: freedomnas-containers
starts at 0.1.0. A module with no release tag yet is left out of `main`
without failing the run. Its packages depend on freedomnas-core and
freedomnas-webui newer than 0.9.12, whose module loader read a single modules
directory: a community module installed beside it hid the core's own. pkg
records a FreeBSD dependency without a version range, so there the guard is
the module's first tag coming after a FreedomNAS release newer than 0.9.12.
On Gentoo the module has only a live `9999` ebuild until its first tag.

## Versions

The base version is the upstream half of each component's
`debian/changelog` (`0.9.12`), and raising it is a decision someone makes. A
build from `main` is that base; a build from `dev` is a snapshot, so every
change gets a version of its own.

A build from `main` does not take the tip of the branch: the workflows
(build-images, and publish-packages in freedomnas-deb and freedomnas-arch)
look up the newest release tag, `vX.Y.Z`, and check every repository out
at it. The tag has the same name in every FreedomNAS repository, so a
release is cut by raising the version on `dev`, moving `main` onto it and
tagging every repository; until the tag exists, `main` keeps building the
previous release. An image built at a tag reports the plain version, without
the snapshot suffix.


| Format | Snapshot version |
|--------|------------------|
| `.deb` | `0.9.12+<yyyymmddHHMMSS>.<commit>-1` (UTC) |
| Arch | `0.9.12+<yyyymmddHHMMSS>.<commit>-1` |
| Gentoo (live ebuilds) | `0.9.12+git.<commit>` in `VERSION` and the documentation |
| FreeBSD | `0.9.12.<yyyymmddhhmm>` (pkg's own form) |
| Void | `0.9.12.<yyyymmddHHMMSS>_1` (xbps refuses `+`; release `0.9.12_1`) |
| Images | `0.9.12+<yyyymmddHHMMSS>.<commit>` |

`0.9.12+...` sorts after `0.9.12` and before `1.0` everywhere.

The first release published from `main` is `0.9.9`, the baseline tested on
real hardware; `1.0` is kept for the first complete release. The packages
once built as `1.0` were deleted from the registries, so a machine that
already has one installed needs a downgrade by hand (`apt install
<package>=<version>`, `pacman -Suu`).

A release raises the last number, `0.9.11` to `0.9.12`, and never appends a
fourth one: pacman and pkg read the `+` of a snapshot as a separator, so
`0.9.9+<stamp>` would sort above a `0.9.9.1` there.

The Debian edition's installer adds the registry with one component only,
`trixie main` or `trixie dev`, never both: the snapshots in `dev` sort above
the releases in `main`, so a machine reading both would leave the releases
for the snapshots. The component is the installer's channel, read from the
`CHANNEL` file beside its `setup.py` (`dev` when there is none, as in a git
checkout). The image builder writes it from the branch it builds:
`live/build.sh` and `common/vm-install.sh` take `FNAS_CHANNEL`, which
build-images sets to `main` for a run on `main` and to `dev` otherwise, and
without it the installer checkout's own branch decides. The installer's
`.deb` carries `main` when it is a release and `dev` when it is a snapshot.
The kernel, zfsutils and topgrade, which follows upstream releases, are
published to both components.

`freedomnas-repository` (freedomnas-deb's `bin/build-repository-deb.sh`)
carries the APT source and the registry's signing key, built once per
component: the one in `main` writes `trixie main`, the one in `dev` writes
`trixie dev`. It writes `/etc/apt/sources.list.d/freedomnas.sources` and
`/usr/share/keyrings/freedomnas-archive-keyring.asc`, and removes the
installer's one-line `freedomnas.list` (apt refuses the same repository
twice with different `Signed-By` keys). The key's SHA-256 is recorded in
freedomnas-deb's `checksums/repository-key.sha256`; a build with a
different key fails until that file is replaced and the version raised.

The `freedomnas-profiles` package also installs
`/etc/sudoers.d/freedomnas-debconf` (`Defaults env_keep += "DEBIAN_FRONTEND"`),
so the `DEBIAN_FRONTEND=noninteractive` that `updates.run_topgrade` sets on
Debian survives topgrade's `sudo apt-get`.

Each component is versioned from its own repository, so the WebUI and the
documentation of one snapshot carry different commits. What matters is the
release: the WebUI writes its version to `<root>/webui/VERSION`, the
documentation is built with its own in `FREEDOMNAS_DOCS_VERSION`, and the
documentation compares only the part before the `+`. FreeBSD writes both in
the FreedomNAS form, `0.9.12+<stamp>`, so the comparison works there too.

## freedomnas-docs

The documentation is the one component that is compiled: MkDocs with
Material turns it into a static site. Every format builds it with its own
distribution's `mkdocs` and `mkdocs-material`, and needs no network: the
fonts are in the repository (`docs/assets/fonts`, Roboto and Roboto Mono,
SIL Open Font License 1.1) and `theme.font` is off, so nothing is downloaded
at build time or when a page is read.

| Format | Built with |
|--------|------------|
| `.deb` | Debian's `mkdocs`, `mkdocs-material`, `python3-pymdownx` |
| Arch | `mkdocs`, `mkdocs-material`, `python-pymdown-extensions` |
| FreeBSD | `py3xx-mkdocs-material` |
| Gentoo | `dev-python/mkdocs` and `mkdocs-material` from freedomnas-overlay (they left `::gentoo`), Python 3.11 to 3.14 |
| Images | `mkdocs` if the build host has it, otherwise the pinned `requirements.txt` in a throwaway virtualenv, otherwise a prebuilt `site/` |

The public copy at <https://freedomnas.codeberg.page/freedomnas-docs/> is
built by freedomnas-docs' own workflow from `requirements.txt`, which pins
`mkdocs<2`: MkDocs 2.0 breaks Material's plugins and themes.

## linux-freedomnas

Arch, Artix and Debian will run their own kernel with the OpenZFS modules built in,
the way Proxmox ships its kernels, instead of building `zfs.ko` with DKMS on
the NAS: a DKMS build that fails once leaves a NAS that cannot import its
pool. [linux-freedomnas](https://codeberg.org/FreedomNAS/linux-freedomnas) is
Arch's `linux-lts` plus OpenZFS compiled against it, split into
`linux-freedomnas`, `linux-freedomnas-headers` and `zfs-utils-freedomnas`;
the kernel depends on the userspace of its own build, so pacman never pairs
a kernel with another ZFS version. freedomnas-arch builds and publishes it,
rebuilding only when its version is not in the repository yet.

The same repository builds the Debian packages from the same tarballs,
patches and `config.x86_64`: `debian/rules` reads the versions from the
`PKGBUILD`, and freedomnas-deb's `bin/build-kernel-debs.sh` fetches and
verifies the sources before `dpkg-buildpackage`. Following Debian's
convention the kernel packages carry the release in their name
(`linux-image-6.18.54-1-freedomnas`, `linux-headers-...`, and the
`linux-image-freedomnas` / `linux-headers-freedomnas` metapackages for the
newest), so an update installs beside the previous kernel and the
`-previous` UKI keeps its modules. `zfsutils-freedomnas` replaces
`zfsutils-linux`, `zfs-zed`, `zfs-dracut` and Debian's ZFS libraries and
enables the same systemd units. It carries `pam_zfs_key.so` but not upstream's
`pam-configs/zfs_key` profile: that profile is `Default: yes`, so the first
`pam-auth-update --package` any package runs puts `pam_zfs_key` in
`common-password`, and from then on `chpasswd` fails for every account. The
postinst reruns `pam-auth-update --package`, which drops the line on systems
that already had it; a kernel depends on it at its own version or
newer, since only one can be installed. The kernel's package scripts run
`/etc/kernel/postinst.d`, so `zz-dracut-uki` rebuilds the UKI with no extra
hook. Rust is enabled, as in Arch's configuration: trixie's `rustc` and
`bindgen` satisfy the kernel.

Arch and Artix install `linux-freedomnas` from the FreedomNAS pacman
repository; a pacman hook rebuilds the UKI, since pacman does not run
`/etc/kernel/postinst.d`. Debian installs `linux-image-freedomnas` and
`zfsutils-freedomnas` from the FreedomNAS Debian registry: no DKMS, no
`linux-image-amd64`, no ZFS from backports.

## freedomnas-void

Void needs no kernel of its own: its repositories carry `zfs` (OpenZFS with
DKMS, the dracut module and a runit `zed` service), and runit-void's
`03-filesystems.sh` already imports and mounts the pools at boot. What is
avoided is DKMS on the NAS, which would bring `gcc` and the kernel headers
and recompile at every kernel update.
[freedomnas-void](https://codeberg.org/FreedomNAS/freedomnas-void) builds the
module once per kernel, in a Void container on Codeberg's hosted runners
(an hourly `codeberg-tiny-lazy` check, a `codeberg-medium` build of about
three minutes only when a module is missing), and publishes
`<series>-zfs` (e.g. `linux6.18-zfs-6.18.54.1.2.4.4.1_2`, the last field
being the repository's `revision`) to
`.../generic/freedomnas-void/<dev|main>`, signed with `xbps-rindex`. After
installing the modules the package runs the kernel's hooks in
`/etc/kernel.d/post-install/` again, because `zfs` and, on an update, the
kernel build their images before it is configured: the initramfs on plain
Void, the UKIs on the edition, whose UKI hook skips while
`/usr/lib/modules/<kver>/extra/zfs.ko` is missing so that it builds and
rotates once per kernel. The
package depends on the exact kernel and `zfs` it was built for, since Void's
kernel has no `CONFIG_MODVERSIONS`: a newer kernel without its module makes
xbps refuse the update, and the NAS keeps the kernel it boots. The edition
installs Void's `zfs` with `ignorepkg=dkms`, the kernel series package (not
the `linux` meta package) and the module package.

`freedomnas-samba-conf` (version in `samba/version`) replaces the example
`smb.conf` Void's `samba` installs — a writable `[homes]` share and
`[printers]` — with the `[global]` settings FreedomNAS needs, since every
share is a usershare. `/etc/samba/smb.conf` is a configuration file of
`samba`, and xbps refuses two packages owning one file: the package ships
ours as `/usr/share/freedomnas/samba/smb.conf`, depends on `samba`, and its
INSTALL script copies it over Void's, kept as `smb.conf.void`. When `samba`
is updated, xbps keeps the changed file and writes Void's as
`smb.conf.new-<version>`; removing the package puts Void's back. The hourly
check publishes it when its version is not in the registry yet. Verified on
the real test box: installed over Void's file, kept across a reinstall of
`samba`, Void's restored on removal, no `[homes]` or `[printers]` listed.


## Licenses

| Repositories | License |
|--------------|---------|
| freedomnas-core, -profiles, -webui, -installer, -module-template | MPL-2.0 |
| freedomnas-docs, pages (the website) | MPL-2.0 |
| freedomnas-arch, linux-freedomnas, freedomnas-deb, -void, -freebsd, -overlay, -image-builder, -specs | GPL-2.0-or-later |

A package keeps the license of what it packages: the FreedomNAS components
are MPL-2.0 whichever repository builds them, `freedomnas-docs` adds the
fonts' OFL-1.1, and the kernel packages carry the kernel's and OpenZFS's.
