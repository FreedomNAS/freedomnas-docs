# Orchestrator

`orchestrator.py` manages the lifecycle of FreedomNAS pluggable modules.
It runs a background heartbeat thread that periodically calls `health_check()`
on every registered module and applies a circuit breaker on repeated failures.

**Populated by `module_loader.py` (2026-09-02)**, not hand-wired: modules
live in `modules/<name>/{module.py, manifest.json, __init__.py}` (see
[Profile System Overview](../profiles/overview.md) for the matching profile
split), and `ModuleLoader` scans `modules/*/manifest.json`, filters by
`supported_os`, and calls `orchestrator.register()` for each match. This is
the first real caller of `Orchestrator` — before this refactor it was
fully defined but never instantiated anywhere. `python -m freedomnas serve`
builds the engine/config/orchestrator, runs `ModuleLoader.load_all()`, then
`orchestrator.start_all()` and blocks until `SIGINT`/`SIGTERM`.

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
those the same way, independently of this file. A module with a page of its
own can also ask for a sidebar entry, `webui.nav`:

```json
"nav": {"label": "Containers", "icon": "icons.svg#containers", "level": "advanced"}
```

`icon` is `<file>#<symbol id>` inside the module's `static_dir` (without it
the WebUI's generic module icon is drawn); `level` is the lowest UI level
that shows the entry — `assisted` (default), `advanced` or `expert`, the
same `advanced-only` / `expert-only` classes the core pages use. Entries
are placed before System, in the order the modules are found.

## Classes

```python
class ModuleState(str, Enum):
    STOPPED | STARTING | RUNNING | FAILED | DISABLED

class FreedomNASModule(ABC):
    @property name: str     # unique module identifier
    def start() -> None     # idempotent
    def stop() -> None      # idempotent
    def health_check() -> bool  # must never raise
    def health() -> tuple[bool, str]  # healthy, and why; default wraps health_check()
    def reconcile(desired: dict, mode: str) -> list[ActionResult]  # default: nothing to do

class Orchestrator:
    def register(module) -> None
    def start_all() -> None           # starts modules in registration order, then heartbeat
    def stop_all() -> None            # stops heartbeat, then modules in reverse order
    def start_module(name) -> None
    def stop_module(name) -> None
    def restart_module(name) -> None  # resets failure_count, re-enables DISABLED modules
    def get_status() -> Dict[str, ModuleStatus]
    def get_module_status(name) -> ModuleStatus
    def list_modules() -> List[str]
```

## Circuit Breaker

- `MAX_FAILURES = 5` — consecutive `health_check()` failures trigger `DISABLED` state
- `HEARTBEAT_INTERVAL = 30` seconds between checks
- `restart_module()` resets the counter and re-enables a `DISABLED` module

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

`python -m freedomnas serve` is not started on an appliance: `supervisor.sh`
runs the WebUI only. The dashboard therefore does not read the
orchestrator's state. [`GET /api/system/health`](../api/system.md) takes
`ModuleLoader.instances()` — every module this edition supports, community
ones included, instantiated but not registered — starts each, asks
`health()` and drops it; the dashboard draws one tile per module with its
state and reason when the page opens.
