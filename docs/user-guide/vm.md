# Virtual machines

Other operating systems running on the NAS, with the community module
**Virtual machines** (package `freedomnas-module-vm`): libvirt with QEMU/KVM on
Linux, bhyve with vm-bhyve on FreeBSD. Install it from the
[Plugins page](plugins.md). The page is at the Advanced level.

!!! warning "Still in development"
    You can create, start and stop a machine, but the page has no console and
    no way to attach an installation image yet.

## Set up

Choose the pool that keeps the machines and press **Set up**. FreedomNAS installs
the hypervisor and creates the `<pool>/vm` dataset. If the processor's
virtualization is off, the page says so: turn on VT-x or AMD-V in the firmware
settings.

On Linux the account that ran Set up joins the `libvirt` group, to use `virsh`
and virt-manager with its own login. Log out and back in first, also over SSH: a
session keeps the groups it started with. The WebUI does not need this. On
FreeBSD vm-bhyve is for root only.

## Machines

**New** asks for a name, processors, memory, a disk and a network. A disk is a
sparse zvol, so it uses space only as the machine writes to it.

Select a machine for its **Summary** and **Hardware**:

| Action | What it does |
|--------|--------------|
| **Start** | Starts the machine, and from now on it starts with the NAS |
| **Shut down** | Asks the guest to shut down, and from now on it stays off at boot |
| **Power off** | Stops it at once, like pulling the plug |
| **Remove** | Removes a stopped machine; its disks stay unless you tick the box |

While a machine told to shut down still runs, the page shows **Stopping…**. Some
systems ignore the request: use **Power off** then.

A new machine with the name of a removed one uses its kept disks again.

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

A real move of an installed system between editions has not been tested yet.
