# Packaging

FreedomNAS is five components, each packaged for every edition from the
same checkouts, plus a kernel for the Arch-based editions.

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
| FreeBSD `pkg` | freedomnas-freebsd | `bin/build-freedomnas-pkgs.sh` on FreeBSD, staging directories handed to `pkg create` | a signed pkg repository |
| Gentoo | freedomnas-overlay | live (`-9999`) ebuilds tracking `dev` | the overlay itself |
| Images, live ISOs | freedomnas-image-builder | `common/install-core.sh` from the sibling checkouts | release downloads |
| Installer copy | freedomnas-installer | `lib/core_installer.py`, from the installed layout or the checkouts | — |

The Debian and Arch registries are filled by Forgejo workflows on the
self-hosted runner (`publish-packages.yml` in each repository), with the
organisation's `PACKAGE_REGISTRY_USER` and `PACKAGE_REGISTRY_TOKEN`.

## Versions

The base version is the upstream half of each component's
`debian/changelog` (`1.0`), and raising it is a decision someone makes. A
build from `main` is that base; a build from `dev` is a snapshot, so every
change gets a version of its own:

| Format | Snapshot version |
|--------|------------------|
| `.deb` | `1.0+<yyyymmdd>.<commit>-1` |
| Arch | `1.0+<yyyymmddHHMMSS>.<commit>-1` |
| Gentoo (live ebuilds) | `1.0+git.<commit>` in `VERSION` and the documentation |
| FreeBSD | `1.0.<yyyymmddhhmm>` (pkg's own form) |
| Images | `1.0+<yyyymmddHHMMSS>.<commit>` |

`1.0+...` sorts after `1.0` and before `1.1` everywhere.

Each component is versioned from its own repository, so the WebUI and the
documentation of one snapshot carry different commits. What matters is the
release: the WebUI writes its version to `<root>/webui/VERSION`, the
documentation is built with its own in `FREEDOMNAS_DOCS_VERSION`, and the
documentation compares only the part before the `+`. FreeBSD writes both in
the FreedomNAS form, `1.0+<stamp>`, so the comparison works there too.

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

Arch and Artix will run their own kernel with the OpenZFS modules built in,
the way Proxmox ships its kernels, instead of building `zfs.ko` with DKMS on
the NAS: a DKMS build that fails once leaves a NAS that cannot import its
pool. [linux-freedomnas](https://codeberg.org/FreedomNAS/linux-freedomnas) is
Arch's `linux-lts` plus OpenZFS compiled against it, split into
`linux-freedomnas`, `linux-freedomnas-headers` and `zfs-utils-freedomnas`;
the kernel depends on the userspace of its own build, so pacman never pairs
a kernel with another ZFS version. freedomnas-arch builds and publishes it,
rebuilding only when its version is not in the registry yet. The editions
still install `zfs-dkms-git` until the packages are published and the
profiles switch.

## Licenses

| Repositories | License |
|--------------|---------|
| freedomnas-core, -profiles, -webui, -installer, -module-template | MPL-2.0 |
| freedomnas-docs, pages (the website) | MPL-2.0 |
| freedomnas-arch, linux-freedomnas, freedomnas-deb, -freebsd, -overlay, -image-builder, -specs | GPL-2.0-or-later |

A package keeps the license of what it packages: the FreedomNAS components
are MPL-2.0 whichever repository builds them, `freedomnas-docs` adds the
fonts' OFL-1.1, and the kernel packages carry the kernel's and OpenZFS's.
