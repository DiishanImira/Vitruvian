'use strict';

/**
 * SMS Rollup Worker
 *
 * Periodically scans sms_messages for phones where the latest un-rolled-up
 * message is older than SMS_SESSION_GAP_MINUTES. When found:
 *   1. Summarize the un-rolled SMS exchange (summarizeSmsSession)
 *   2. Create an sms_sessions row and attach messages via session_id
 *   3. Rewrite the member story so the updated narrative reflects the session
 *
 * Runs via setInterval at startup. Single-instance / Replit friendly.
 */

const db = require('./db');
const {
  summarizeSmsSession,
  rewriteStory,
} = require('./story-writer');

const SESSION_GAP_MIN = parseInt(process.env.SMS_SESSION_GAP_MINUTES || '20', 10);
const SCAN_EVERY_MIN  = parseInt(process.env.SMS_ROLLUP_INTERVAL_MINUTES || '5', 10);

async function rollupPhone(phone) {
  const messages = await db.getUnrolledSmsMessages(phone);
  if (messages.length === 0) return { phone, skipped: 'no unrolled messages' };

  const member = await db.getMember(phone);
  const memberName = member?.name?.trim() || 'Member';

  const startedAt = messages[0].created_at;
  const endedAt   = messages[messages.length - 1].created_at;
  const sessionDate = new Date(endedAt).toISOString().slice(0, 10);

  // Build prior-summaries context (merged voice + sms) for the summarizer.
  const priorTimeline = member ? await db.getMergedMemoryTimeline(phone, 5) : [];
  const priorForSummarizer = priorTimeline.map(e => ({
    label: e.type === 'sms'
      ? `SMS Session (${e.date})`
      : `Call (${e.date})`,
    date: e.date,
    summary: e.summary,
  }));

  let summary;
  try {
    summary = await summarizeSmsSession(messages, memberName, sessionDate, priorForSummarizer);
  } catch (err) {
    console.error(`[sms-rollup] Summary failed for ${phone}:`, err.message);
    summary = `SMS session on ${sessionDate} (${messages.length} msgs). Summary generation failed.`;
  }

  const session = await db.createSmsSession(phone, {
    started_at: startedAt,
    ended_at: endedAt,
    messageIds: messages.map(m => m.id),
    summary,
  });
  console.log(`[sms-rollup] Session ${session.id} created for ${phone} — ${messages.length} msgs`);

  // Rewrite story using merged timeline (now includes this new session).
  if (member) {
    try {
      const [previousStory, merged] = await Promise.all([
        db.getStory(phone),
        db.getMergedMemoryTimeline(phone, 3),
      ]);

      const labeled = merged.map(e => ({
        label: e.type === 'sms'
          ? `SMS Session (${e.date})`
          : `Call (${e.date})`,
        date: e.date,
        summary: e.summary,
      }));

      const newStory = await rewriteStory(
        member,
        previousStory || '',
        labeled,
        [], // no mid-call notes from SMS
      );
      await db.writeStory(phone, newStory);
      console.log(`[sms-rollup] Story rewritten for ${phone} (${newStory.length} chars)`);
    } catch (err) {
      console.error(`[sms-rollup] Story rewrite failed for ${phone}:`, err.message);
    }
  }

  return { phone, session_id: session.id, messages: messages.length };
}

async function rollupStaleSessions(gapMinutes = SESSION_GAP_MIN) {
  const stale = await db.findPhonesWithStaleUnrolledSms(gapMinutes);
  if (stale.length === 0) return { count: 0, results: [] };
  console.log(`[sms-rollup] Rolling up ${stale.length} stale session(s) — gap ≥ ${gapMinutes}min`);
  const results = [];
  for (const s of stale) {
    try {
      results.push(await rollupPhone(s.phone));
    } catch (err) {
      console.error(`[sms-rollup] Rollup failed for ${s.phone}:`, err.message);
      results.push({ phone: s.phone, error: err.message });
    }
  }
  return { count: results.length, results };
}

function startRollupWorker() {
  const intervalMs = SCAN_EVERY_MIN * 60 * 1000;
  console.log(`[sms-rollup] Worker starting — scan every ${SCAN_EVERY_MIN}min, session gap ${SESSION_GAP_MIN}min`);
  const tick = async () => {
    try {
      await rollupStaleSessions();
    } catch (err) {
      console.error('[sms-rollup] Tick error:', err.message);
    }
  };
  // Fire once shortly after startup, then on interval.
  setTimeout(tick, 30_000);
  setInterval(tick, intervalMs);
}

module.exports = {
  rollupStaleSessions,
  rollupPhone,
  startRollupWorker,
};
