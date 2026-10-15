# Containers

The **Containers** page comes with the community module
`freedomnas-module-containers` (repository `freedomnas-containers`). It is
not part of a plain FreedomNAS install: the page appears in the sidebar once
the package is installed.

Install the package `freedomnas-module-containers` with your edition's
package manager (`apt`, `pacman`, `xbps-install`, or `emerge
app-nas/freedomnas-module-containers` from the FreedomNAS overlay); it needs
FreedomNAS newer than 0.9.12. The WebUI shows the page after its next
restart (or a reboot).

Containers run with **Docker**, from your edition's own packages, on every
Linux edition (Debian, Arch, Artix, Void, Gentoo), and with **AppJail** on
FreeBSD (see [FreeBSD: AppJail](#freebsd-appjail)). On FreeBSD the
runtime and the Containers and Images cards are ready; apps and the
catalogue follow, and their cards are not shown there yet.

## Install Docker

*Advanced and Expert.* If Docker is not installed, **Install Docker**
installs it: on Debian from Docker's own APT repository, elsewhere from the
edition's packages, with the service scripts of your init. It takes a few
minutes; on Gentoo much longer, because Docker is compiled. The page shows
the installation while it runs.

## Where containers live

*Advanced and Expert.* Choose a pool and **Use this pool**. FreedomNAS
creates two datasets on it and mounts them where Docker keeps its data:

| Dataset | Mounted on |
|---------|------------|
| `<pool>/containers/docker` | `/var/lib/docker` — containers, volumes, Docker's own state |
| `<pool>/containers/containerd` | `/var/lib/containerd` — images and layers |

Containers, images and volumes are then outside the system dataset: an
automatic or manual rollback of the system leaves them alone, and the
pool's snapshots and replication take them along. Docker's own
configuration is not touched.

What Docker already held is copied onto the datasets, and the old
directories are moved aside to `/var/lib/docker.pre-freedomnas` and
`/var/lib/containerd.pre-freedomnas`: FreedomNAS never deletes them, so
remove them yourself once the containers work from the pool. Docker stops
for the copy, and running containers with it. If such a directory is
already there, the new copy gets the date in its name
(`/var/lib/docker.pre-freedomnas-20261011-054200`).

The datasets are mounted at boot together with the rest of the pool,
before any service starts, so Docker finds them in place even when another
service that needs it (a CI runner, for example) starts it early. When
the pool is imported later, by FreedomNAS itself, Docker waits: FreedomNAS
mounts the datasets first and then starts it.

The pool is chosen once: moving containers to another pool is not possible
yet.

## FreeBSD: AppJail

On FreeBSD, **Install** installs `appjail` and `py312-director` (AppJail's
Director, which plays Docker Compose's part) from FreeBSD's packages.
**Use this pool** then creates two datasets:

| Dataset | Mounted on |
|---------|------------|
| `<pool>/containers/appjail` | `/usr/local/appjail` — jails, releases, networks, logs |
| `<pool>/containers/oci` | `/var/db/containers` — OCI images (buildah) |

and prepares the system for jails:

- `/usr/local/etc/appjail/appjail.conf`: AppJail keeps everything in its
  ZFS root on the first dataset, reaches the network through the interface
  of the default route, and builds jails from the system's own release,
  fetched once onto the pool.
- `/usr/local/etc/containers/storage.conf`: image layers become datasets
  under `<pool>/containers/oci`. Left to its defaults, buildah would make
  every layer a dataset under the system dataset, which a rollback of the
  system would then take back.
- `pf` is enabled with AppJail's NAT and port anchors, in a block of
  `/etc/pf.conf` between `# freedomnas appjail begin` and
  `# freedomnas appjail end`. Your own rules stay below it as they are; a
  `pf.conf` with no `pass` rule of its own gets `pass all` in the block,
  since pf would otherwise block everything.
- Packet forwarding (`gateway_enable`) and a NAT network for the jails,
  `fnasjails`, 10.231.0.0/24.

Containers are **jails**. The Containers card lists every jail AppJail
knows, with its image (or `FreeBSD <release>` for a plain jail), state,
ports and address on the jails' network; Logs shows the newest log of the
jail's process, else of its console. **Run a container** (*Expert*)
creates a jail from an OCI image, for instance
`ghcr.io/appjail-makejails/nginx:latest`, on the `fnasjails` network
behind NAT:

- a jail always needs a **name** (letters, digits, `-` and `_`);
- **ports** are `host:jail`, with `/udp` for UDP; they are reached on the
  NAS's address from the network, not from the NAS itself;
- **folders** are folders of the system, `/tank/media:/media`, with `:ro`
  for read only; the path inside the jail must exist in the image, or
  start the jail will fail. There are no named volumes;
- *Restart* `no` keeps the jail from starting at boot; any other choice
  starts it at boot.

**Remove** on a running jail stops it first, then destroys it. Images are downloaded and removed with buildah;
**Remove unused** removes the images no jail uses.

What `/usr/local/appjail` held before is moved aside to
`/usr/local/appjail.pre-freedomnas`, as on Linux. AppJail's services stay
enabled at boot: the pool is imported and mounted before them, and the
jails' NAT comes from `appjail-natnet`. At every boot FreedomNAS checks the
files, pf and the network, and only writes what differs.

## Catalogue

Ready-made apps, installed as apps of their own (see below), at every UI
level:

| App | What it is | Web port | Notes |
|-----|------------|----------|-------|
| Home Assistant | home automation | 8123 | host network, so it can find the devices of your home; the port cannot change |
| Immich | photo and video backup from your phones | 2283 | needs 4 GB of memory or more; the library is `./library` unless you choose a folder of your pool |
| Jellyfin | films, series and music streaming | 8096 | reads a media folder of your pool, read only, as the account you choose |
| Nextcloud | files, calendars, contacts | 8088 | with its own MariaDB; the administrator password is made up and shown once; its data folder is `./data` unless you choose an empty or new folder of your pool |
| Pi-hole | blocks ads for the whole network as its DNS server | 8053 | answers DNS on port 53 of the NAS's address: give that address to your router; the NAS needs a static address |
| Vaultwarden | password manager for the Bitwarden apps | 8222 | browsers open its web vault only over HTTPS: put it behind a reverse proxy before using it from other devices |

**Install** asks, at every UI level, where the app keeps its files:
Jellyfin's media folder, Immich's photo library, Nextcloud's data folder.
The list offers *Inside the app* (a folder of the app's own dataset), the
folders of your pools (the apps' and Docker's own datasets left out), and
*Another folder…* to type one, such as `/tank/media/films`. Everything else
uses the usual settings in *Assisted*: the first free port from the one in
the table, the system's time zone, your account, and passwords made up for
you. In *Advanced* and *Expert* the same window lets you change them first:
the app's name, its port, the account it runs as, passwords.

Nextcloud's data folder must be empty or not exist yet (its parent on a
pool): FreedomNAS creates it and gives it to the account the Nextcloud
container runs as (`www-data`, uid 33). Files already in a folder would not
show up in Nextcloud, which lists only what it stored itself.

Settings are checked before anything is created: a port something on the
NAS already listens on, or that a container or a stopped catalogue app
uses, is refused, and so is a folder outside the pools. The settings are
kept in the app's `.env` (readable by root only), next to its
`compose.yaml`. At the end FreedomNAS shows the app's address and the
passwords it made up, **once**: write them down. Installing an app again on
a dataset that was kept keeps its old passwords, since its databases were
made with them.

The first start downloads the app's images and can take several minutes;
the Runtime card says when it is done. **Open** in the app list then opens
its web page.

## Apps

An app is a Docker Compose project with a dataset of its own,
`<pool>/apps/<name>`, on the pool the containers use. The dataset holds
the app's `compose.yaml` and every folder the file mounts with a relative
path (`./data:/data`), so the app is snapshotted, replicated and restored
with its data. On a pool mounted nowhere (`mountpoint=none`), `<pool>/apps`
is mounted on `/<pool>/apps`. The app's name is also the Compose project's name, shown
next to its containers in the list below.

The list shows each app with how many of its containers run and the ports
they publish (Assisted shows it read only).

*Advanced and Expert:*

- **New app**: a name (lowercase letters, digits, `-` and `_`) and the
  `compose.yaml`. The file is checked with `docker compose config` before
  anything is created, and an invalid one is refused with Docker's own
  message. **Start it now** brings it up straight away.
- **Start** / **Stop**: `docker compose up -d` / `down`. Stopping removes
  the containers; the data on the dataset stays.
- **Update**: downloads newer images and, if the app is up, recreates its
  containers with them.
- **Edit**: replaces the compose file, after the same check; an app that is
  up is brought up again with it.
- **Logs**: the last 200 lines of all its containers.
- **Remove**: stops the app and forgets it. Its dataset is kept unless you
  tick **Also destroy its dataset**; a new app with the same name then uses
  the kept dataset again, data included, with the new compose file.

An app that is up is brought up again at every boot, after Docker, if any
of its containers is not running. On a restored or reinstalled system the
apps come back from the pool the same way.

## Containers

Every container, running ones first, with its image, state and published
ports. A container started by Docker Compose shows its project's name.

*Advanced and Expert:* **Logs** shows its last 200 lines, with timestamps;
**Start**, **Stop**, **Restart** and **Remove**. Removing a running
container stops it first; its named volumes are kept.

*Expert:* **Run a container** starts one from an image, downloading it if
needed: a name, ports (`host:container`, e.g. `8081:80`, optionally with an
address or `/udp`), volumes (`name:/path` for a named volume, which lives
on the containers dataset, or `/tank/media:/media` for a directory of your
pool, `:ro` for read only), environment variables (`NAME=value`, no
spaces) and a restart policy (`unless-stopped` by default, so the container
comes back at every boot). Anything malformed is refused before it reaches
Docker.

## Images

*Advanced and Expert.* The downloaded images with their size. **Download**
fetches one by reference (`nginx:alpine`,
`ghcr.io/home-assistant/home-assistant:stable`); **Remove** deletes one no
container uses; **Remove unused** deletes the images that no tag names and
no container uses.

Downloads and new containers run in the background, one at a time: the
Runtime card says what is running and how the last one went.

## At boot

Docker no longer starts by itself at boot. FreedomNAS imports the pools,
mounts the two datasets and only then starts Docker: a Docker started
before the pool would write into the empty directories of the system
dataset. Containers with a restart policy (`--restart unless-stopped` or
`always`) come back as usual.

On a reinstalled system, or one restored on another edition, the same
happens from the saved configuration: once Docker is installed again,
the containers on the pool start where they were. If Docker is missing,
the reconciler reports it and the page offers to install it.

## Dashboard

The module's tile says whether Docker runs on the pool, with the number of
containers and images, or what is wrong: Docker stopped, a dataset not
mounted.
