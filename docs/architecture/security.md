# Security

## No `shell=True` (except where unavoidable)

All subprocess calls use `shell=False` via `shlex.split()`. This prevents
shell injection attacks.

The only exception: commands in JSON profiles that contain `|`, `>`,
`&&`, or `$()` metacharacters (e.g. `apt list --upgradable | tail`) trigger
`shell=True` automatically inside `engine._run_safe()`. This is:

- **Isolated to one function** in the engine
- **Driven by the profile command**, not by application logic
- **Protected by `_sanitize_kwargs()`** (see below)

## Password Protection

Passwords are never visible in the process list or log files.

| Operation | Method |
|-----------|--------|
| OS user password | `execute_with_stdin()` — piped via stdin to `chpasswd` |
| Samba password | `execute_with_stdin()` — piped via stdin to `smbpasswd` |
| Config persistence | `config.yaml` never stores plaintext passwords |

```python
# Correct
engine.execute_with_stdin("users", "set_password", stdin_data="admin:newpassword\n")

# Wrong — password visible in ps aux
subprocess.run(["chpasswd"], ...)  # Never do this from application code
```

## Input Sanitisation

`engine._sanitize_kwargs()` strips shell metacharacters (`;`, `|`, `&`,
`$`, `` ` ``, `\n`) from all kwargs before template substitution. This
protects against injection through API input even when the profile command
uses `shell=True`.

## File Permissions

`config.yaml` is always written with `chmod 0o600` (owner read/write only).
The file is owned by root. No other user can read it.

## Encrypted Pool Keyslots

ZFS native encryption allows only one active key per encryption root — there
is no LUKS-style multi-keyslot mechanism built into ZFS itself. `keymgmt.py`
works around this by generating its own random 32-byte raw ZFS key (never
stored in the clear) and keeping **two independently-wrapped copies** of it in
a keyslot file outside the encrypted pool, at
`/etc/freedomnas/keyslots/<pool>.json`, so it is readable before the pool
unlocks:

| Slot | Wrapped by | Delivered via |
|------|-----------|----------------|
| `usb` | The byte content of a `freedomnas.key` file | Removable media, scanned via the `media` profile category |
| `passphrase` | The operator's Master Passphrase | TTY prompt on `/dev/console`, tried only if no USB key matches |

Each slot has its own random salt and AES-256-GCM nonce. Wrapping derives a
key-encryption-key with `hashlib.scrypt` and encrypts/decrypts the raw key
with `cryptography.hazmat.primitives.ciphers.aead.AESGCM` (the `cryptography`
package is a required dependency — the standard library has no AES). A
tampered or mismatched slot fails authentication (`SlotUnavailableError`)
rather than silently returning a wrong key, and compromising one slot never
exposes the other slot or the pool key.

**Two implementations.** Like the [engine](engine.md#two-implementations),
`keymgmt.py` exists twice: `keymgmt_py.py` wraps with `hashlib.scrypt` +
`cryptography`'s `AESGCM` (above); `keymgmt_native.py` is the Python side
of `nim/src/fnas/keymgmt.nim`, which wraps with `nimcrypto`'s scrypt
(RFC 7914) and AES-256-GCM (NIST SP 800-38D) instead — chosen, and
cross-checked byte-for-byte in `tests/test_keymgmt_parity.py`, specifically
*because* both sides implement the same public, deterministic standards:
a keyslot wrapped by one engine has to open with the other, since a pool
created under one and booted under the other is an ordinary scenario, not
an edge case. `FREEDOMNAS_KEYMGMT` (falling back to `FREEDOMNAS_ENGINE`)
picks between them; the native side calls the native engine's handle
directly, so it only makes sense paired with it.

At boot, `PoolUnlocker` (invoked by `python -m freedomnas unlock-pools` from
`firstboot.sh`) tries the USB slot first and falls back to the passphrase
slot only if no USB key matches. The passphrase prompt disables local echo
and retries for up to `--tty-timeout` seconds (default 300). If nobody
answers in time, `unlock-pools` **fails open**: it logs a warning and returns
non-zero, but `firstboot.sh` still boots the WebUI rather than blocking
indefinitely — the pool simply stays locked until unlocked manually.

Secret material for the passphrase path never appears in argv or a
subprocess pipe. The only place the unwrapped raw key ever touches disk is a
`0600` file under `/run/freedomnas/` (tmpfs), written just long enough for
`zfs load-key -L file://...` to read it, then overwritten with random bytes
and unlinked (shredded) immediately afterward — on both the unlock path and
the pool-provisioning path used by `/api/setup/initialize`.

## HTTP Basic Auth via PAM

The WebUI uses PAM for authentication. Credentials are never stored in the
WebUI codebase — they are validated against the OS user database at login time.

Client-side, credentials are stored in `sessionStorage` (cleared on tab close),
not in `localStorage` (which persists). They are sent as `Authorization: Basic
<btoa(user:pass)>` on every API request.

### Authentication is not authorisation

PAM answers *who you are*, not *what you may do*. Every account that can
authenticate used to reach every endpoint — including one created only to
mount a share, which could then delete users or reboot the appliance.

`is_administrator()` closes that: the account must be in the edition's admin
group, read from `users.sudo_group` (`sudo` on Debian, `wheel` elsewhere) and
compared against `users.list_groups` (`id -nG`). `root` always passes. The
same check guards the updates WebSocket, which runs a system update as the
caller. Wrong password gives 401, right password without the group gives 403.

### Guessing limit

Five failed attempts for one username inside 60 seconds lock that username
out for 5 minutes, counted in memory and reset by a successful login. The
trade-off is deliberate: whoever can reach the port can keep an administrator
locked out by failing on purpose. On a LAN appliance a five-minute wait is
the cheaper of the two risks, but it is a choice, not an oversight.

### The transport

Basic auth carries the administrator's password — base64, not encrypted — on
**every request**, so the WebUI speaks TLS. `python -m freedomnas ensure-tls`
runs from `firstboot.sh` and, the first time only, writes an EC P-256
self-signed certificate to `/etc/freedomnas/tls` (key `0600`, ten years,
SANs for the hostname, `localhost`, `127.0.0.1` and `::1`). The supervisor
passes it to uvicorn, so the WebUI answers `https://<host>:8080`.

The certificate is generated **once** and then left alone: one that changed
at every boot would teach the admin to click through the warning, which is
the opposite of the point. Its SHA-256 fingerprint is printed at first boot,
to be compared with what the browser shows.

What this does and does not buy: it stops anyone on the network from reading
the password, and it does **not** prove the appliance's identity — no
self-signed certificate can. An installation from before this existed keeps
serving plain HTTP rather than refusing to start; it gains TLS as soon as the
certificate is there.

## WebSocket Terminal

Browsers cannot set an `Authorization` header on a WebSocket, so
`/ws/updates/terminal` takes the Basic credentials as its first frame
(`{"auth": "<base64(user:pass)>"}`) and checks them with PAM and
`is_administrator()` before anything runs: no frame within 10 seconds or bad
credentials close with `4401`, a non-administrator with `4403`. The update
then runs as that user (`su - {username}` in the profile). The terminal only
shows Topgrade output — it cannot be used as an interactive shell. See
[WebSocket Terminal](../api/websocket.md).

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Command injection via API input | `_sanitize_kwargs()` strips metacharacters before substitution |
| Password exposure in logs/ps | `execute_with_stdin()` for all password operations |
| Config file reading by non-root | `0o600` permissions on `config.yaml` |
| Encrypted pool key exposure | Two independently-wrapped keyslots (scrypt + AES-256-GCM); raw key only ever touches a transient `0600` tmpfs file, shredded immediately after use |
| Unauthorized API access | HTTP Basic Auth via PAM on all non-exempt routes; administrator group required; first-frame auth on the updates WebSocket |
| OS command hardcoding | All commands in JSON profiles — no commands in Python |
| XSS via Jinja2 | Jinja2 auto-escaping enabled (default) |
