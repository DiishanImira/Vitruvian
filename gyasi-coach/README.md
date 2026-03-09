# Gyasi AI Coach — Vitruvian Man

> AI voice + SMS coaching system with persistent narrative memory. Powered by Gyasi Hantman's cloned voice, Claude AI, ElevenLabs Conversational AI, and Twilio.

## What This Is

A Node.js/Express server that gives the Vitruvian Man recovery program a real-time AI coaching presence. Men can:
- **Call** the Twilio number and speak directly with Gyasi (powered by ElevenLabs Conversational AI + his cloned voice)
- **Text** the Twilio number and get thoughtful SMS replies written in Gyasi's voice (powered by Claude)
- **Sign up** via a web intake form — Gyasi will already know their story when they call

The system uses a **Narrative Memory** architecture: each member has a living story document that gets rewritten by Claude after every call, capturing patterns, breakthroughs, and coaching guidance.

---

## Architecture

```
Member signs up → POST /api/signup → Claude generates initial story
                                      ↓
                                  data/stories/+1XXXXXXXXXX.md

Member calls → Twilio → POST /webhook/voice → ElevenLabs ConvAI
                                                    │
                                          Server tools (mid-call):
                                           • get_member_context
                                           • save_note / log_mood
                                           • update_progress
                                           • send_sms
                                                    │
                                          Call ends → POST /webhooks/conversation-end
                                                    │
                                           Post-call pipeline:
                                           1. Save transcript
                                           2. Summarize via Claude
                                           3. Rewrite member story
                                           4. Update index

Member texts → Twilio → POST /webhook/sms → Claude (with story context) → SMS reply
```

### Three-Layer Memory

| Layer | Storage | Purpose |
|-------|---------|---------|
| 1. Index | `data/members.json` | Phone → profile lookup |
| 2. Story | `data/stories/*.md` | AI-written narrative per member |
| 3. Archive | `data/calls/*/*.json` | Raw transcripts + summaries |

---

## Setup

### Environment Variables

| Key | Description |
|-----|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `ELEVENLABS_AGENT_ID` | ElevenLabs Conversational AI agent ID |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio phone number |

### Run

```bash
cd gyasi-coach
npm install
npm start
```

Server starts on port 5000. Visit `/` to see the signup form.

### Create ElevenLabs Agent

```bash
node scripts/create-agent.js
```

This creates the ElevenLabs agent with Gyasi's system prompt and voice. Copy the returned agent ID to `ELEVENLABS_AGENT_ID`.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Redirects to signup page |
| GET | `/signup.html` | Member intake form |
| GET | `/api/health` | Health check |
| POST | `/api/signup` | Register member + generate initial story |
| POST | `/api/tools/get-context` | ElevenLabs tool: member profile + story |
| POST | `/api/tools/save-note` | ElevenLabs tool: mid-call observation |
| POST | `/api/tools/log-mood` | ElevenLabs tool: emotional state |
| POST | `/api/tools/update-progress` | ElevenLabs tool: days clean / module |
| POST | `/api/tools/send-sms` | ElevenLabs tool: send SMS via Twilio |
| POST | `/webhooks/conversation-end` | Post-call pipeline (transcript, rewrite) |
| POST | `/webhooks/call-status` | Twilio call status tracking |
| POST | `/webhook/voice` | Twilio voice → ElevenLabs bridge |
| POST | `/webhook/sms` | Twilio SMS → Claude reply |

---

## Documentation

- [PRD](../PRD.md) — Product requirements and architecture
- [White Paper](../docs/narrative-memory-whitepaper.md) — Narrative Memory architecture
- [Agent Configs](AGENT_CONFIGS.md) — ElevenLabs agent baseline settings
