# PRD: Vitruvian Man AI Coach — Narrative Memory Architecture

**Version:** 2.0  
**Date:** 2026-03-06  
**Author:** DiiClaw + Diishan Imira  
**Status:** Draft  

---

## 1. What We're Building

An AI coaching system for men recovering from porn addiction, powered by Gyasi Hantman's cloned voice. The system remembers every member across calls — not just facts, but their story: patterns, breakthroughs, struggles, and what to do next. Each call feels like talking to a coach who genuinely knows you.

### The Core Insight

Traditional AI voice agents are stateless — every call starts from zero. Real coaching depends on continuity. A therapist's value isn't what they say in one session; it's the compounding understanding they build over months. This system gives an AI that same compounding memory.

---

## 2. Architecture

### 2.1 Three-Layer Memory

```
┌──────────────────────────────────────────────────┐
│ LAYER 1: Member Index (members.json)             │
│                                                  │
│ Phone → name, tier, signup, call count, status   │
│ Purpose: "Who is this person?" (instant lookup)  │
└──────────────────────────┬───────────────────────┘
                           │
┌──────────────────────────▼───────────────────────┐
│ LAYER 2: Member Story (stories/+1XXXXXXXXXX.md)  │
│                                                  │
│ YAML frontmatter (structured tags for future     │
│ VDB ingestion) + synthesized narrative:           │
│ patterns, breakthroughs, struggles, emotional    │
│ arc, coaching guidance for next call              │
│                                                  │
│ Purpose: "What does Gyasi need to know to        │
│ coach this person right now?"                    │
└──────────────────────────┬───────────────────────┘
                           │
┌──────────────────────────▼───────────────────────┐
│ LAYER 3: Call Archive (calls/*.json)             │
│                                                  │
│ Raw transcript + AI-generated summary per call   │
│ Chronological record — the "Timeline_README"     │
│ of each member's journey                         │
│                                                  │
│ Purpose: Source material for story rewrites +    │
│ future cross-user analysis                       │
└──────────────────────────────────────────────────┘
```

### 2.2 System Diagram

```
                    ┌──────────────────────┐
                    │     ElevenLabs       │
                    │  Conversational AI   │
                    │                      │
                    │  Voice: Gyasi PVC    │
                    │  LLM: Claude 3.5     │
                    │  KB: Full curriculum  │
                    └───┬──────────┬───────┘
                        │          │
             Tool calls │          │ Post-call webhook
                        ▼          ▼
┌──────────────────────────────────────────────────┐
│              VITRUVIAN SERVER                      │
│              (Node.js / Express)                   │
│                                                    │
│  ┌─────────────┐  ┌──────────────────────────┐    │
│  │ Tool Engine  │  │   Post-Call Pipeline     │    │
│  │              │  │                          │    │
│  │ get_context  │  │ 1. Save transcript       │    │
│  │ save_note    │  │ 2. Generate summary      │    │
│  │ log_mood     │  │ 3. Rewrite Member Story  │    │
│  │ send_sms     │  │ 4. Update index          │    │
│  │ update_prog  │  │                          │    │
│  └──────┬───────┘  └────────────┬─────────────┘   │
│         │                       │                  │
│  ┌──────▼───────────────────────▼──────────────┐   │
│  │              DATA LAYER                      │   │
│  │                                              │   │
│  │  members.json     stories/*.md    calls/*.json│  │
│  │  (phone book)     (narratives)    (archive)  │   │
│  └──────────────────────────────────────────────┘   │
│                                                    │
│  ┌──────────────────────────────────────────────┐   │
│  │  Twilio (SMS delivery) + Claude (summaries)  │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### 2.3 File Structure

```
data/
├── members.json                        # Index: phone → profile
├── stories/
│   ├── +13055551234.md                 # Marcus's narrative
│   ├── +17865559876.md                 # James's narrative
│   └── ...
├── calls/
│   ├── +13055551234/
│   │   ├── 2026-03-06_conv_abc123.json # Call 1: transcript + summary
│   │   ├── 2026-03-09_conv_def456.json # Call 2: transcript + summary
│   │   └── ...
│   └── +17865559876/
│       └── ...
└── coaching-playbook.md                # System-level insights (future: from VDB analysis)
```

---

## 3. Data Formats

### 3.1 Member Index (`members.json`)

```json
{
  "+13055551234": {
    "name": "Marcus",
    "email": "marcus@gmail.com",
    "tier": "foundation",
    "signup": "2026-03-01",
    "calls": 4,
    "lastCall": "2026-03-18",
    "lastOutcome": "relapsed_reframe",
    "daysSober": 0,
    "currentModule": 1,
    "storyFile": "stories/+13055551234.md"
  }
}
```

### 3.2 Member Story (`stories/+13055551234.md`)

```markdown
---
phone: "+13055551234"
name: Marcus
tier: foundation
signup: 2026-03-01
calls: 4
last_call: 2026-03-18
days_clean: 0
current_module: 1
status: active
tags: [late-night-trigger, work-stress, shame-spiral, wife-discovered, relapse-after-streak, emotional-void, physical-movement-works]
---

