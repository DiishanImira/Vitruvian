'use strict';

/**
 * Admin Router — all routes require Authorization: Bearer <ADMIN_API_KEY>
 *
 * GET    /admin/members                  — list all members
 * GET    /admin/member/:phone            — full profile + story + recent calls
 * GET    /admin/member/:phone/story      — living narrative (plain text)
 * GET    /admin/member/:phone/calls      — call summary timeline (?limit=N, max 50)
 * GET    /admin/member/:phone/transcript — most recent raw transcript
 * GET    /admin/stats                    — aggregate counts
 * GET    /admin/logs                     — last N lines from in-memory log buffer
 * DELETE /admin/member/:phone            — wipe member across all 4 tables
 */

const express        = require('express');
const router         = express.Router();
const db             = require('../services/db');
const { getLogBuffer } = require('../services/log-buffer');

// ── Auth middleware ────────────────────────────────────────────────────────

router.use((req, res, next) => {
  const key = process.env.ADMIN_API_KEY;
  if (!key) {
    return res.status(503).json({ error: 'Admin API not configured (ADMIN_API_KEY missing)' });
  }
  const header = req.headers.authorization || '';
  if (header !== `Bearer ${key}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ── Phone normalizer ──────────────────────────────────────────────────────

function normalizePhone(raw) {
  return '+' + raw.replace(/[^0-9]/g, '');
}

// ── GET /admin/members ────────────────────────────────────────────────────

router.get('/members', async (req, res) => {
  try {
    const membersMap = await db.listMembers();
    const members = Object.values(membersMap).map(m => ({
      phone:     m.phone,
      name:      m.name,
      email:     m.email,
      tier:      m.tier,
      status:    m.status,
      calls:     m.calls,
      signup:    m.signup,
      lastCall:  m.lastCall,
      daysSober: m.daysSober,
    }));
    res.json({ count: members.length, members });
  } catch (err) {
    console.error('[admin] GET /members error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/member/:phone ──────────────────────────────────────────────

router.get('/member/:phone', async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  try {
    const [member, story, calls] = await Promise.all([
      db.getMember(phone),
      db.getStory(phone),
      db.getRecentCalls(phone, 5),
    ]);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json({ member, story, recentCalls: calls });
  } catch (err) {
    console.error('[admin] GET /member error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/member/:phone/story ────────────────────────────────────────

router.get('/member/:phone/story', async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  try {
    const story = await db.getStory(phone);
    if (!story) return res.status(404).json({ error: 'No story found' });
    res.type('text/plain').send(story);
  } catch (err) {
    console.error('[admin] GET /member/story error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/member/:phone/calls ────────────────────────────────────────

router.get('/member/:phone/calls', async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
  try {
    const calls = await db.getRecentCalls(phone, limit);
    res.json({ phone, count: calls.length, calls });
  } catch (err) {
    console.error('[admin] GET /member/calls error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/member/:phone/transcript ───────────────────────────────────

router.get('/member/:phone/transcript', async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  try {
    const transcript = await db.getLatestTranscript(phone);
    if (!transcript) return res.status(404).json({ error: 'No transcript found' });
    res.json(transcript);
  } catch (err) {
    console.error('[admin] GET /member/transcript error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/stats ──────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const stats = await db.getAdminStats();
    res.json(stats);
  } catch (err) {
    console.error('[admin] GET /stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/logs ───────────────────────────────────────────────────────

router.get('/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
  const lines = getLogBuffer(limit);
  res.json({ count: lines.length, logs: lines });
});

// ── DELETE /admin/member/:phone ───────────────────────────────────────────

router.delete('/member/:phone', async (req, res) => {
  const phone = normalizePhone(req.params.phone);
  try {
    const existing = await db.getMember(phone);
    await db.deleteMember(phone);
    db.clearNotes(phone);
    console.log(`[admin] Deleted all data for ${phone}`);
    res.json({ success: true, phone, existed: !!existing });
  } catch (err) {
    console.error('[admin] DELETE /member error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
