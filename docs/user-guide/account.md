# My Account

Every account of the NAS can sign in to the WebUI, not only the
administrators. An account that does not administer the NAS lands on
**My Account** and sees only that page: the rest of the WebUI stays closed
to it, and opening another page brings it back here. Administrators find it
at the bottom of the menu too.

| Section | What it shows |
|---------|---------------|
| Account | The user name, its groups and the NAS's name |
| Change Password | The current password and the new one, twice. The new password is used for signing in and for the shares (SMB) at once, and the page stays signed in with it |
| My Shares | The shares the account may use: SMB shares it owns, is a user of, or that belong to one of its groups, and the NFS shares it owns. Each one with the address to open it from a computer: `\\<NAS>\<share>` on Windows, `smb://<NAS>/<share>` on macOS, `<NAS>:<path>` for NFS |
| Apps | One button per app that is running (Jellyfin, Nextcloud, …) and per site of the [reverse proxy](proxy.md): by its name (`https://jellyfin.<hostname>.home.arpa/`) when names are on, otherwise on its port. Opening an app only opens it: managing apps stays with the administrators |
| Certificate | The fingerprint of the NAS's certificate authority and the button to download it, to install once on each computer and phone so the browser trusts the NAS and its apps |

An account with a **temporary password** (given after a restore) first
chooses its own on the **Change your password** page linked from the sign-in
page; then it signs in here.
