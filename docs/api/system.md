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

## GET /api/system/health

Each FreedomNAS module's health, and why.

**Auth required:** yes

```json
{
  "modules": [
    { "id": "network", "name": "Network", "state": "healthy",   "detail": "enp3s0 up" },
    { "id": "shares",  "name": "Shares",  "state": "unhealthy", "detail": "smbd not running" },
    { "id": "storage", "name": "Storage", "state": "healthy",   "detail": "2 pool(s) online" },
    { "id": "updates", "name": "Updates", "state": "healthy",   "detail": "topgrade configured" },
    { "id": "users",   "name": "Users",   "state": "healthy",   "detail": "3 account(s) present" }
  ]
}
```

Every module `ModuleLoader.instances()` finds for this edition — community
modules included — is started (which only reads the configuration), asked
`health()`, and dropped: no orchestrator runs on an appliance, so nothing
keeps modules alive between requests. `state` is `healthy`, `unhealthy`,
`error` when the module raised, with the exception as `detail`, or `failed`
for a module that could not be loaded at all (malformed manifest, code that
does not import, constructor that raises, profile fragment left out), with
the reason as `detail` — the dashboard shows it as **Not loaded**. The
commands run in a worker thread. `500` only when the modules directory
cannot be found.

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

The name is not checked further here, unlike in the setup wizard: on
editions where `system.hostname_set` is plain `hostname {hostname}` (Artix,
Gentoo, Void), that command only changes the running name — the persistent
one is written by the installer, and the reconciler sets the recorded name
again at every boot.

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

## GET /api/system/certificate

**Auth required:** yes

```json
{
  "ca_fingerprint": "3F:1A:…",
  "fingerprint": "9A:8C:…",
  "names": ["nas", "nas.local", "localhost"],
  "addresses": ["127.0.0.1", "::1", "192.168.1.200"],
  "expires": "2028-12-31T10:00:00+00:00"
}
```

The SHA-256 fingerprints of FreedomNAS's certificate authority and of the
WebUI's certificate, the names and addresses the certificate covers and when
it expires. `ca_fingerprint` is `null` on a certificate from before the CA
(until the next boot); `404` when there is no certificate at all.

## GET /freedomnas-ca.crt

**Auth required:** no

The CA's certificate (PEM, `application/x-x509-ca-cert`), to install on
computers and phones as a trusted authority. Outside `/api/`, so it answers
before setup too; `404` until the CA exists.

---

## GET /api/system/boot

The automatic rollback: its setting, the boot state, and the last rollback.

```json
{
  "supported": true,
  "autorollback": true,
  "state": "ok",
  "rollback": {
    "date": "20261009-101500",
    "failed_kernel": "6.12.111+deb13-amd64",
    "restored_kernel": "6.18.54-3-freedomnas",
    "reason": "the initramfs reached the emergency shell",
    "snapshot": "rpool/ROOT/debian@pre-update-20261009-100000",
    "system_restored": true,
    "failed_dataset": "rpool/ROOT/debian-failed-20261009-101500"
  },
  "kernel": { "running": "6.18.54-3-freedomnas", "installed": "6.18.60-1-freedomnas" },
  "reboot_needed": true
}
```

On FreeBSD `rollback` has instead `date`, `failed_system` (the updated boot
environment that did not finish starting) and `restored_system`, and while
an updated copy waits for the restart `state` is `trial` and
`trial_system` names it (`reboot_needed` is then true).

`supported` is false where the edition has neither a UKI nor updates into a
boot environment. `state` is
`ok`, `trial` (a new kernel not yet confirmed), `fallback-requested` or
`rolled-back`. `rollback` is `null` when nothing was rolled back or the
record was cleared. `failed_dataset` is empty unless it names a
`…-failed-YYYYmmdd-HHMMSS` dataset.

`kernel.running` is the running kernel's release (`uname -r`).
`kernel.installed` is the kernel the next boot starts: the active UKI's,
which `zz-dracut-uki --state` prints as `active-kernel` from
`<uki>.kernel` on the ESP, or on FreeBSD `bootloader.kernel_installed`
(`freebsd-version -k`); empty when unknown (an install older than the
`.kernel` files). `reboot_needed` is true when the two differ: the pages
then show the reboot notice.

## POST /api/system/boot/autorollback

```json
{ "enabled": false }
```

