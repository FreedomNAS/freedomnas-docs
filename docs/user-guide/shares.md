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

### Deleting an SMB Share

Click **Remove** next to a share and confirm. The share is removed but the
underlying directory is not deleted.

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

The entry is added to `/etc/exports` and `exportfs -ra` is called to reload.
Path, hosts and options must each be a single word: a space would split the
export line.

### Deleting an NFS Share

Click **Remove** and confirm. The entry is removed from `/etc/exports` and
`exportfs -ra` is called.

### Mounting from a Linux Client

```bash
mount -t nfs freedomnas:/mnt/datapool/backup /mnt/backup
```

For permanent mounts, add to `/etc/fstab`:

```
freedomnas:/mnt/datapool/backup  /mnt/backup  nfs  defaults,_netdev  0 0
```
