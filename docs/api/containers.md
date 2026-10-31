# Containers API

Routes of the community module **Containers** (package
`freedomnas-module-containers`), mounted at `/api/containers` when the
module is installed. Docker on Linux, AppJail on FreeBSD; the commands come
from the module's profiles, as everywhere else. The WebUI's
[Containers page](../user-guide/containers.md) uses them.

**Auth required:** an administrator, on every route.

## Jobs

Install, setup, run, pull and every app change can take minutes (a Gentoo
install compiles the runtime, an image download is as slow as the line), so
they run in a thread, one at a time. Such a route answers at once with
`{"job": {"kind", "state": "running", "error", "started", "finished"}}`,
or `409` while another job runs; `GET /api/containers/status` reports how
the last one went (`state` `done` or `failed` with `error`). An app job
also brings the [reverse proxy](proxy.md)'s sites in step with the apps.

## Runtime

| Route | What it does |
|-------|--------------|
| `GET /status` | The runtime installed and running, the pool and datasets it keeps its data on, the pools it can go on, the profile's `ui` words, `apps` (whether this runtime runs apps), `app_file` and `app_files` (the names of an app's files), and the `job` |
| `POST /install` | Installs the runtime from the edition's packages (a job); `409` when it is already installed |
| `POST /setup` `{"pool": "tank"}` | Mounts `<pool>/containers/<name>` on each of the runtime's data directories, copying what they held, and records it (a job); `422` for a pool that is not imported |

## Containers and images

| Route | What it does |
|-------|--------------|
| `GET /containers` | Every container, running first |
| `POST /containers/run` `{image, name, ports, volumes, env, restart}` | Creates and starts one (a job); `422` for a value the runtime would not take |
| `POST /containers/{name}/{action}` | `start`, `stop`, `restart` |
| `DELETE /containers/{name}?force=true` | Removes it; `force` also a running one |
| `GET /containers/{name}/logs?lines=N` | The last N lines, with timestamps |
| `GET /images` | Every image |
| `POST /images/pull` `{"image": "nginx:alpine"}` | Downloads it (a job) |
| `POST /images/prune` | Removes the images no container uses and no tag names |
| `DELETE /images/{image}` | Removes one image |

## Apps

An app is a dataset `<pool>/apps/<name>` holding its app file (a Compose
file on Linux, a Director file on FreeBSD) and the profile's other files.

| Route | What it does |
|-------|--------------|
| `GET /apps` | Every app: dataset, state, containers and how many run, ports, `catalogue` entry and `web_port` |
| `POST /apps` `{name, compose, files, start}` | Creates the app (`files`: `{key: text}`); `start` brings it up (a job) |
| `GET /apps/{name}` | The app, its app file and its other files |
| `PUT /apps/{name}` `{compose, files}` | Replaces them; a running app is brought up again with them (a job) |
| `POST /apps/{name}/{action}` | `up`, `down`, or `update`: a catalogue app takes the catalogue's release and is installed again from the catalogue over its kept data, left up or down as it was, then its images are fetched again; any other app only fetches its images again (jobs) |
| `GET /apps/{name}/logs?lines=N` | The last N lines of every container of the app |
| `DELETE /apps/{name}?destroy_data=true` | Takes it down and forgets it; `destroy_data` also destroys its dataset |

## Catalogue

| Route | What it does |
|-------|--------------|
| `GET /catalogue` | `{"entries": [...]}`: the ready-made apps, each saying whether this edition has a recipe for it |
| `GET /catalogue/{id}` | One of them, with `app_name` (the first free name), its settings' `defaults` for this NAS, the folders an earlier install left (`kept`), the shares it can use, the accounts it can run as and the pool folders |
| `POST /catalogue/{id}/install` `{name, values}` | Creates it as an app and brings it up (a job); without `values` the defaults are used. The answer carries the values to show once (generated passwords, tokens) with the `job` |

The account page lists the apps that are up through the module's
`links()` — see [GET /api/account/me](users.md#get-apiaccountme).
