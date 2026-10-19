# Updates API

## GET /api/updates/status

Returns the current update status.

**Auth required:** yes

**Response:**

```json
{
  "pending_updates": 5,
  "checked_at": "2026-09-28T09:12:44.118302",
  "refreshing": false,
  "error": null,
  "topgrade_configured": true,
  "enabled_steps": ["system", "containers", "firmware"],
  "auto_snapshot": true
}
```

The route never waits for the package manager: counting pending updates
takes milliseconds with apt and minutes with Portage. It answers with the
last count it has and, when that count is older than an hour, starts a
refresh in the background (`packages.list_updatable`, one line per update,
up to 15 minutes).

- `pending_updates` — the last count; `null` until the first refresh ends
- `checked_at` — when it was taken (server local time); `null` before that
- `refreshing` — a refresh is running; the page polls every 5 seconds meanwhile
- `error` — why the last refresh failed, else `null`
- `enabled_steps` — the steps saved by `POST /configure`, or the defaults
  (`system`, `containers`, `firmware`) before anything was saved; the
  **Configure** dialog opens with these ticked, so saving it unchanged keeps
  them

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

1. Writes the edition's `updates.topgrade_config` —
   `/etc/freedomnas/topgrade.toml`, `/usr/local/etc/freedomnas/topgrade.toml`
   on FreeBSD — with the provided settings
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

`topgrade.toml` is written by `POST /configure`, and also
by the WebSocket handler when an update starts and the file is not there —
otherwise topgrade would run every step it knows (pip, cargo, flatpak and
the rest) instead of the three this page offers. An existing file is never
overwritten, not even one edited by hand. A missing one is rewritten from
the steps `config.yaml` has saved; only on a system where nothing was ever
saved does it get the defaults, which are then recorded too. The file lives
on the system disk and the steps on the pool, so a restored system has the
second without the first. Verified on the real test box (Void): with
`only = ["system"]` saved and the file deleted, an update wrote it back
with `["system"]`; a hand-edited file was left as it was.

## topgrade itself

!!! note "How each edition packages topgrade"
    Building Topgrade from source pulls the Rust toolchain and several
    hundred crates. FreedomNAS uses release binaries where available rather
    than compiling it as part of the system package:

    | Edition | Where topgrade comes from |
    |---------|---------------------------|
    | Arch, Artix | `topgrade-bin` from the FreedomNAS pacman repository, built by freedomnas-arch from the same binary — not in the official repositories |
    | Void | `topgrade`, in the distribution |
    | Gentoo | `app-admin/topgrade-bin` in freedomnas-overlay, which the installer adds as a git-synced repository (`files.repos_conf`, `repositories.core`) |
    | Debian | a `.deb` built from the same binary by [freedomnas-deb](https://codeberg.org/FreedomNAS/freedomnas-deb) and published to Codeberg's Debian registry, which `repositories.core` adds to the target's sources |
    | FreeBSD | `sysutils/topgrade`, in FreeBSD's own repository |

    Every edition's package list installs topgrade (`packages/core.json`),
    so `updates.run_topgrade` can count on it.

`updates.run_topgrade` passes `--yes` on the command line as well as writing
`assume_yes` into the configuration. The WebSocket handler gives the process
`/dev/null` as stdin, so a package manager that stops to ask anything fails
the whole run: on Arch and Artix an unconfigured system ended at
`:: Proceed with installation? [Y/n]` and reported
`` Command failed: `/usr/bin/sudo /usr/bin/pacman -Syu` ``. The flag holds
whether or not `topgrade.toml` has been written yet.

On Debian, `run_topgrade` also sets `DEBIAN_FRONTEND=noninteractive`, and
`/etc/sudoers.d/freedomnas-debconf`, installed by the `freedomnas-profiles`
package, keeps it through `sudo`
(`Defaults env_keep += "DEBIAN_FRONTEND"`): without a terminal debconf would
otherwise try Dialog, Readline and Teletype in turn and print a dozen
`debconf: unable to initialize frontend` lines before settling on
Noninteractive anyway. The answers are the same either way; only the
warnings go.

---

## WebSocket /ws/updates/terminal

Streams Topgrade output in real time. See [WebSocket Terminal](websocket.md).
