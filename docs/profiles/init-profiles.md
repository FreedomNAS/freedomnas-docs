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
| `init/init-runit.json` | runit | Void Linux, … |
| `init/init-runit-artix.json` | runit | Artix (runit) — different paths, see below |
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
| start | `systemctl start {svc}` | `rc-service {svc} start` | wait for `sv status {svc}`, then `sv start {svc}` | `s6 live start {svc}` | `dinitctl start {svc}` | `service {svc} status \|\| service {svc} start` |
| stop | `systemctl stop {svc}` | `rc-service {svc} stop` | `sv stop {svc}` | `s6 live stop {svc}` | `dinitctl stop {svc}` | `service {svc} stop` |
| restart | `systemctl restart {svc}` | `rc-service {svc} restart` | wait for `sv status {svc}`, then `sv restart {svc}` | `s6 live restart {svc}` | `dinitctl restart {svc}` | `service {svc} restart` |
| enable | `systemctl enable {svc}` | `rc-update add {svc} default` | `ln -sfn /etc/sv/{svc} /var/service/{svc}` | `s6 set enable -p {svc}`, `s6 set commit`, `s6 live install -b` | `dinitctl enable {svc}`, accepting "already enabled" | `service {svc} enable` |
| enable_early | — | `rc-update add {svc} sysinit` | — | — | — | — |
| enable_offline | — | — | — | `s6 set enable -p {svc}`, `s6 set commit` | `dinitctl --offline enable {svc}`, accepting "already enabled" | — |
| status | `systemctl is-active {svc}` | `rc-service {svc} status` | `sv status {svc}` | `s6 live status {svc}` | `dinitctl status {svc}` | `service {svc} status` |
| list_all | `systemctl list-unit-files --type=service`, names without `.service` or templates | `rc-service --list` | directories in `/etc/sv` (aliases like `crond → cronie` left out) | directories in `/etc/s6/sv` | files in `/etc/dinit.d` | `service -l` |
| is_running | `systemctl is-active --quiet {svc}` | `rc-service {svc} status` | `sv status {svc}` starts with `run:` | `s6 live status {svc}` says `up` | `dinitctl is-started {svc}` | `service {svc} onestatus` |

**bsd_rc.** `service {svc} enable|disable|enabled` let rc.subr use the
script's own rcvar. It is not always `{svc}_enable`: `/etc/rc.d/nfsd` reads
`nfs_server_enable`, so `sysrc nfsd_enable=YES` did nothing and
`service nfsd start` refused to run. `start` checks `status` first because
`service samba_server start` exits 1 when Samba is already running.
Verified on FreeBSD 15.1 with samba416.

**runit.** runsvdir notices a newly linked service only on its next scan,
every 5 s, and until that service's runsv is up `sv` fails — "unable to
open supervise/control", or "runsv not running" when a `supervise/`
directory is left from an earlier run. Enabling SSH in the restore wizard
and starting it right away therefore answered 500 on Void. `start` and
`restart` wait up to 15 s for `sv status` to answer while the service is
linked. Verified on the real test box with Void: 2–5 s, every time.

`list_all`, `is_running` and `is_enabled` feed the WebUI's
[Services API](../api/services.md). The last two print `yes` when the
answer is yes rather than failing otherwise, so listing services does not
log a failed command for every stopped one. `sv status` exits 0 for a
stopped service too, hence the `run:` test on runit. Verified on Void
(runit) and, for `rc-service --list`, on OpenRC; the dinit, s6, bsd_rc and
systemd lines are not tested on a running system yet.

`enable` is `ln -sfn`: enabling a service that is already enabled must
not fail (plain `ln -s` answered "File exists"), and without `-n` a second
`ln -sf` follows the existing link into the service directory and leaves a
stray `/etc/sv/<svc>/<svc>` link there. The same holds for Artix's
`init-runit-artix.json`. Verified on the real test box (Void): enabling and
starting a service twice, and enabling the running `sshd`, succeed without
restarting it or leaving a stray link.

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

The same init does not always mean the same paths. runit services live in
`/etc/sv` on Void and are enabled into `/var/service`; on Artix, where
runit comes with `runit-rc`, they live in `/etc/runit/sv` and are enabled
by a symlink into `/etc/runit/runsvdir/default` (`/run/runit/service`,
which `sv` is pointed at with `SVDIR`, is a symlink to the same place
once stage 2 has run). That is what `init-runit-artix.json` is for: the
per-edition file wins where it exists, and every other edition keeps the
shared one.
