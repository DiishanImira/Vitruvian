# Gyasi AI Coach — Vitruvian Man

## Overview

An AI coaching system for men recovering from porn addiction, powered by Gyasi Hantman's cloned voice. The system uses a "Narrative Memory" architecture — it remembers every member across calls via a living story document that gets rewritten by Claude after each conversation.

## Architecture

- **Runtime**: Node.js (>=18)
- **Framework**: Express.js
- **Package manager**: npm
- **Memory**: File-based three-layer system (members.json index + per-member .md stories + per-call .json archives)
- **AI**: Anthropic Claude (story generation, rewrites, SMS replies), ElevenLabs Conversational AI (voice)
- **Telephony**: Twilio (voice routing, SMS)

## Project Structure

```
gyasi-coach/
  public/
    signup.html               # Frontend intake form (dark-themed, 8 questions)
  src/
    index.js                  # Main Express server entry point
    routes/
      signup.js               # POST /api/signup — member registration + initial story generation
      tools.js                # POST /api/tools/* — ElevenLabs server tools (get-context, save-note, log-mood, update-progress, send-sms)
      webhooks.js             # POST /webhooks/* — ElevenLabs post-call webhook (transcript save, story rewrite) + Twilio call status
      twilio.js               # POST /webhook/voice and /webhook/sms — Twilio voice + SMS webhooks
    services/
      memory.js               # File-based persistent memory (3-layer: index, stories, calls, notes)
      story-writer.js          # Claude-powered story generation (initial + post-call rewrite + transcript summary)
      claude.js               # Anthropic Claude API integration (streaming + non-streaming)
      twilio.js               # Twilio SMS sending helper
    prompts/
      gyasi-system.md         # Gyasi AI coach system prompt (memory-aware, instructs tool usage)
  data/
    members.json              # Layer 1: phone → profile index
    stories/                  # Layer 2: per-member narrative .md files (auto-created)
    calls/                    # Layer 3: per-member call transcripts + summaries (auto-created)
    notes/                    # Mid-call scratch notes (auto-created)
  AGENT_CONFIGS.md            # ElevenLabs agent baseline settings documentation
  .env.example                # Template for required environment variables

docs/
  narrative-memory-whitepaper.md  # White paper on the narrative memory architecture
PRD.md                            # Product requirements document (v2.0)
```

## API Endpoints

- `GET /` — Redirects to signup page
- `GET /signup.html` — Member intake form
- `GET /api/health` — Health check (returns service info JSON)
- `POST /api/signup` — Register new member, generate initial story via Claude
- `POST /api/tools/get-context` — ElevenLabs server tool: returns member profile + story for a call
- `POST /api/tools/save-note` — ElevenLabs server tool: saves mid-call observation
- `POST /api/tools/log-mood` — ElevenLabs server tool: records emotional state
- `POST /api/tools/update-progress` — ElevenLabs server tool: updates days clean / module progress
- `POST /api/tools/send-sms` — ElevenLabs server tool: sends SMS via Twilio
- `POST /webhooks/conversation-end` — ElevenLabs post-call webhook (saves transcript, rewrites story)
- `POST /webhooks/call-status` — Twilio call status tracking
- `POST /webhook/voice` — Twilio voice webhook (bridges to ElevenLabs Conversational AI)
- `POST /webhook/sms` — Twilio SMS webhook (Claude-powered SMS replies with member context)
- `GET /debug/members` — Debug: list all members (dev only)
- `GET /debug/story/:phone` — Debug: view member story (dev only)
- `GET /debug/calls/:phone` — Debug: view member call history (dev only)

## Required Environment Variables / Secrets

- `ANTHROPIC_API_KEY` — Claude API key
- `ELEVENLABS_API_KEY` — ElevenLabs API key
- `ELEVENLABS_AGENT_ID` — ElevenLabs Conversational AI agent ID
- `TWILIO_ACCOUNT_SID` — Twilio account SID
- `TWILIO_AUTH_TOKEN` — Twilio auth token
- `TWILIO_PHONE_NUMBER` — Twilio phone number (e.g. +15105883049)

### Optional

- `CLAUDE_MODEL` — Claude model to use (default: claude-sonnet-4-6)
- `BASE_URL` — Public server URL
- `DATA_DIR` — Data directory path (default: ./data)
- `VITRUVIAN_CALL_NUMBER` — Phone number shown to members after signup

## Configuration

- `PORT` — Set to `5000` (configured in shared env vars)
- Server binds to `0.0.0.0` on port 5000

## Workflow

- **Start application**: `cd gyasi-coach && npm start` — runs on port 5000

## Deployment

- Target: autoscale
- Run: `node gyasi-coach/src/index.js`
