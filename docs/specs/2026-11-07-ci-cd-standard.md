# ProgramingLive CI/CD standard — design

- Status: proposed, not implemented
- Date: 2026-11-07
- Owner: ProgramingLive

## 1. Problem

CI/CD is inconsistent across the organisation. Measured on 7 November 2026:

| Repository | Runner | Pipeline |
|---|---|---|
| `dev-workflow-mcp-server` | self-hosted Windows (MMCH) | CI, Netlify deploy, GitHub release |
| `programinglive` | GitHub-hosted Ubuntu | CI, Netlify deploy on `v*` |
| `zettly`, `commiter`, `zettly-editor` | GitHub-hosted | release/publish only |
| `absen`, `detak`, `windows` | GitHub-hosted | tests only, no deploy |
| `factory` | none | backup watchdog only |
| most other repositories | none | none |

Deployment was manual: the live monitor was shipped with `scp` and
`systemctl restart`, the Factory by copying a release directory, Clinic by
scripts on the VM, and web by the Netlify CLI. No single record proved what a
deployment actually verified.

The immediate trigger: a monitor fix was deployed directly to production on
7 November 2026 because no pipeline existed for it.

## 2. Goals

1. One place defines how CI runs and how a deploy is proven.
2. Every project gets the same checks with a 5–10 line caller workflow.
3. Production deploys require an approving reviewer and leave evidence.
4. No project can bypass the pipeline without it being visible.

Non-goals for v1: mobile and desktop release automation; replacing GitHub
Actions with another engine; a central deploy daemon.

## 3. Decisions

### 3.1 Reusable workflows, not a central orchestrator

A library of `workflow_call` workflows plus composite actions, consumed with
`uses: programinglive/ci-cd/.github/workflows/<name>.yml@v1`. A central
orchestrator was rejected for v1: it is a larger project and it would own
production credentials. The library keeps credentials in each repository's
GitHub Environment while still enforcing one standard.

### 3.2 Runners

- Windows/Node jobs: the existing self-hosted runner on MMCH
  (`[self-hosted, windows, mmch]`).
- Linux jobs: a new self-hosted runner on **bw-tools** (`100.77.138.14`,
  `[self-hosted, linux, bw-tools]`). `docker-alma` no longer exists, and
  `bw-app` is production.
- GitHub-hosted minutes are not used unless a project explicitly opts in.

Capacity note: bw-tools is `e2-custom-2-4096` (2 vCPU, 4 GB) and also runs
`central-mcp-gateway`, `devwf-managed`, and `notification-hub`. CI jobs must be
serialised with `concurrency` and must not run untrusted fork code with access
to secrets. If queueing becomes a problem, a dedicated small runner VM is the
follow-up.

### 3.3 Environments and secrets

| Environment | Trigger | Approval |
|---|---|---|
| (none) | pull request | — |
| `staging` | push to `main` | automatic |
| `production` | tag `v*` or manual dispatch | required reviewer |

Secret naming is fixed so templates work unchanged:

```
DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY     # ssh-systemd targets
DEPLOY_APP_DIR, DEPLOY_SERVICE, HEALTH_URL   # ssh-systemd layout
NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID          # netlify targets
```

Secrets live in each repository's Environment, never in this repository.

## 4. Repository layout

```
.github/workflows/
  ci-node.yml
  ci-php.yml
  deploy-netlify.yml
  deploy-ssh-systemd.yml
  release.yml
actions/
  node-setup/action.yml
  php-setup/action.yml
  deploy-evidence/action.yml
templates/
  ci-node.yml
  ci-php.yml
  deploy-netlify.yml
  deploy-ssh-systemd.yml
docs/
  specs/2026-11-07-ci-cd-standard.md
  standards/branch-protection.md
  standards/secrets.md
scripts/
  rollout.mjs
```

## 5. Workflow contracts

### 5.1 `ci-node.yml`

