'use strict';

/**
 * Story Writer Service
 * 
 * Uses Claude to generate and rewrite member narrative stories.
 * Two modes:
 *   1. generateInitialStory() — from intake form answers
 *   2. rewriteStory() — after a call, using all available context
 */

const https = require('https');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// ─── Claude API ───────────────────────────────────────────────────────────

function callClaude(systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content && parsed.content[0]) {
            resolve(parsed.content[0].text);
          } else {
            reject(new Error(`Claude error: ${data}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Generate Initial Story (from intake) ─────────────────────────────────

async function generateInitialStory(member, intake) {
  const systemPrompt = `You are generating the initial narrative memory file for a new member of the Vitruvian Man program — a porn addiction recovery coaching system.

Based on their intake form answers, create a Member Story that will be read by the AI coach (Gyasi) before their first call.

The story must include:

1. YAML frontmatter with structured tags (see format below)
2. A brief "Who They Are" section — humanize them from the data
3. "Where They Are" — current state based on intake answers
4. "What We Know So Far" — key details from intake that should guide the first call
5. "First Call Guidance" — specific coaching direction for the very first conversation

YAML frontmatter format:
---
phone: "{phone}"
name: "{name}"
tier: "{tier}"
signup: "{date}"
calls: 0
last_call: null
days_clean: {days}
current_module: 0
status: active
tags: [list, of, relevant, tags]
---

Tags should reflect what we know: relationship status, what brought them here, how long they've struggled, emotional state. Use lowercase, hyphenated.

Write as narrative, not a clinical report. This is a person, not a case file.`;

  const userMessage = `New member intake data:

Name: ${member.name}
Phone: ${member.phone}
Email: ${member.email || 'not provided'}
Tier: ${member.tier || 'foundation'}
Signup date: ${new Date().toISOString().slice(0, 10)}

Intake answers:
- What brought you here? ${intake.whatBroughtYou || 'not answered'}
- How long have you been struggling with this? ${intake.howLong || 'not answered'}
- Are you currently in a relationship? ${intake.relationship || 'not answered'}
- Has your partner found out? ${intake.partnerKnows || 'not answered'}
- Have you tried to quit before? ${intake.triedBefore || 'not answered'}
- What does a typical day look like when urges hit? ${intake.urgePattern || 'not answered'}
- On a scale of 1-10, how ready are you to make a change? ${intake.readiness || 'not answered'}
- Is there anything else you want your coach to know? ${intake.anythingElse || 'not answered'}

Generate their initial Member Story.`;

  return callClaude(systemPrompt, userMessage);
}

// ─── Rewrite Story (post-call) ────────────────────────────────────────────

async function rewriteStory(member, previousStory, callSummaries, midCallNotes) {
  const systemPrompt = `You are maintaining the narrative memory for a coaching client in the Vitruvian Man program — a porn addiction recovery system.

Rewrite their Member Story based on ALL available information. This file is what the coach reads before the next call.

Include:
1. YAML frontmatter — update tags to reflect current patterns
2. "Where He Is" — current state, what just happened
3. "Patterns" — behaviors that keep showing up across calls. Triggers, coping mechanisms, timing patterns, emotional cycles.
4. "What's Working" — positive signals, engagement, breakthroughs
5. "What's Not" — gaps, stalls, risks, things the member avoids
6. "Next Call Guidance" — specific coaching direction. Reference Vitruvian Man course concepts (Compounding Machine, Depletive vs Accretive Inputs, brainwashing framework) where the member is ready for them.

Rules:
- Preserve insights from the previous story that still hold
- Update patterns with new evidence — an "emerging" pattern may now be "confirmed"
- Add new insights from the latest call
- Be specific, not generic. "Late-night triggers" not "has triggers."
- Write as narrative, not a report
- "Next Call Guidance" should give actionable coaching direction, not vague suggestions`;

  const callSummaryText = callSummaries.map((c, i) => 
    `Call ${i + 1} (${c.date}): ${c.summary}`
  ).join('\n\n');

  const notesText = midCallNotes.length > 0
    ? `\nMid-call notes from latest call:\n${midCallNotes.map(n => `- ${n.note}`).join('\n')}`
    : '';

  const userMessage = `Member: ${member.name} (${member.phone})
Tier: ${member.tier || 'foundation'}
Total calls: ${member.calls || 0}
Days clean: ${member.daysSober || 0}

PREVIOUS STORY:
${previousStory || 'No previous story.'}

ALL CALL SUMMARIES (chronological):
${callSummaryText || 'No calls yet.'}
${notesText}

Rewrite the Member Story.`;

  return callClaude(systemPrompt, userMessage);
}

// ─── Summarize Transcript ─────────────────────────────────────────────────

async function summarizeTranscript(transcript, memberName) {
  const systemPrompt = `You are summarizing a coaching call from the Vitruvian Man program (porn addiction recovery). The coach is Gyasi.

Summarize in 3-4 sentences. Include:
- What was discussed
- The member's emotional state
- Any commitments they made
- What to follow up on next time

Be specific and concrete. This summary will be used to rewrite the member's narrative memory.`;

  const userMessage = `Member: ${memberName}\n\nTranscript:\n${transcript}`;

  return callClaude(systemPrompt, userMessage);
}

module.exports = {
  generateInitialStory,
  rewriteStory,
  summarizeTranscript,
};