# Marcus — The Story So Far

Marcus is 37, married, two kids. Wife found his browser history in January —
that's what brought him here. The shame is the dominant emotion, not the
addiction itself.

## Where He Is
Day 0 — just relapsed after an 18-day streak (his longest). He's in the
self-punishment phase.

## Patterns
- **Late-night vulnerability**: 3 of 4 calls after 10pm. Nighttime is when
  urges surface. No nighttime routine built yet.
- **Stress → isolation → urge cycle**: Work stress in calls 2, 3, and 4.
  He isolates when stressed (stays up after wife sleeps), creating the window.
- **Emotional void, not just sexual**: Call 3 — "empty, not horny." Starting
  to see porn as a coping mechanism. Module 3 insight arriving organically.
- **Physical movement works**: Walk on Day 10 was his only successful
  intervention. Hasn't repeated it.

## What's Working
- He keeps calling. 4 calls in 18 days — engaged.
- Honest. No minimizing, no performing recovery.
- "Empty not horny" was unprompted — real self-examination happening.

## What's Not
- No nighttime routine despite clear trigger window.
- Module 1 only — no course progression in 18 days.
- Walk worked once but not built into pattern.
- Post-relapse shame spiral could become a quit trigger.

## Next Call Guidance
Lead with normalizing the relapse. Do NOT let him sit in shame — that
feeds the cycle. Push the "Compounding Machine" frame: the relapse didn't
erase 18 days of neural rewiring. Probe the nighttime routine gap. Suggest
the walk as a deliberate pre-bed ritual, not just emergency intervention.
If receptive, introduce Module 3 concepts (Depletive vs Accretive Inputs) —
he's already arriving at those ideas on his own.
```

### 3.3 Call Archive (`calls/+13055551234/2026-03-18_conv_xyz789.json`)

```json
{
  "conversation_id": "conv_xyz789",
  "phone": "+13055551234",
  "date": "2026-03-18",
  "started_at": "2026-03-18T23:14:00Z",
  "duration_secs": 487,
  "outcome": "relapsed_reframe",
  "transcript": "Gyasi: Hey Marcus, how are you doing tonight?\nMarcus: Not great man. I messed up...",
  "summary": "Call 4. Marcus relapsed on Day 18 after his longest streak. Called at 11:14pm — late-night pattern continues. Trigger was work stress leading to isolation after wife went to sleep. Heavy shame. Talked through the shame spiral — reframed relapse as data, not failure. He acknowledged the 'empty not horny' feeling again. Didn't get to course content. Committed to calling back in 2 days.",
  "mood": "defeated but still engaged",
  "tools_used": []
}
```

---

## 4. Call Flow

### 4.1 Call Start — Context Loading

```
Phone rings → Twilio → ElevenLabs answers
  ↓
Agent triggers: get_member_context(phone)
  ↓
Server:
  1. Look up phone in members.json
  2. Read stories/+13055551234.md
  3. Read last 2 call summaries from calls/+13055551234/
  ↓
Returns to agent:
  {
    "known_member": true,
    "name": "Marcus",
    "tier": "foundation",
    "calls": 4,
    "days_clean": 0,
    "story": "[full .md content]",
    "recent_calls": [
      { "date": "2026-03-15", "summary": "Day 14. Called at 11pm..." },
      { "date": "2026-03-18", "summary": "Day 18. Relapsed..." }
    ]
  }
  ↓
