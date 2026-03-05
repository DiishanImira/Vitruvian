'use strict';

/**
 * Member Context Service — Phase 1 (In-Memory)
 *
 * Stores member state keyed by phone number.
 * Phase 2 will migrate this to Replit DB or a real database.
 *
 * Member shape:
 * {
 *   phone: '+13055551234',
 *   name: 'Marcus',
 *   history: [{ role: 'user'|'assistant', content: '...', ts: ISO }],
 *   intake: { /* form data from onboarding *\/ },
 *   streak: 0,      // days clean
 *   joinedAt: ISO,
 *   lastSeenAt: ISO
 * }
 */

// In-memory store — lives as long as the process
const members = {};

/**
 * Get or create a member by phone number.
 * @param {string} phone - E.164 format e.g. '+13055551234'
 * @returns {object} member context
 */
function getMember(phone) {
  if (!members[phone]) {
    members[phone] = {
      phone,
      name: null,
      history: [],
      intake: {},
      streak: 0,
      joinedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    console.log(`[member] New member: ${phone}`);
  }
  return members[phone];
}

/**
 * Update member fields (shallow merge).
 * @param {string} phone
 * @param {object} updates
 */
function updateMember(phone, updates) {
  const member = getMember(phone);
  Object.assign(member, updates, { lastSeenAt: new Date().toISOString() });
}

/**
 * Append a message to member history.
 * Trims history to last 50 messages to avoid context blowup.
 * @param {string} phone
 * @param {string} role - 'user' | 'assistant'
 * @param {string} content
 */
function appendHistory(phone, role, content) {
  const member = getMember(phone);
  member.history.push({ role, content, ts: new Date().toISOString() });

  // Keep last 50 messages (25 turns)
  if (member.history.length > 50) {
    member.history = member.history.slice(-50);
  }
}

/**
 * Get conversation history in Claude/OpenAI message format.
 * Strips timestamps — just role + content.
 * @param {string} phone
 * @param {number} [limit=20] - max messages to return
 * @returns {Array<{role: string, content: string}>}
 */
function getHistory(phone, limit = 20) {
  const member = getMember(phone);
  return member.history
    .slice(-limit)
    .map(({ role, content }) => ({ role, content }));
}

/**
 * List all members (for debugging).
 */
function listMembers() {
  return Object.values(members).map((m) => ({
    phone: m.phone,
    name: m.name,
    messageCount: m.history.length,
    joinedAt: m.joinedAt,
    lastSeenAt: m.lastSeenAt,
  }));
}

module.exports = {
  getMember,
  updateMember,
  appendHistory,
  getHistory,
  listMembers,
};
