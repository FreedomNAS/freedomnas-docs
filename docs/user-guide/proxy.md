# Reverse Proxy

The **Reverse proxy** page comes with the community module
`freedomnas-module-proxy` (repository `freedomnas-proxy`). Install the
package from the [Plugins page](plugins.md) or with your edition's package
manager; the page appears in the sidebar at the *Advanced* level after the
WebUI restarts.

It puts [Caddy](https://caddyserver.com) in front of the NAS's web apps and
serves each of them over **HTTPS on its own port**, with FreedomNAS's own
certificate. Once FreedomNAS's certificate authority is installed on a device
([System → Certificate](system.md#certificate)), every app opens without a
warning, by the NAS's hostname or by its address.

Editions: Debian, Arch, Artix, Void, Gentoo and FreeBSD. Caddy comes from
your edition's own packages; Artix has none, so there it comes from
FreedomNAS's own repository (`caddy-bin`, with the service of your init:
`caddy-openrc`, `caddy-dinit` or `caddy-runit`).

## Set up

**Set up** installs Caddy from your edition's packages if it is not there,
takes over Caddy's configuration (the one it came with is kept beside it as
`Caddyfile.pre-freedomnas`), and starts Caddy at boot. Right after, the apps
of the [Containers](containers.md) catalogue that can go behind it do:

| App | Behind the proxy |
|-----|------------------|
| Jellyfin | yes, on Linux and FreeBSD |
| Immich | yes (Linux) |
| Nextcloud | yes on Linux (it is told it is served over HTTPS); on FreeBSD not yet |
| Pi-hole, Vaultwarden | no need: they serve HTTPS with the same certificate themselves |
| Home Assistant | not yet: it uses the host's network on a fixed port |

Each app keeps its address: Jellyfin is still `https://<your NAS>:8096`, now
over HTTPS. The app itself moves to a port only the proxy reaches (on Linux
`127.0.0.1`, on FreeBSD the jail's own address), so nobody reaches it over
plain HTTP any more. An app installed while the proxy is set up starts behind
it directly.

## Turn off

**Turn off** (on the Caddy card, once the proxy is set up) stops Caddy and
keeps it off at boot, then puts the apps behind it back on their own ports,
over plain HTTP as before: Jellyfin answers again on `http://<your NAS>:8096`.
Caddy stays installed and the sites added here stay in the configuration, so
**Set up** brings everything back. If an app cannot go back to its own port
(something else took it meanwhile), Caddy stays off and the page says which
app.

## Sites

The **Sites** table lists every site: the port of the NAS, the service behind
it and who added it (*Containers app*, or *Added here*). The port opens the
site.

*Add* puts another service behind the proxy: a name, the port of the NAS it
answers on, and the service as `host:port` — something on the NAS
(`127.0.0.1:9000`) or on your network (`192.168.1.50:80`, a printer's or a
camera's page). The proxy reaches it over plain HTTP, so keep it on the NAS
or on your own network. A port something already listens on is refused (on
FreeBSD also one a jail exposes through the firewall), and
Caddy checks the configuration before it is kept: if Caddy refuses it,
nothing changes. **Remove** takes a site added here away again.

## At boot

At every boot FreedomNAS writes Caddy's configuration and the sites again,
copies FreedomNAS's certificate when it was issued again (a new address or
hostname) and reloads Caddy. The sites added here are kept in the
configuration (`modules.proxy`), so they come back after a reinstall or on
another edition.
