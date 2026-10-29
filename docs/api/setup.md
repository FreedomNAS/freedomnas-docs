# Setup API

The setup API drives the first-run wizard. Its routes are exempt from the
first-run guard, so they answer before the system is initialized. All of
them but `/status` need an administrator's credentials: on a system flashed
from an image, the ones it shipped with (`admin` / `freedomnas`), which the
wizard replaces.

## GET /api/setup/status

**Auth required:** no

```json
{
  "initialized": false,
  "restored": false,
  "password_chosen": false,
  "edition": null,
  "detected_edition": "debian"
}
```

`detected_edition` is the profile the engine detected (`engine.os_type`).
`initialized` is false while the wizard still has to run: before any setup,
and also on a restored system (`restored: true`, below). `password_chosen` is
true when the installer left the system (`setup-pending` holds `install`): the
administrator chose the password there, so the wizard accepts it instead of
requiring a new one.

## Restored systems

An image leaves an empty `setup-pending` file in the edition's configuration
directory (`/etc/freedomnas/setup-pending`, `/usr/local/etc/freedomnas/` on
FreeBSD; `python3 -m freedomnas path setup-pending`). The installer's image
mode, which builds every Linux image, and the FreeBSD image builder write it.
A clean or in-place install writes `install` into it.

When the first boot finds no initialized configuration on the root pool's
`.freedomnas` and an initialized one on an attached pool, it restores that
configuration, which is already marked initialized. The
pending file keeps the wizard in front anyway: the WebUI answers `503` and
`/status` says `"initialized": false, "restored": true`, because the image's
shipped account and password still work and the restored users have no
passwords. While the file exists, the reconciler also keeps SSH off whatever
the configuration records. Finishing either wizard removes the file.

## Restore in progress

