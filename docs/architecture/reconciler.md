# Reconciliation Engine

`reconcile.py` is used by the **installer** (recovery mode) and by the
`firstboot.sh` baked into every install and every image — via
`python -m freedomnas reconcile --mode {hybrid,declarative,disaster_recovery}`,
which exposes it on the CLI — to apply configuration during provisioning,
first boot, or disaster recovery. **Never called directly by the WebUI.**

It computes the diff between a desired state (YAML) and the current system
state, then executes the necessary changes through the engine.

## Two implementations

Like the [engine](engine.md#two-implementations), it exists twice:
`reconcile_py.py` (pure Python, the reference — `compute_diff`, the
disaster-recovery order and every `_do_*` atomic call) and
`reconcile_native.py` (the Python side of `nim/src/fnas/reconcile.nim`,
where that same logic runs). `reconcile.py` picks between them —
`FREEDOMNAS_RECONCILE`, following `FREEDOMNAS_ENGINE` when unset — and
`tests/test_reconcile_parity.py` holds the two to identical behaviour:
`reconcile()` end to end (including seeded random current/desired pairs,
compared in order), `compute_diff()` over a seeded corpus of random states,
and `load_desired()`.

The native side implements the whole public API — `reconcile()`,
`compute_diff()` and `load_desired()`; only the internal `_do_*` split is
Python-only. `reconcile()` drives the native engine's handle, so under
`FREEDOMNAS_ENGINE=python` `reconcile.py` uses the Python reconciler
whatever `FREEDOMNAS_RECONCILE` says. Either way, callers get back the same
`ActionResult` and `Change` objects, so `r.target_state`/`r.error` read
identically regardless of backend.

Group membership changes are applied in **sorted** order by both. The
Python reconciler used to iterate a set difference, whose order depends on
the interpreter's hash seed — the same run could add a user to `sudo` and
`samba` in either order.

!!! note "One recorded difference"
    A users or shares entry without its key (`username`, `name`), or a
    section that is `null`, makes the Python reconciler stop with whatever
    Python error it hits first (`KeyError`, `TypeError`,
    `AttributeError`); the native one leaves that entry out. Neither can
    come from a `config.yaml` the managers wrote.

## Three Modes

| Mode | Behaviour |
|------|-----------|
| `hybrid` (default) | Diff desired vs current; users absent from desired are **never** deleted |
| `declarative` | Treat current as empty; users/shares missing from desired **are** deleted |
| `disaster_recovery` | Ignore desired; restore from current config snapshot in fixed order |

## Classes

```python
class ReconcileMode(str, Enum):
    HYBRID | DECLARATIVE | DISASTER_RECOVERY

@dataclass
class Change:
    path: str           # dot-notation: "system.hostname", "users.admin"
    old_value: Any
    new_value: Any
    change_type: str    # "add" | "remove" | "modify"

@dataclass
class ActionResult:
    action: str
    params: dict
    target_state: str   # "applied" | "failed" | "skipped"
    error: Optional[str]

class ReconciliationEngine:
    def load_desired(path: str) -> dict
    def compute_diff(desired, current, mode) -> list[Change]
    def reconcile(desired_path=None, mode="hybrid") -> list[ActionResult]
```

## What compute_diff Covers

- `system.hostname`
- `system.timezone`
- `users` — add, modify, delete (delete only in `declarative` mode)
- `storage.pools` — add (modification not supported)
- `shares.smb` — add, modify, delete
- `shares.nfs` — add, modify, delete
- User group membership diff

## Disaster Recovery Order

When restoring from a config snapshot, changes are applied in this fixed order:

```
1. Hostname → 2. Timezone → 3. ZFS Pools → 4. Users
→ 5. Services → 6. SMB Shares → 7. NFS Shares
```

This order ensures dependencies are satisfied: pools must exist before shares,
users must exist before share permissions can reference them.

On first boot, `firstboot.sh` runs `python -m freedomnas unlock-pools`
*before* `reconcile --mode disaster_recovery` — an encrypted pool must be
unlocked before its datasets can mount. `reconcile.py` itself performs no
unlocking; if a pool is still locked when reconciliation runs (e.g. the
`unlock-pools` TTY prompt timed out and failed open), that pool's datasets
simply are not mounted yet and any reconciliation steps depending on them
will not converge correctly until it is unlocked manually. See
[Security](security.md#encrypted-pool-keyslots) for the unlock mechanism.

## Already in the target state

Reconciliation is not installation: it runs against a system that may already
be half-configured, and reaching the desired state by other means is not a
failure. Two actions check before acting, and report `skipped` rather than a
failure the admin has to read past:

| Action | Check | Reported as |
|--------|-------|-------------|
| `zfs.pool_import` | the pool is in `zfs.pool_list` | `skipped -- already imported` |
| `users.create` | `users.get_user_info` returns a line | `skipped -- user already exists` |

The root pool is the obvious case for the first: disaster-recovery mode runs
from a config that describes the very pool the system booted from.

## Constraints

- **Idempotent**: safe to re-run; applying the same config twice has the same result as applying it once
- **Engine-only**: never calls OS commands directly — all changes via `engine.execute()`
- **No pool modification**: pool topology changes — including converting an
  existing pool to encrypted — are not supported via reconciler (use storage API)
- **Service names**: always resolved via `engine.get_profile_value()` — never hardcoded
