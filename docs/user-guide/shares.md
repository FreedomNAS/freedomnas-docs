# File Shares

The Shares page manages SMB (Windows/macOS) and NFS (Linux/Unix) file shares.

## SMB Shares

SMB shares are accessible from Windows, macOS, and Linux clients using the
Samba protocol (also called CIFS or Windows File Sharing).

### Listing Shares

The **SMB / CIFS** tab lists the shares recorded by FreedomNAS with their
path, the users recorded for them and whether they are read-only.

### Creating an SMB Share

1. Open the **SMB / CIFS** tab
2. Click **Add Share**
3. Fill in the form:

| Field | Description | Example |
|-------|-------------|---------|
| **Share Name** | Unique share identifier | `Documents` |
| **Directory Path** | Absolute path to the directory | `/mnt/datapool/documents` |
| **Read-only share** | Nobody may write, its creator included | Off |

4. Click **Create Share**

Everyone with an account can read a new share, and the account that created
it has full control; with **Read-only share**, everyone can only read. The
share is recorded with that access list, so restoring the system brings it
back exactly so. Accounts log in to SMB with their FreedomNAS password (see
[Users](users.md)). There is no guest access.

!!! warning "Pre-flight check"
    FreedomNAS verifies that `smb.conf` has usershares configured before
    creating a share. If the check fails (HTTP 409), re-run the first-run
    wizard to repair the Samba configuration.

### Shares for a group of accounts

Under **Who uses it**, *A group of accounts* makes a share several people use
together, such as a family's photos: every member reads and writes every
file in it, whoever put it there.

| Field | Description | Example |
|-------|-------------|---------|
| **Group** | The Unix group made for the share (lowercase letters, digits, `-` and `_`); it is filled in from the share name | `famiglia` |
| **Members** | *Every account, also those added later* (the default), or the accounts ticked below it | `luca`, `anna` |

The path has to be the directory a dataset of a data pool mounts on. The
dataset becomes the group's: root owns its directory, the group may read and
write everything in it (the files already there included), and what anyone
creates there stays the group's, through an ACL every new file and folder
inherits. Only the group's members can open the share; other accounts are
refused. A name an account or a group of the system already has is refused.

**Members** on the share's row changes who belongs to the group, and whether
accounts created later join it by themselves. Membership is recorded on the
accounts (see [Users](users.md)), so a restore brings the group back first,
then the accounts in it, and gives the dataset to the group again (the group
may get another number on the new system; the old number's permissions are
taken away).

On Linux, FreedomNAS adds `create mask = 0770` and `directory mask = 0770`
to Samba's global settings the first time: with Samba's own default the group
could only read the files another member creates. FreeBSD's ZFS ACLs need
nothing more.

### Deleting an SMB Share

Click **Remove** next to a share and confirm. The share is removed but the
underlying directory is not deleted. A group share's directory goes back to
root alone, and its group is deleted when no other share uses it; the files
stay, owned by whoever created them.

### Connecting from a Client

=== "Windows"
    Open File Explorer and enter in the address bar:
    ```
    \\freedomnas\Documents
    ```

=== "macOS"
    Finder → Go → Connect to Server:
    ```
    smb://freedomnas/Documents
    ```

=== "Linux"
    ```bash
    mount -t cifs //freedomnas/Documents /mnt/share -o username=admin
    ```

---

## NFS Shares

NFS shares are optimized for Linux/Unix clients and provide better
performance for large file transfers in local networks.

### Creating an NFS Share

1. Open the **NFS** tab
2. Click **Add Share**
3. Fill in the form:

| Field | Description | Example |
|-------|-------------|---------|
| **Share Name** | Identifier for this export | `backup` |
| **Directory Path** | Absolute path to the directory | `/mnt/datapool/backup` |
| **Allowed Hosts** | IP, CIDR or hostname that may mount | `192.168.1.0/24` |
| **Export Options** | NFS export options — **Advanced** UI level; default `rw,sync,no_subtree_check` | `ro,sync` |

4. Click **Create Share**

The entry is added to `/etc/exports` and the export table is reloaded
(`exportfs -ra` on Linux, `service mountd onereload` on FreeBSD).
Path, hosts and options must each be a single word: a space would split the
export line.

### Deleting an NFS Share

Click **Remove** and confirm. The entry is removed from `/etc/exports` and
the export table is reloaded.

### Mounting from a Linux Client

```bash
mount -t nfs freedomnas:/mnt/datapool/backup /mnt/backup
```

For permanent mounts, add to `/etc/fstab`:

```
freedomnas:/mnt/datapool/backup  /mnt/backup  nfs  defaults,_netdev  0 0
```