Before the wizard, the restore itself runs behind a lock:
`<state>/restoring.json` (`python3 -m freedomnas path restoring`). When
`state-boot` answers `restored` or `reinitialized`, or a lock is still there
from a restore a power cut interrupted, `firstboot.sh` writes it
(`python3 -m freedomnas restore-begin --reason <action>`), starts the WebUI
**before** the reconcile, and runs `reconcile --progress`, which writes every
step into the lock as it goes: each planned change ("Hostname", "Account
sarah", "SMB share media", ...), "Modules to install", then each module in
the order they run.

While the lock exists every page answers `303` to `/restoring/` and every
API `503` (`{"detail": "Restore in progress", "restoring": true}`), the
setup wizard's included; only the restore page, `/api/restore/*`, static
files and `/freedomnas-ca.crt` are served. Nothing there asks for a
password: the restored accounts may not have one yet. A restore that ends
well removes the lock. One with a failed step keeps it, `finished` and
`failed`, with the errors: the page shows which step failed and why, and
**Continue to the WebUI** takes the lock away. A WebUI started while the
lock was there loaded the configuration and the modules from before the
restore, so once the lock is gone it restarts itself (the page says so) and
the next one opens normally, with the wizard when it is still pending.

### GET /api/restore/progress

**Auth required:** no

```json
{
  "active": true,
  "reason": "restored",
  "started": "2026-10-29T10:44:51+00:00",
  "steps": [
    {"label": "Hostname", "state": "done", "error": ""},
    {"label": "Module containers", "state": "running", "error": ""}
  ],
  "finished": false,
  "failed": false
}
```

`state` is `waiting`, `running`, `done` or `failed`; a finished restore with
errors adds `errors` (every failed action, also those outside a step).
`{"active": false}` when there is no lock; `{"active": true, "restarting":
true}` while the WebUI from before the restore restarts.

### POST /api/restore/continue

**Auth required:** no

Takes a finished lock away. `409` while the restore still runs.

## GET /api/setup/restored

**Auth required:** yes

What the restored configuration brought along. `409` when no restored
configuration is waiting.

```json
{
  "hostname": "oldnas",
  "timezone": "Europe/Rome",
  "state_dataset": "rpool/.freedomnas",
  "admins": ["sarah"],
  "users": ["mario"],
  "ssh_enabled": true
}
```

`admins` are the users marked `admin` (or, in a file written before
2026-10-15, in any edition's sudo group).

---

## GET /api/setup/whoami

**Auth required:** yes

`{"username": "admin"}`. The sign-in page uses it to check credentials
while `/api/system/info` still answers `503`.

## GET /api/setup/devices

**Auth required:** yes

The block devices, for the wizard's data pool — the same answer as
[`GET /api/storage/devices`](storage.md).

## GET /api/setup/pools

**Auth required:** yes

The imported pools, as [`GET /api/storage/pools`](storage.md), plus
`system_pool`: the pool the root filesystem is on, so the wizard can tell it
from a data pool.

---

## POST /api/setup/initialize

**Auth required:** yes

```json
{
  "hostname": "mynas",
  "timezone": "Europe/Rome",
  "admin": {"username": "sarah", "password": "a new password", "remove_default": false},
  "pool": {"name": "tank", "vdev_type": "mirror", "devices": ["/dev/sdb", "/dev/sdc"],
           "encrypted": false},
  "state_pool": "tank"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `hostname` | no | Letters, digits, hyphens; default `freedomnas` |
| `timezone` | no | A known IANA name; default `UTC` |
| `edition` | no | Defaults to the detected edition; any other value is refused |
| `admin.username` | no | Empty keeps the account the request is authenticated as; otherwise lowercase letters, digits, `_`, `-` |
| `admin.password` | yes | At least 8 characters, and different from the password the request is authenticated with |
| `admin.remove_default` | no | With a new `username`: remove the account the request is authenticated as. If false, it is kept and gets the new password too, so the shipped one works nowhere. Never applies to `root` |
| `pool` | no | A data pool to create, exactly as [`POST /api/storage/pools`](storage.md) takes it (`name`, `vdev_type`, `devices`, `encrypted`, `master_passphrase`, cache and log devices) |
| `state_pool` | yes | The pool that keeps the external copy of the configuration: an imported pool, or the one `pool` creates. The root pool itself means no external copy |

**Behaviour**, in this order — everything that can be checked is checked
before anything changes:

1. On a restored system, the restore path below instead; otherwise `409`
   if the system is already initialized
2. `422` for an invalid hostname, timezone, edition, administrator or a
   `state_pool` that is neither imported nor being created
3. If `pool` was given, it is created through the Storage route, which
   validates it (`422` before anything else changes) and gives it a
   `.freedomnas` dataset
4. `shadow.activate(engine, state_pool)`: the root pool's `.freedomnas`
   (created by the first boot) stays the live state; `<state_pool>` gets its
   `.freedomnas` with the external mountpoint `<config_dir>/shared` if it has
   none. Nothing is destroyed (see
   [Configuration](../architecture/config.md#storage-locations)). It runs
   before anything is written, so a failure leaves the system uninitialized
   and the wizard can be run again
5. `system.hostname_set`, `system.timezone_set`, the Samba usershare
   directory and `smb.conf` stanza
6. The administrator: `users.create` with the edition's sudo group for a
   new name, then its password through `users.set_password_stdin` and,
   where Samba is installed, `samba.set_user_password`; the old account
   removed (`samba.delete_user`, `users.delete`) or given the same password.
   `root` is never removed nor changed: signed in as root with a new name,
   only the new account is set up
7. `system.ssh_enabled: false` in `config.yaml` (SSH is off on fresh
   systems; see [`/api/system/ssh`](system.md))
8. `config.mark_initialized(edition, initialized_by="webui")`
9. `shadow.sync`: the configuration is copied to every external copy

**Response:**

```json
{
  "detail": "System initialized",
  "hostname": "mynas",
  "edition": "debian",
  "admin": "sarah",
  "state_dataset": "rpool/.freedomnas"
}
```

After step 8 the `setup-pending` file is removed.

**Errors:** `401` without an administrator's credentials, `409`, `422` as
above, `500` when an engine, configuration or pool step fails partway.
Nothing is undone: a failure in steps 3–6 leaves the system uninitialized
with whatever was already applied (a created pool, a new administrator
password), and a failure in step 8 comes after step 7, so the system is
already marked initialized while its configuration is still on the root
filesystem.

### On a restored system

The same route finishes a restore. Only the administrator and SSH are
asked for; the hostname, timezone, users and shares stay as restored.

```json
{
  "admin": {"username": "sarah", "password": "a new password", "remove_default": true},
  "ssh": false,
  "users": {"mario": "a temporary password"}
}
```

`users` gives every other restored account (administrators included, but
not the one taken over nor the account the request is authenticated as) a
**temporary password**: a configuration never carries passwords, so a
restored account has none until it is given one here. The wizard asks for
them one account at a time.

1. `422` for an invalid administrator, as above, or a non-boolean `ssh`;
   `422` too when `users` does not name exactly the accounts waiting, or one
   of their passwords is not acceptable (the message starts with its name)
2. `ssh: true` enables and starts the SSH service; either way
   `system.ssh_enabled` records the choice
3. `system.edition` becomes the edition running here: the configuration may
   come from another one's install (a FreeBSD pool restored on Artix); the
   Samba usershare directory is prepared, as for a new system — before
   2026-10-15 a restored system with no share could not create one
   (`net usershare: cannot open usershare directory`)
4. Each restored account gets its temporary password, for the system and
   Samba, and has it expired (`users.password_expire`: `chage -d 0` on
   Linux, `pw usermod -p 1` on FreeBSD), so it must be changed before the
   account is used; its entry records `temporary_password: true` until its
   owner changes it ([`/api/account/password`](users.md#post-apiaccountpassword))
5. The administrator as in step 5 above. A name that already has an account
   (one the restore created) is taken over, not created: it gets the
   password, and its restored entry keeps its fields and gains `admin`. A
   removed shipped account also leaves `config.yaml`
6. The `setup-pending` file is removed, and `shadow.sync` copies the
   configuration to the external copies

The password changes last. When an earlier step fails the route answers
`500` and the password the wizard was opened with still works, so the
wizard can simply be run again; changed first, the browser's next request
got `401` and sent the user back to a wizard that no longer accepted the
password it knew. Verified on the real test box (Void): a forced failure
of the SSH step left the old password working and the restore pending; the
next attempt completed.

```json
{
  "detail": "System restored",
  "hostname": "oldnas",
  "admin": "sarah",
  "temporary_passwords": ["mario"]
}
```

`temporary_passwords` lists the accounts given one.

!!! note
    Neither an image nor an installation creates a `.freedomnas` dataset, so
    every first boot lands here: on the wizard, or on the restore when a pool
    held a configuration. An installation leaves its answers in an
    uninitialized `config.yaml` in the state directory; the wizard's
    `shadow.activate` moves it onto the pool chosen for `.freedomnas`.
