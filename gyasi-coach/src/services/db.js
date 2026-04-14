'use strict';

// Database Service — Four-Layer Memory Architecture
//
//   Layer 1: members         — profile + all 8 intake answers
//   Layer 2: member_stories  — narrative memory (overwritten after each call)
//   Layer 3: call_transcripts — raw verbatim transcripts per call
//   Layer 4: call_summaries  — Claude-generated per-call summaries (timeline)
//
// Notes (transient mid-call scratchpad) remain file-based and are cleared
// after every call — no persistence needed.

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

// ─── Schema Bootstrap ─────────────────────────────────────────────────────
// Called once on server startup. Creates tables if they don't exist.

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS members (
        phone           VARCHAR(20)  PRIMARY KEY,
        name            VARCHAR(255) NOT NULL,
        email           VARCHAR(255),
        tier            VARCHAR(50)  DEFAULT 'foundation',
        status          VARCHAR(50)  DEFAULT 'new',
        signup_date     DATE,
        total_calls     INTEGER      DEFAULT 0,
        last_call       DATE,
        last_outcome    VARCHAR(100),
        days_sober      INTEGER      DEFAULT 0,
        current_module  INTEGER      DEFAULT 0,
        what_brought_you TEXT,
        how_long        TEXT,
        relationship    TEXT,
        partner_knows   TEXT,
        tried_before    TEXT,
        urge_pattern    TEXT,
        readiness       TEXT,
        anything_else   TEXT,
        created_at      TIMESTAMP    DEFAULT NOW(),
        updated_at      TIMESTAMP    DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS member_stories (
        phone      VARCHAR(20) PRIMARY KEY REFERENCES members(phone) ON DELETE CASCADE,
        story      TEXT        NOT NULL,
        updated_at TIMESTAMP   DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS call_transcripts (
        id              SERIAL      PRIMARY KEY,
        phone           VARCHAR(20) NOT NULL REFERENCES members(phone) ON DELETE CASCADE,
        conversation_id VARCHAR(255),
        call_date       DATE        NOT NULL,
        started_at      TIMESTAMP,
        duration_secs   INTEGER,
        outcome         VARCHAR(100),
        transcript      TEXT,
        created_at      TIMESTAMP   DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS call_summaries (
        id              SERIAL      PRIMARY KEY,
        phone           VARCHAR(20) NOT NULL REFERENCES members(phone) ON DELETE CASCADE,
        conversation_id VARCHAR(255),
        call_date       DATE        NOT NULL,
        summary         TEXT        NOT NULL,
        created_at      TIMESTAMP   DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_call_transcripts_phone ON call_transcripts(phone);
      CREATE INDEX IF NOT EXISTS idx_call_transcripts_date  ON call_transcripts(phone, call_date DESC);
      CREATE INDEX IF NOT EXISTS idx_call_summaries_phone   ON call_summaries(phone);
      CREATE INDEX IF NOT EXISTS idx_call_summaries_date    ON call_summaries(phone, call_date DESC);
    `);

    console.log('[db] Schema ready');
  } finally {
    client.release();
  }
}

// ─── Notes (file-based scratchpad — transient) ────────────────────────────

const NOTES_DIR = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'notes')
  : path.join(__dirname, '..', '..', 'data', 'notes');

if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true });

function notesPath(phone) {
  return path.join(NOTES_DIR, `${phone.replace(/[^+\d]/g, '')}_current.json`);
}

function saveNote(phone, note) {
  const p = notesPath(phone);
  let notes = [];
  if (fs.existsSync(p)) {
    try { notes = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
  }
  notes.push({ note, ts: new Date().toISOString() });
  fs.writeFileSync(p, JSON.stringify(notes, null, 2));
}

function getNotes(phone) {
  const p = notesPath(phone);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; }
}

function clearNotes(phone) {
  const p = notesPath(phone);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function rowToMember(row) {
  if (!row) return null;
  return {
    phone: row.phone,
    name: row.name,
    email: row.email,
    tier: row.tier,
    status: row.status,
    signup: row.signup_date ? new Date(row.signup_date).toISOString().slice(0, 10) : null,
    calls: row.total_calls,
    lastCall: row.last_call ? new Date(row.last_call).toISOString().slice(0, 10) : null,
    lastOutcome: row.last_outcome,
    daysSober: row.days_sober,
    currentModule: row.current_module,
    intake: {
      whatBroughtYou: row.what_brought_you,
      howLong: row.how_long,
      relationship: row.relationship,
      partnerKnows: row.partner_knows,
      triedBefore: row.tried_before,
      urgePattern: row.urge_pattern,
      readiness: row.readiness,
      anythingElse: row.anything_else,
    },
    updatedAt: row.updated_at,
  };
}

// ─── Layer 1: Members ─────────────────────────────────────────────────────

async function getMember(phone) {
  const { rows } = await pool.query('SELECT * FROM members WHERE phone = $1', [phone]);
  return rowToMember(rows[0] || null);
}

async function upsertMember(phone, data) {
  const colMap = {
    name:             data.name,
    email:            data.email,
    tier:             data.tier,
    status:           data.status,
    signup_date:      data.signup,
    total_calls:      data.calls,
    last_call:        data.lastCall,
    last_outcome:     data.lastOutcome,
    days_sober:       data.daysSober,
    current_module:   data.currentModule,
    what_brought_you: data.whatBroughtYou,
    how_long:         data.howLong,
    relationship:     data.relationship,
    partner_knows:    data.partnerKnows,
    tried_before:     data.triedBefore,
    urge_pattern:     data.urgePattern,
    readiness:        data.readiness,
    anything_else:    data.anythingElse,
  };

  const activeCols = Object.entries(colMap).filter(([, v]) => v !== undefined && v !== null);
  if (activeCols.length === 0) {
    const { rows } = await pool.query('SELECT * FROM members WHERE phone = $1', [phone]);
    return rowToMember(rows[0] || null);
  }

  const colNames = activeCols.map(([k]) => k);
  const colVals  = activeCols.map(([, v]) => v);
  const updateSet = colNames.map((k, i) => `${k} = $${i + 2}`).join(', ');

  // If name is present we can safely INSERT or UPDATE.
  // If name is absent, only UPDATE an existing row (avoids NOT NULL violation).
  if (data.name) {
    const insertCols = ['phone', ...colNames].join(', ');
    const insertPhs  = ['$1', ...colNames.map((_, i) => `$${i + 2}`)].join(', ');

    const { rows } = await pool.query(
      `INSERT INTO members (${insertCols}, updated_at)
       VALUES (${insertPhs}, NOW())
       ON CONFLICT (phone) DO UPDATE SET ${updateSet}, updated_at = NOW()
       RETURNING *`,
      [phone, ...colVals]
    );
    return rowToMember(rows[0]);
  } else {
    const { rows } = await pool.query(
      `UPDATE members SET ${updateSet}, updated_at = NOW()
       WHERE phone = $1
       RETURNING *`,
      [phone, ...colVals]
    );
    return rowToMember(rows[0] || null);
  }
}

async function listMembers() {
  const { rows } = await pool.query('SELECT * FROM members ORDER BY created_at DESC');
  const result = {};
  for (const row of rows) result[row.phone] = rowToMember(row);
  return result;
}

async function deleteMember(phone) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM call_summaries  WHERE phone = $1', [phone]);
    await client.query('DELETE FROM call_transcripts WHERE phone = $1', [phone]);
    await client.query('DELETE FROM member_stories  WHERE phone = $1', [phone]);
    await client.query('DELETE FROM members         WHERE phone = $1', [phone]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Layer 2: Member Stories ──────────────────────────────────────────────

async function getStory(phone) {
  const { rows } = await pool.query('SELECT story FROM member_stories WHERE phone = $1', [phone]);
  return rows[0]?.story || null;
}

async function writeStory(phone, content) {
  await pool.query(
    `INSERT INTO member_stories (phone, story, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (phone) DO UPDATE SET story = $2, updated_at = NOW()`,
    [phone, content]
  );
}

// ─── Layer 3: Call Transcripts ────────────────────────────────────────────

async function saveCall(phone, callData) {
  await pool.query(
    `INSERT INTO call_transcripts
       (phone, conversation_id, call_date, started_at, duration_secs, outcome, transcript)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      phone,
      callData.conversation_id || null,
      callData.date || new Date().toISOString().slice(0, 10),
      callData.started_at || new Date().toISOString(),
      callData.duration_secs || 0,
      callData.outcome || 'completed',
      typeof callData.transcript === 'string'
        ? callData.transcript
        : JSON.stringify(callData.transcript || ''),
    ]
  );

  if (callData.summary) {
    await pool.query(
      `INSERT INTO call_summaries (phone, conversation_id, call_date, summary)
       VALUES ($1, $2, $3, $4)`,
      [
        phone,
        callData.conversation_id || null,
        callData.date || new Date().toISOString().slice(0, 10),
        callData.summary,
      ]
    );
  }

  return callData.conversation_id || 'saved';
}

// ─── Layer 4: Call Summaries / Timeline ──────────────────────────────────

async function getRecentCalls(phone, limit = 3) {
  const { rows } = await pool.query(
    `SELECT call_date AS date, summary, conversation_id
     FROM call_summaries
     WHERE phone = $1
     ORDER BY call_date DESC, created_at DESC
     LIMIT $2`,
    [phone, limit]
  );
  return rows.map(r => ({
    date: r.date ? new Date(r.date).toISOString().slice(0, 10) : null,
    summary: r.summary,
    conversation_id: r.conversation_id,
  }));
}

async function getCallCount(phone) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS count FROM call_transcripts WHERE phone = $1',
    [phone]
  );
  return parseInt(rows[0]?.count || '0', 10);
}

// ─── Full Context ─────────────────────────────────────────────────────────

async function getFullContext(phone) {
  const member = await getMember(phone);
  if (!member) return { known_member: false };

  const [story, recentCalls] = await Promise.all([
    getStory(phone),
    getRecentCalls(phone, 2),
  ]);

  return {
    known_member: true,
    name: member.name,
    tier: member.tier || 'foundation',
    calls: member.calls || 0,
    days_clean: member.daysSober || 0,
    current_module: member.currentModule || 0,
    signup: member.signup,
    story: story || 'No story yet — this is a new member.',
    recent_calls: recentCalls.map(c => ({
      date: c.date,
      summary: c.summary || 'No summary available.',
    })),
  };
}

module.exports = {
  initDb,
  getMember,
  upsertMember,
  listMembers,
  deleteMember,
  getStory,
  writeStory,
  saveCall,
  getRecentCalls,
  getCallCount,
  saveNote,
  getNotes,
  clearNotes,
  getFullContext,
};
