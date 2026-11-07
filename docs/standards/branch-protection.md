# Branch protection

Apply these rules to `main` in every repository that uses `programinglive/ci-cd`.

## Required settings

| Setting | Value |
|---|---|
| Require a pull request before merging | yes |
| Required approvals | 1 |
| Dismiss stale approvals on new commits | yes |
| Require status checks to pass | yes |
| Required checks | `Test, lint and build` (Node) or `Install, test and analyse` (PHP) |
| Require branches to be up to date | yes |
| Require conversation resolution | yes |
| Allow force pushes | no |
| Allow deletions | no |

The job names above come from `ci-node.yml` and `ci-php.yml`. They are stable
because they are declared with `name:`.

## Production

Production is gated by the `production` GitHub Environment, not by a branch
rule. A tag push starts `deploy-*.yml`; the job pauses until a reviewer
approves. Do not add an auto-approval path.

## Verification

```bash
gh api repos/<org>/<repo>/branches/main/protection
```

A repository without protection on `main` is a standard violation even if its
CI is green.
