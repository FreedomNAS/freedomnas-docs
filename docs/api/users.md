# Users API

## GET /api/users/

List all users recorded in `config.yaml`.

**Auth required:** yes

**Response:**

```json
{
  "users": [
    {
      "username": "admin",
      "groups": ["sudo", "samba"],
      "shell": "/bin/bash"
    },
    {
      "username": "sarah",
      "groups": ["samba"],
      "shell": "/bin/bash"
    }
  ]
}
```

!!! note
    This returns what is stored in `config.yaml` — not a live read from
    `/etc/passwd`. Users created outside FreedomNAS will not appear here.

---

## POST /api/users/

Create a new OS user and persist to `config.yaml`.

**Auth required:** yes

**Request body:**

```json
{
  "username": "sarah",
  "groups": ["samba"],
  "shell": "/bin/bash",
  "uid": 1001,
  "gid": 1001
}
```

`username` is required. `groups` defaults to `[]`, `shell` to `/bin/bash`.
`uid` and `gid` are optional — omit them to let the OS assign IDs.

!!! warning "Passwords are not set via this endpoint"
    The API creates the OS account but does **not** set a password. The user
    will be locked until a password is set via the terminal
    (`passwd <username>`). Password management via the API is deferred to a
    future release.

**Behaviour (dual write):**

1. `engine.execute("users", "create", username=..., groups=..., shell=..., uid=..., gid=...)`
2. `config.add_user({username, groups, shell, [uid, gid]})`

**Response:**

```json
{ "username": "sarah" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 422 | `username` is missing |
| 500 | OS user creation failed (duplicate username, invalid groups, etc.) |

---

## DELETE /api/users/{target}

Delete an OS user and remove from `config.yaml`.

**Auth required:** yes

**Path parameter:** `target` — the username to delete

**Behaviour (dual write):**

1. `engine.execute("users", "delete", username=target)`
2. `config.remove_user(target)`

**Response:**

```json
{ "detail": "User sarah deleted" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 500 | OS user deletion failed |

!!! warning
    The API does not prevent deleting the currently authenticated user or
    the last admin account. Guard these cases in the UI layer.
