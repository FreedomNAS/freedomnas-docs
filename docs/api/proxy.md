# Reverse Proxy API

Routes of the community module **Reverse proxy** (package
`freedomnas-module-proxy`), mounted at `/api/proxy` when the module is
installed: Caddy with FreedomNAS's certificate, one HTTPS port per site. The
WebUI's [Reverse proxy page](../user-guide/proxy.md) uses them.

**Auth required:** an administrator, on every route.

Setup, disable and the own domain's certificate run as a job, one at a time:
the route answers `{"job": {"kind", "state": "running", ...}}` or `409`, and
`GET /api/proxy/status` reports how it went. Errors in what was asked are
`422` with a `detail`.

| Route | What it does |
|-------|--------------|
| `GET /status` | Caddy installed and running, `enabled` (set up), every site whichever module wrote it (`owner`, `name`, `port`, `upstream`), `names` (on, the local domain, the own domain once its certificate is there, the address, the Pi-hole state), `acme`, the CA fingerprint, and the `job` |
| `POST /setup` | Installs Caddy if needed, takes over its configuration with FreedomNAS's certificate and starts it at boot (a job) |
| `POST /disable` | Stops Caddy, keeps it off at boot and puts the apps behind it back on their own ports (a job); `422` when it is not set up |
| `POST /sites` `{name, port, upstream}` | Serves `upstream` (`host:port`, plain HTTP) over HTTPS on `port`; a port in use, redirected by a firewall or taken by another site is refused |
| `DELETE /sites/{name}` | Removes a site added by hand (the containers module manages its own) |
| `POST /names` `{"enabled": true}` | Serves every site by name too, `https://<name>.<hostname>.home.arpa` |
| `POST /acme` `{domain, email, provider, env, server}` | A domain of your own with its Let's Encrypt certificate through the DNS provider's DNS-01 challenge (a job). Needs the proxy set up and names on. `env` is `KEY=value` lines or an object; keys left out keep their saved values |
| `DELETE /acme` | Stops using the own domain |
| `POST /dns` `{url, password}` | Keeps the names in the network's Pi-hole (v6) from now on |
| `DELETE /dns` | Takes them out of it and stops |

The account page lists every site through the module's `links()`, by name
when names are on — see [GET /api/account/me](users.md#get-apiaccountme).
