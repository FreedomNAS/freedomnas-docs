# Orchestrator

`orchestrator.py` keeps the FreedomNAS modules checked while the NAS runs:
`python -m freedomnas serve`, which `supervisor.sh` starts next to the WebUI,
checks every module, retries one that fails and blocks it when the tries run
out, and writes what it found for the WebUI.

**Populated by `module_loader.py` (2026-09-02)**, not hand-wired: modules
live in `modules/<name>/{module.py, manifest.json, __init__.py}` (see
[Profile System Overview](../profiles/overview.md) for the matching profile
split), and `ModuleLoader` scans `modules/*/manifest.json`, filters by
`supported_os`, and calls `orchestrator.register()` for each match. This is
the first real caller of `Orchestrator` — before this refactor it was
fully defined but never instantiated anywhere. `python -m freedomnas serve`
builds the engine/config/orchestrator, runs `ModuleLoader.load_all()`, then
checks the modules until `SIGINT`/`SIGTERM` (see [Checks, retries and
blocked modules](#checks-retries-and-blocked-modules)).

A community module (its own repo/`.deb`, dropped into `modules/<id>/` at
install time) is discovered the exact same way, with zero changes to this
file, `engine.py`, or `freedomnas-webui`'s routing — see the `manifest.json`
schema below.

`ModuleLoader` scans two directories, in this order: the core's own modules
(`<root>/core/freedomnas/modules`) and the community modules beside it
(`<root>/modules`), both from `paths.modules_candidates()`. A community
module that takes the id of a core module is ignored with a warning, so no
package can replace `storage` or `users`. Up to 0.9.12 only the first
directory that existed was read: a single community module installed in
`<root>/modules` would have hidden every core module.

## `manifest.json`

```json
{
  "id": "storage",
  "name": "Storage",
  "version": "1.0.0",
  "type": "core",
  "entry_point": "module:StorageModule",
  "supported_os": [],
  "depends_on": [],
  "webui": null
}
```

`entry_point` (`"<file_stem>:<ClassName>"`) is loaded from
`{module_dir}/{file_stem}.py` **by file path**
(`importlib.util.spec_from_file_location`), not Python's package import
machinery — that's what lets a module live in a totally separate repo with
zero wiring into `freedomnas-core`. A module is silently skipped (not an
error) if the running OS isn't in `supported_os`; an empty list means every
edition, which is what the core modules declare — they only ever talk to
the system through the profiles. `webui` is `null` for
every core module today; a community module with a WebUI component sets it
to an object naming its `api_routes.py`, route prefix, and template/static
directories — see `freedomnas-webui/api/module_discovery.py`, which mounts
those the same way, independently of this file. Each community module is loaded on its own: an invalid
manifest, a `webui` block without `api_routes`, a missing file, an
`api_routes.py` that raises on import (`SyntaxError`, `ImportError`, …), no
`APIRouter` under `router_attr`, or a bad `route_prefix` leaves that module
out and records it in `module_discovery.failed_modules` with the reason; the
WebUI starts with the others and serves the list at
`GET /api/plugins/failed`. A module with a page of its
own can also ask for a sidebar entry, `webui.nav`:

```json
"nav": {"label": "Containers", "icon": "icons.svg#containers", "level": "advanced"}
```

`icon` is `<file>#<symbol id>` inside the module's `static_dir` (without it
the WebUI's generic module icon is drawn); `level` is the lowest UI level
that shows the entry — `assisted` (default), `advanced` or `expert`, the
same `advanced-only` / `expert-only` classes the core pages use. Entries
are placed before System, in the order the modules are found.

`after` (optional) lists module ids the reconciler runs first when they are
present: `containers` declares `"after": ["proxy"]`, so on a fresh install
restored from its pool the proxy has installed Caddy and made its folders
before the containers write the apps' sites. It only orders the reconcile
(a module not installed is ignored, a loop keeps the order modules are
found in); `depends_on` is not read by the core.

A module the reconciler installs (a configuration restored onto a fresh
image names it) brings its profile fragment with its package: right after
installing, the reconciler has the engine merge the profiles again
(`FreedomNASEngine.reload_profile`), so the module's commands (Docker's
apt repository, Caddy's check) exist when it reconciles in the same run,
and the restore page gets a step for it.

## A module that cannot be loaded

`ModuleLoader` loads each module on its own. A `manifest.json` that is not
valid JSON or not an object, a manifest without `entry_point` (or a
malformed one), an entry-point file that is missing or raises on import
(`SyntaxError`, `ImportError`, anything else), a missing class, a
constructor that raises, or a profile fragment the engine left out
(`engine.profile_failures`, see
[Invalid fragments](../profiles/overview.md#invalid-fragments)) leaves that
module out and records it in `loader.failed` (module id → reason); every
other module is still returned by `instances()`. A module for another
edition (`supported_os`) is skipped, not failed. Only a missing modules
directory still raises `ModuleLoaderException`.

Every caller reports the failed modules: the reconcile as a failed
`modules.<id>` result each, `restore-offline` as `modules.<id>.prepare` for a
module the configuration has a section for, `serve` on stderr,
[`GET /api/system/health`](../api/system.md#get-apisystemhealth) as state
`failed`, the proxy's and the containers' cross-module reconciles in their
own results. A module that failed counts as present, so the reconcile does
not try to install its package again.

## Classes

```python
class ModuleState(str, Enum):
    STARTING | HEALTHY | PROBLEM | RETRYING | BLOCKED | FAILED

class FreedomNASModule(ABC):
    @property name: str     # unique module identifier
    def start() -> None     # idempotent; reads the configuration
    def stop() -> None      # idempotent
    def health_check() -> bool  # False is a real problem; raising is a failure
    def health() -> tuple[bool, str]  # healthy, and why; default wraps health_check()
    def reconcile(desired: dict, mode: str) -> list[ActionResult]  # default: nothing to do
    def prepare(desired: dict) -> list[ActionResult]  # packages only, before the first boot (installer's chroot); default: nothing
    def links() -> list[dict]  # web pages every account may open (account page); default: none

class Orchestrator:
    def register(module, module_id=None, name=None) -> None  # id and name from the manifest
    def mark_failed(module_id, reason) -> None  # a module that could not be loaded
    def keep_blocked() -> None        # modules the last serve left blocked stay blocked
    def start_all() -> None           # every module due for a check now
    def check_due() -> list[str]      # check the modules whose time has come
    def take_restart_requests() -> list[str]  # <run>/module-restart/<id>, from the WebUI
    def write() -> None               # <run>/module-health.json
    def stop_all() -> None
```

## Checks, retries and blocked modules

`serve` loops about once a second. A module is checked every
`CHECK_INTERVAL` (30) seconds: `start()`, which reads the configuration
again, and `health()`, together within `CHECK_TIMEOUT` (5) seconds, in a
thread of their own.

| State | When | Next |
|-------|------|------|
| `healthy` | `health()` said yes | checked again in 30 s |
| `problem` | `health()` said no: a degraded pool, a broken disk, a service down | shown, checked again in 30 s; never blocks the module and turns `healthy` by itself |
| `retrying` | the module raised, or did not answer within 5 s | `stop()` and `start()` again after 10, 20, 30, then 60 s (`RETRY_DELAYS`), about 2 minutes in all |
| `blocked` | the fourth try failed too | not checked any more until a restart is asked for (**Restart module** on the dashboard) |
| `failed` | the module could not be loaded (manifest, import, constructor, profile fragment) | never checked |

A restart request is a file named after the module in
`<run_dir>/module-restart/` (`POST /api/system/modules/{id}/restart` writes
it): the module is checked again at once, with its tries counted from zero.

The state is written to `<run_dir>/module-health.json` (`run_dir` comes
from the OS profile: `/run/freedomnas`, `/var/run/freedomnas` on FreeBSD)
whenever a module was checked and at least every 10 seconds. A module
blocked there stays blocked when `serve` starts again. `serve` reads the
configuration again when `config.yaml` changes, exits with 75 when the set
of installed modules changes so that `supervisor.sh` starts it again with
the new one, and refuses to start while another `serve` holds
`<run_dir>/serve.lock`.

The reconciler does not look at this state: a blocked module is still
reconciled at boot and reports its own errors.

## Pluggable Modules

Each core module implements `health()`, which says why as well as whether;
its `health_check()` is `health()[0]`.

| Module | `name` | `health()` logic |
|--------|--------|------------------|
| StorageModule | `"storage"` | `zfs.pool_list` — no imported pool DEGRADED, FAULTED, REMOVED or UNAVAIL, recorded or not (a system set up from an image does not record its root pool) |
| NetworkModule | `"network"` | `network.list_interfaces` — at least one non-loopback interface up: `operstate` from Linux's `ip -j addr show` JSON, any Ethernet name from FreeBSD's `ifconfig -l -ether` |
| SharesModule | `"shares"` | `services.status` for the service of each enabled share feature and of each kind of share the configuration holds (a restored or imaged system has shares but may record no features); the detail counts the SMB and NFS shares and names the services that are down |
| UsersModule | `"users"` | `users.get_user_info` for each configured user; names the missing ones |
| UpdatesModule | `"updates"` | the configuration can be read; says whether topgrade is configured |

## Dashboard Integration

The WebUI checks nothing itself. [`GET /api/system/health`](../api/system.md)
returns `module-health.json` as `serve` last wrote it, with
`monitor.running` false when the file is older than 90 seconds or missing;
the dashboard then says that module checks are not running and shows the
last state known with its time. It reloads the tiles every 15 seconds.
