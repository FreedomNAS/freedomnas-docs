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
  "edition": null,
  "detected_edition": "debian"
}
```

`detected_edition` is the profile the engine detected (`engine.os_type`).

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
| `admin.remove_default` | no | With a new `username`: remove the account the request is authenticated as. If false, it is kept and gets the new password too, so the shipped one works nowhere |
| `pool` | no | A data pool to create, exactly as [`POST /api/storage/pools`](storage.md) takes it (`name`, `vdev_type`, `devices`, `encrypted`, `master_passphrase`, cache and log devices) |
| `state_pool` | yes | The pool that keeps `.freedomnas`: an imported pool, or the one `pool` creates |

**Behaviour**, in this order — everything that can be checked is checked
before anything changes:

1. `409` if the system is already initialized
2. `422` for an invalid hostname, timezone, edition, administrator or a
   `state_pool` that is neither imported nor being created
3. If `pool` was given, it is created through the Storage route, which
   validates it (`422` before anything else changes) and gives it a
   `.freedomnas` dataset
4. `system.hostname_set`, `system.timezone_set`, the Samba usershare
   directory and `smb.conf` stanza
5. The administrator: `users.create` with the edition's sudo group for a
   new name, then its password through `users.set_password_stdin`; the old
   account removed (`users.delete`) or given the same password
6. `system.ssh_enabled: false` in `config.yaml` (SSH is off on fresh
   systems; see [`/api/system/ssh`](system.md))
7. `config.mark_initialized(edition, initialized_by="webui")`
8. `shadow.activate(engine, state_pool)`: creates `<state_pool>/.freedomnas`
   if needed, moves the configuration written so far from the plain state
   directory into it, removes the copies left on the root filesystem and
   mounts the dataset in their place

**Response:**

```json
{
  "detail": "System initialized",
  "hostname": "mynas",
  "edition": "debian",
  "admin": "sarah",
  "state_dataset": "tank/.freedomnas"
}
```

**Errors:** `401` without an administrator's credentials, `409`, `422` as
above, `500` when an engine, configuration or pool step fails partway —
the system then stays uninitialized.

!!! note
    A system installed with the installer is initialized
    (`initialized_by: "installer"`) and has its `.freedomnas` on the root
    pool already; `setup.js` sends it to the dashboard. Images are built in
    the installer's image mode, which creates the shipped administrator but
    no `.freedomnas` and no configuration, so their first boot lands here.
