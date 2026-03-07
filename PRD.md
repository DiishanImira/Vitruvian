# PRD: Voice Agent Platform — Multi-Agent with User Memory & Tool Calling

**Version:** 1.0  
**Date:** 2026-03-06  
**Author:** DiiClaw + Diishan Imira  
**Status:** Draft

---

## 1. Overview

A single Node.js server that powers multiple AI voice agents (ElevenLabs Conversational AI + Twilio), with shared infrastructure for:

- **Per-user persistent memory** across calls
- **Mid-call tool execution** (SMS, lookups, etc.)
- **Multi-agent switching** via environment variable

### Agents

| Agent | Product | Purpose | Voice | LLM |
|-------|---------|---------|-------|-----|
| **Gyasi** | Vitruvian Man | Porn addiction recovery coaching | Gyasi PVC clone (`ta5vPsZm54WOCYibe6OP`) | Claude 3.5 Sonnet |
| **Evan** | Mayvenn | New ambassador onboarding | Young Jamal (`6OzrBCQf8cjERkYgzSg8`) | GPT-5.2 |

---

## 2. Problem Statement

### Gyasi (Vitruvian)
Members call in for coaching. Today, every call is stateless — the agent doesn't know who's calling, what they discussed last time, where they are in the program, or what they're struggling with. A real coach remembers. This agent needs to as well.

### Mayvenn
New ambassadors get an outbound call. The agent needs their name, signup data, and ambassador links injected per call. After the call, outcomes need to be logged and follow-ups scheduled.

### Shared
Both agents need mid-call actions (send SMS, look up user data) and post-call logging. Building this twice is wasteful.

---

## 3. Architecture

### 3.1 System Diagram

```
                         ┌─────────────────┐
                         │   ElevenLabs    │
                         │  Conversational  │
                         │       AI         │
                         └────┬───────┬────┘
                              │       │
                   Tool calls │       │ Post-call webhook
                              ▼       ▼
┌─────────────────────────────────────────────────────────────┐
│                    VOICE AGENT SERVER                         │
│                    (Node.js / Express)                        │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Agent Router  │  │  Tool Engine │  │  Memory Service   │  │
│  │              │  │              │  │                   │  │
│  │ AGENT_MODE   │  │ • send_sms   │  │ • get_context     │  │
│  │ = vitruvian  │  │ • get_member │  │ • save_summary    │  │
│  │ | mayvenn    │  │ • log_mood   │  │ • get_history     │  │
│  │              │  │ • save_note  │  │ • update_progress │  │
│  └──────────────┘  └──────┬───────┘  └─────────┬─────────┘  │
│                           │                     │            │
│                    ┌──────┴─────────────────────┴──────┐     │
│                    │           Database                 │     │
│                    │         (PostgreSQL)               │     │
│                    │                                    │     │
│                    │  users / calls / memory / tools    │     │
│                    └───────────────────────────────────┘     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                   Twilio                              │    │
│  │  • SMS delivery    • Call status    • Phone numbers   │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Agent Switching

```bash
# .env
AGENT_MODE=vitruvian   # or "mayvenn"
```

The server loads agent-specific config (prompt, tools, ElevenLabs agent ID, voice) based on this variable. Shared infrastructure (database, SMS, memory) is agent-agnostic.

```
config/
├── agents/
│   ├── vitruvian.js    # Gyasi agent config (IDs, voice, prompt, tools)
│   └── mayvenn.js      # Evan agent config (IDs, voice, prompt, tools)
└── shared.js           # DB, Twilio, common settings
```

---

## 4. User Memory Architecture

### 4.1 Core Concept

Every caller gets a persistent profile tied to their phone number. The AI agent fetches this at the start of every call via a **server tool** (`get_member_context`), so it knows who it's talking to before saying a word.

### 4.2 Data Model

```sql
-- Users table: core identity
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  phone         VARCHAR(20) UNIQUE NOT NULL,
  name          VARCHAR(100),
  email         VARCHAR(200),
  agent_mode    VARCHAR(20) NOT NULL,           -- 'vitruvian' or 'mayvenn'
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  metadata      JSONB DEFAULT '{}'              -- agent-specific fields
);

