# ProgramingLive CI/CD

Central, reusable CI/CD for every ProgramingLive repository.

Projects do not copy pipeline logic. They add a small caller workflow that
references a reusable workflow here, pinned to a major tag:

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
jobs:
  ci:
    uses: programinglive/ci-cd/.github/workflows/ci-node.yml@v1
```

## Why this repository exists

Until 7 November 2026 every project had its own pipeline, and most had none.
The live monitor was deployed by `scp` plus `systemctl restart`, which meant a
production change could ship with no review, no test gate, and no record of
what was verified. That is the failure this repository removes.

## What is in scope (v1)

| Stack | CI | Deploy |
|---|---|---|
| Node / MCP servers | `ci-node.yml` | `deploy-ssh-systemd.yml` |
| PHP / Laravel | `ci-php.yml` | `deploy-ssh-systemd.yml` |
| Next.js / static web | `ci-node.yml` | `deploy-netlify.yml` |

Mobile (Expo/EAS) and desktop (Tauri MSI) are deliberately out of scope for v1.

## Rules

1. **No direct production mutation.** A release artifact is produced by a
   workflow, never by editing files on a server over SSH.
2. **Production is gated.** Deploys to production run in the `production`
   GitHub Environment and require an approving reviewer.
3. **No shared secrets.** Each repository owns its environment secrets. This
   repository never stores credentials for another project.
4. **Every deploy leaves evidence.** Commit SHA, version, health check result,
   and duration are written to the workflow summary.
5. **Pinned versions.** Callers use `@v1`; releases publish immutable `v1.x.y`
   tags as well.

## Layout

```
.github/workflows/   reusable workflows (workflow_call)
actions/             composite actions shared by the workflows
templates/           caller workflows copied into projects
docs/                standards and the design spec
scripts/             rollout helper
```

## Status

Design stage. See
[docs/specs/2026-11-07-ci-cd-standard.md](docs/specs/2026-11-07-ci-cd-standard.md).
Nothing is wired into a project yet.
