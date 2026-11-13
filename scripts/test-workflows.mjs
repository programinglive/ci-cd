#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows');
const TEMPLATES_DIR = path.join(ROOT, 'templates');

let failures = 0;
let passes = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failures += 1;
  } else {
    console.log(`PASS: ${message}`);
    passes += 1;
  }
}

function checkWorkflowFile(filePath) {
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
  console.log(`\n--- Checking ${relPath} ---`);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  let checkedShellCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s*shell:\s*([^\s#]+)/);
    if (match) {
      checkedShellCount += 1;
      const val = match[1].trim();
      assert(
        !val.includes('${{'),
        `${relPath}:${i + 1} shell key must NOT use dynamic expressions: "${val}"`
      );
      assert(
        ['bash', 'sh', 'cmd', 'powershell', 'pwsh', 'python'].includes(val),
        `${relPath}:${i + 1} shell key must be an allowed static shell identifier: "${val}"`
      );
    }
  }
  if (checkedShellCount > 0) {
    console.log(`Verified ${checkedShellCount} static shell declaration(s) in ${relPath}`);
  }

  // Check runner default standard matches bw-tools
  if (content.includes('default: \'["self-hosted","linux"')) {
    assert(
      content.includes('default: \'["self-hosted","linux","bw-tools"]\''),
      `${relPath} self-hosted runner default must specify ["self-hosted","linux","bw-tools"]`
    );
  }

  // Check for balanced braces
  const openBraces = (content.match(/\${{/g) || []).length;
  const closeBraces = (content.match(/}}/g) || []).length;
  assert(
    openBraces === closeBraces,
    `${relPath} balanced GitHub expressions (found ${openBraces} open, ${closeBraces} close)`
  );
}

function main() {
  console.log('Running GitHub Actions CI/CD Reusable Workflow Integrity Suite');

  const workflowFiles = fs.readdirSync(WORKFLOWS_DIR)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map(f => path.join(WORKFLOWS_DIR, f));

  for (const file of workflowFiles) {
    checkWorkflowFile(file);
  }

  if (fs.existsSync(TEMPLATES_DIR)) {
    const templateFiles = fs.readdirSync(TEMPLATES_DIR)
      .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map(f => path.join(TEMPLATES_DIR, f));
    for (const file of templateFiles) {
      checkWorkflowFile(file);
    }
  }

  console.log('\n========================================');
  console.log(`Passed checks: ${passes}`);
  if (failures > 0) {
    console.error(`TOTAL FAILURES: ${failures}`);
    process.exit(1);
  } else {
    console.log('ALL WORKFLOW INTEGRITY CHECKS PASSED');
    process.exit(0);
  }
}

main();
