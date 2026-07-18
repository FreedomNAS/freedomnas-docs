# WebSocket Terminal

!!! warning "Not yet implemented"
    `api/websocket/terminal.py` has not been created. The endpoint is
    specified here and the frontend (`terminal.js`) is ready, but the
    Python handler is pending. See [WebUI Development](../developer/webui.md).

## Endpoint

```
ws://<host>:8080/ws/updates/terminal
wss://<host>/ws/updates/terminal   (if TLS is terminated upstream)
```

## Authentication

!!! note
    This endpoint has no authentication check. Browsers cannot set custom
    headers on WebSocket connections, making HTTP Basic Auth impossible.
    This is a known limitation — the terminal only streams Topgrade output
    and cannot accept input.

## Protocol

### Server → Client Messages

All messages are JSON objects:

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

### Client → Server

The client sends no messages. The connection is unidirectional (server push only).

## Implementation

```python
# websocket/terminal.py
@app.websocket("/ws/updates/terminal")
async def terminal(websocket: WebSocket):
    await websocket.accept()

    # Get command from profile (never hardcoded)
    cmd = engine.get_command("updates", "run_topgrade")

    # Pre-update snapshot if configured
    if config.get("updates.topgrade.auto_snapshot"):
        engine.execute("zfs", "create_snapshot", dataset="datapool", snapshot_name=f"pre-update-{date}")

    # Stream via asyncio subprocess (not subprocess.run — blocking)
    proc = await asyncio.create_subprocess_exec(
        *shlex.split(cmd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # Read stdout and stderr concurrently, send each line as JSON
    ...

    await websocket.send_json({"exit_code": proc.returncode})
```

## JavaScript Consumer

```javascript
// updates.js
const proto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${proto}://${location.host}/ws/updates/terminal`);

ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.exit_code !== undefined) {
        showResult(msg.exit_code === 0 ? 'success' : 'failure');
        return;
    }
    const cls = msg.stream === 'stderr' ? 'err' : classifyLine(msg.line);
    appendLine(terminalEl, cls, msg.line);
};

ws.onerror = () => toast('Connection to terminal lost', 'error');
```

## Constraints

- `shell=True` is never used in the terminal handler
- The command string always comes from `engine.get_command()` — never hardcoded
- The process is launched with `asyncio.create_subprocess_exec` for non-blocking streaming
- Lines are sent one by one as they are produced — no output buffering
