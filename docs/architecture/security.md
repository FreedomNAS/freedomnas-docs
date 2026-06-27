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

## HTTP Basic Auth via PAM

The WebUI uses PAM for authentication. Credentials are never stored in the
WebUI codebase — they are validated against the OS user database at login time.

Client-side, credentials are stored in `sessionStorage` (cleared on tab close),
not in `localStorage` (which persists). They are sent as `Authorization: Basic
<btoa(user:pass)>` on every API request.

## WebSocket Terminal

The `/ws/updates/terminal` endpoint has no authentication check because browsers
cannot set custom headers on WebSocket connections. This is an accepted limitation.
The terminal only shows topgrade output — it cannot be used as an interactive shell.

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Command injection via API input | `_sanitize_kwargs()` strips metacharacters before substitution |
| Password exposure in logs/ps | `execute_with_stdin()` for all password operations |
| Config file reading by non-root | `0o600` permissions on `config.yaml` |
| Unauthorized API access | HTTP Basic Auth via PAM on all non-exempt routes |
| OS command hardcoding | All commands in JSON profiles — no commands in Python |
| XSS via Jinja2 | Jinja2 auto-escaping enabled (default) |
