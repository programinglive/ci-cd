#!/usr/bin/env node
'use strict';

/**
 * Open one pull request per repository that adds the standard CI caller.
 *
 * Idempotent by design: a repository whose workflow already references
 * `programinglive/ci-cd` is skipped, and a repository with an existing
 * `.github/workflows/ci.yml` is reported instead of overwritten.
 *
 * Usage:
 *   node scripts/rollout.mjs --dry-run
 *   node scripts/rollout.mjs --apply --repos repo-a,repo-b
 */

const { execFileSync } = require('node:child_process');

const ORG = 'programinglive';
const BRANCH = 'chore/standard-ci';
const WORKFLOW_PATH = '.github/workflows/ci.yml';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

function parseArgs(argv) {
  const options = { apply: false, repos: [], kind: 'node' };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--apply') options.apply = true;
    else if (argv[i] === '--dry-run') options.apply = false;
    else if (argv[i] === '--repos') options.repos = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (argv[i] === '--kind') options.kind = String(argv[++i] || 'node');
  }
  return options;
}

function listRepos() {
  const raw = run('gh', ['repo', 'list', ORG, '--limit', '200', '--json', 'name,isArchived']);
  return JSON.parse(raw).filter(r => !r.isArchived).map(r => r.name);
}

function hasStandardWorkflow(repo) {
  try {
    const file = run('gh', ['api', `repos/${ORG}/${repo}/contents/${WORKFLOW_PATH}`]);
    const content = JSON.parse(file);
    const text = Buffer.from(content.content || '', 'base64').toString('utf8');
    return text.includes('programinglive/ci-cd');
  } catch {
    return false;
  }
}

function workflowFor(kind) {
  return `name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
jobs:
  ci:
    uses: programinglive/ci-cd/.github/workflows/${kind === 'php' ? 'ci-php' : 'ci-node'}.yml@v1
`;
}

function rollout(repo, kind, apply) {
  if (hasStandardWorkflow(repo)) {
    console.log(`skip   ${repo}: already uses ci-cd`);
    return 'skipped';
  }

  let existing = '';
  try {
    const file = run('gh', ['api', `repos/${ORG}/${repo}/contents/${WORKFLOW_PATH}`]);
    existing = Buffer.from(JSON.parse(file).content || '', 'base64').toString('utf8');
  } catch {
    existing = '';
  }
  if (existing) {
    console.log(`review ${repo}: ${WORKFLOW_PATH} already exists without ci-cd`);
    return 'review';
  }

  if (!apply) {
    console.log(`plan   ${repo}: add ${WORKFLOW_PATH} (${kind})`);
    return 'planned';
  }

  const body = workflowFor(kind);
  run('gh', [
    'api', '--method', 'PUT', `repos/${ORG}/${repo}/contents/${WORKFLOW_PATH}`,
    '-f', `message=chore(ci): use the standard ProgramingLive CI workflow`,
    '-f', `content=${Buffer.from(body).toString('base64')}`,
    '-f', `branch=${BRANCH}`,
  ]);
  console.log(`done   ${repo}: committed ${WORKFLOW_PATH} on ${BRANCH}`);
  return 'done';
}

function main() {
  const options = parseArgs(process.argv);
  const repos = options.repos.length ? options.repos : listRepos();
  const summary = { planned: 0, done: 0, skipped: 0, review: 0 };
  for (const repo of repos) {
    try {
      summary[rollout(repo, options.kind, options.apply)] += 1;
    } catch (error) {
      console.error(`error  ${repo}: ${error.message}`);
    }
  }
  console.log(`\n${JSON.stringify(summary)}`);
  if (!options.apply) console.log('dry run: nothing was written. Pass --apply to commit.');
}

main();
