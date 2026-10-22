# Init Profiles

Init profiles live in `init/init-{name}.json` (renamed from `init/{name}.json`)
and contain **only** the `services` category. No other profile fragment
(`os/`, or any per-module fragment — see [OS Profiles](os-profiles.md)) ever
includes a `services` key.

## Available Init Profiles

| File | Init system | Used on |
|------|-------------|---------|
| `init/init-systemd.json` | systemd | Debian, Ubuntu, Arch, Fedora, … |
| `init/init-openrc.json` | OpenRC | Artix (openrc), Alpine, Gentoo, … |
| `init/init-runit.json` | runit | Void Linux, Artix (runit), … — through `assets/runitctl`, see below |
| `init/init-s6.json` | s6 | Artix (s6), … |
| `init/init-dinit.json` | dinit | Artix (dinit), … |
| `init/init-bsd_rc.json` | bsd_rc (rc.d) | FreeBSD, DragonFlyBSD |

## Structure

```json
{
  "init_name": "systemd",
  "services": {
    "start":        "systemctl start {service_name}",
    "stop":         "systemctl stop {service_name}",
    "restart":      "systemctl restart {service_name}",
    "enable":       "systemctl enable {service_name}",
    "disable":      "systemctl disable {service_name}",
    "status":       "systemctl is-active {service_name}",
    "is_enabled":   "systemctl is-enabled {service_name}",
    "reload":       "systemctl reload {service_name}",
    "daemon_reload":"systemctl daemon-reload",
    "list_managed": "systemctl list-units --type=service --no-pager --plain --no-legend"
  }
}
```

## Command Comparison

| Action | systemd | openrc | runit | s6 | dinit | bsd_rc |
|--------|---------|--------|-------|-----|-------|--------|
| start | `systemctl start {svc}` | `rc-service {svc} start` | `runitctl start {svc}` | `s6 live start {svc}` | `dinitctl start {svc}` | `freedomnas-rc-service start {svc}` (see below) |
| stop | `systemctl stop {svc}` | `rc-service {svc} stop` | `runitctl stop {svc}` | `s6 live stop {svc}` | `dinitctl stop {svc}` | `service {svc} stop` |
| restart | `systemctl restart {svc}` | `rc-service {svc} restart` | `runitctl restart {svc}` | `s6 live restart {svc}` | `dinitctl restart {svc}` | `freedomnas-rc-service restart {svc}` |
| enable | `systemctl enable {svc}` | `rc-update add {svc} default` | `runitctl enable {svc}` | `s6 set enable -p {svc}`, `s6 set commit`, `s6 live install -b` | `dinitctl enable {svc}`, accepting "already enabled" | `service {svc} enable` |
| enable_early | — | `rc-update add {svc} sysinit` | — | — | — | — |
| enable_offline | — | — | link from `/etc/sv` or `/etc/runit/sv` into `/etc/runit/runsvdir/default` | `s6 set enable -p {svc}`, `s6 set commit` | `dinitctl --offline enable {svc}`, accepting "already enabled" | — |
| status | `systemctl is-active {svc}` | `rc-service {svc} status` | `runitctl status {svc}` | `s6 live status {svc}` | `dinitctl status {svc}` | `service {svc} status` |
| list_all | `systemctl list-unit-files --type=service`, names without `.service` or templates | `rc-service --list` | `runitctl list-available`: service directories with a `run` file | directories in `/etc/s6/sv` | files in `/etc/dinit.d` | `service -l` |
| is_running | `systemctl is-active --quiet {svc}` | `rc-service {svc} status` | `runitctl is-running {svc}` | `s6 live status {svc}` says `up` | `dinitctl is-started {svc}` | `freedomnas-rc-service running {svc}` |

**bsd_rc.** `service {svc} enable|disable|enabled` let rc.subr use the
script's own rcvar. It is not always `{svc}_enable`: `/etc/rc.d/nfsd` reads
`nfs_server_enable`, so `sysrc nfsd_enable=YES` did nothing and
`service nfsd start` refused to run.

`start`, `restart` and `is_running` go through
`profiles/assets/freedomnas-rc-service`. A service started through
daemon(8) (appjail-dns, appjail-health…) keeps the output it was given
open, so the engine, which reads the command's output to its end, waited
until its 30 s timeout although the service was up. The script sends the
rc script's output to a file instead, then checks that the service really
runs: `service {svc} onestatus` for up to 15 s; when it does not, the
command fails with the rc script's own output plus "not running 15s after
start". `start` does nothing for a service that already runs
(`service samba_server start` exits 1 then). Two exceptions, written in the
script: `samba_server` is checked by its `smbd`, because its `status`
counts winbindd too, which a standalone server does not run (it reported
Samba stopped before); `appjail-natnet` and `appjail-health` finish once
their work is done, so only their exit code counts. Verified on FreeBSD
15.1 through the engine: daemon(8) services start at once, a broken
configuration (dnsmasq) and a disabled service (zfsd) fail with their
message, a reboot reconciles without failures.

