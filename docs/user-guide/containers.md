# Containers

The **Containers** page comes with the community module
`freedomnas-module-containers` (repository `freedomnas-containers`). It is
not part of a plain FreedomNAS install: the page appears in the sidebar once
the package is installed.

Containers run with **Docker**, from your edition's own packages, on every
Linux edition (Debian, Arch, Artix, Void, Gentoo). FreeBSD is not supported
yet.

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
for the copy, and running containers with it.

The pool is chosen once: moving containers to another pool is not possible
yet.

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
