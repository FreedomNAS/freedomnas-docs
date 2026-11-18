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

### FreeBSD: the update goes into a copy of the system

On FreeBSD the update does not touch the running system. FreedomNAS makes a
new copy of it (a boot environment, `update-YYYYmmdd-HHMMSS`), installs the
update into that copy and leaves the running system as it is:

```
Making a copy of the system to install the update into...
Copy update-YYYYmmdd-HHMMSS ready at /tmp/freedomnas-be: the running system is not touched
```

1. `pkg` upgrades everything inside the copy in one go: the base system
   (kernel and userland, installed as packages from FreeBSD's `FreeBSD-base`
   repository, known as *pkgbase*) and the other packages, FreedomNAS's own
   included.
2. A system installed before FreedomNAS used pkgbase (from `base.txz` and
   `kernel.txz`, updated with `freebsd-update`) is converted at its first
   update: inside the copy, the base system packages matching what is
   installed are registered and installed over it, keeping the changes made
   to the files in `/etc`. The log says *The base system is not installed as
   packages yet: converting it (pkgbase)*. The conversion downloads a few
   hundred MB, and goes on trial like any update: if the converted system does
   not start, the system from before comes back by itself.
3. If nothing changed, the copy is deleted: *Nothing to update*. If a step
   failed, the copy is deleted too and the running system was never touched.
4. Otherwise the copy starts **once, on trial**, at the next restart, and the
   pages show *An update is ready* with a **Reboot now** button.

When the updated system finishes starting, it becomes the system that always
starts. If it does not get that far (a panic restarts the machine by itself;
a system that hangs needs to be switched off and on), the start after it
goes back to the system from before, and the dashboard says so (see
[Dashboard](dashboard.md#rollback-notice)). With
[Automatic Rollback](system.md#automatic-rollback) off, the copy becomes the
system that always starts at once, without the trial.

Anything changed on the running system between the update and the restart
(a package installed by hand, a file edited in `/etc`) is not in the copy.
FreedomNAS's own settings are kept outside it, and are applied again at
every start.

The system from before stays under
[System → Previous systems](system.md#previous-systems), and can be started
again from there.

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

If the update changed FreedomNAS itself or installed a new kernel, the
terminal says so and the notices at the top of the page appear (see
[Dashboard](dashboard.md#restart-and-reboot-notices)): restart the WebUI or
reboot when your other jobs are done.

### Pre-Update Snapshots

With **Create ZFS snapshot before updating** on (the default), FreedomNAS
takes a **recursive** snapshot named `pre-update-YYYYmmdd-HHMMSS` of the
pool the system runs from and of every pool recorded in `config.yaml`
before running Topgrade — every dataset of those pools, the system's own
`<pool>/ROOT/<edition>` included — and prints each one in the terminal:

```
Snapshot created: rpool@pre-update-YYYYmmdd-HHMMSS (recursive)
Snapshot created: datapool@pre-update-YYYYmmdd-HHMMSS (recursive)
```

A pool whose snapshot fails is reported as a warning; the others are still
taken and the update still runs. On Linux, right after it, the boot image the system
is running is copied to the `-previous` UKI and paired with this snapshot:

```
zz-dracut-uki: copied /boot/efi/EFI/Linux/debian-uki.efi (kernel 6.18.54-3-freedomnas) to /boot/efi/EFI/Linux/debian-uki-previous.efi
zz-dracut-uki: previous UKI paired with snapshot rpool/ROOT/debian@pre-update-YYYYmmdd-HHMMSS
```

so kernel and system can be rolled back together (see
[ZFS](../developer/zfs.md#uki-pairing)). A new kernel whose boot image would
lack ZFS is never made the active one, and one that does not boot is
replaced by the previous one by itself (see
[Automatic Rollback](system.md#automatic-rollback)).

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

## Arch and Artix machines installed before November 2026

Machines installed before 0.9.20 fetch the FreedomNAS packages from
Codeberg, with a key that is no longer used, so their updates stop. Run once,
as root:

```
curl -fLo /tmp/freedomnas-keyring.pkg.tar.zst https://github.com/FreedomNAS/freedomnas-arch/releases/download/pacman-main/freedomnas-keyring.pkg.tar.zst
pacman -U /tmp/freedomnas-keyring.pkg.tar.zst
pacman -Syu
```

The package keeps the channel the machine was on (`main` or `dev`), adds the
new key and points `[freedomnas]` in `/etc/pacman.conf` at GitHub. Later
changes of key or address arrive as normal updates.

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