Agent: reads the story, understands Marcus, adapts the conversation
```

For **new callers** (phone not in index):
```
Returns: { "known_member": false }
Agent: runs first-call intake — name, what brought them here,
       where they are in their journey
```

### 4.2 Mid-Call — Tool Execution

| Tool | When | What It Does |
|------|------|--------------|
| `get_member_context` | Call start | Returns profile + story + recent summaries |
| `save_note` | Agent hears something important | Writes a note to a scratch file for post-call processing |
| `log_mood` | Agent assesses emotional state | Records mood + context (used in story rewrite) |
| `update_progress` | Member reports milestone | Updates days_clean, current_module in index |
| `send_sms` | Member needs a resource | Sends course link, crisis hotline, journal prompt via Twilio |
| `get_course_content` | Member asks about a topic | Returns relevant curriculum section from KB |

### 4.3 Call End — Story Rewrite Pipeline

```
Call ends → ElevenLabs fires webhook
  ↓
1. SAVE — Write transcript + basic metadata to calls/+PHONE/DATE_CONVID.json
  ↓
2. SUMMARIZE — Send transcript to Claude:
   "Summarize this coaching call in 3-4 sentences. Include: what was
    discussed, emotional state, any commitments made, what to follow up on."
   → Save summary to the call JSON
  ↓
3. REWRITE STORY — Send to Claude:
   - Previous Member Story (.md)
   - ALL call summaries for this member (chronological)
   - Any mid-call notes (save_note, log_mood)
   - Member profile from index
   
   Prompt:
   "You are maintaining the narrative memory for a coaching client.
    Rewrite their Member Story based on all available information.
    
    Include:
    - Updated 'Where He Is' section reflecting current state
    - Patterns: behaviors that keep showing up, trigger patterns,
      what's consistent across calls
    - What's Working: positive signals, engagement indicators
    - What's Not: gaps, stalls, risks
    - Next Call Guidance: specific coaching direction based on
      everything above. Reference Vitruvian Man course concepts
      where the member is ready for them.
    
    Update the YAML frontmatter tags to reflect current patterns.
    
    Write as narrative, not a report. Be specific, not generic.
    This file is what the coach reads before the next call."
   
   → Overwrite stories/+PHONE.md with new version
  ↓
4. UPDATE INDEX — Update members.json: call count, lastCall, lastOutcome,
   daysSober, currentModule
```

---

## 5. Server Tools (ElevenLabs → Server)

### 5.1 Tool Definitions

```javascript
// get_member_context — called at start of every call
{
  name: "get_member_context",
  description: "Look up the caller's profile, their story (history, patterns, coaching notes), and recent call summaries. Call this at the very beginning of every conversation to understand who you're talking to.",
  parameters: {
    phone_number: {
      type: "string",
      description: "Caller's phone number. Use {{system__caller_id}}."
    }
  }
}

// save_note — mid-call memory capture
{
  name: "save_note",
  description: "Save an important observation about the caller that should be remembered. Use when you notice a pattern, the caller reveals something significant, or makes a commitment.",
  parameters: {
    note: {
      type: "string",
      description: "What to remember. Be specific."
    }
  }
}

// log_mood — emotional state tracking
{
  name: "log_mood",
  description: "Record the caller's current emotional state and what's driving it.",
  parameters: {
    mood: {
      type: "string",
      description: "Emotional state (e.g., 'defeated but engaged', 'angry at himself', 'cautiously hopeful')"
    },
    context: {
      type: "string",
      description: "What's driving this mood"
    }
  }
}

// update_progress — milestone tracking
{
  name: "update_progress",
  description: "Update the caller's recovery progress when they report a milestone.",
  parameters: {
    days_clean: {
      type: "number",
      description: "Current self-reported days without porn. 0 if just relapsed."
    },
    current_module: {
      type: "number",
      description: "Module number they're currently working through (1-7)"
    }
  }
}

// send_sms — resource delivery
{
  name: "send_sms",
  description: "Send a text message to the caller with a resource, link, or journal prompt.",
  parameters: {
    phone_number: {
      type: "string",
      description: "Phone number to text"
    },
    message: {
      type: "string",
      description: "Message content"
    }
  }
}

