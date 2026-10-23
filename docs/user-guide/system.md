# System Settings

The System page contains general system configuration and the danger zone.

## Hostname

Change the system's hostname:

1. Enter the new hostname in the **Hostname** field
2. Click **Save**

The change applies immediately via `hostnamectl set-hostname` (or the
equivalent profile command) and is persisted to `config.yaml`.

Hostname rules: letters, digits, and hyphens only. No dots, no underscores,
no spaces.

## Timezone

!!! info "Advanced level required"
    Timezone settings are only visible at **Advanced** UI level and above.

Change the timezone:

1. Open the **Timezone** list — it holds every IANA zone the browser knows,
   with the one the system currently reports preselected. Typing a few
   letters jumps to it (e.g. `Europe/R` for `Europe/Rome`).
2. Click **Save**

The change is applied to the system first (`timedatectl set-timezone` on
systemd editions, the `/etc/localtime` link or `tzsetup` elsewhere) and only
then recorded in `config.yaml`, so a zone the system refuses is not saved.

## Certificate

The WebUI uses HTTPS with a certificate FreedomNAS signs itself, with its own
certificate authority. Until a device trusts that authority, its browser
warns about the certificate. To get rid of the warning for good, install the
authority once on each computer and phone:

1. Click **Download the certificate authority** (or open
   `https://<your NAS>:8080/freedomnas-ca.crt` on the phone).
2. Compare the **Authority** fingerprint shown here with the one your device
   displays, then install it as a trusted certificate authority: in the
   browser's certificate settings (Authorities tab), on Android under
   *Security → Encryption & credentials → Install a certificate → CA
   certificate*, on iPhone in *Settings → Profile Downloaded*, then turn it on
   in *General → About → Certificate Trust Settings*.
3. Open the NAS by its hostname or its address.

The same authority covers the apps that use FreedomNAS's certificate, such
as Vaultwarden, so the Bitwarden apps and browser extensions trust them too.
When the NAS gets a new address or hostname it makes a new certificate at the
next boot, signed by the same authority: nothing to install again.

*Advanced level:* the card also shows the certificate's own fingerprint, the
names and addresses it is valid for, and when it expires (it is renewed by
itself well before).

## SSH

*Advanced level.* SSH is off on a freshly installed or flashed system.
**Allow SSH logins** turns it on (and back off) through the edition's init
system, and the choice is kept in the configuration, so it is restored with
everything else after a reinstall. While it is on, anyone who can reach the
system and knows an administrator's password can log in.

## Automatic Rollback

!!! info "Expert level"

On editions that boot a UKI (all but FreeBSD), **Roll back a kernel update
that does not boot** is on by default. After a kernel update the new kernel
is on trial: if it ends in the emergency shell, or does not finish booting
three times, FreedomNAS puts the previous kernel back by itself and returns
the system files to the snapshot taken before the update. The failed system
is kept beside the restored one until you delete it from the dashboard. Data
pools, home directories and logs are never touched.

The line below the checkbox says whether the running kernel is confirmed or
still on trial.

## UI Level

Select your preferred interface complexity level. See [UI Levels](ui-levels.md)
for a full explanation of each level.

## Danger Zone

!!! info "Advanced level required"
    Danger zone buttons are only visible at **Advanced** UI level and above.

The danger zone contains irreversible operations:

### Restart WebUI

*Advanced.* Starts the WebUI again, for example after FreedomNAS was
updated (the notice at the top of every page offers the same button). The
page waits and reloads by itself once the WebUI answers again, usually
within a few seconds. Running updates block it; running replication jobs
are named in the confirmation, since a restart stops them. Jobs started on
other pages (a container app being installed, for example) are interrupted
too, so let them finish first. A restart asked from here is not counted as
a failure by the supervisor.

### Reboot

Reboots the system immediately. A confirmation dialog appears first.
Any active file transfer sessions will be interrupted.

### Shutdown

Powers off the system immediately. A confirmation dialog appears first.

!!! warning
    After shutdown, the system can only be powered on by physically pressing
    the power button. Ensure you have physical access or IPMI/iDRAC remote
    access before shutting down.
