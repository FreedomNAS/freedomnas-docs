# Init Profiles

Init profiles live in `init/{name}.json` and contain **only** the `services`
category. OS profiles never include a `services` key.

## Available Init Profiles

| File | Init system | Used on |
|------|-------------|---------|
| `init/systemd.json` | systemd | Debian, Ubuntu, Arch, Fedora, … |
| `init/openrc.json` | OpenRC | Artix (openrc), Alpine, Gentoo, … |
| `init/runit.json` | runit | Void Linux, Artix (runit), … |
| `init/s6.json` | s6 | Artix (s6), … |
| `init/dinit.json` | dinit | Artix (dinit), … |
| `init/bsd_rc.json` | bsd_rc (rc.d) | FreeBSD, DragonFlyBSD |

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
| start | `systemctl start {svc}` | `rc-service {svc} start` | `sv start {svc}` | `s6-svc -u /var/run/s6/services/{svc}` | `dinitctl start {svc}` | `service {svc} start` |
| stop | `systemctl stop {svc}` | `rc-service {svc} stop` | `sv stop {svc}` | `s6-svc -d /var/run/s6/services/{svc}` | `dinitctl stop {svc}` | `service {svc} stop` |
| restart | `systemctl restart {svc}` | `rc-service {svc} restart` | `sv restart {svc}` | `s6-svc -t /var/run/s6/services/{svc}` | `dinitctl restart {svc}` | `service {svc} restart` |
| enable | `systemctl enable {svc}` | `rc-update add {svc} default` | `ln -s /etc/sv/{svc} /var/service/` | `s6-rc-bundle-update add default {svc}` | `dinitctl enable {svc}` | `sysrc {svc}_enable=YES` |
| status | `systemctl is-active {svc}` | `rc-service {svc} status` | `sv status {svc}` | `s6-svstat /var/run/s6/services/{svc}` | `dinitctl status {svc}` | `service {svc} status` |

## How Merging Works

At engine startup:

1. OS profile is loaded (e.g. `debian.json`)
2. Init system is detected (e.g. `systemd`)
3. `init/systemd.json` is loaded
4. The `services` key from the init profile is injected into the OS profile dict
5. `engine.execute("services", "start", service_name="smbd")` now works

This separation means:
- One OS profile can be used with any compatible init system
- Adding a new init system only requires one new JSON file
