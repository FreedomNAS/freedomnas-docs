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
| Network interfaces | `network.list_interfaces` — their names; `network.list_physical` — physical cards with MAC and driver | left alone |
| Pools | `zfs.pool_list` — the imported ones | imported again |
| Accounts | `users.list` (UIDs 1000–65533, 1001– on FreeBSD; `root` left out), each with `users.list_groups` | created if missing, nothing removed |
| SMB shares | `samba.list_shares` (`net usershare list`) | written again, nothing removed |
| NFS exports | the lines of `nfs.config_file` (`/etc/exports`), read as a file | added, nothing removed |

A part that cannot be read is *unknown*, not empty: nothing is ever removed
on the strength of a list that could not be taken.

## The Plan

`compute_diff(desired, observed, mode)` returns the steps in a fixed order:

```
1. Hostname → 2. Timezone → 3. Network interfaces → 4. Pools
→ 5. Group shares' groups → 6. Accounts (add, group changes)
→ 7. Feature services → 8. SSH → 9. Boot choices of services
→ 10. SMB shares → 11. NFS exports → 12. Removal of accounts → 13. Modules
```

Pools come before the shares on them, a group share's group before the
accounts created in it, accounts before the shares that name them, and
accounts are removed last, when no share refers to them any more.

| Step | Declarative | Additive |
|------|-------------|----------|
| Hostname, timezone | set when different | same |
| Network interfaces | first every physical card gets its FreedomNAS name by MAC address (`freedomnas.netnames`: `network.list_physical`, `names_clear` + `name_persist` rewrite the names the system applies at boot, a card with another name is renamed live with `rename_interface` and its connection follows with `connection_rename`; the entry in `network.interfaces` moves to the new name). Then every entry under `network.interfaces` with a `config` is found on this system by its `mac_address`, or by its name, and gets its configuration back when the system holds none for it (`network.connection_exists`: no `fnas-<interface>` connection, no `ifconfig_<interface>` line on FreeBSD), through the same steps as the Network page, without a checkpoint. A configured interface is left alone, so a boot never takes the network down — except one renamed during this boot, whose connection is activated again (`connection_activate`). An interface this system does not have is skipped. Bridges, bonds and VLANs (entries with a `type`) the system does not have are created with all their steps — bonds first, then VLANs, then bridges — when their ports or parent are there; ports (entries with `master`) get no configuration of their own. The WireGuard VPN (type `wireguard`) is written and brought up again, with its key and devices, when `network.wg_exists` does not answer `yes` | same |
| Pools | imported when not imported; an imported one is put in the default cachefile and its datasets mounted (`zfs.pool_cachefile_default`, `zfs.mount_pool_auto`): `firstboot.sh` leaves a restored data pool imported with `-N` and no cachefile. **Never exported or destroyed** | same |
| Group shares' groups | for every SMB share with a `group` (`freedomnas.groupshares.restore`): the group is created when missing (`users.group_create`); when the share's directory does not carry that group — a restore, where the group got another number here and the files show the old one — or lacks the group's ACL entry (`directories.acl_get`: a pool moved from FreeBSD to Linux, whose NFSv4 ACLs Linux does not read), the old group's ACL entries are removed (`directories.acl_group_remove`) and the directory and everything in it are given to the group again, with the apps recorded for it (`apps`). Only the directory is checked at every boot | same |
| Accounts | created when missing, with the `uid` the configuration records, or else the numeric owner (`directories.owner_uid_get`) of a share directory given to them — the ID a restored pool's files carry; a uid already taken here is not reused. Group membership changed | same |
| Group membership | only the groups FreedomNAS assigns: the edition's `sudo_group` and `share_group`, any group the configuration lists, and the administrators' groups. A user's own group, `users`, anything set up by hand is left alone. An administrator (`admin: true`) is given the **running** edition's `sudo_group`, whatever group the file named; any group name of another edition's administrators (`sudo`, `wheel`) in the file is read as `admin: true`. The running edition's `sudo_group` is never taken away from anyone: administrators lose their rights from the WebUI only | same |
| Administrators' groups | an administrator (`admin: true`, or in the `sudo_group`) also joins every `admin_groups` group of `packages/*.json` that exists on this system (`package_manager.admin_groups_present`, checked with `users.group_exists`) — `docker`, whose socket topgrade's containers step needs. A configuration restored from another edition, or written before Containers was installed, does not list it | same |
| Pools' ACL type | `acltype` becomes the edition's (`zfs.pool_acltype`: `posix` on Linux, `nfsv4` on FreeBSD) on the pool's root dataset and on any dataset that sets it locally; the rest inherit. Only the property changes: the ACLs FreedomNAS writes are the trivial ones the file mode already carries | same |
| Share directories' group | a share with an `owner` whose directory's group is not the edition's (`directories.owner_group`: the owner's own group on Linux, `wheel` on FreeBSD) is given it with `chgrp -R`, once — files restored from another edition carry that one's group; only the directory is checked at every boot | same |
| Feature services | enabled and started for every feature marked `enabled`, unless the service is disabled at boot under `services.boot` | same |
| Power button | where the os profile has `power_button` (Artix, Void, Gentoo): acpid installed when missing (`power-button` package category), FreedomNAS's rule written when missing or different, the service enabled and running (restarted after a new rule); see [OS profiles](../profiles/os-profiles.md#power_button) | same |
| SSH | turned on or off as `system.ssh_enabled` records it, when it is recorded; kept off while the image's `setup-pending` file exists ([Setup API](../api/setup.md#restored-systems)) | same |
| Boot choices | every service under `services.boot` that `services.list_all` lists here is enabled and started, or stopped and disabled, as recorded by the WebUI's **Services**; one this system does not have is skipped | same |
| SMB shares | before the first one, usershares are made possible (`usershares.prepare()`: smb.conf's `[global]` settings and the directory), since a restored configuration reaches a system no wizard has prepared, and the edition's SMB service (`samba.smb_service`) is started if `services.is_running` says it is not: `net usershare add` needs a running smbd to turn user names into SIDs, and at boot the reconciler can be ahead of it (a share is retried for up to 30 s while Samba answers "smbd is not running"); usershares the configuration does not name are removed; **every** recorded share is written again (`net usershare add` replaces one of the same name), so path, comment and ACL end up exactly as recorded | written again, none removed |
| NFS exports | a line that differs from the recorded share is removed and the recorded one added; a line the configuration does not name is removed | missing lines added; a differing line is left alone, with a warning |
| Accounts not in the configuration | removed, **home directory kept** (`users.delete_keep_home`), after leaving Samba's database | never |
| Module packages | a module the configuration has a section for (`modules.<id>`, not empty) but this system lacks is installed from the edition's repositories before the modules are reconciled: `packages.update_cache` once, `packages.module_search` for its package (`freedomnas-module-<id>`), `packages.install`. A fresh install restored from its pool, or another edition, so gets back the modules the configuration names; one the edition's repositories do not offer is reported and skipped | same |
| Modules | after every step above, each module this edition loads ([Orchestrator](orchestrator.md)) gets its own section of the configuration, `modules.<id>`, through its `reconcile(desired, mode)`, and returns its own results; a module that raises becomes one failed result (`modules.<id>`) and the others still run; so does a module that could not be loaded (`Module not loaded: <reason>`), and one whose profile fragment was left out is reported once, as `modules.<id>.profile`. Not part of a dry run | the module is told `additive` and removes nothing |

### What is never removed

- **Pools and datasets**: pools are only imported.
- **`root` and system accounts**: only UIDs in the regular range are observed.
- **Administrators**: an account in the edition's `sudo_group` is only
  removed from the WebUI, and nobody is ever taken out of that group by the
  reconciler. Neither a boot nor a loaded file can leave a system with
  nobody who can log in — the image's shipped `admin` included, until the
  setup wizard deals with it. (On 2026-10-14 a configuration written by a
  Debian install, `groups: [sudo]`, took `wheel` away from the
  administrator of a Gentoo install sharing the data pool.)
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
    target_state: str   # "applied" | "failed" | "warning" | "skipped" | "planned" (dry run)
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
