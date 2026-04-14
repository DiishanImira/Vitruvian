'use strict';

/**
 * Story Writer Service
 *
 * Uses Claude to generate and rewrite member narrative stories.
 * Two modes:
 *   1. generateIntakeStory()       — lean hypothesis brief from intake, before call 1
 *   2. rewriteStoryAfterCall()     — full narrative rewrite after every call
 *
 * Legacy exports kept for backward compatibility:
 *   generateInitialStory(), rewriteStory(), summarizeTranscript()
 */

const https = require('https');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// ─── Claude API ───────────────────────────────────────────────────────────

function callClaude(systemPrompt, userMessage, maxTokens = 2000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
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

// ─── Mode 1: INTAKE STORY (called after signup, 0 prior calls) ────────────
// Goal: lean, honest, hypothesis-driven. NOT a narrative conclusion.
// A working document for call 1.

async function generateIntakeStory(intakeAnswers) {
  const systemPrompt = `You are preparing a coaching brief for Gyasi, a men's coach, before his first call with a new member.

Based ONLY on the intake answers below, write a lean member brief. Do not infer or conclude — only note what was literally said, then generate hypotheses to test.

FORMAT:
---
## What We Know (Intake Facts)
[bullet list — only literal answers, no interpretation]

## Hypotheses to Explore
[3-5 numbered hypotheses, each clearly labeled as an assumption]
Example format: "H1: [Assumption] — suggested question: [specific question to test this]"

## First Call Priorities
[2-3 specific things Gyasi should focus on in call 1 — keep it tight, not a script]

## Open Questions
[things the intake didn't reveal that matter — what we don't know yet]
---

Keep it under 400 words. Be honest about uncertainty. This is a working hypothesis document, not a story.`;

  const userMessage = `INTAKE DATA:\n${intakeAnswers}`;

  return callClaude(systemPrompt, userMessage, 1000);
}

// ─── Mode 2: POST-CALL REWRITE (called after every call, 1+ prior calls) ──
// Goal: full rewrite incorporating everything known. Replace the previous story entirely.

async function rewriteStoryAfterCall(previousStory, transcript, callDate, callCount) {
  const systemPrompt = `You are updating the coaching file for a member of the Vitruvian Man program after a coaching call with Gyasi.

Rewrite the member story completely — this replaces the previous version. Use the call transcript and any prior story context to build the most accurate, useful picture of who this person is.

FORMAT:
---
## Who He Is
[2-3 paragraphs. Specific. Based on what actually came out in calls, not intake assumptions. Update and correct anything from prior story that the conversation validated or disproved.]

## Where He Is Right Now
[Current state — emotional, motivational, relational. What's the actual terrain at this moment?]

## What We Know Works / Doesn't Work
[Specific patterns observed across calls. What resonates with him? What falls flat? What approaches have moved him?]

## Key Facts
[bullet list — specific confirmed details: triggers, relationship status updates, faith context, streaks, commitments made, anything concrete]

## Next Call Guidance
[This section is the roadmap for the NEXT call. 3-5 specific things to explore, follow up on, or push. Written as if briefing Gyasi before that call. Reference specific things from this call that need follow-up.]
---

Be specific. Use his actual words where possible. This document should make Gyasi feel like he remembers everything about this person the moment he reads it.`;

  const userMessage = `PREVIOUS STORY:
${previousStory || 'No previous story.'}

CALL TRANSCRIPT:
${transcript}

CALL DATE: ${callDate}
TOTAL CALLS TO DATE: ${callCount}`;

  return callClaude(systemPrompt, userMessage, 2000);
}

// ─── Legacy: Generate Initial Story (from intake) ─────────────────────────
// Kept for backward compatibility. New code should use generateIntakeStory().

async function generateInitialStory(member, intake) {
  const intakeAnswers = [
    `Name: ${member.name}`,
    `Phone: ${member.phone}`,
    `Email: ${member.email || 'not provided'}`,
    `Tier: ${member.tier || 'foundation'}`,
    `Signup date: ${new Date().toISOString().slice(0, 10)}`,
    `What brought you here: ${intake.whatBroughtYou || 'not answered'}`,
    `How long struggling: ${intake.howLong || 'not answered'}`,
    `In a relationship: ${intake.relationship || 'not answered'}`,
    `Partner knows: ${intake.partnerKnows || 'not answered'}`,
    `Tried to quit before: ${intake.triedBefore || 'not answered'}`,
    `Urge pattern: ${intake.urgePattern || 'not answered'}`,
    `Readiness (1-10): ${intake.readiness || 'not answered'}`,
    `Anything else: ${intake.anythingElse || 'not answered'}`,
  ].join('\n');

  return generateIntakeStory(intakeAnswers);
}

// ─── Legacy: Rewrite Story (post-call) ────────────────────────────────────
// Kept for backward compatibility. New code should use rewriteStoryAfterCall().

async function rewriteStory(member, previousStory, callSummaries, midCallNotes) {
  const callSummaryText = callSummaries.map((c, i) =>
    `Call ${i + 1} (${c.date}): ${c.summary}`
  ).join('\n\n');

  const notesText = midCallNotes.length > 0
    ? `\nMid-call notes from latest call:\n${midCallNotes.map(n => `- ${n.note}`).join('\n')}`
    : '';

  const transcript = `${callSummaryText}${notesText}`;
  const callDate = callSummaries.length > 0
    ? callSummaries[callSummaries.length - 1].date
    : new Date().toISOString().slice(0, 10);
  const callCount = member.calls || callSummaries.length;

  return rewriteStoryAfterCall(previousStory, transcript, callDate, callCount);
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

  return callClaude(systemPrompt, userMessage, 1000);
}

module.exports = {
  // Primary exports (new API)
  generateIntakeStory,
  rewriteStoryAfterCall,
  // Legacy exports (backward compat)
  generateInitialStory,
  rewriteStory,
  summarizeTranscript,
};
