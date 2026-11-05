# Virtual Machines API

Routes of the community module **Virtual machines** (package
`freedomnas-module-vm`), mounted at `/api/vm` when the module is installed. The
WebUI's [Virtual machines page](../user-guide/vm.md) uses them.

**Auth required:** an administrator, on every route.

Errors in what was asked are `422` with a `detail`.

| Route | What it does |
|-------|--------------|
| `GET /status` | The hypervisor: `backend`, `installed`, `enabled`, `running`, `accelerated`, `pool`, `pools`, `bridges`, `access_group`, `access_members`, `machines`, `isos`, and the `job` |
| `POST /setup` `{"pool": "tank"}` | Installs the hypervisor if needed and sets it up on the pool (a job); `409` while one runs |
| `POST /machines` `{name, cpus, memory_mb, disks: [{size_gb}], nics: [{bridge}]}` | Creates a machine, stopped, with its uuid and MAC addresses |
| `POST /machines/{name}/{action}` | `start`, `stop` (asks the guest to shut down) or `poweroff`; start and stop also set what it does at boot |
| `POST /machines/{name}/install` `{iso}` | Starts a stopped machine from an image, this once |
| `DELETE /machines/{name}` | Removes a stopped machine; its disks stay unless `?destroy_disks=true` |
| `WS /machines/{name}/console` | The first message is `{"auth": "<base64 user:password>"}`, the answer `{"ok": true}` or `{"error": ...}`, then the machine's VNC stream |
| `POST /isos?name=<file>` | Uploads an image, as the request's body; a name in use is refused |
| `POST /isos/download` `{url, name}` | Fetches an image from `http` or `https` (a job) |
| `DELETE /isos/{name}` | Removes an image |

In `machines`, `state` is what the hypervisor says (`running`, `stopped`, or
`undefined` when it does not know the machine), `wanted` is the state in the
configuration (`up` or `down`), and `stopping` is true when it was told to stop
and still runs. `foreign` marks a machine FreedomNAS did not create.
