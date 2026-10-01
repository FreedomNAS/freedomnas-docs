# Reconciliation Engine

`reconcile.py` makes the running system match a configuration. It is run by
the `firstboot.sh` baked into every install and every image, at every boot;
by the WebUI when a configuration is loaded
([`POST /api/system/config`](../api/system.md)); and by the installer's
recovery mode. The CLI exposes it as
`python -m freedomnas reconcile [--mode declarative|additive] [--desired FILE] [--dry-run]`.

The desired state is `config.yaml`, or a YAML file given with `--desired`.
The current state is **read from the system** by `observe()`, never taken
from `config.yaml`: the configuration says what should be, only the system
can say what is.

## Two Modes

| Mode | Behaviour |
|------|-----------|
| `declarative` (default) | The system is made to match the configuration **exactly**: what is missing is added, what differs is changed, what the configuration does not name is removed — within the limits below |
| `additive` | Adds and changes only, never removes: for applying a partial desired-state file from the command line |

Disaster recovery is not a mode of its own: it is `declarative` with the
configuration found on a pool's `.freedomnas` dataset. `disaster_recovery`
is still accepted as another name for `declarative`, because the
`firstboot.sh` copied into systems installed before the change passes it.
`--dry-run` prints the plan and applies nothing.

## What Is Observed

| Part | How | Unreadable → |
|------|-----|--------------|
| Hostname, timezone | `network.hostname_get` (`hostnamectl --static` on systemd editions, else `hostname`), `system.timezone_get` | set again |
| Pools | `zfs.pool_list` — the imported ones | imported again |
| Accounts | `users.list` (UIDs 1000–65533, 1001– on FreeBSD; `root` left out), each with `users.list_groups` | created if missing, nothing removed |
| SMB shares | `samba.list_shares` (`net usershare list`) | written again, nothing removed |
| NFS exports | the lines of `nfs.config_file` (`/etc/exports`), read as a file | added, nothing removed |

A part that cannot be read is *unknown*, not empty: nothing is ever removed
on the strength of a list that could not be taken.

## The Plan

`compute_diff(desired, observed, mode)` returns the steps in a fixed order:

```
1. Hostname → 2. Timezone → 3. Pools → 4. Accounts (add, group changes)
→ 5. Feature services → 6. SSH → 7. SMB shares → 8. NFS exports
→ 9. Removal of accounts
```

Pools come before the shares on them, accounts before the shares that name
them, and accounts are removed last, when no share refers to them any more.

| Step | Declarative | Additive |
|------|-------------|----------|
| Hostname, timezone | set when different | same |
| Pools | imported when not imported; **never exported or destroyed** | same |
| Accounts | created when missing; group membership changed | same |
| Group membership | only the groups FreedomNAS assigns: the edition's `sudo_group` and `share_group`, and any group the configuration lists. A user's own group, `users`, anything set up by hand is left alone | same |
| Feature services | enabled and started for every feature marked `enabled` | same |
| SSH | turned on or off as `system.ssh_enabled` records it, when it is recorded; kept off while the image's `setup-pending` file exists ([Setup API](../api/setup.md#restored-systems)) | same |
| SMB shares | usershares the configuration does not name are removed; **every** recorded share is written again (`net usershare add` replaces one of the same name), so path, comment and ACL end up exactly as recorded | written again, none removed |
| NFS exports | a line that differs from the recorded share is removed and the recorded one added; a line the configuration does not name is removed | missing lines added; a differing line is left alone, with a warning |
| Accounts not in the configuration | removed, **home directory kept** (`users.delete_keep_home`), after leaving Samba's database | never |

### What is never removed

- **Pools and datasets**: pools are only imported.
- **`root` and system accounts**: only UIDs in the regular range are observed.
- **Administrators**: an account in the edition's `sudo_group` is only
  removed from the WebUI. Neither a boot nor a loaded file can leave a
  system with nobody who can log in — the image's shipped `admin` included,
  until the setup wizard deals with it.
- **Everything, when the configuration names no administrator** (no user
  with `admin: true` or in the `sudo_group`): such a file is more likely
  damaged than meant, so the plan removes nothing and logs a warning.
- **Home directories**: a stale configuration must never cost anyone their
  files.

### Shares as recorded

An SMB share is written with the ACL recorded in `config.yaml`. A share
recorded before the ACL was stored gets `Everyone:R` plus full control for
its `valid_users` — what the WebUI gave it — or `Everyone:R` alone when it
is `read_only`; never more.

An NFS export goes to the hosts the WebUI records as `allowed_hosts`. A
share with none recorded is skipped: exporting it to `*` would open it to
every host that can reach the NAS.

`/etc/exports` has no share names, so an export is identified by its line.
A line not in the Linux `path hosts(options)` form — FreeBSD's
`path -ro -network …`, or one written by hand — is identified by its path
alone.

## Passwords

Passwords are not in `config.yaml`. An account the reconciler creates has
none: it cannot log in, to the WebUI or to SMB, until one is set
(**Users → Password** in the WebUI).

## Encrypted pools

`firstboot.sh` runs `python -m freedomnas unlock-pools` *before*
`reconcile --mode declarative` — an encrypted pool must be unlocked before
its datasets can mount. `reconcile.py` itself performs no unlocking; if a
pool is still locked when reconciliation runs (e.g. the `unlock-pools` TTY
prompt timed out and failed open), that pool's datasets simply are not
mounted yet and any steps depending on them will not converge until it is
unlocked manually. See [Security](security.md#encrypted-pool-keyslots) for
the unlock mechanism.

## Already in the target state

Reconciliation runs at every boot, against a system that is usually already
right. What already matches produces no step at all; account creation, which
is also planned when the accounts cannot be listed, checks before acting:
`users.create` is reported `skipped -- user already exists` when
`users.get_user_info` returns a line.

## Classes

```python
class ReconcileMode(str, Enum):
    DECLARATIVE | ADDITIVE

def parse_mode(mode: str) -> ReconcileMode    # "disaster_recovery" → DECLARATIVE

@dataclass
class Change:
    path: str           # "system.hostname", "users.alice", "smb_shares.media", "features.nfs"
    old_value: Any
    new_value: Any
    change_type: str    # "add" | "modify" | "remove" | "ensure"

@dataclass
class ActionResult:
    action: str
    params: dict
    target_state: str   # "applied" | "failed" | "skipped" | "planned" (dry run)
    error: Optional[str]

class ReconciliationEngine:
    def observe() -> dict
    def compute_diff(desired, current, mode) -> list[Change]
    def plan(desired_path=None, mode="declarative") -> list[Change]
    def reconcile(desired_path=None, mode="declarative", dry_run=False) -> list[ActionResult]
```

## Constraints

- **Idempotent**: safe to re-run; a second run right after the first plans only the steps that are always re-applied (feature services, SSH, SMB shares)
- **Engine-only**: never calls OS commands directly — all changes via `engine.execute()`
- **No pool modification**: pool topology changes — including converting an
  existing pool to encrypted — are not supported via reconciler (use storage API)
- **Service names**: always resolved via `engine.get_profile_value()` — never hardcoded
