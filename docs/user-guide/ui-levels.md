# UI Levels

FreedomNAS provides three interface levels to match the user's experience and
comfort with system administration. The level is selected in the topbar and
stored in the browser — it persists across sessions.

## The Three Levels

### Assisted (default)

Safe for everyday use. Destructive and advanced operations are hidden.

- Core features fully visible: storage health, shares list, user list,
  changing a user's password
- Advanced controls hidden: snapshot creation, IP editing, timezone, reboot,
  removing a user
- Danger zone hidden: shutdown, factory reset
- Terminal not shown

### Advanced

Full control of the system. Recommended for experienced users.

- Everything in Assisted
- Snapshot creation and management
- Network interface IP editing
- Removing users
- Timezone configuration
- Reboot and shutdown buttons
- Update configuration
- Services page: start, stop and restart
- Disks tab: why a disk needs attention, last self-test, short self-test

### Expert

Everything in Advanced, plus diagnostic and low-level information.

- Everything in Advanced
- Services page: enable or disable at boot
- Disks tab: long self-test and the full SMART attribute table
- Terminal always visible hint on Updates page
- Extended diagnostic cards
- Raw system info panels

## Changing the Level

Click the level selector in the **topbar** (top-right area of the UI).
The change applies immediately — no page reload needed.

The level is stored in `localStorage` under the key `fnas_ui_level`.
Clearing browser storage resets it to **Assisted**.

## How It Works (CSS)

The UI level is applied as a `data-ui` attribute on `<body>`:

```html
<body data-ui="assisted">
<body data-ui="advanced">
<body data-ui="expert">
```

CSS hides elements using class selectors:

```css
[data-ui="assisted"] .advanced-only { display: none !important; }
[data-ui="assisted"] .expert-only   { display: none !important; }
[data-ui="advanced"] .expert-only   { display: none !important; }
```

Elements tagged `.advanced-only` appear at Advanced and above.
Elements tagged `.expert-only` appear only at Expert.
