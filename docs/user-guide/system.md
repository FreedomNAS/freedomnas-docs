# System Settings

The System page contains general system configuration and the danger zone.

## Hostname

Change the system's hostname:

1. Enter the new hostname in the **Hostname** field
2. Click **Save**

The change applies immediately via `hostnamectl set-hostname` (or the
equivalent profile command) and is persisted to `config.yaml`.

Hostname rules: letters, digits, and hyphens only. No dots, no underscores,
no spaces.

## Timezone

!!! info "Advanced level required"
    Timezone settings are only visible at **Advanced** UI level and above.

Change the timezone:

1. Open the **Timezone** list — it holds every IANA zone the browser knows,
   with the one the system currently reports preselected. Typing a few
   letters jumps to it (e.g. `Europe/R` for `Europe/Rome`).
2. Click **Save**

!!! warning "Not applied yet"
    There is no timezone endpoint after setup yet: **Save** does not change
    the system timezone. The timezone chosen in the setup wizard is applied
    (`timedatectl set-timezone`) and recorded in `config.yaml`.

## UI Level

Select your preferred interface complexity level. See [UI Levels](ui-levels.md)
for a full explanation of each level.

## Danger Zone

!!! info "Advanced level required"
    Danger zone buttons are only visible at **Advanced** UI level and above.

The danger zone contains irreversible operations:

### Reboot

Reboots the system immediately. A confirmation dialog appears first.
Any active file transfer sessions will be interrupted.

### Shutdown

Powers off the system immediately. A confirmation dialog appears first.

!!! warning
    After shutdown, the system can only be powered on by physically pressing
    the power button. Ensure you have physical access or IPMI/iDRAC remote
    access before shutting down.
