# Containers

The **Containers** page comes with the community module
`freedomnas-module-containers` (repository `freedomnas-containers`). It is
not part of a plain FreedomNAS install: the page appears in the sidebar once
the package is installed.

Install the package `freedomnas-module-containers` with your edition's
package manager (`apt`, `pacman`, `xbps-install`, `pkg install` on FreeBSD,
or `emerge app-nas/freedomnas-module-containers` from the FreedomNAS
overlay), or from the [Plugins page](plugins.md); it needs
FreedomNAS newer than 0.9.12. The WebUI shows the page after its next
restart (or a reboot).

Containers run with **Docker**, from your edition's own packages, on every
Linux edition (Debian, Arch, Artix, Void, Gentoo), and with **AppJail** on
FreeBSD (see [FreeBSD: AppJail](#freebsd-appjail)). On FreeBSD the
catalogue has Jellyfin, Nextcloud, Pi-hole and Vaultwarden; the other
entries are shown as *Not on this edition yet*.

Everything the module runs comes from its profile for your edition
(`containers-<os>.json`), as for the rest of FreedomNAS: the page and the
module's code are the same on every edition.

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
- Names for the jails: `appjail-dns` writes every jail's name to
  `/var/tmp/appjail-hosts` and dnsmasq (installed with AppJail) answers
  them on the network's address, 10.231.0.1, only there. Every new jail
  asks it, so the jails of an app reach each other as
  `<jail>.fnasjails.appjail` (Nextcloud reaches its database that way).

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

**Apps** on FreeBSD are AppJail Director projects (Director plays Docker
Compose's part): the app's dataset holds `appjail-director.yml`, its
`Makejail` and the folders the file mounts with a relative path. The
*New app* and *Edit* windows have a field for each file. The Director file
is checked with Director's own parser before anything is written, and an
invalid one is refused with its message (an unknown key, a jail name that
is not allowed). Jails of an app are named in its file (`name:`), and the
app list counts the jails Director reports for the project. **Start** and
**Stop** are Director's `up` and `down`, and also turn on or off AppJail's
start-at-boot for the app's jails, so a stopped app stays stopped after a
reboot; **Update** rebuilds the app's
jails (`up --overwrite`), keeping the folders of its dataset; **Remove**
also destroys its jails; **Logs** shows each jail's log in turn. A minimal
app, with nginx from the AppJail Makejails images:

```yaml
options:
  - virtualnet: "fnasjails:<random> default"
  - nat:
services:
  web:
    name: site-web
    makejail: ./Makejail
    options:
      - template: /usr/local/share/examples/appjail/templates/freebsd-oci.conf
      - expose: "8080:80"
    volumes:
      - html: /usr/local/www/nginx
volumes:
  html:
    device: ./html
```

```
OPTION container=boot
OPTION overwrite=force
OPTION from=ghcr.io/appjail-makejails/nginx:latest
```

## Catalogue

Ready-made apps, installed as apps of their own (see below), at every UI
level:

| App | What it is | Web port | Notes |
|-----|------------|----------|-------|
| Home Assistant | home automation | 8123 | host network, so it can find the devices of your home; the port cannot change |
| Immich | photo and video backup from your phones | 2283 | needs 4 GB of memory or more; the library is `./library` unless you choose a folder of your pool |
| Jellyfin | films, series and music streaming | 8096 | reads the NAS's **media** share, read only, as the account you choose (see below) |
| Nextcloud | files, calendars, contacts | 8088 | the NAS's group shares as External storage (see below); with its own MariaDB; the administrator password is made up and shown once; its data folder is `./data` unless you choose an empty or new folder of your pool |
| Pi-hole | blocks ads for the whole network as its DNS server | 8053 | answers DNS on port 53 of the NAS's address: give that address to your router; the NAS needs a static address; its web interface uses HTTPS with FreedomNAS's own certificate (setting **HTTPS**, on by default), like Vaultwarden; while the [reverse proxy](proxy.md#names) serves the sites by name it answers every name under `<hostname>.home.arpa` with the NAS's address |
| Vaultwarden | password manager for the Bitwarden apps | 8222 | serves HTTPS with FreedomNAS's own certificate (setting **HTTPS**, on by default), which browsers need for the web vault: install FreedomNAS's certificate authority once on each device ([System → Certificate](system.md#certificate)) and the web vault, the Bitwarden apps and the browser extensions trust it by the NAS's hostname or address; a new certificate (new address or hostname) reaches the app at the next boot, which restarts it; from outside your network, a certificate of your own domain (reverse proxy) is the lasting way |

On FreeBSD the same entries install as AppJail Director projects, with
the Makejails of the [AppJail-makejails](https://github.com/AppJail-makejails)
project (Jellyfin, Nextcloud with MariaDB), the FreeBSD package
(Vaultwarden) and FreedomNAS's own packages of Pi-hole, built for FreeBSD
(the jail gets them from the same FreedomNAS repository as the NAS), and the
same settings: the window, the passwords shown once
and the folders are the same; the app's jails are named
`<app>-<service>`.

**Install** asks, at every UI level, where the app keeps its files:
Jellyfin's media folder, Immich's photo library, Nextcloud's data folder.
The list offers *Inside the app* (a folder of the app's own dataset), the
folders of your pools (the apps' and Docker's own datasets left out), and
*Another folder…* to type one, such as `/tank/media/films`. Everything else
uses the usual settings in *Assisted*: the first free port from the one in
the table, the system's time zone, your account, and passwords made up for
you. In *Advanced* and *Expert* the same window lets you change them first:
the app's name, its port, the account it runs as, passwords.

Jellyfin's media folder is, unless you choose another, the NAS's **media**
share: the dataset `<apps' pool>/media`, shared over SMB as `media` for a
group of accounts ([Shares](shares.md#shares-for-a-group-of-accounts)), so
films and music go in from any computer (`\\<NAS>\media`) and Jellyfin sees
them at once. When the share is missing, the install makes it (a dataset
already there is reused, its files included) and asks who uses it over SMB,
reading and writing: *Every account, also those added later* (the default)
or the accounts you tick; the Shares page changes that later. Jellyfin gets
its own read-only entry in the share's ACL, for the account it runs as, and
mounts it read only; when Jellyfin runs as an account that is itself a member
of the share, its entry carries the member's read and write instead (an entry
for one account comes before the group's, so a read-only one would take
writing away from that person too; the mount keeps Jellyfin read only).
Removing Jellyfin takes that entry away and keeps the share and its files. A second Jellyfin uses the same share.

With another folder chosen, **Share this folder over SMB as the media share**
makes that folder the media share instead, with the accounts chosen below it:
your films already on a dataset of their own (such as `/home/sarah/Video` on
a desktop that became a NAS) are then reached from every computer, and no
empty `media` dataset is made elsewhere. The folder must be a dataset's own
directory, and no other share may be named `media` (remove it on the Shares
page first).

Nextcloud shows the NAS's group shares as **External storage**, to read and
write: the install lists them (all ticked; untick the ones it should not
see) and each is mounted into Nextcloud at `/shares/<name>` and appears in
its Files as a folder of the same name, for every Nextcloud user (Nextcloud's
*Administration → External storage* can narrow that down). Nextcloud gets
its own read-write entry in each share's ACL, for the account it runs as
(`www-data`, uid 33, on Linux; `www`, uid 80, on FreeBSD), and files it
creates stay the group's, so the share's members reach them over SMB too.
A script FreedomNAS puts in Nextcloud's `before-starting` hooks creates the
External storages at every start, for each share mounted (on FreeBSD the recipe sets `RUN_HOOKS_AS_ROOT` empty: the port's entrypoint stops on it unset); the shares are
chosen at the install, so one made later reaches Nextcloud when it is
installed again on its kept data. Removing Nextcloud takes its ACL entries
away; the shares stay.

An app installed again on the data it kept (removed without deleting its
data) is offered the folders it used before: its database still points
there. Choosing another one shows a warning in the window, and again once the
app is installed: a Jellyfin that used `./media` and now reads the media
share finds its old library empty until its files are there.

Every app of the catalogue whose data can move between Linux and FreeBSD
runs the **same release on both**, the one the catalogue names, because
apps upgrade their data and never go back to an older release:

| App | Release | Linux | FreeBSD |
|-----|---------|-------|---------|
| Nextcloud | `NEXTCLOUD_VERSION` | `nextcloud:<release>-apache` | the AppJail image, its code replaced at start by the `nextcloud-<release>.tar.bz2` of nextcloud.com (checksum verified) |
| MariaDB (Nextcloud's) | `MARIADB_VERSION` | `mariadb:<release>` (`MARIADB_AUTO_UPGRADE`) | the AppJail image pinned by digest (`MARIADB_FREEBSD_IMAGE`) |
| Jellyfin | `JELLYFIN_VERSION` | `jellyfin/jellyfin:<release>` | the AppJail image pinned by digest (`JELLYFIN_FREEBSD_IMAGE`) |
| Pi-hole | `PIHOLE_RELEASE` | `pihole/pihole:<release>` | FreedomNAS's own port, the same core, web and FTL |
| Vaultwarden | `VAULTWARDEN_VERSION` | `vaultwarden/server:<release>` | FreeBSD's package, which the catalogue follows |

The releases an app was installed or updated with are written into its
dataset (`.freedomnas-release`), and Nextcloud's own `html/version.php` is
read too. An install over kept data written
by a newer release than the catalogue's is refused with a message saying so,
instead of an app that restarts forever or whose pages fail. **Update** on the app moves it to the catalogue's
current release, never further back; a new release reaches an installed
Nextcloud only that way, when you choose.

Pi-hole's settings come along too: both recipes give FTL the paths of their
own edition (`FTLCONF_webserver_paths_webroot`, `FTLCONF_files_database`,
`FTLCONF_files_tmp_db`, `FTLCONF_files_gravity`, `FTLCONF_files_macvendor`:
`/etc/pihole` and `/var/www/html` on Linux, `/usr/local/etc/pihole` and
`/usr/local/www/pihole` on FreeBSD), so a `pihole.toml` written on the other
edition is corrected at the first start instead of serving no web interface.

Nextcloud's data comes along when its pool moves to another edition
(FreeBSD to Linux or back): install it again from the catalogue on its kept
data. Its folders (`./html`, the data folder) are given to the account
Nextcloud runs as there (`www-data`, uid 33, on Linux; `www`, uid 80, on
FreeBSD) when they belong to someone else, and a script FreedomNAS puts in
Nextcloud's `pre-upgrade` and `before-starting` hooks writes that edition's
paths and database host into `config.php` (`datadirectory`, `apps_paths`,
`dbhost`) before Nextcloud reads it. The newer release of the two editions
then upgrades the data by itself.

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

With the [reverse proxy](proxy.md) set up, Jellyfin, Immich and Nextcloud (on FreeBSD: Jellyfin and Nextcloud) are installed behind it: their web port answers over HTTPS with FreedomNAS's certificate.

The first start downloads the app's images and can take several minutes;
the Runtime card says when it is done. **Open** in the app list then opens
its web page.

## Apps

On Linux an app is a Docker Compose project with a dataset of its own,
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
of its containers is not running, and an app that is stopped is stopped
again if its containers were started by the system (AppJail starts jails
at boot by itself). On a restored or reinstalled system the apps come back
from the pool the same way.

### Moving to another edition

The pool keeps each app's data and settings. A system restored from it
(a fresh install, another edition) needs nothing done by hand: the module
is installed from the edition's repositories, the runtime (Docker on Linux,
AppJail on FreeBSD) is installed as the page's **Install** would, and its
data directories are this edition's on the same pool (`<pool>/containers/docker`
and `containerd`, or `appjail` and `oci`), created when missing and recorded;
the other edition's stay on the pool, untouched. When it is imported on an
edition with the other runtime (Linux and FreeBSD), an app from the
catalogue is set up for it at boot. **Vaultwarden**, whose data both
runtimes read as it is, only gets this edition's recipe beside it. Every
other app of the catalogue (Jellyfin, Nextcloud, Pi-hole, ...) is installed
again from the catalogue over the data it kept, with the folders, ports,
account and passwords of its old `.env`, and started: this edition's
recipe, folders' owners, paths and reverse proxy address replace those of
the edition it ran on. This happens whenever the app was last installed on
the other edition, even when a file this edition wrote long ago is still
beside its data, and also when its record names this edition but only the
other edition's files sit beside its data (an older FreedomNAS recorded the
move without making it). When the install cannot be done (data written by a newer
Nextcloud than the catalogue's, a port something else took), the app stays
stopped with the reason on the dashboard, recorded as it was and its
dataset kept. Apps you wrote yourself (Compose or Director files) are not
changed: write the other file for them.

### After a power cut

A machine that lost power while an app was starting can leave the app
stuck: on FreeBSD, AppJail Director keeps a lock for each project and a
copy of its last spec, and AppJail a lock on each jail, and an interrupted
run leaves the lock behind and the copy empty ("Project locked", "Invalid
document specification", "the jail has been locked"). Before starting an
app (at boot, from the page, on Update) FreedomNAS clears what nothing is
working on any more: the project's lock, an empty copy of its spec, the
locks of its jails (`containers.compose_repair` in the FreeBSD profile).

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

On Linux, setup and every boot also make sure a user may hold 1024 inotify
instances (`fs.inotify.max_user_instances`, in
`/etc/sysctl.d/10-freedomnas-containers.conf`; a higher value set by you is
left alone). An app that runs as one of the NAS's users, such as Jellyfin,
shares that user's instances with everything else the user runs, and the
kernel's default of 128 can run out: Jellyfin then crashes at start and keeps
restarting.

## Dashboard

The module's tile says whether Docker runs on the pool, with the number of
containers and images, or what is wrong: Docker stopped, a dataset not
mounted.
