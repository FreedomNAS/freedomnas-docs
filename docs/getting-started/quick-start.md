# Quick Start

New to FreedomNAS? This page takes you from an empty computer to a NAS
where your family or office keeps its files, in plain words. You don't need
to know Linux or ZFS. The rest of the documentation goes deeper when you
want it.

## What you get

A **NAS** (Network Attached Storage) is a computer at home or at work that
keeps files for everyone on the network: documents, photos, backups. Every
PC, Mac and phone opens them like a folder. FreedomNAS turns a computer into
that, and you manage it from a web page.

## What you need

| | Minimum | Better |
|---|---------|--------|
| A 64-bit PC (an old one is fine) | 2 GB of memory | 8 GB or more |
| A disk for the system | 16 GB | a 32 GB SSD |
| Disks for your files | 1 | 2 or more, so a broken disk loses nothing |
| A network cable to your router | yes | — |
| A USB stick or a way to write the system disk | — | — |

!!! warning "The disks will be erased"
    The system disk is overwritten, and so are the data disks you choose
    in step 4. Copy anything you want to keep somewhere else first.

## 1. Download

Get the newest image from the
[download page](https://github.com/FreedomNAS/freedomnas-image/releases).
If you don't know which one to take, take **Debian** (`debian.img.zst`): it
works on the widest range of hardware. **FreeBSD** (`freebsd.img.zst`) is
the other official edition. The others (Arch, Void, Gentoo, Artix) are for people
who already use those systems.

## 2. Write it to the system disk

The image is the whole system, ready to start. Write it to the disk the
NAS will start from — the internal disk (connect it to another computer
for a moment) or a USB stick or SSD that stays plugged in.

- **Raspberry Pi Imager** or **Rufus** read the `.img.zst` file directly:
  choose "custom image" / the file, choose the disk, write.
- **balenaEtcher** needs the file uncompressed first:
  `zstd -d debian.img.zst` gives `debian.img`.

## 3. Start the NAS and open its page

Put the disk in the NAS, connect it to the router with a cable, and switch
it on. Give it two or three minutes the first time.

On another computer of the same network, open a browser and go to:

```
https://freedomnas:8080
```

If that doesn't open, look up the address your router gave the NAS (in the
router's list of connected devices it is called **freedomnas**) and use
that instead, e.g. `https://192.168.1.50:8080`.

The browser warns that the connection is not trusted: that is normal the
first time, because the NAS signs its own certificate. Choose to continue
(you can make the warning go away for good later, see step 7).

Sign in with:

| User name | Password |
|-----------|----------|
| `admin` | `freedomnas` |

## 4. Answer the setup questions

A short wizard starts by itself:

1. **Administrator** — choose your own password (at least 8 characters).
   This is the account that manages the NAS. Don't lose it.
2. **System** — a name for the NAS (it can stay `freedomnas`) and your
   time zone.
3. **Storage** — pick the disks for your files. With two disks choose
   **mirror**: each file is kept on both, so one disk can break without
   losing anything.
4. **Configuration** — leave the suggested choice. It keeps a copy of the
   settings on your data disks, so if the system disk ever dies, a new one
   gets everything back by itself.
5. **Review** — check and confirm.

Details for each question: [First-Run Setup](first-run.md).

## 5. Add the people who use it

In the menu, open **Users** → **Add User**: a name and a password for each
person. That name and password are what they type on their computer to open
the shared folders.

Everyone can also sign in to the NAS's page with their own account: they
see only **My Account**, where they change their password and find their
folders and the apps (see [My Account](../user-guide/account.md)).

## 6. Make a shared folder

Open **Shares** → **Add Share**, give it a name (for example `Photos`) and
choose who may use it: one person, or a group of people. Then, on a
computer:

| On | How to open it |
|----|----------------|
| Windows | File Explorer, address bar: `\\freedomnas\Photos` |
| Mac | Finder → **Go** → **Connect to Server**: `smb://freedomnas/Photos` |
| Linux | the file manager's "Other Locations": `smb://freedomnas/Photos` |

Sign in with the user name and password from step 5.

## 7. Nice to have

- **No more browser warning:** **System** → **Certificate** → download the
  certificate authority and install it once on each computer and phone as
  a trusted authority.
- **Updates:** the **Updates** page says when there are some and installs
  them with one button.
- **Apps** (photos, films, passwords, ad blocking): **Plugins** → install
  **Containers**, then on the **Containers** page choose a disk for it and
  install apps from the catalogue — Jellyfin, Nextcloud, Immich,
  Vaultwarden, Pi-hole, Home Assistant. See [Containers](../user-guide/containers.md).
- **Short addresses for the apps** such as `https://jellyfin.freedomnas.home.arpa`:
  the [Reverse proxy](../user-guide/proxy.md).
- **More options:** the selector at the top of every page switches between
  **Assisted** (the simple view you start with), **Advanced** and
  **Expert**. See [UI Levels](../user-guide/ui-levels.md).

## If something goes wrong

| Problem | Try this |
|---------|----------|
| The page doesn't open | Wait a couple more minutes after switching on; check the cable; use the address from the router's list |
| "Invalid username or password" | On a new image it is `admin` / `freedomnas`; after the setup, the password you chose. Five wrong tries lock the name for five minutes |
| A computer can't open a shared folder | Check the user name and password from step 5, and that the person may use that share (**Shares**) |
| A person was given a temporary password | They sign in to the NAS's page with it once: it asks for a new one right away |
| The system disk broke | Put the image on a new disk, leave the data disks in and start: the NAS comes back as it was. With the installer it asks first (see [Installation](installation.md#restoring-an-existing-nas)) |