Writes `boot.state` on the ESP (`bootloader.autorollback_set`) and
`system.autorollback` in `config.yaml`. 422 if `enabled` is not a boolean,
409 on an edition with neither. On FreeBSD only `config.yaml` is written: the
setting decides whether an updated copy starts on trial or at once. Returns
the same body as `GET /boot`.

## POST /api/system/boot/forget

```json
{ "destroy_failed": true }
```

Clears the record of the last rollback (`bootloader.rollback_forget`, which
also deletes `-failed.efi`), so the dashboard notice goes and the failed
kernel may be built again. With `destroy_failed`, the failed root dataset is
destroyed first (`zfs.dataset_destroy_recursive`) — only a name matching
`…-failed-YYYYmmdd-HHMMSS`. On FreeBSD it clears the record in
`<state>/bootenv.json` and `destroy_failed` destroys the failed boot
environment. Returns `{"destroyed": <dataset or null>, …GET /boot}`.

## GET /api/system/boot-environments

The boot environments (FreeBSD; `{"supported": false, "environments": []}`
elsewhere), oldest first:

```json
{ "supported": true, "environments": [
  { "name": "update-20261101-080147", "running": true, "next_boot": true, "once": false,
    "space": "3.31G", "created": "2026-11-01 08:01", "ours": true }
] }
```

`next_boot` with `once` is a copy that starts at the next start only (an
update on trial). `ours` marks the copies FreedomNAS made and prunes.

## POST /api/system/boot-environments/{name}/activate

Makes it the boot environment that starts from the next start on
(`bootloader.be_activate`). A copy that is not running is mounted first and
any fixed `vfs.root.mountfrom` line is taken out of its `/boot/loader.conf`
(`bootloader.be_fix_loader`). 422 for an unknown name. Returns the list.

## DELETE /api/system/boot-environments/{name}

Destroys it (`bectl destroy -o`). 422 for the running one or the one that
starts next. Returns the list.

## GET /api/system/webui

Whether the WebUI must restart to run updated files, and what a restart
would stop.

**Auth required:** yes

```json
{
  "started": "2925-1791700055422177667",
  "restart_needed": true,
  "busy": { "updates": 0, "plugins": 0, "replication": 1 }
}
```

At start-up the WebUI takes a fingerprint (path, mtime and size of every
file) of `<root>/core`, `profiles`, `webui` and `modules`, leaving out
`__pycache__` and `.pyc`. `restart_needed` is true while the files now
installed differ from it, whoever installed them. `started` changes at every
start: the page compares it to know the restart is done. `busy.updates` is
the number of updates running in the terminal, `busy.plugins` 1 while a
module is installed or removed ([Plugins API](plugins.md)), `busy.replication`
the replication jobs running.

## POST /api/system/webui/restart

```json
{ "force": true }
```

Restarts the WebUI: writes the marker `<config_dir>/webui-restart`, answers,
then sends itself SIGTERM; `supervisor.sh` sees the marker and starts it
again without counting a failure. 409 while an update or a module install or
removal runs (stopping the WebUI would cut it off), and while replication jobs run unless `force` is
true. The body may be omitted.

```json
{ "detail": "Restarting", "started": "2925-1791700055422177667" }
```

## POST /api/system/reboot

Reboot the system.

**Auth required:** yes

Calls `engine.execute("system", "reboot", check=False)` and answers once
the command has returned — the reboot itself follows, so the response
usually arrives before the connection drops.

**Response:**

```json
{ "detail": "Rebooting" }
```

---

## POST /api/system/shutdown

Power off the system.

**Auth required:** yes

Calls `engine.execute("system", "shutdown", check=False)` and answers once
the command has returned; the power-off follows.

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
   worker thread so the event loop keeps serving. Declarative means
   **exactly**: accounts, SMB shares and NFS exports the file does not name
   are removed — never an administrator, never a pool, and a removed
   account keeps its home directory. See
   [Reconciliation Engine](../architecture/reconciler.md).

**Response:**

```json
{
  "applied": ["system.hostname_set", "users.create", "samba.create_share"],
  "skipped": [],
  "failed":  [],
  "warnings": []
}
```

`warnings` lists what could not be done without being a failure: an account
asking for a group this edition does not have.

This is restore-by-re-applying, not restore-by-copying-files back: the same
path the appliance uses when it finds a `.freedomnas` dataset at boot.
