# Plugins API

Community modules installed from the edition's package repository. A module
is the package `freedomnas-module-<id>` (`app-nas/freedomnas-module-<id>` on
Gentoo). The OS profile lists them with `packages.module_search` (the local
package index) and `packages.module_installed`, one line per package:
`name<TAB>version<TAB>description`; it installs them with `packages.install`
and removes them with `packages.module_remove`. The routes know no package
manager. The WebUI's [Plugins page](../user-guide/plugins.md) uses them.

## GET /api/plugins/

**Auth required:** yes

```json
{
  "supported": true,
  "modules": [
    {
      "id": "containers",
      "package": "freedomnas-module-containers",
      "description": "Containers for FreedomNAS: Docker on its own ZFS datasets, apps and a catalogue",
      "available": "0.1.0+20261011083703.9393194-1",
      "installed": null,
      "loaded": false
    }
  ],
  "job": { "kind": null, "module": null, "state": "idle", "lines": [], "next": 0 },
  "restart_needed": false
}
```

- `available` — the version the repository offers, else `null`
- `installed` — the version installed, else `null`
- `loaded` — the module was in `<root>/modules` when the WebUI started: a
  module installed since then needs a restart, one removed since then is
  still running until it
- `supported` — `false` when the profile has no `module_search` command
- `restart_needed` — as in [`GET /api/system/webui`](system.md)

A module present in `<root>/modules` but not installed from a package is
listed with `package: null` and cannot be removed here.

## GET /api/plugins/failed

The community modules the WebUI could not load when it started, with the
reason; empty when all loaded. The Plugins page and the Dashboard show them
as a notice.

```json
{ "failed": [ { "id": "w2test", "reason": "SyntaxError in /usr/lib/freedomnas/modules/w2test/api_routes.py, line 2: '(' was never closed" } ] }
```

## Jobs

Install, remove and refresh are jobs: one at a time, never while a system
update runs (`409`), and while one runs the updates terminal and
`POST /api/system/webui/restart` refuse to start. The command is the
profile's, run without a shell, stdin closed, stdout and stderr together.

### GET /api/plugins/job?since=N

```json
{
  "kind": "install", "module": "containers", "state": "done",
  "error": null, "exit_code": 0,
  "started": "2026-10-11T15:00:51+00:00", "finished": "2026-10-11T15:00:55+00:00",
  "lines": ["$ pacman -S --noconfirm freedomnas-module-containers", "resolving dependencies..."],
  "next": 2, "from": 0
}
```

`state` is `idle`, `running`, `done` or `failed` (`error` says why). `lines`
are the output lines from line `since` on; pass `next` as `since` the next
time. The last 2000 lines are kept.

### POST /api/plugins/refresh

Runs `packages.update_cache`. Answers `{"job": …}`.

### POST /api/plugins/{id}/install

Installs the package `module_search` lists for `id`. `422` for an invalid
name, `404` when the repository offers no such module. Answers `{"job": …}`.

### DELETE /api/plugins/{id}

Removes the package `module_installed` lists for `id`. The module's
configuration (`modules.<id>`) and datasets are left alone. `404` when no
such module is installed from a package. Answers `{"job": …}`.