-- Call log: every conversation
CREATE TABLE calls (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER REFERENCES users(id),
  conversation_id   VARCHAR(100),                -- ElevenLabs conversation ID
  agent_mode        VARCHAR(20) NOT NULL,
  started_at        TIMESTAMP DEFAULT NOW(),
  duration_secs     INTEGER,
  transcript        TEXT,
  outcome           VARCHAR(50),                 -- completed, dropped, voicemail, etc.
  summary           TEXT,                         -- AI-generated call summary
  metadata          JSONB DEFAULT '{}'
);

-- Memory: persistent per-user context
CREATE TABLE memory (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id),
  key           VARCHAR(100) NOT NULL,           -- e.g. 'current_module', 'mood_trend'
  value         TEXT NOT NULL,
  agent_mode    VARCHAR(20) NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, key, agent_mode)
);

-- Tool log: every mid-call tool execution
CREATE TABLE tool_logs (
  id              SERIAL PRIMARY KEY,
  call_id         INTEGER REFERENCES calls(id),
  tool_name       VARCHAR(50),
  input_params    JSONB,
  output_result   JSONB,
  executed_at     TIMESTAMP DEFAULT NOW()
);
```

### 4.3 Memory Keys by Agent

**Vitruvian (Gyasi):**
| Key | Example Value | Purpose |
|-----|---------------|---------|
| `current_module` | `"3"` | Where they are in the course |
| `days_clean` | `"14"` | Self-reported streak |
| `key_triggers` | `"stress at work, late nights alone"` | Known relapse triggers |
| `breakthroughs` | `"realized porn is a coping mechanism, not a need"` | Moments of clarity |
| `struggles` | `"wife found out, trust is broken"` | Active pain points |
| `coaching_notes` | `"responds well to direct challenges, don't coddle"` | How to approach them |
| `last_mood` | `"frustrated but determined"` | Emotional state last call |
| `commitment` | `"no porn for 30 days, check in weekly"` | What they committed to |

**Mayvenn (Evan):**
| Key | Example Value | Purpose |
|-----|---------------|---------|
| `ambassador_link` | `"shop.mayvenn.com/keisha"` | Their unique link |
| `autopilot_link` | `"autopilot.mayvenn.com/setup/keisha"` | Setup URL |
| `autopilot_status` | `"not_activated"` | Current activation status |
| `signup_date` | `"2026-03-05"` | When they joined |
| `client_count` | `"15"` | Number of weave/extension clients |
| `instagram_active` | `"no"` | Whether they use IG |
| `commitment` | `"tonight"` | When they said they'd activate |
| `follow_up_reason` | `"wanted to talk to husband first"` | Why they didn't commit |

### 4.4 Memory Flow (per call)

```
Call starts
  ↓
Agent triggers: get_member_context(phone)
  ↓
Server: lookup phone → return user profile + memory + last call summary
  ↓
Agent: adapts conversation using context
  ↓
Mid-call: Agent triggers tools (send_sms, save_note, log_mood, etc.)
  ↓
Call ends
  ↓
Post-call webhook fires
  ↓
Server: save transcript, generate summary, update memory keys
```

---

## 5. Server Tools (ElevenLabs → Our Server)

### 5.1 Shared Tools (both agents)

| Tool | Trigger | Endpoint | Action |
|------|---------|----------|--------|
| `get_member_context` | Call start (automatic) | `POST /api/tools/get-context` | Returns user profile, memory, last call summary |
| `send_sms` | User agrees to receive link/info | `POST /api/tools/send-sms` | Sends SMS via Twilio |
| `save_note` | Agent wants to remember something | `POST /api/tools/save-note` | Stores a memory key for this user |

### 5.2 Vitruvian-Only Tools

| Tool | Trigger | Endpoint | Action |
|------|---------|----------|--------|
| `log_mood` | Agent assesses emotional state | `POST /api/tools/log-mood` | Saves mood + context to memory |
| `update_progress` | User reports module completion or milestone | `POST /api/tools/update-progress` | Updates current_module, days_clean, etc. |
| `get_course_content` | User asks about specific topic | `POST /api/tools/get-course` | Returns relevant curriculum section |

### 5.3 Mayvenn-Only Tools

| Tool | Trigger | Endpoint | Action |
|------|---------|----------|--------|
| `check_autopilot` | Agent wants to verify activation status | `POST /api/tools/check-autopilot` | Calls Mayvenn API to check status |
| `schedule_followup` | User needs a callback | `POST /api/tools/schedule-followup` | Queues a follow-up call |

### 5.4 Tool Request/Response Format

```
ElevenLabs → POST /api/tools/get-context
Body: { "phone_number": "+13055551234" }

