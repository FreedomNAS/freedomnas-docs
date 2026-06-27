# File Shares

The Shares page manages SMB (Windows/macOS) and NFS (Linux/Unix) file shares.

## SMB Shares

SMB shares are accessible from Windows, macOS, and Linux clients using the
Samba protocol (also called CIFS or Windows File Sharing).

### Listing Shares

The SMB tab lists all current usershares with their path, read-only status,
and guest access setting.

### Creating an SMB Share

1. Go to **Shares → SMB**
2. Click **+ Add Share**
3. Fill in the form:

| Field | Description | Example |
|-------|-------------|---------|
| **Share Name** | Unique share identifier | `Documents` |
| **Path** | Absolute path to the directory | `/mnt/datapool/documents` |
| **Read Only** | Disallow write access | Off |
| **Guest Access** | Allow unauthenticated access | Off |
| **Valid Users** | Comma-separated usernames | `admin,sarah` |

4. Click **Create Share**

!!! warning "Pre-flight check"
    FreedomNAS verifies that `smb.conf` has usershares configured before
    creating a share. If the check fails (HTTP 409), re-run the first-run
    wizard to repair the Samba configuration.

### Deleting an SMB Share

Click the **trash** icon next to a share. A confirmation dialog appears.
The share is removed but the underlying directory is not deleted.

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

1. Go to **Shares → NFS**
2. Click **+ Add Export**
3. Fill in the form:

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | Identifier for this export | `backup` |
| **Path** | Absolute path to the directory | `/mnt/datapool/backup` |
| **Allowed Hosts** | IP or CIDR that may mount | `192.168.1.0/24` |
| **Options** | NFS export options | `rw,sync,no_subtree_check` |

4. Click **Add Export**

The entry is added to `/etc/exports` and `exportfs -ra` is called to reload.

### Deleting an NFS Share

Click the **trash** icon. The entry is removed from `/etc/exports` and
`exportfs -ra` is called.

### Mounting from a Linux Client

```bash
mount -t nfs freedomnas:/mnt/datapool/backup /mnt/backup
```

For permanent mounts, add to `/etc/fstab`:

```
freedomnas:/mnt/datapool/backup  /mnt/backup  nfs  defaults,_netdev  0 0
```
