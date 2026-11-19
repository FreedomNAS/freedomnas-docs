# Git & GitHub

FreedomNAS lives in the GitHub organization
[FreedomNAS](https://github.com/FreedomNAS): sources, issues, CI (GitHub
Actions on hosted runners), the package repositories (release assets of
freedomnas-deb, freedomnas-arch, freedomnas-void and freedomnas-freebsd),
the images (freedomnas-image) and the website and documentation (GitHub
Pages). Codeberg, where the project started, is no longer used.

## Remote URLs

All remotes use SSH, not HTTPS:

```
git@github.com:FreedomNAS/freedomnas-core.git
git@github.com:FreedomNAS/freedomnas-profiles.git
git@github.com:FreedomNAS/freedomnas-installer.git
git@github.com:FreedomNAS/freedomnas-webui.git
git@github.com:FreedomNAS/freedomnas-docs.git
```

The image builder is `freedomnas-builder` on GitHub (its checkout is still
called `freedomnas-image-builder`, the name the build scripts look for next
to the other repositories), and the website is `freedomnas.github.io`.

## CI

| Workflow | Where | What |
|----------|-------|------|
| `tests` | core, webui | the test suites, on every push and pull request |
| `notify-packages` | every component | tells the four package repositories; they build once, ten minutes after the last push |
| `notify-image-builder` | core, profiles, webui | a push to `main` asks freedomnas-image for the release images |
| `follow-lts` | linux-freedomnas | every night, the newest LTS kernel OpenZFS supports |
| `autobump` | freedomnas-overlay | every night, the overlay's ebuilds on their upstream's newest version |
| `pages` | freedomnas-docs, freedomnas.github.io | the documentation and the website |

The organization secret `PACKAGES_DISPATCH_TOKEN` carries the dispatches
from one repository to another; everything else uses each run's own
`GITHUB_TOKEN`. The signing keys are organization secrets too
(`APT_SIGNING_KEY`, `ARCH_SIGNING_KEY`, `VOID_SIGNING_KEY`,
`FREEBSD_SIGNING_KEY`).

## Commit Conventions

- All commits omit `Co-Authored-By` attribution
- Imperative mood, present tense: "Add snapshot creation API" not "Added..."
- Do not use `--no-verify` or skip pre-commit hooks

## Branch Strategy

- `dev` — where work happens; every push publishes snapshots
- `main` — stable, always deployable: `dev` is moved onto it only once a
  snapshot has been tested on real hardware, and the release is tagged
  (`v0.9.9` is the first, then `v0.9.10`, `v0.9.11`, `v0.9.12`, `v0.9.20`, `v0.9.21`). In freedomnas-image-builder and
  freedomnas-module-template `master` follows `main`.
- Images: built from `main` they are the stable images and install only
  from the `main` package component; built from `dev` they install only
  from `dev`.
- Feature branches for larger changes (optional for solo work)
