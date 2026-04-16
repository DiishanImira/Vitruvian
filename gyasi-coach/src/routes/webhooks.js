'use strict';

/**
 * Webhook Routes
 *
 * POST /webhooks/convai-init — ElevenLabs fires this BEFORE every call.
 *   Returns { conversation_config_override, dynamic_variables } so Gyasi
 *   greets the caller by name with context already in mind.
 *
 * POST /webhooks/conversation-end — ElevenLabs fires this AFTER every call.
 *   Triggers the full post-call pipeline:
 *     1. Save transcript to call_transcripts
 *     2. Generate summary → save to call_summaries
 *     3. Rewrite member story
 *     4. Update member profile
 */

const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { summarizeTranscript, rewriteStory } = require('../services/story-writer');

// ── Pool of open-ended greeting openers for varied, natural first lines ─────
const OPENERS = [
  "how's it going?",
  "how you doing, man?",
  "what's up, brother?",
  "how you holding up?",
  "good to hear your voice — what's going on?",
  "what's on your mind today?",
  "how's your day been?",
  "what's happening?",
  "how you been?",
  "what's good?",
];
const pickOpener = () => OPENERS[Math.floor(Math.random() * OPENERS.length)];

// ── Auth helper — verify ElevenLabs is calling us, not a random caller ──────
function verifyWebhookAuth(req) {
  const expected = process.env.CONVAI_WEBHOOK_SECRET;
  if (!expected) return true; // if not configured, allow (dev mode)
  const header = req.headers.authorization || '';
  return header === `Bearer ${expected}`;
}

