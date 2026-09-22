# Updates API

## GET /api/updates/status

Returns the current update status.

**Auth required:** yes

**Response:**

```json
{
  "pending_updates": 5,
  "topgrade_configured": true,
  "auto_snapshot": true
}
```

`pending_updates` is queried from the package manager using the profile
key `packages.list_updatable` — the command varies by OS.

---

## POST /api/updates/configure

Write a new Topgrade configuration.

**Auth required:** yes

**Request body:**

```json
{
  "auto_snapshot": true,
  "enabled_steps": ["system", "containers", "firmware"]
}
```

**Behaviour:**

1. Writes `/etc/freedomnas/topgrade.toml` with the provided settings
2. `config.configure_topgrade(steps=["system", "containers", "firmware"])` + `config.save()`

**Generated `topgrade.toml`:**

```toml
[misc]
assume_yes = true
no_retry = true
run_in_tmux = false
skip_notify = true
only = ["system", "containers", "firmware"]
```

Every key has to be one topgrade knows: it rejects the whole file over a
single unknown field and falls back to its defaults without saying so, which
is how `disable_tmux`, `[unstable]` and `[notifications]` used to cost us the
`only` list. An edition may append its own section through
`updates.topgrade_extra_config` — Gentoo does, because the default
`emerge_update_flags` carry `-a`.

**Response:**

```json
{"detail": "Topgrade configured", "enabled_steps": ["system", "containers", "firmware"]}
```

---

`/etc/freedomnas/topgrade.toml` is written by `POST /configure`, and also
by the WebSocket handler when an update starts and the file is not there —
otherwise topgrade would run every step it knows (pip, cargo, flatpak and
the rest) instead of the three this page offers. An existing file is never
overwritten.

## topgrade itself

!!! warning "Not every edition packages topgrade"
    `packages/core.json` installs `topgrade` on Arch, Artix (from
    Chaotic-AUR — it is not in the official repositories) and Void. Debian
    and Gentoo do not package it at all, and FreeBSD has not been checked, so
    on those editions the Updates page has nothing to run until topgrade is
    installed by hand. `updates.check_topgrade` is what tells them apart.

`updates.run_topgrade` passes `--yes` on the command line as well as writing
`assume_yes` into the configuration. The WebSocket handler gives the process
`/dev/null` as stdin, so a package manager that stops to ask anything fails
the whole run: on Arch and Artix an unconfigured system ended at
`:: Proceed with installation? [Y/n]` and reported
`` Command failed: `/usr/bin/sudo /usr/bin/pacman -Syu` ``. The flag holds
whether or not `/etc/freedomnas/topgrade.toml` has been written yet.

---

## WebSocket /ws/updates/terminal

Streams Topgrade output in real time. See [WebSocket Terminal](websocket.md).