// get_course_content — curriculum retrieval
{
  name: "get_course_content",
  description: "Retrieve a specific section of the Vitruvian Man course content. Use when the caller asks about or is ready for specific course concepts.",
  parameters: {
    topic: {
      type: "string",
      description: "Topic to look up (e.g., 'Compounding Machine', 'Depletive vs Accretive', 'Module 3 exercises')"
    }
  }
}
```

### 5.2 Tool Endpoints

```
POST /api/tools/get-context       → reads members.json + story + recent calls
POST /api/tools/save-note         → appends to scratch file for post-call processing
POST /api/tools/log-mood          → saves mood entry for post-call processing
POST /api/tools/update-progress   → updates members.json immediately
POST /api/tools/send-sms          → sends via Twilio
POST /api/tools/get-course        → searches curriculum KB, returns relevant section
POST /webhooks/conversation-end   → triggers the full post-call pipeline
```

---

## 6. Project Structure

```
vitruvian/
├── src/
│   ├── index.js                        # Express server
│   ├── config.js                       # Agent config, paths, API keys
│   ├── routes/
│   │   ├── tools.js                    # All server tool endpoints
│   │   └── webhooks.js                 # Post-call webhook handler
│   ├── services/
│   │   ├── memory.js                   # Read/write members.json + stories
│   │   ├── story-writer.js             # Post-call Claude narrative rewrite
│   │   ├── summarizer.js               # Transcript → summary (Claude)
│   │   ├── sms.js                      # Twilio SMS
│   │   └── curriculum.js               # Course content retrieval
│   └── prompts/
│       ├── gyasi-system.md             # ElevenLabs agent system prompt
│       ├── summarize.md                # Summary generation prompt
│       └── rewrite-story.md            # Story rewrite prompt
├── data/
│   ├── members.json                    # Member index
│   ├── stories/                        # Member narratives (.md)
│   ├── calls/                          # Call archives (.json)
│   └── coaching-playbook.md            # System-level coaching insights
├── config/
│   ├── knowledge-base.md               # Vitruvian Man curriculum
│   └── sample-data/                    # Example member stories for testing
├── scripts/
│   ├── setup-agent.js                  # Create/update ElevenLabs agent + tools
│   └── migrate-to-sqlite.js            # Future: JSON → SQLite migration
├── .env.example
├── package.json
├── PRD.md
└── README.md
```

---

## 7. Environment Variables

```bash
# === ElevenLabs ===
ELEVENLABS_API_KEY=xxx
ELEVENLABS_AGENT_ID=agent_3601kk02sk5cfq583ned6q34k6s2

# === Twilio ===
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+15105883049

# === Claude (post-call summaries + story rewrites) ===
ANTHROPIC_API_KEY=xxx
CLAUDE_MODEL=claude-sonnet-4-6

# === Server ===
PORT=3000
BASE_URL=https://your-server.replit.app
DATA_DIR=./data
```

---

## 8. ElevenLabs Agent Configuration

| Setting | Value |
|---------|-------|
| Agent ID | `agent_3601kk02sk5cfq583ned6q34k6s2` |
| Voice | Gyasi PVC `ta5vPsZm54WOCYibe6OP` |
| LLM | `claude-3-5-sonnet` |
| Temperature | 0.0 |
| Stability | 0.5 |
| Similarity | 0.8 |
| Speed | 1.0 |
| TTS Model | `eleven_turbo_v2` |
| Knowledge Base | Vitruvian Man curriculum (`RsT0F05SEOXGwH7MbyvY`) |
| Tools | get_member_context, save_note, log_mood, update_progress, send_sms, get_course_content |
| Post-call webhook | `{BASE_URL}/webhooks/conversation-end` |

---

## 9. Scaling Path

| Phase | Users | Index | Stories | What Changes |
|-------|-------|-------|---------|--------------|
| Launch | 0 – 1K | `members.json` | `.md` files | Nothing. Ship this. |
| Growth | 1K – 10K | `members.json` | `.md` files | Maybe file-locking on writes |
| Scale | 10K – 1M | SQLite | `.md` files | Swap JSON for SQLite (2hr migration). Stories unchanged. |
| Intelligence | 500+ members | + Vector DB | `.md` files (with frontmatter) | Add Layer 4: cross-user pattern analysis → coaching playbook |

### Future: Collective Intelligence (Phase 4+)

When member count justifies it, add a VDB layer for cross-user analysis:

```
Weekly analysis cycle:

