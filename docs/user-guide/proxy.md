# Reverse Proxy

The **Reverse proxy** page comes with the community module
`freedomnas-module-proxy` (repository `freedomnas-proxy`). Install the
package from the [Plugins page](plugins.md) or with your edition's package
manager; the page appears in the sidebar at the *Advanced* level after the
WebUI restarts. Opened at the *Assisted* level, it shows Caddy's state and the
sites only; setting up, turning off and the sites' changes are *Advanced*.

It puts [Caddy](https://caddyserver.com) in front of the NAS's web apps and
serves each of them over **HTTPS on its own port**, with FreedomNAS's own
certificate. Once FreedomNAS's certificate authority is installed on a device
([System → Certificate](system.md#certificate)), every app opens without a
warning, by the NAS's hostname or by its address.

Editions: Debian, Arch, Artix, Void, Gentoo and FreeBSD. Caddy comes from
your edition's own packages; Artix has none, so there it comes from
FreedomNAS's own repository (`caddy-bin`, with the service of your init:
`caddy-openrc`, `caddy-dinit` or `caddy-runit`; and `lego-bin` for Let's Encrypt).
On Gentoo it installs Caddy 2.11 or later, accepting its `~amd64` keyword
alone (`/etc/portage/package.accept_keywords/freedomnas-caddy`): the stable
2.10.2, built with Go 1.27, crashes on its first HTTPS site.

## Set up

**Set up** installs Caddy from your edition's packages if it is not there,
takes over Caddy's configuration (the one it came with is kept beside it as
`Caddyfile.pre-freedomnas`), and starts Caddy at boot. Right after, the apps
of the [Containers](containers.md) catalogue that can go behind it do:

| App | Behind the proxy |
|-----|------------------|
| Jellyfin | yes, on Linux and FreeBSD |
| Immich | yes (Linux) |
| Nextcloud | yes, on Linux and FreeBSD: it trusts the proxy, so it builds its links with the protocol the proxy reports (HTTPS) and goes back to plain HTTP by itself when the proxy is off |
| Pi-hole, Vaultwarden | no need: they serve HTTPS with the same certificate themselves |
| Home Assistant | not yet: it uses the host's network on a fixed port |

Each app keeps its address: Jellyfin is still `https://<your NAS>:8096`, now
over HTTPS. The app itself moves to a port only the proxy reaches (on Linux
`127.0.0.1`, on FreeBSD the jail's own address), so nobody reaches it over
plain HTTP any more. An app installed while the proxy is set up starts behind
it directly.

## Names

Once the proxy is set up, **Serve the sites by name** (on the *Names* card,
*Advanced*) makes every site answer by name too, on the usual HTTPS port:
`https://jellyfin.<hostname>.home.arpa/`, with no port to remember. Each site
keeps its port as well. `home.arpa` is the domain set aside for home networks
(RFC 8375), so these names never clash with a real one, and FreedomNAS's
certificate covers every name under `<hostname>.home.arpa`: a device that
trusts its certificate authority opens them without a warning. Typing
`http://` sends the browser to `https://`; a name no site has answers *There
is no site with this name on this NAS*.

Your devices find the names through your network's DNS: every name under
`<hostname>.home.arpa` (one wildcard record, `*.<hostname>.home.arpa`) has to
point at the NAS's address on your network, which the card shows. **Pi-hole**
from the [Containers](containers.md) catalogue does it by itself: while names
are on it answers every one of them with that address (and with nothing once
they are off), for every device that uses it as DNS server. Without Pi-hole,
add the wildcard record in your router. A Pi-hole installed before this came
gets it once reinstalled on its kept data (Containers → remove, keeping the
data, then install it again).

**A Pi-hole of your network** (one running elsewhere, which your devices
already use as DNS server) can be kept up to date by FreedomNAS: on the
*Names* card give its address (such as `http://192.168.1.5`) and an **app
password** (in Pi-hole 6: Settings → Web interface / API → App password).
FreedomNAS writes its Local DNS Records there: one for the NAS
(`<address> <hostname> <hostname>.home.arpa <site>.<hostname>.home.arpa …`,
so the WebUI answers by the NAS's name too) and, with an own domain, one for
it. It writes them again whenever sites, names, the domain or the NAS's
address change, and at every boot; records naming anything else are left
alone, so several NASes can share one Pi-hole. Pi-hole takes no wildcard
from its API, so the records name each site. **Forget** takes them out.
A device with a second DNS server (such as `1.1.1.1`) may ask that one
instead now and then, which does not know the names: for local names, give
your devices the Pi-hole alone.

Names need ports 443 and 80 of the NAS; FreedomNAS refuses to turn them on
while something else uses them, and refuses a site of yours on those ports
while names are on. Caddy does not run as root, so it is allowed to open them:
on FreeBSD with `mac_portacl` (only the `www` user, only tcp 80, tcp 443 and
udp 443; root keeps its own rights, nobody else gets any), on Artix, Void and
Gentoo with the file capability `cap_net_bind_service` on `/usr/bin/caddy`;
Debian's and Arch's Caddy service already have it. **Stop serving by name**
takes all of it back.

Nextcloud refuses names it was not told about: an app installed now trusts
every name under `<hostname>.home.arpa` by itself. One installed before needs
it added once, with Nextcloud's `occ config:system:set trusted_domains <n>
--value="*.<hostname>.home.arpa"`.

Pi-hole and Vaultwarden serve HTTPS themselves and are not behind the proxy,
so they keep their ports only.

## Your own domain (Let's Encrypt)

With names on, the *Your own domain* card (*Advanced*) adds a domain of yours:
every site then also answers as `https://jellyfin.<your domain>/` with a
**Let's Encrypt** certificate, which phones, TVs and guests' devices trust
without installing anything. The local names keep working.

The certificate covers your domain and every name under it (one wildcard
certificate) and comes through the **DNS-01** challenge: FreedomNAS asks your
DNS provider, through its API, to publish the record Let's Encrypt checks. No
port of the NAS is opened to the internet, and the domain needs no address of
its own on the internet; on your network, Pi-hole from the catalogue answers
it with the NAS's address (or add a wildcard record in your router, as for the
local names).

Fill in the domain (such as `nas.example.org`), an email for Let's Encrypt,
your **DNS provider** with the name lego gives it (`desec`, `cloudflare`,
`ovh`, `hetzner`, `duckdns`… see [lego's list of DNS
providers](https://go-acme.github.io/lego/dns/)) and its **credentials**, one
`KEY=value` per line with the names lego's page for your provider gives (for
deSEC: `DESEC_TOKEN=…`). *Let's Encrypt staging* gets a test certificate no
browser trusts, to try the settings without Let's Encrypt's limits; at the
*Expert* level any other ACME directory can be given.

**Get the certificate** asks for it in the background (a minute or two);
the card then shows its expiry. A daily job renews it 30 days before it
expires, with no action from you. The credentials are kept on the NAS in a
file only root can read (and in the configuration, so a reinstall gets the
certificate again by itself); saving the form with the credentials empty keeps
the saved ones. **Stop using this domain** removes the names under it and the
renewal; the local names stay.

The certificate comes from [lego](https://go-acme.github.io/lego/), installed
from your edition's packages (`lego-bin` from FreedomNAS's repository on
Artix; on Gentoo its `~amd64` keyword is accepted like Caddy's). A Nextcloud
installed before the domain was set needs it added once to its trusted
domains, as for the local names (`*.<your domain>`); one installed afterwards
trusts it by itself.

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
