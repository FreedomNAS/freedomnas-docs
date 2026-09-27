# WebSocket Terminal

Implemented in `freedomnas-webui/websocket/terminal.py` and consumed by
`frontend/static/js/updates.js`.

## Endpoint

```
wss://<host>:8080/ws/updates/terminal
wss://<host>/ws/updates/terminal   (if TLS is terminated upstream)
```

!!! warning "uvicorn needs a WebSocket library"
    uvicorn speaks HTTP by itself; the WebSocket protocol comes from a
    separate package (`websockets`). Without it the upgrade request is never
    turned into a WebSocket connection: it reaches the app as a plain `GET`,
    matches no HTTP route, and the browser is told `404 {"detail":"Not
    Found"}` — which the page reports as `WebSocket connection error` while
    every other part of the WebUI works. The package is therefore named in
    `requirements.txt`, `debian/control`, freedomnas-arch's PKGBUILD, the Gentoo ebuild and
    `packages/core.json` (`python-websockets`, `python3-websockets`,
    `py312-websockets`, `dev-python/websockets` depending on the edition).

## Authentication

Browsers cannot set an `Authorization` header on a WebSocket, so the client
sends the same Basic blob the REST calls carry as its **first frame**:

```json
{"auth": "<base64(username:password)>"}
```

Nothing runs before that frame is checked:

| Condition | Server sends | Close code |
|-----------|--------------|------------|
| No frame within 10 seconds, or a malformed one | `{"stream": "stderr", "line": "Authentication required"}` | `4401` |
| PAM rejects the credentials | `{"stream": "stderr", "line": "Invalid credentials"}` | `4401` |
| Valid account, not in the edition's admin group | `{"stream": "stderr", "line": "This account is not an administrator"}` | `4403` |

The administrator check is the same `is_administrator()` that guards the REST
routes — see [Security](../architecture/security.md#authentication-is-not-authorisation).

## Protocol

### Client → Server

Only the authentication frame above. Nothing else is read; the terminal is
not an interactive shell.

### Server → Client

All messages are JSON objects.

**Output line:**

```json
{"stream": "stdout", "line": "==> Updating system packages..."}
{"stream": "stderr", "line": "Warning: unmet dependency"}
```

**Completion:**

```json
{"exit_code": 0}
```

`exit_code` of `0` means success. Any other value means failure.

## Behaviour

1. Authenticate the first frame (above)
2. `engine.get_command("updates", "run_topgrade", username=<user>)` — the
   profile wraps Topgrade in `su - {username}`, because Topgrade refuses to
   run as root and calls `sudo` itself. A profile error, or a command
   sequence instead of a single command, closes with `1011`
3. If `updates.topgrade.auto_snapshot` is true (the default), take
   `<pool>@pre-update-YYYYmmdd-HHMMSS` on every pool recorded in
   `config.yaml` via `zfs.snapshot_create`, reporting each as a `stdout`
   line. A failed snapshot is reported as a `stderr` warning and the update
   still runs
4. Launch the command with `asyncio.create_subprocess_exec`, stdin on
   `/dev/null`
5. Stream stdout and stderr line by line; both pipes keep being drained after
   the client disconnects, so the update is never blocked halfway
6. Send `{"exit_code": N}` and close

## JavaScript Consumer

```javascript
// updates.js
const proto = location.protocol === 'https:' ? 'wss' : 'ws';
_ws = new WebSocket(`${proto}://${location.host}/ws/updates/terminal`);

_ws.onopen = () => {
    _ws.send(JSON.stringify({ auth: Auth.get() }));
};

_ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.exit_code !== undefined) {
        done(msg.exit_code === 0);
        return;
    }
    const cls = msg.stream === 'stderr' ? 'err' : classifyLine(msg.line);
    appendLine(termEl, cls, msg.line);
};
```

## Constraints

- `shell=True` is never used in the terminal handler
- The command string always comes from `engine.get_command()` — never hardcoded
- The process is launched with `asyncio.create_subprocess_exec` for non-blocking streaming
- Lines are sent one by one as they are produced — no output buffering
- A socket closed by the client mid-update is tolerated: the update runs to completion