// ── POST /webhooks/convai-init — caller-specific initialization ─────────────
// ElevenLabs calls this before connecting each inbound call.
// Returns the first_message Gyasi will speak + dynamic vars his prompt uses.
router.post('/convai-init', async (req, res) => {
  if (!verifyWebhookAuth(req)) {
    console.warn('[convai-init] Unauthorized request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const callerPhone =
    req.body.caller_id ||
    req.body.system__caller_id ||
    req.body.dynamic_variables?.system__caller_id;

  console.log(`[convai-init] Call starting from ${callerPhone || 'unknown'}`);

  // Fallback defaults for unknown / error case — safe for the prompt.
  const dyn = {
    member_name: 'brother',
    member_first_name: 'brother',
    member_story: 'First-time caller — no story yet. Run gentle intake: what brought them here, how long, what they have tried. Don\'t interrogate.',
    days_sober: 0,
    total_calls: 0,
    tier: 'foundation',
    recent_calls: 'No prior calls.',
    caller_status: 'unknown',
  };

  let firstMessage = "Hey, this is Jyasi — who am I talking to?";

  if (callerPhone) {
    try {
      const [member, story, recentCalls] = await Promise.all([
        db.getMember(callerPhone),
        db.getStory(callerPhone),
        db.getRecentCalls(callerPhone, 3),
      ]);

      if (member) {
        const firstName = (member.name || '').split(' ')[0] || 'brother';
        dyn.member_name = member.name || firstName;
        dyn.member_first_name = firstName;
        dyn.days_sober = member.daysSober || 0;
        dyn.total_calls = member.calls || 0;
        dyn.tier = member.tier || 'foundation';
        dyn.member_story = story || dyn.member_story;
        const summaries = recentCalls
          .filter(c => c.summary)
          .map(c => `- ${c.date}: ${c.summary}`)
          .join('\n');
        if (summaries) dyn.recent_calls = summaries;

        if ((member.calls || 0) === 0) {
          dyn.caller_status = 'first_call';
          firstMessage = `Hey ${firstName}, Jyasi here — glad you called.`;
        } else {
          dyn.caller_status = 'returning';
          firstMessage = `Hey ${firstName}, ${pickOpener()}`;
        }
        console.log(`[convai-init] Known member: ${member.name} (${member.calls || 0} prior calls)`);
      } else {
        console.log(`[convai-init] Unknown caller: ${callerPhone}`);
      }
    } catch (err) {
      console.error('[convai-init] Lookup error:', err.message);
      // fall through with defaults
    }
  }

  res.json({
    type: 'conversation_initiation_client_data',
    conversation_config_override: {
      agent: { first_message: firstMessage },
    },
    dynamic_variables: dyn,
  });
});

// ElevenLabs sends the transcript as an array of {role, message, ...} objects.
// Convert to readable dialogue so Claude receives actual text, not "[object Object]".
function formatTranscript(arr) {
  if (typeof arr === 'string') return arr;
  if (!Array.isArray(arr)) return '';
  return arr
    .map(t => {
      const role = (t.role || '').toLowerCase() === 'agent' ? 'Gyasi' : 'Member';
      const msg = (t.message || '').trim();
      return msg ? `${role}: ${msg}` : null;
    })
    .filter(Boolean)
    .join('\n');
}

// In-flight guard — handles concurrent duplicate webhook fires from the same
// process. Falls back to the DB check for retries across processes/restarts.
const inFlightConversations = new Set();

router.post('/conversation-end', async (req, res) => {
  // ElevenLabs' current webhook format wraps payload under `data`.
  // Support both nested and legacy flat structure.
  const payload = req.body.data || req.body;

  const conversation_id = payload.conversation_id;
  const agent_id        = payload.agent_id;
  const call_duration_secs =
    payload.call_duration_secs
    ?? payload.metadata?.call_duration_secs;
  const transcript      = formatTranscript(payload.transcript);
  const initData        = payload.conversation_initiation_client_data || {};
  const dynamic_variables = initData.dynamic_variables || payload.dynamic_variables || {};

  // Always respond fast so ElevenLabs doesn't retry on timeout.
  res.json({ received: true });

  if (!conversation_id) {
    console.error('[webhook/conversation-end] Missing conversation_id — skipping');
    return;
  }

  // Guard 1: concurrent duplicate fire in this process
  if (inFlightConversations.has(conversation_id)) {
    console.log(`[webhook/conversation-end] ${conversation_id} already in-flight — skipping`);
    return;
  }

  // Guard 2: already processed and persisted (retries after restart, etc.)
  if (await db.callAlreadyProcessed(conversation_id)) {
    console.log(`[webhook/conversation-end] ${conversation_id} already in DB — skipping`);
    return;
  }

  inFlightConversations.add(conversation_id);

  try {
    await processConversationEnd({
      conversation_id,
      agent_id,
      call_duration_secs,
      transcript,
      dynamic_variables,
      payload,
    });
  } finally {
    inFlightConversations.delete(conversation_id);
  }
});

async function processConversationEnd({
  conversation_id,
  agent_id,
  call_duration_secs,
  transcript,
  dynamic_variables,
  payload,
}) {
  const phone =
    payload.metadata?.phone_call?.external_number
    || dynamic_variables.system__caller_id
    || dynamic_variables.phone_number
    || payload.caller_id;

  if (!phone) {
    console.error('[webhook/conversation-end] No phone number found in payload — keys:', Object.keys(payload));
    return;
  }

  console.log(`[webhook/conversation-end] Call ended: ${conversation_id} (${phone}, ${call_duration_secs}s)`);

  const member = await db.getMember(phone);
  const memberName = member?.name || 'Unknown';

  if (!member) {
    console.log(`[webhook/conversation-end] Unknown caller ${phone} — skipping post-call pipeline`);
    return;
  }

  const callData = {
    conversation_id,
    phone,
    date: new Date().toISOString().slice(0, 10),
    started_at: new Date().toISOString(),
    duration_secs: call_duration_secs,
    outcome: 'completed',
    transcript: transcript || '',
    summary: null,
  };

  // ── Step 2: Generate summary ──
  if (transcript) {
    try {
      console.log(`[webhook] Generating summary for ${memberName}...`);
      callData.summary = await summarizeTranscript(transcript, memberName);
      console.log(`[webhook] Summary generated (${callData.summary.length} chars)`);
    } catch (err) {
      console.error(`[webhook] Summary generation failed:`, err.message);
      callData.summary = `Call on ${callData.date}. Duration: ${call_duration_secs}s. Summary generation failed.`;
    }
  }

  // ── Step 1 + 2 combined: Save transcript + summary to DB ──
  await db.saveCall(phone, callData);
  console.log(`[webhook] Call saved to DB (${conversation_id})`);

  // ── Step 3: Rewrite member story ──
  if (member && transcript) {
    try {
      console.log(`[webhook] Rewriting story for ${memberName}...`);

      // Rewrite input: previous story carries the long-term synthesis; only
      // the most recent 3 summaries add recency detail. Older specific moments
      // stay in the archive, reachable mid-call via search_call_history.
      // callCountNow reflects the just-saved call so story labels are accurate.
      const [previousStory, callSummaries, midCallNotes, callCountNow] = await Promise.all([
        db.getStory(phone),
        db.getRecentCalls(phone, 3),
        Promise.resolve(db.getNotes(phone)),
        db.getCallCount(phone),
      ]);

      const newStory = await rewriteStory(
        { ...member, calls: callCountNow },
        previousStory || '',
        callSummaries.map(c => ({ date: c.date, summary: c.summary || 'No summary.' })),
        midCallNotes
      );

      await db.writeStory(phone, newStory);
      console.log(`[webhook] Story rewritten for ${memberName} (${newStory.length} chars)`);

      db.clearNotes(phone);
    } catch (err) {
      console.error(`[webhook] Story rewrite failed:`, err.message);
    }
  }

  // ── Step 4: Update member profile ──
  const callCount = await db.getCallCount(phone);
  await db.upsertMember(phone, {
    calls: callCount,
    lastCall: new Date().toISOString().slice(0, 10),
    lastOutcome: 'completed',
    status: 'active',
  });

  console.log(`[webhook] Post-call pipeline complete for ${memberName} (${phone})`);
}

router.post('/call-status', (req, res) => {
  const { CallSid, CallStatus, To, Duration } = req.body;
  console.log(`[webhook/call-status] ${CallSid}: ${CallStatus} → ${To} (${Duration || 0}s)`);
  res.sendStatus(200);
});

module.exports = router;
