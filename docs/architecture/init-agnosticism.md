# Init System Agnosticism

FreedomNAS does not depend on any specific init system. It runs identically
on systemd, OpenRC, runit, s6, dinit, and bsd_rc.

## How the WebUI Starts

The WebUI is **not** installed as a systemd/OpenRC/runit service. Instead,
it uses a cron-based startup approach that works on any init system.

At installation, the packages write:

```
/etc/cron.d/freedomnas-webui
@reboot root /usr/lib/freedomnas/webui/supervisor.sh >> /var/log/freedomnas-webui.log 2>&1
```

`supervisor.sh` keeps the WebUI alive with a 5-failure circuit breaker:

```bash
FAILURES=0
MAX_FAILURES=5
while true; do
    uvicorn api.main:app --host 0.0.0.0 --port 8080
    EXIT_CODE=$?
    [ $EXIT_CODE -eq 0 ] && { FAILURES=0; continue; }
    FAILURES=$((FAILURES + 1))
    [ $FAILURES -ge $MAX_FAILURES ] && { echo "Circuit breaker: stopping"; exit 1; }
    sleep 5
done
```

## Service Management via Profiles

Init-system-specific service commands live in `init/{name}.json`.
The engine detects the running init system at startup and loads the
appropriate profile automatically.

=== "systemd"

    ```json
    {
      "services": {
        "start":  "systemctl start {service_name}",
        "stop":   "systemctl stop {service_name}",
        "enable": "systemctl enable {service_name}",
        "status": "systemctl is-active {service_name}"
      }
    }
    ```

=== "OpenRC"

    ```json
    {
      "services": {
        "start":  "rc-service {service_name} start",
        "stop":   "rc-service {service_name} stop",
        "enable": "rc-update add {service_name} default",
        "status": "rc-service {service_name} status"
      }
    }
    ```

=== "runit"

    ```json
    {
      "services": {
        "start":  "sv start {service_name}",
        "stop":   "sv stop {service_name}",
        "enable": "ln -s /etc/sv/{service_name} /var/service/",
        "status": "sv status {service_name}"
      }
    }
    ```

=== "bsd_rc"

    ```json
    {
      "services": {
        "start":  "service {service_name} start",
        "stop":   "service {service_name} stop",
        "enable": "sysrc {service_name}_enable=YES",
        "status": "service {service_name} status"
      }
    }
    ```

The core never checks which init system is running — it calls
`engine.execute("services", "start", service_name="smbd")` and the engine
resolves the correct command from the detected init profile.

## Init System Detection

The engine checks filesystem markers at startup in this order:

| Marker | Init system |
|--------|-------------|
| `/run/systemd/private` | systemd |
| `/run/openrc/started` | openrc |
| `/run/runit` | runit |
| `/run/s6` | s6 |
| `/run/dinit` | dinit |
| `/etc/rc.conf` | bsd_rc |

Falls back to the `init_system` field in the OS profile. Defaults to `systemd`.
