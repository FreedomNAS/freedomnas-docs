# Git & Codeberg

## Remote URLs

All remotes use SSH, not HTTPS:

```
git@codeberg.org:FreedomNAS/freedomnas-core.git
git@codeberg.org:FreedomNAS/freedomnas-profiles.git
git@codeberg.org:FreedomNAS/freedomnas-installer.git
git@codeberg.org:FreedomNAS/freedomnas-webui.git
git@codeberg.org:FreedomNAS/freedomnas-docs.git
```

## SSH Key

The SSH key for Codeberg is `~/.ssh/codeberg-nas`.

SSH config (`~/.ssh/config`):

```
Host codeberg.org
  IdentityFile ~/.ssh/codeberg-nas
```

## Push Command (CachyOS)

On CachyOS, there is no interactive TTY for SSH key passphrase entry.
Use the X11 askpass helper:

```bash
DISPLAY=:0 \
SSH_ASKPASS=/usr/lib/ssh/x11-ssh-askpass \
SSH_ASKPASS_REQUIRE=force \
bash -c 'eval "$(ssh-agent -s)" && ssh-add ~/.ssh/codeberg-nas && git push'
```

## Commit Conventions

- All commits omit `Co-Authored-By` attribution
- Imperative mood, present tense: "Add snapshot creation API" not "Added..."
- Do not use `--no-verify` or skip pre-commit hooks

## Branch Strategy

- `main` — stable, always deployable
- Feature branches for larger changes (optional for solo work)
