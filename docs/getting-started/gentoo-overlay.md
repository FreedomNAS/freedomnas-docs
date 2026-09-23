# Gentoo Overlay

`freedomnas-overlay` packages FreedomNAS for Portage, so a Gentoo system can
install and update it the way it manages everything else. It is the
counterpart to the Gentoo edition profiles: the profiles tell the installer
*how* to install Gentoo, the overlay tells Portage *what* to install.

## Adding the overlay

```sh
eselect repository add freedomnas git https://codeberg.org/FreedomNAS/freedomnas-overlay.git
emaint sync --repo freedomnas
```

Or by hand, in `/etc/portage/repos.conf/freedomnas.conf`:

```ini
[freedomnas]
location = /var/db/repos/freedomnas
sync-type = git
sync-uri = https://codeberg.org/FreedomNAS/freedomnas-overlay.git
auto-sync = yes
masters = gentoo
```

The installer writes this file itself (`files.repos_conf` in
`installer-gentoo.json`), on a clean install and in place alike, before
`repositories.core` syncs the overlay.

## Packages

Everything lives in a dedicated `app-nas` category — these are one appliance,
not four unrelated tools.

| Package | Installs to |
|---------|-------------|
| `app-nas/freedomnas-profiles` | `/usr/lib/freedomnas/profiles` |
| `app-nas/freedomnas-core` | `/usr/lib/freedomnas/core` + the `freedomnas` CLI |
| `app-nas/freedomnas-webui` | `/usr/lib/freedomnas/webui` |
| `app-nas/freedomnas-installer` | `/usr/lib/freedomnas/installer` + `freedomnas-install` |
| `app-nas/freedomnas` | Meta package |

The paths are the ones
[ARCHITECTURE.md](../architecture/system-stack.md) defines, so a
Portage-installed system is indistinguishable from a flashed image or an
installer-provisioned one as far as the engine, the reconciler and the WebUI
are concerned.

## Installing

The ebuilds are live (`-9999`) and keyword-masked, as live ebuilds always
are. In `/etc/portage/package.accept_keywords`:

```
app-nas/* **
```

Then:

```sh
emerge --ask app-nas/freedomnas                     # core + profiles + WebUI
emerge --ask --newuse app-nas/freedomnas[installer] # add the provisioning tool
```

## USE flags

| Package | Flag | Default | Effect |
|---------|------|---------|--------|
| `freedomnas` | `webui` | on | Install the web interface |
| `freedomnas` | `installer` | off | Install `freedomnas-install` |
| `freedomnas-webui` | `cron` | on | Start the WebUI via the cron `@reboot` hook |
| `freedomnas-webui` | `openrc` | off | Install an OpenRC service instead |

`cron` and `openrc` are mutually exclusive — enabling both would start the
WebUI twice.

!!! note "Why cron is the default, even on an OpenRC distribution"
    The cron `@reboot` hook is the canonical startup path across every
    edition (ADR-002): it is what lets one image and one installer serve
    systemd, OpenRC, runit, s6, dinit and bsd_rc without a per-init service
    file. `USE=openrc` is a local convenience for Gentoo systems that would
    rather manage the service natively; nothing else in FreedomNAS depends
    on it.

## Live ebuilds

There are no upstream release tags yet, so every ebuild tracks the `dev`
branch through `git-r3`. Once `dev` is merged and tagged, `EGIT_BRANCH` goes
away and versioned ebuilds land alongside the live ones.

## Why not `distutils-r1`

`freedomnas-core` ships no `setup.py` and no `[project]` table: its modules
are a package directory installed under `/usr/lib/freedomnas/core/` and put
on `sys.path` with a `.pth` file — the same layout `install-core.sh` and the
installer produce. The ebuild installs plain files instead of pretending
there is a Python build system to drive.
