# Virtual machines

Other operating systems running on the NAS, with the community module
**Virtual machines** (package `freedomnas-module-vm`): libvirt with QEMU/KVM on
Linux, QEMU with NVMM on FreeBSD. The page is at the Advanced level.

!!! danger "Not published"
    The module is not in any package repository, not even the `dev` one, and the
    [Plugins page](plugins.md) does not offer it. It stays out until it is stable
    and works fully, so that nobody trying it can harm their system. Until then
    it is only for development: copy `modules/vm` and `profiles/vm` from the
    `freedomnas-module-vm` git repository onto a test machine by hand.

!!! warning "Still in development"
    Hardware cannot be edited yet, and there is no passthrough. Install images
    have been tested on FreeBSD only; the console on FreeBSD and on Artix.

## Set up

Choose the pool that keeps the machines and press **Set up**. On Debian, Arch and
Artix the module's package has already brought the hypervisor (libvirt and QEMU,
with your init's service on Artix); elsewhere Set up installs it. It creates the
`<pool>/vm` dataset. If the processor's
virtualization is off, the page says so: turn on VT-x or AMD-V in the firmware
settings.

On Linux every administrator is in the `libvirt` group, to use `virsh`
and virt-manager with their own login; no other account may be, because it
gives root's power. Log out and back in first, also over SSH: a
session keeps the groups it started with. The WebUI does not need this. On
FreeBSD the group is `nvmm`, which owns `/dev/nvmm`.

## Machines

**New** asks for a name, processors, memory, a disk and a network. A disk is a
sparse zvol, so it uses space only as the machine writes to it.

Select a machine for its **Summary** and **Hardware**:

| Action | What it does |
|--------|--------------|
| **Start** | Starts the machine, and from now on it starts with the NAS |
| **Shut down** | Asks the guest to shut down, and from now on it stays off at boot |
| **Power off** | Stops it at once, like pulling the plug, and from now on it stays off at boot |
| **Remove** | Removes a stopped machine; its disks stay unless you tick the box |

While a machine told to shut down still runs, the page shows **Stopping…**. Some
systems ignore the request: use **Power off** then.

A new machine with the name of a removed one uses its kept disks again.

## Install images

**Install images** lists the `.iso` files on the pool, in `<pool>/vm/.iso`. Upload
one from your computer, or give an address and the NAS fetches it itself, which is
quicker for a large image. Windows also needs the virtio drivers while installing,
and a second image cannot be attached yet.

On a stopped machine, choose an image and press **Start from image**. The image
stays attached while the machine runs, also across restarts from inside the guest;
the next **Start** after the machine has been off goes to the disks. Like
**Start**, it also makes the machine start with the NAS from then on.

## Console

The **Console** tab shows the machine's screen in the browser, with **Ctrl+Alt+Del**
and **Full screen**. It opens no port on the network: the machine's VNC listens on
the NAS only and the WebUI bridges to it, after asking for your credentials.

After **Start from image** the console connects by itself.

A machine that FreedomNAS did not create is listed, but you manage it with the
hypervisor's own tools.

## Moving between editions

The configuration keeps what a machine is, never how a hypervisor runs it, and
every edition gives it the same hardware: UEFI, virtio disks and networks in the
same PCI slots, plain VGA, one serial port, and the same uuid and MAC addresses.
Disks are raw zvols on the pool, with no conversion.

So a machine is rebuilt when its pool comes back on another edition. Keep in mind:

- UEFI only: a system that needs a plain BIOS does not run here.
- The firmware's boot entries stay behind, so the guest must also boot through
  the fallback path `\EFI\BOOT\BOOTX64.EFI`.
- A few virtual chipset details still differ, and Windows may notice.

An installed Debian guest has moved from FreeBSD to Artix this way and booted
unchanged. The way back, and Windows guests, have not been tested yet.