1. Ingest all member stories (frontmatter tags + prose) into VDB
2. Run pattern queries:
   - "Common triggers for relapse after 14+ day streaks?"
   - "What coaching approaches correlate with longer streaks?"
   - "Members stuck on Module 1 for 2+ weeks — what do they have in common?"
3. Synthesize findings into coaching-playbook.md
4. Agent reads playbook alongside individual story → all members benefit
```

The YAML frontmatter in every story file is pre-structured for VDB ingestion. No reprocessing needed when this layer is added.

---

## 10. Milestones

### Phase 1: Foundation (Week 1)
- [ ] Data directory setup + initial `members.json`
- [ ] `get_member_context` tool — read index + story + recent calls
- [ ] `save_note` tool — scratch capture during calls
- [ ] `send_sms` tool — resource delivery via Twilio
- [ ] Post-call webhook — save transcript to `calls/` directory
- [ ] Wire tools to ElevenLabs agent via setup script
- [ ] Test: call in → tool fires → context returned → call ends → transcript saved

### Phase 2: Memory (Week 2)
- [ ] Summarizer service — transcript → 3-4 sentence summary via Claude
- [ ] Story writer service — Claude rewrites `.md` narrative post-call
- [ ] Story rewrite prompt engineering and testing
- [ ] `log_mood` tool
- [ ] `update_progress` tool
- [ ] Index auto-update on call end
- [ ] Test: call in → personalized response → call ends → story rewritten → next call reflects new context

### Phase 3: Coaching Depth (Week 3)
- [ ] `get_course_content` tool — curriculum section retrieval
- [ ] First-call intake flow (new member detection + onboarding)
- [ ] Enhance Gyasi system prompt with memory-aware coaching instructions
- [ ] SMS resource library (journal prompts, crisis info, module links)
- [ ] Test with 5-10 real members through multi-call journeys

### Phase 4: Operations (Week 4+)
- [ ] Deploy to production (Replit or dedicated host)
- [ ] Proactive outreach — check-in SMS if no call in X days
- [ ] Call outcome tracking + basic reporting
- [ ] Coaching playbook (manually curated from early call patterns)
- [ ] Voicemail detection
- [ ] `migrate-to-sqlite.js` script (ready but not deployed until needed)

---

## 11. Success Metrics

| Metric | Target | How Measured |
|--------|--------|-------------|
| Returning callers (2+ calls) | >40% of members | members.json call count |
| "Agent remembered me" | >80% of returning callers | Transcript analysis — member references prior context |
| Avg call duration | >5 minutes | Call archive duration |
| Story quality | Actionable guidance in every story | Manual review of `.md` files |
| Days clean trend | Increasing avg across members | members.json / story frontmatter |
| Post-call pipeline reliability | 100% of calls get stories rewritten | Call archive vs story file timestamps |
| Tool call success rate | >95% | Tool log in call archives |

---

## 12. Open Questions

1. **Phone number**: Use `+15105883049` (local) or get a dedicated number for Vitruvian?
2. **First-call intake**: How much info should Gyasi gather on first call? (Name, what brought them here, where they are — or deeper?)
3. **Proactive outreach**: Should the system text members who haven't called in X days? What's the message?
4. **Story rewrite cost**: Each rewrite is ~1 Claude API call ($0.01-0.05). At 100 calls/day = $1-5/day. Acceptable?
5. **Call recording consent**: "This call may be recorded for quality purposes" — add to agent first message?
6. **Crisis protocol**: Current system prompt routes self-harm to 988 hotline. Is that sufficient, or do we need a tool that alerts a human?
7. **Gyasi identity**: Agent is instructed never to reveal it's AI. Legal/ethical review needed?

---

## 13. What This PRD Does NOT Cover

- Mayvenn ambassador onboarding (separate PRD — different memory needs, different call patterns)
- Custom LLM proxy (ElevenLabs handles LLM calls natively for now)
- Background ambient audio (requires WebSocket proxy — parked)
- Mobile app (SMS + phone only)
- Payment / subscription management
- Course delivery platform
