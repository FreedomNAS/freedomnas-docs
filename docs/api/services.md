# Services API

Every service the edition's init knows, its state, and whether it starts at
boot. The commands come from the init profile (`services.list_all`,
`services.is_running`, `services.is_enabled`, `start`, `stop`, `restart`,
`enable`, `disable`), so the routes are the same on every edition. The WebUI's
[Services page](../user-guide/services.md) uses them.

## GET /api/services/

**Auth required:** yes

```json
{
  "services": [
    {"name": "nfs-server", "running": true, "enabled": true, "role": "NFS file sharing"},
    {"name": "smbd", "running": true, "enabled": true, "role": "SMB file sharing"},
    {"name": "sshd", "running": true, "enabled": true, "role": "SSH"},
    {"name": "udevd", "running": true, "enabled": true, "role": null}
  ]
}
```

- `name` — as the init knows it, one per `services.list_all` line
- `running` — `services.is_running` printed `yes`
- `enabled` — `services.is_enabled` printed `yes`: it starts at boot
- `role` — what FreedomNAS uses it for (`system.ssh_service`,
  `samba.smb_service`, `nfs.nfs_service`), else `null`

Both checks print `yes` instead of failing, so a stopped service is not
logged as a failed command. On the real test box (Void, runit) the list of
38 services answers in about 0.1 s.

## POST /api/services/{name}/{action}

`action` is `start`, `stop`, `restart`, `enable` or `disable`. `404` for a
name `services.list_all` does not list or another action. The answer is the
service's entry as above, read again after the action.

- `start`, `stop`, `restart` act now and last until the next boot
- `enable`, `disable` decide whether it starts at boot, and are written to
  `config.yaml` too (dual write): the SSH service as `system.ssh_enabled`,
  every other one under `services.boot.<name>`. The reconciler applies them
  at every boot ([Reconciler](../architecture/reconciler.md)), so a feature's
  service disabled here is not turned back on

On runit, enabling links the service into the service directory and runsvdir
starts it at its next scan, within 5 s: the answer to `enable` can still say
`running: false`.

Verified on the real test box (Void): Samba stopped (SMB unreachable),
started and restarted (SMB back); `nfs-server` disabled at boot stayed off
across a reboot, enabled again it came back with its export.
