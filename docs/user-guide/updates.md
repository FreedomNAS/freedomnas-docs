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

The **Update Status** card shows how many packages have updates waiting.
Counting them takes milliseconds with apt and minutes with Portage, so the
page never waits for it: it shows the last count the system has (hover it
for when it was taken) and, when that count is more than an hour old, a new
one is taken in the background — the card says *(refreshing…)* and updates
itself when it is done. The command is the edition's
`packages.list_updatable`.

## Running Updates

Click **Run Updates**. There is no confirmation step: the run starts at
once, and the button reads *Updating…* until it ends.

The WebUI connects to the WebSocket terminal (`/ws/updates/terminal`) and
streams Topgrade output line by line. Only administrator accounts can run
updates; Topgrade runs as the logged-in user and calls `sudo` for the steps
that need it.

If you close the tab, the update keeps running to completion on the server.

When the update finishes, the terminal shows the exit code: `✓ Update
completed successfully (exit 0)` or `✗ Update exited with code N`.

### Pre-Update Snapshots

With **Create ZFS snapshot before updating** on (the default), FreedomNAS
takes a snapshot named `pre-update-YYYYmmdd-HHMMSS` of every pool recorded
in `config.yaml` before running Topgrade, and prints each one in the
terminal:

```
Snapshot created: datapool@pre-update-YYYYmmdd-HHMMSS
```

!!! warning "Not yet a rollback point for the system"
    The snapshot is taken of each pool's top dataset only, not recursively,
    and the system itself lives in `<pool>/ROOT/<edition>`: it is not in the
    snapshot. A system set up from an image does not record its root pool
    in `config.yaml` at all. Until this is fixed, take a recursive snapshot
    by hand (`zfs snapshot -r rpool@before-update`) if you want to be able
    to roll the system back.

## Configuring Updates

!!! info "Advanced level required"
    The **Configure** button is only visible at **Advanced** UI level and above.

Click **Configure** to open the configuration dialog:

| Setting | Description |
|---------|-------------|
| **Update Categories** | Which Topgrade steps to run: *System packages*, *Docker / Podman containers*, *Firmware (fwupd)* |
| **Create ZFS snapshot before updating** | The pre-update snapshots above |

**Save Configuration** writes the edition's `updates.topgrade_config`
(`/etc/freedomnas/topgrade.toml`, `/usr/local/etc/freedomnas/topgrade.toml`
on FreeBSD):

```toml
[misc]
assume_yes = true
no_retry = true
run_in_tmux = false
skip_notify = true
only = ["system", "containers", "firmware"]
```

Gentoo appends its own section, because Portage's default flags would stop
at a prompt. If nobody has saved a configuration yet, the first update run
writes one with all three steps.

## Terminal

The terminal panel shows the live output of Topgrade. Each line is
coloured by what it says:

- lines with `error` or `failed`, and everything on stderr — red
- lines with `warn` — yellow
- lines with `✓`, `success`, `done` or `up to date` — green
- lines starting with `==>`, `--` or `[` — blue
- everything else — plain

The terminal is **read-only** — it is not an interactive shell. It only
shows update progress.