Response: {
  "name": "Keisha",
  "call_count": 3,
  "last_call": "2 days ago",
  "last_call_summary": "Discussed Module 3. She's on day 14 clean. Still struggling with late-night triggers. Committed to journaling before bed.",
  "memory": {
    "current_module": "3",
    "days_clean": "14",
    "key_triggers": "late nights alone, stress at work",
    "last_mood": "determined"
  }
}
```

---

## 6. Post-Call Processing

When a call ends, ElevenLabs fires a webhook to our server:

```
POST /webhooks/conversation-end
```

### Processing pipeline:
1. **Save raw transcript** to `calls` table
2. **Generate call summary** — call Claude API with transcript, get a 2-3 sentence summary
3. **Extract memory updates** — call Claude API: "Based on this conversation, what should we remember about this person? Return updated memory keys."
4. **Update memory** — merge new memory keys into the `memory` table
5. **Update call outcome** — mark as `completed`, `dropped`, `voicemail`, `callback_requested`, etc.
6. **Trigger follow-ups** — if outcome requires it (missed call → retry, callback → schedule)

### Summary Generation Prompt:
```
You are summarizing a coaching call for future reference. The coach needs to quickly remember:
- What was discussed
- How the person was feeling
- Any commitments they made
- What to follow up on next time

Keep it to 2-3 sentences. Be specific, not generic.
```

---

## 7. Outbound Calling

### 7.1 Single Call
```bash
node scripts/make-call.js +13055551234 --name "Keisha" --link "shop.mayvenn.com/keisha"
```

### 7.2 Batch Calls (CSV)
```bash
node scripts/batch-call.js leads.csv --delay 30 --dry-run
```

### 7.3 Scheduled Follow-ups
Server checks `calls` table for follow-up triggers:
- `callback_requested` with a scheduled time
- `no_answer` → retry after 24h (max 3 attempts)
- `autopilot_not_activated` → follow-up after 48h

---

## 8. Project Structure

```
Vitruvian/
├── src/
│   ├── index.js                    # Express server entry
│   ├── config/
│   │   ├── agents/
│   │   │   ├── vitruvian.js        # Gyasi: agent ID, voice, tools, prompt ref
│   │   │   └── mayvenn.js          # Evan: agent ID, voice, tools, prompt ref
│   │   └── shared.js              # DB, Twilio, common config
│   ├── routes/
│   │   ├── tools.js               # All server tool endpoints
│   │   ├── webhooks.js            # Call status + conversation end
│   │   └── calls.js               # Outbound call triggers
│   ├── services/
│   │   ├── memory.js              # User memory CRUD
│   │   ├── sms.js                 # Twilio SMS
│   │   ├── summary.js             # Post-call summary generation (Claude)
│   │   └── db.js                  # PostgreSQL connection + queries
│   └── prompts/
│       ├── gyasi.md               # Vitruvian system prompt
│       └── evan.md                # Mayvenn system prompt
├── scripts/
│   ├── setup-agent.js             # Create/update ElevenLabs agent
│   ├── make-call.js               # Single outbound call
│   ├── batch-call.js              # Batch calls from CSV
│   └── migrate.js                 # Database migration
├── migrations/
│   └── 001_initial.sql            # Create tables
├── config/
│   ├── knowledge/
│   │   ├── vitruvian-curriculum.md
│   │   └── mayvenn-ambassador.md
│   └── sample-leads.csv
├── docs/
│   ├── architecture.md
│   └── PRD.md (this file)
├── .env.example
├── package.json
└── README.md
```

---

## 9. Environment Variables

```bash
# === Mode ===
AGENT_MODE=vitruvian              # "vitruvian" or "mayvenn"

