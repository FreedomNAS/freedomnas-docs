# Updates

The Updates page manages system package updates using **Topgrade**.

## How Updates Work

FreedomNAS uses [Topgrade](https://github.com/topgrade-rs/topgrade) as its
update engine. Topgrade auto-detects the package manager (apt, pacman, pkg,
etc.) and updates:

- System packages
- Docker / Podman containers
- Firmware

!!! note
    Topgrade is intentionally restricted to these three categories.
    It does not update pip packages, npm, cargo, or other language runtimes
    — those are outside the scope of a NAS appliance.

## Update Status Card

The status card shows the number of packages with available updates.
This count is queried from the package manager using the profile key
`packages.list_updatable`.

Click **Check for Updates** to refresh the count.

## Running Updates

1. Click **Run Updates**
2. A confirmation dialog appears
3. Click **Confirm** to start

The WebUI connects to the WebSocket terminal (`/ws/updates/terminal`) and
streams Topgrade output line by line. You can see exactly what is being
updated in real time.

When the update finishes, the terminal shows a success or failure status.

### Pre-Update Snapshots

If **auto-snapshot** is enabled in the configuration, FreedomNAS creates a
ZFS snapshot of your datasets before running Topgrade:

```
datapool@pre-update-YYYYMMDD
```

This gives you a rollback point if an update causes problems.

## Configuring Updates

!!! info "Advanced level required"
    The **Configure** button is only visible at **Advanced** UI level and above.

Click **Configure** to open the configuration modal:

| Setting | Description |
|---------|-------------|
| **Auto-snapshot before updates** | Create ZFS snapshot before each update run |
| **Enabled steps** | Which Topgrade steps to run: `system`, `containers`, `firmware` |

Changes write `/etc/freedomnas/topgrade.toml`:

```toml
[misc]
assume_yes = false
disable_tmux = true
no_retry = true

[unstable]
only = ["system", "containers", "firmware"]

[notifications]
enable = false
```

## Terminal

The terminal panel (bottom of the Updates page) shows the live output of
Topgrade. Each line is coloured by type:

- Normal output — white
- Warnings — yellow
- Errors — red
- Section headers — blue/bold

The terminal is **read-only** — it is not an interactive shell. It only
shows update progress.