**runit.** Every runit command goes through `profiles/assets/runitctl`, a
POSIX sh wrapper that finds the layout at run time instead of a profile per
distribution:

- the directory runsvdir watches is the argument after `-P` of the
  `runsvdir` whose parent is PID 1, read from `/proc` (Void
  `/run/runit/runsvdir/current`, Artix `/run/runit/service`, Debian and
  Devuan `/etc/service`); `sv` gets that path;
- enabling writes into the persistent directory behind it (`readlink -f`:
  `/etc/runit/runsvdir/default` on Void, Artix and Debian,
  `/etc/runit/runsvdir/svmanaged` on Devuan);
- service sources are looked up in `/etc/sv`, `/etc/runit/sv` and
  `/usr/share/runit/sv.current`;
- with `--root DIR` it works offline on a mounted system: the directory is
  read from `DIR/etc/runit/2` and resolved inside DIR.

`enable` and `disable` are idempotent; a link to another existing service
is refused, a dangling one replaced, a service already linked under another
name (Artix's `logind` → `elogind`) or through a relative link
(`dbus -> ../../sv/dbus`) counts as enabled. runsvdir notices a newly linked
service only on its next scan, every 5 s, and until its runsv is up `sv`
fails ("unable to open supervise/control"), so `start`, `stop` and
`restart` wait up to 15 s (`RUNITCTL_WAIT`) for runsv, then for the state,
and fail if it is not reached. runit reports uptime in whole seconds: a
`sv restart` within a second of a start answered ok before the old process
had gone, so `restart` waits for a new pid. `is-enabled` and `is-running`
answer with their exit status only; the profile turns that into `yes`.

`enable_offline` and `disable_offline` run in the installer's chroot,
before FreedomNAS — and runitctl — is installed there and with no runsvdir
running: they link from whichever of `/etc/sv` and `/etc/runit/sv` holds the
service into `/etc/runit/runsvdir/default`, which Void and Artix boot from.

Tests: `freedomnas-profiles/tests/runitctl/run.sh` builds Void, Artix,
Debian and Devuan containers with their own runit packages, runs each
distribution's `/etc/runit/2` under `docker --init` (so runsvdir's parent is
PID 1, as on a real boot) and runs `cases.sh` (runitctl itself) and
`profile.sh` (every command of `init-runit.json`, formatted by the engine).

`list_all`, `is_running` and `is_enabled` feed the WebUI's
[Services API](../api/services.md). The last two print `yes` when the
answer is yes rather than failing otherwise, so listing services does not
log a failed command for every stopped one. `sv status` exits 0 for a
stopped service too, hence runitctl's `run:` test. Verified on Void
(runit), on FreeBSD 15.1 (bsd_rc) and, for `rc-service --list`, on OpenRC;
the dinit, s6 and systemd lines are not tested on a running system yet.

**s6.** Artix runs s6 through s6-frontend: the stores (`/etc/s6/sv`,
`/etc/s6/adminsv`) are compiled into a working set, so enabling is
`s6 set enable` followed by `s6 set commit` and `s6 live install`
(`s6-rc-set-commit` exits 0 when nothing changed). `s6 live` starts and stops
bundles and oneshots as well as longruns, with their dependencies; the old
`s6-svc /run/service/{svc}` only reached longruns, while package services
such as samba-s6 are bundles (`smbd` = `smbd-srv` + `smbd-log`).
`is_enabled` reads the prescription from `s6 set status` (`active` or
`always`). The old `s6-service add default` targeted the pre-s6-frontend
`adminsv/default` bundle, and its `delete` verb did not exist (`del`).
s6 is not yet offered by the installer; after the first enable in a chroot,
`s6 live install --init` is still needed (see the Artix notes).

`enable_early` and `enable_offline` are optional and used by the installer only.
`enable_early` is for the services a package category lists under
`early_services` — importing and mounting pools — and puts them in OpenRC's
`sysinit` runlevel, as Gentoo does, so the pools are there before anything in
`boot` or `default` starts. `enable_offline` is for enabling inside a chroot,
where dinit has no running daemon to ask. An init without either key gets the
plain `enable` for both.

## How Merging Works

At engine startup:

1. `os/os-<name>.json` is loaded as the base (e.g. `os/os-debian.json`)
2. Every other profile subdirectory is scanned and its `<dir>-<name>.json`
   fragment merged in (see [OS Profiles](os-profiles.md))
3. Init system is detected (e.g. `systemd`)
4. `init/init-<init>-<edition>.json` is loaded if it exists, otherwise
   `init/init-<init>.json`
5. The `services` key from the init profile is injected into the merged
   profile dict, last
6. `engine.execute("services", "start", service_name="smbd")` now works

This separation means:
- One set of OS/module fragments can be used with any compatible init system
- Adding a new init system only requires one new JSON file

### When one init needs two profiles

The same init does not always mean the same paths, so the engine loads
`init/init-<init>-<edition>.json` first when it exists. No edition needs one
today: runit used to (`init-runit-artix.json`, for Artix's `/etc/runit/sv`
and `/etc/runit/runsvdir/default`), until runitctl started finding the
layout by itself.
