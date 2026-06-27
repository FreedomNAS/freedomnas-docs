# Installer Flow

The `freedomnas-installer` is a Python + dialog TUI that provisions a
complete ZFS-on-root system. It runs before the WebUI exists.

## Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `setup.py` | Orchestrator — defines and executes the 20-step install order |
| `installer_modules.py` | Logger, DialogManager (stderr-correct), Configuration, run_command helper |
| `disk_installer.py` | `lsblk` detection, `/dev/disk/by-id/` resolution, `sgdisk` layout |
| `zfs_installer.py` | bpool/rpool creation, dataset tree, `bootfs` flag |
| `system_installer.py` | Boot mode detection, mirror selection (14 countries), hostname, debootstrap, chroot bind mounts |
| `users_installer.py` | Admin double-prompt, additional users loop, `chpasswd` via stdin |
| `packages_installer.py` | `apt install` in chroot, `supervisor.sh` with circuit breaker |
| `bootloader_installer.py` | GRUB for UEFI/BIOS, `/etc/default/grub` with ZFS root, `update-grub` |

## Execution Order

See the [full installation guide](../getting-started/installation.md) for the
complete 20-step flow with details on each step.

## OS Detection

The installer auto-detects the OS using `platform.system()` and
`/etc/os-release`. It **never** asks the user to choose between editions.

## Recovery Mode

When the installer detects an existing ZFS pool with a `.freedomnas` dataset,
it offers disaster recovery:

1. Mount the `.freedomnas` dataset
2. Read `config.yaml`
3. Run `ReconciliationEngine` in `disaster_recovery` mode
4. Apply configuration in the fixed order (hostname → timezone → pools → users → services → shares)

## Supervisor Script

`packages_installer.py` writes `supervisor.sh` to `/usr/lib/freedomnas/webui/`:

```bash
#!/bin/sh
FAILURES=0
MAX_FAILURES=5

while true; do
    cd /usr/lib/freedomnas/webui
    uvicorn api.main:app --host 0.0.0.0 --port 8080
    EXIT_CODE=$?

    if [ "$EXIT_CODE" -eq 0 ]; then
        FAILURES=0
        continue
    fi

    FAILURES=$((FAILURES + 1))
    echo "$(date): WebUI exited with code $EXIT_CODE (failure $FAILURES/$MAX_FAILURES)"

    if [ "$FAILURES" -ge "$MAX_FAILURES" ]; then
        echo "$(date): Circuit breaker triggered — supervisor stopping"
        exit 1
    fi

    sleep 5
done
```

And writes `/etc/cron.d/freedomnas-webui`:

```
@reboot root /usr/lib/freedomnas/webui/supervisor.sh >> /var/log/freedomnas-webui.log 2>&1
```

## DialogManager Notes

- All dialog calls use `stderr=PIPE` for correct output capture
  (dialog writes to stderr, not stdout)
- No `shell=True` in any `run_command` call
- Passwords are collected with `--passwordbox` and never logged
