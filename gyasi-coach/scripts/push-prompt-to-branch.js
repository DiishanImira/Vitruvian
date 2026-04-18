#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) { /* optional */ }

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ELEVENLABS_API_KEY;
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID || 'agent_3601kk02sk5cfq583ned6q34k6s2';
const BRANCH_NAME = process.argv[2] || 'GyasiV2';
const PROMPT_FILE = process.argv[3] || path.join(__dirname, '..', 'src', 'prompts', 'gyasi-system.v2.md');

if (!API_KEY) {
  console.error('Error: ELEVENLABS_API_KEY not set');
  process.exit(1);
}

if (!fs.existsSync(PROMPT_FILE)) {
  console.error(`Error: prompt file not found: ${PROMPT_FILE}`);
  process.exit(1);
}

const PROMPT = fs.readFileSync(PROMPT_FILE, 'utf-8');
const HEADERS = { 'xi-api-key': API_KEY, 'Content-Type': 'application/json' };

async function resolveBranchId() {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}/branches`,
    { headers: HEADERS }
  );
  const data = await res.json();
  if (!res.ok) {
    console.error('List branches failed:', JSON.stringify(data, null, 2));
    process.exit(1);
  }
  const branches = data.results || data.branches || data;
  const match = branches.find((b) => b.name === BRANCH_NAME);
  if (!match) {
    console.error(`Branch "${BRANCH_NAME}" not found. Available:`);
    branches.forEach((b) => console.error(`  - ${b.name} (${b.id || b.branch_id})`));
    process.exit(1);
  }
  return match.id || match.branch_id;
}

async function pushPrompt(branchId) {
  const url = `https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}?branch_id=${branchId}`;
  const body = {
    conversation_config: {
      agent: { prompt: { prompt: PROMPT } },
    },
  };
  const res = await fetch(url, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Update failed:', JSON.stringify(data, null, 2));
    process.exit(1);
  }
  return data;
}

(async () => {
  console.log(`Agent: ${AGENT_ID}`);
  console.log(`Branch: ${BRANCH_NAME}`);
  console.log(`Prompt: ${PROMPT_FILE} (${PROMPT.length} chars)`);
  console.log('');
  console.log('Resolving branch ID...');
  const branchId = await resolveBranchId();
  console.log(`Branch ID: ${branchId}`);
  console.log('');
  console.log('Pushing prompt...');
  const result = await pushPrompt(branchId);
  const versionId = result.version_id || result.agtvrsn || '(see response)';
  console.log('Done.');
  console.log(`New version: ${versionId}`);
})();