Inputs: `node-version` (default 22), `package-manager` (`npm`|`pnpm`|`yarn`),
`run-build` (bool), `run-lint` (bool). Steps: checkout, cached install, test,
lint, build, `npm audit --omit=dev --audit-level=high`. Never uploads raw logs.

### 5.2 `ci-php.yml`

Inputs: `php-version` (default 8.3), `composer-flags`, `run-static-analysis`.
Steps: setup PHP, composer cache + install, `vendor/bin/paratest
--processes=4 --runner=WrapperRunner`, optional PHPStan/Pint.

### 5.3 `deploy-netlify.yml`

Inputs: `site-id-secret` name, `build-command`, `publish-dir`. Runs in the
`production` environment. Deploys with a pinned Netlify CLI version and writes
evidence.

### 5.4 `deploy-ssh-systemd.yml`

Inputs: `host`, `app-dir`, `service`, `health-url`, `artifact-path`,
`release-command`. Behaviour:

1. Build a timestamped release directory (`<app-dir>/releases/<sha>`).
2. Upload the artifact over SSH (rsync/scp with a deploy key).
3. Point `current` at the new release.
4. Restart the unit and wait for it.
5. Poll `health-url` until HTTP 200 or a timeout.
6. On failure, repoint `current` to the previous release, restart, and fail the
   job.
7. Write evidence (SHA, version, health status, duration).

This is the workflow that replaces the manual monitor deploy.

### 5.5 `release.yml`

Inputs: `release-type`. Runs the project's `npm run release`, pushes the tag,
and publishes the `vX.Y.Z` GitHub release. Deploy workflows trigger from the
tag, not from a laptop.

## 6. Evidence

`actions/deploy-evidence` writes to `$GITHUB_STEP_SUMMARY`:

```
Deploy: <project> <version>
Commit: <sha>
Environment: production
Health: 200 OK at <url> after <n>s
Actor: <login>
```

Optionally posts the same record to Notification Hub (`/api/v1/notify`,
`topic=deploys`) when `NOTIFY_URL` is configured. The submission is best-effort
and never fails a deploy.

## 7. Rollout

1. Publish this repository at `v1.0.0` and move the `v1` tag.
2. Pilot three repositories: `dev-workflow-mcp-server`, `programinglive`, and
   one PHP project (`clinic`).
   - `dev-workflow-mcp-server` also migrates the monitor deploy from manual
     `scp` to `deploy-ssh-systemd.yml`.
3. `scripts/rollout.mjs` opens one pull request per repository adding the caller
   workflow. It is idempotent: a repository that already references `ci-cd@v1`
   is skipped.
4. Merge in waves; required checks are enabled per repository after the first
   green run.

## 8. Branch protection

Each repository enables, on `main`: require a pull request, require the CI
check, require branches to be up to date, and disallow force pushes. The exact
check names are listed in `docs/standards/branch-protection.md` once the
workflows exist.

## 9. Rollback

`deploy-ssh-systemd` keeps the previous release directory and repoints `current`
on a failed health check. Netlify keeps the previous deploy and can be restored
from the Netlify UI; the workflow prints the previous deploy id.

## 10. Risks

| Risk | Mitigation |
|---|---|
| A runner on bw-tools competes with the MCP gateway | concurrency limit, no untrusted code with secrets, follow-up dedicated VM |
| Reusable workflows lock projects to GitHub Actions | accepted; the organisation's repositories live on GitHub |
| Production approval adds latency | tags only for production; hotfixes use the same path with an expedited reviewer |
| Secrets drift between repositories | fixed secret names and a documented checklist |
| Workflow changes break many projects at once | callers pin `@v1`; breaking changes require `v2` |

## 11. Open questions

1. Should `clinic` (PHP) deploy from `bw-tools` or from a GitHub-hosted runner
   with a restricted deploy key?
2. Which repository owns the Notification Hub deploy events: this one or
   `notification-hub`?
3. Do we migrate the existing `programinglive` Netlify workflow or leave it and
   only standardise new projects?
