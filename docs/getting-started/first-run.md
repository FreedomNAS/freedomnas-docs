# First-Run Setup (WebUI Wizard)

When FreedomNAS starts for the first time (or is reset), it shows a 3-step
setup wizard before granting access to the dashboard.

## Accessing the Wizard

Open a browser and navigate to:

```
http://<hostname or IP>:8080
```

If the system is not yet initialized, the root URL automatically redirects
to the setup wizard.

## Step 1 — Identity

Configure the system's hostname and timezone.

| Field | Description | Example |
|-------|-------------|---------|
| **Hostname** | Short system name (letters, digits, hyphens) | `freedomnas` |
| **Timezone** | IANA timezone identifier | `Europe/Rome` |

Click **Continue** to proceed.

## Step 2 — Edition

Select the operating system edition that matches the OS currently running
on this machine.

| Edition | Select if… |
|---------|-----------|
| **Debian** | Running Debian trixie or compatible |
| **FreeBSD** | Running FreeBSD 14+ |
| **Arch Linux** | Running Arch Linux or compatible |

!!! warning
    This selection determines which JSON profile FreedomNAS loads for all
    system commands. Choosing the wrong edition will cause errors. This
    setting cannot be changed without re-running setup.

## Step 3 — Review

A summary table shows your choices. Review them, then click
**Initialize System**.

The wizard calls `POST /api/setup/initialize`, which:

1. Sets the hostname via `engine.execute("system", "hostname_set")`
2. Sets the timezone via `engine.execute("system", "timezone_set")`
3. Marks the system as initialized in `config.yaml`
4. Saves the configuration to the `.freedomnas` ZFS dataset

## Done

After initialization you'll see a confirmation screen. Click **Sign In**
to go to the login page.

## Login

Use the `admin` credentials configured during installation (or your OS
user credentials — FreedomNAS uses PAM authentication).

After logging in you'll be redirected to the **Dashboard**.

[Dashboard guide →](../user-guide/dashboard.md)
