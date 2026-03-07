'use strict';

/**
 * Persistent Memory Service
 * 
 * Three-layer architecture:
 *   Layer 1: members.json — indexed lookup (phone → profile)
 *   Layer 2: stories/*.md — narrative memory per member (with YAML frontmatter)
 *   Layer 3: calls/*/*.json — raw transcripts + summaries
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const MEMBERS_FILE = path.join(DATA_DIR, 'members.json');
const STORIES_DIR = path.join(DATA_DIR, 'stories');
const CALLS_DIR = path.join(DATA_DIR, 'calls');
const NOTES_DIR = path.join(DATA_DIR, 'notes');

// Ensure directories exist
[STORIES_DIR, CALLS_DIR, NOTES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Layer 1: Member Index ────────────────────────────────────────────────

function loadIndex() {
  try {
    return JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveIndex(index) {
  fs.writeFileSync(MEMBERS_FILE, JSON.stringify(index, null, 2));
}

function getMember(phone) {
  const index = loadIndex();
  return index[phone] || null;
}

function upsertMember(phone, data) {
  const index = loadIndex();
  index[phone] = {
    ...(index[phone] || {}),
    ...data,
    phone,
    updatedAt: new Date().toISOString(),
  };
  saveIndex(index);
  return index[phone];
}

function listMembers() {
  return loadIndex();
}

// ─── Layer 2: Member Stories ──────────────────────────────────────────────

function storyPath(phone) {
  const safe = phone.replace(/[^+\d]/g, '');
  return path.join(STORIES_DIR, `${safe}.md`);
}

function getStory(phone) {
  const p = storyPath(phone);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf-8');
}

function writeStory(phone, content) {
  fs.writeFileSync(storyPath(phone), content);
}

// ─── Layer 3: Call Archive ────────────────────────────────────────────────

function callDir(phone) {
  const safe = phone.replace(/[^+\d]/g, '');
  const dir = path.join(CALLS_DIR, safe);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveCall(phone, callData) {
  const dir = callDir(phone);
  const date = new Date().toISOString().slice(0, 10);
  const convId = callData.conversation_id || 'unknown';
  const filename = `${date}_${convId}.json`;
  fs.writeFileSync(
    path.join(dir, filename),
    JSON.stringify(callData, null, 2)
  );
  return filename;
}

function getRecentCalls(phone, limit = 3) {
  const dir = callDir(phone);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit);

  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function getCallCount(phone) {
  const dir = callDir(phone);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;
}

// ─── Mid-Call Notes (scratch pad) ─────────────────────────────────────────

function notesPath(phone) {
  const safe = phone.replace(/[^+\d]/g, '');
  return path.join(NOTES_DIR, `${safe}_current.json`);
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

// ─── Full Context (for get_member_context tool) ───────────────────────────

function getFullContext(phone) {
  const member = getMember(phone);
  
  if (!member) {
    return { known_member: false };
  }

  const story = getStory(phone);
  const recentCalls = getRecentCalls(phone, 2);

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
  // Index
  getMember,
  upsertMember,
  listMembers,
  // Stories
  getStory,
  writeStory,
  // Calls
  saveCall,
  getRecentCalls,
  getCallCount,
  // Notes
  saveNote,
  getNotes,
  clearNotes,
  // Full context
  getFullContext,
};