# === Database ===
DATABASE_URL=postgresql://user:pass@host:5432/voice_agent

# === Twilio ===
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+18559364637

# === ElevenLabs ===
ELEVENLABS_API_KEY=xxx

# === Vitruvian Agent ===
VITRUVIAN_AGENT_ID=agent_3601kk02sk5cfq583ned6q34k6s2
VITRUVIAN_PHONE_NUMBER_ID=xxx

# === Mayvenn Agent ===
MAYVENN_AGENT_ID=agent_1401kk2g94smfccvm4g45gerpt23
MAYVENN_PHONE_NUMBER_ID=phnum_1301kk2g9he6epxbedg12ze64j4w

# === Claude (for post-call summaries) ===
ANTHROPIC_API_KEY=xxx

# === Server ===
PORT=3000
BASE_URL=https://your-server.replit.app
```

---

## 10. Milestones

### Phase 1: Foundation (Week 1)
- [ ] Database schema + migration script
- [ ] Agent config loader (switch by `AGENT_MODE`)
- [ ] `get_member_context` tool — lookup user by phone, return profile + memory
- [ ] `send_sms` tool — send SMS mid-call via Twilio
- [ ] `save_note` tool — persist a memory key during the call
- [ ] Post-call webhook — save transcript + basic outcome
- [ ] Wire tools to both ElevenLabs agents

### Phase 2: Intelligence (Week 2)
- [ ] Post-call summary generation via Claude
- [ ] Automatic memory extraction from transcripts
- [ ] `log_mood` tool (Vitruvian)
- [ ] `update_progress` tool (Vitruvian)
- [ ] `schedule_followup` tool (Mayvenn)
- [ ] Outbound call scripts (single + batch)

### Phase 3: Operations (Week 3)
- [ ] Follow-up call scheduler (auto-retry no-answers, scheduled callbacks)
- [ ] `check_autopilot` tool (Mayvenn — hit Mayvenn API)
- [ ] `get_course_content` tool (Vitruvian — return relevant curriculum section)
- [ ] Call outcome dashboard (or at minimum, CSV export)
- [ ] Voicemail detection + drop

### Phase 4: Scale (Week 4+)
- [ ] Webhook from Mayvenn app → auto-trigger onboarding call on new signup
- [ ] A/B test different prompts/voices
- [ ] Per-user call cadence rules (don't over-call)
- [ ] Analytics: conversion rates, avg duration, memory utilization
- [ ] Multi-number support (different numbers per agent)

---

## 11. Success Metrics

| Metric | Gyasi (Vitruvian) | Evan (Mayvenn) |
|--------|-------------------|----------------|
| **Primary** | Returning caller rate (>2 calls) | AutoPilot activation rate |
| **Secondary** | Self-reported days clean | Call-to-commitment conversion |
| **Engagement** | Avg call duration >5 min | Avg call duration 4-6 min |
| **Quality** | "Agent remembered me" (transcript analysis) | SMS delivered + opened |
| **Cost** | <$0.50/call | <$0.30/call (vs $10 TeleDirect) |

---

## 12. Open Questions

1. **Database hosting?** Replit has built-in PostgreSQL, or use Supabase/Neon for external hosting.
2. **Mayvenn API access?** Need endpoint to check AutoPilot status per ambassador. Does this exist?
3. **Call recording consent?** Both agents should announce "This call may be recorded" — check state laws.
4. **Gyasi identity disclosure?** Agent is instructed never to reveal it's AI. Legal implications?
5. **Rate limits?** ElevenLabs Pro plan concurrent call limits. Batch calling may need throttling.
6. **Phone number per agent?** Currently sharing 855 number. Should each agent have its own number?

---

## 13. Non-Goals (for now)

- Custom LLM proxy (running our own Claude endpoint for voice calls) — complexity not justified yet
- Real-time ambient background audio mixing — requires WebSocket proxy, parked
- Mobile app — SMS + phone only
- Multi-language support
- Video calls
