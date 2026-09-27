# System API

## GET /api/system/status

Health check — always accessible, no auth required.

**Response:**

```json
{ "status": "ok" }
```

---

## GET /api/system/info

Returns OS and system identity information.

**Auth required:** yes

**Response:**

```json
{
  "hostname": "freedomnas",
  "edition": "debian",
  "timezone": "Europe/Rome",
  "uptime_since": "up 3 days, 14:22",
  "initialized": true,
  "version": "1.0+20260927134226.bc74e68",
  "init_system": "systemd",
  "firmware": "UEFI"
}
```

- `timezone` — live read via `system.timezone_get` profile command
- `uptime_since` — live read via `system.uptime` profile command
- `edition` — read from `config.yaml`
- `initialized` — `config.is_initialized()`
- `version` — the `VERSION` file next to the WebUI, written by its package;
  `null` when there is none (a checkout)
- `init_system` — the init system the engine detected
- `firmware` — live read via the `bootloader.firmware_mode` profile command,
  `null` if the profile has none

The last three are what the offline documentation shows and matches the
system against — see [WebUI Internals](../developer/webui.md#offline-documentation).

---

## POST /api/system/hostname

Set the system hostname (spec §7.5 dual write).

**Auth required:** yes

**Request body:**

```json
{ "hostname": "nas-server" }
```

**Behaviour:**

1. `engine.execute("system", "hostname_set", hostname="nas-server")`
2. `config.set_hostname("nas-server")`

**Response:**

```json
{ "hostname": "nas-server" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 422 | `hostname` is missing or empty |
| 500 | Engine command failed |

---

## POST /api/system/timezone

Set the system timezone (spec §7.5 dual write).

**Auth required:** yes

**Request body:**

```json
{ "timezone": "Europe/Rome" }
```

**Behaviour:**

1. The name is checked: every `/`-separated part starts with a letter and
   holds only letters, digits, `_`, `+` and `-`; where the host has a zone
   database (`zoneinfo.available_timezones()`), the name must be in it.
   Several editions set the zone with
   `ln -sf /usr/share/zoneinfo/{timezone} /etc/localtime`, so the name is a
   path there — `../../../etc/shadow` or an option must never reach it.
2. `engine.execute("system", "timezone_set", timezone="Europe/Rome")`
3. `config.set("system.timezone", "Europe/Rome")` — only after the OS accepted it

**Response:**

```json
{ "timezone": "Europe/Rome" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 422 | `timezone` is missing, is not a timezone name, or is unknown to this host |
| 500 | Engine command failed; the configuration is left unchanged |

---

## GET /api/system/ssh

**Auth required:** yes

`{"enabled": false, "service": "sshd"}` — `enabled` as `config.yaml`
records it (`system.ssh_enabled`), `service` the edition's
`system.ssh_service` (`ssh` on Debian, `sshd` elsewhere).

## POST /api/system/ssh

**Auth required:** yes

`{"enabled": true}` enables and starts the service through the init
profile (`services.enable`, `services.start`); `{"enabled": false}` stops
and disables it. The result is then written to `system.ssh_enabled` (dual
write), which disaster recovery reapplies. `422` unless `enabled` is a
boolean; `500` when enabling fails, and nothing is recorded then.

SSH is off on every fresh system: the installer does not enable it and
disables it explicitly where the package turns it on by itself (Debian's
`openssh-server`), and the setup wizard records it as off.

---

## POST /api/system/reboot

Reboot the system.

**Auth required:** yes

Calls `engine.execute("system", "reboot", check=False)`.
The response is sent before the command executes.

**Response:**

```json
{ "detail": "Rebooting" }
```

---

## POST /api/system/shutdown

Power off the system.

**Auth required:** yes

Calls `engine.execute("system", "shutdown", check=False)`.
The response is sent before the command executes.

**Response:**

```json
{ "detail": "Shutting down" }
```


---

## `GET /api/system/config`

Download this appliance's configuration as YAML.

**Auth required:** yes

Returns `config.yaml` as an attachment named `<hostname>-config.yaml`
(`application/x-yaml`). It is the same desired state the reconciler reads at
first boot: hostname, timezone, users, shares, pools, features and snapshot
policies.

---

## `POST /api/system/config`

Load a configuration back and apply it.

**Auth required:** yes

The body is the YAML itself (no form encoding). What happens, in order:

1. the YAML is parsed — `422` if it is not valid YAML or not a mapping;
2. it is validated and saved by `ConfigurationManager.save()`, which refuses
   a file missing required sections — `422`, and **the running configuration
   is put back** untouched;
3. `ReconciliationEngine.reconcile(mode="declarative")` applies it, in a
   worker thread so the event loop keeps serving.

**Response:**

```json
{
  "applied": ["system.hostname_set", "users.create"],
  "skipped": ["zfs.pool_import"],
  "failed":  []
}
```

This is restore-by-re-applying, not restore-by-copying-files back: the same
path the appliance uses when it finds a `.freedomnas` dataset at boot.
