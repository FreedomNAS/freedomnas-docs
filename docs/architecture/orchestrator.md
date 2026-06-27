# Orchestrator

`orchestrator.py` manages the lifecycle of FreedomNAS pluggable modules.
It runs a background heartbeat thread that periodically calls `health_check()`
on every registered module and applies a circuit breaker on repeated failures.

## Classes

```python
class ModuleState(str, Enum):
    STOPPED | STARTING | RUNNING | FAILED | DISABLED

class FreedomNASModule(ABC):
    @property name: str     # unique module identifier
    def start() -> None     # idempotent
    def stop() -> None      # idempotent
    def health_check() -> bool  # must never raise

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

| Module | `name` | `health_check()` logic |
|--------|--------|------------------------|
| StorageModule | `"storage"` | `zpool list` — no pool in DEGRADED/FAULTED/UNAVAIL |
| NetworkModule | `"network"` | `list_interfaces` — at least one non-loopback interface UP |
| SharesModule | `"shares"` | `services.status` for each enabled feature's service |
| UsersModule | `"users"` | `users.get_user_info` for each configured user |
| UpdatesModule | `"updates"` | `config.is_topgrade_configured()` returns True |

## Dashboard Integration

The WebUI dashboard polls `GET /api/system/status` every 30 seconds and
displays each module's state as a coloured badge. When any module enters
`FAILED` or `DISABLED` state, the badge turns red and the module name is
highlighted in the health grid.
