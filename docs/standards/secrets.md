# Secrets and environments

Every repository owns its own credentials. Nothing in `programinglive/ci-cd`
stores a secret for another project.

## Environments

| Environment | When | Approval |
|---|---|---|
| *(none)* | pull requests, CI | — |
| `staging` | push to `main` | automatic |
| `production` | tag `v*` or manual dispatch | required reviewer |

Create both environments in **Settings → Environments**. On `production`,
enable **Required reviewers** and pick at least one owner. A deploy job that
targets `production` then waits for approval, and the approval is recorded in
the run.

## Secret names

The reusable workflows read fixed names, so templates work unchanged.

### Node / PHP hosts (`deploy-ssh-systemd.yml`)

| Secret | Meaning |
|---|---|
| `DEPLOY_HOST` | Hostname or Tailscale address |
| `DEPLOY_SSH_KEY` | Private key of the deploy user |

Host requirements:

- A `deploy` user (or the account in `remote-user`)
- **Passwordless sudo for the one unit** (`deploy ALL=(root) NOPASSWD: /bin/systemctl restart <service>`)
- `<app-dir>/releases/` writable by the deploy user
- `rsync` installed

The workflow never edits application files in place: it uploads a new release
directory, repoints `current`, restarts the unit, checks health, and rolls back
on failure.

### Netlify (`deploy-netlify.yml`)

| Secret | Meaning |
|---|---|
| `NETLIFY_AUTH_TOKEN` | Netlify personal access token |
| `NETLIFY_SITE_ID` | Site id from the Netlify UI |

### Release (`release.yml`)

| Secret | Meaning |
|---|---|
| `RELEASE_TOKEN` | Token allowed to push commits and tags |

## Rules

1. Never commit a secret. Use environment secrets.
2. Never reuse a personal token across repositories; create one per purpose.
3. Rotate `DEPLOY_SSH_KEY` when a device is lost.
4. Keep production approval on. Removing it removes the audit trail.
