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

## Meaningful Themes
Each theme is a person, event, idea, or pattern that carries emotional weight and has come up across calls. Format each as:

- **[Theme Name]** (calls: [list of call numbers or dates]) — [1-2 sentences: what it means to him, why it matters, what we know about it so far]

Examples:
- **Father** (calls: 1, 3) — Believes his father's emotional distance modeled shame. Hasn't fully unpacked whether this predates the addiction or is an assumption.
- **Wife's ultimatum** (call: 2) — She told him she's done if he doesn't change. He made a commitment. Needs follow-up — did he keep it?
- **Night routine** (calls: 1, 2, 3) — Phone in bedroom, boredom after 10pm is primary trigger window. Has been the main battleground.

Only include themes that have actually come up in calls. Update/add to existing themes after each call. This section grows over time. Merge new themes from this transcript with any existing themes from the previous story.

## Key Facts
[bullet list — specific confirmed details: triggers, relationship status updates, faith context, streaks, commitments made, anything concrete]

## Open Questions
[Things that surfaced but weren't resolved — partial disclosures, hints, deflections, or topics that seem important but haven't been explored yet. For each: what was hinted at, why it might matter, and when/how to approach it. This list grows and shrinks across calls as questions get answered or become irrelevant.]

- **[Topic]** — [what was hinted at or left unresolved] — [why it might matter] — [when/how to approach]

Merge any existing Open Questions from the previous story. Mark questions as RESOLVED if they were answered in this call. Add new ones from this transcript. Remove ones that are no longer relevant.

## Next Call Guidance
[This section is the roadmap for the NEXT call. 3-5 specific things to explore, follow up on, or push. Written as if briefing Gyasi before that call. Reference specific things from this call that need follow-up. Consider the Open Questions — which ones is the member ready to explore next?]
---

Be specific. Use his actual words where possible. This document should make Gyasi feel like he remembers everything about this person the moment he reads it.`;

  const userMessage = `PREVIOUS STORY:
${previousStory || 'No previous story.'}

CALL TRANSCRIPT:
${transcript}

CALL DATE: ${callDate}
TOTAL CALLS TO DATE: ${callCount}`;

  return callClaude(systemPrompt, userMessage, 16000);
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
  // callSummaries arrives DESC (newest first). Label each with its actual
  // call number so the rewriter doesn't re-index 4→1 when only 3 summaries
  // are passed. totalCalls must reflect the *just-saved* call.
  const totalCalls = member.calls || callSummaries.length;
  const callSummaryText = callSummaries.map((c, i) =>
    `Call ${totalCalls - i} (${c.date}): ${c.summary}`
  ).join('\n\n');

  const notesText = midCallNotes.length > 0
    ? `\nMid-call notes from latest call:\n${midCallNotes.map(n => `- ${n.note}`).join('\n')}`
    : '';

  const transcript = `${callSummaryText}${notesText}`;
  const callDate = callSummaries.length > 0
    ? callSummaries[0].date  // newest summary is the current call
    : new Date().toISOString().slice(0, 10);

  return rewriteStoryAfterCall(previousStory, transcript, callDate, totalCalls);
}

// ─── Summarize Transcript ─────────────────────────────────────────────────

async function summarizeTranscript(transcript, memberName, callDate) {
  const dateLabel = callDate || new Date().toISOString().slice(0, 10);

  const systemPrompt = `You are analyzing a coaching call from the Vitruvian Man program (porn addiction recovery). The coach is Gyasi.

Produce a structured call summary. This summary will be stored and used to rewrite the member's narrative story — specifically to update the Meaningful Themes section and Next Call Guidance. Make it rich, specific, and useful to a reader who wasn't on the call.

FORMAT:
---
## Call Summary — ${dateLabel}

### What Happened
[2-3 sentences: what was discussed, where the conversation went]

### Themes That Came Up
[bullet list — themes, people, events that surfaced. Flag each as NEW or RECURRING]
- **[Theme]** — [new/recurring] — [1 sentence: what was said about it]

### Meaningful Moments
[1-3 verbatim or near-verbatim quotes that carry weight — things the member actually said that matter]
- "[quote]" — [why this matters]

### What Changed
[What shifted for the member during this call? Progress, regression, new awareness, new commitment?]

### Connections Made
[Did anything from this call connect to something from a previous call or their intake? Call it out explicitly. If nothing connects, say "No prior connections identified."]

### Open Questions
[Things that surfaced but weren't resolved — gaps, hints, or partial disclosures that warrant deeper exploration in a future call. For each, note WHY it might matter and WHEN to pursue it (e.g. "only when trust is deeper"). Be specific.]
- **[Topic]** — [what was hinted at or left unresolved] — [why it might be important] — [when/how to approach it]

Examples:
- **Childhood trauma** — Member referenced "something that happened when I was young" but didn't elaborate. Didn't push — too early. Could be a root cause of the shame pattern. Revisit when trust is deeper and he brings it up again.
- **His father** — Mentioned briefly but deflected. Seems loaded. Worth exploring gently in a later call.
- **The "one time it really worked"** — He mentioned quitting for 3 months once but didn't say what changed. Understanding that could be the key to replicating it.

### For the Story Rewrite
[2-3 sentences: what the story rewriter needs to know from this call to update the Meaningful Themes, Open Questions, and Next Call Guidance]
---

Be specific. Use the member's actual words where possible. This is the primary input to the story rewrite — make it count.`;

  const userMessage = `Member: ${memberName}\n\nTranscript:\n${transcript}`;

  return callClaude(systemPrompt, userMessage, 8000);
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
