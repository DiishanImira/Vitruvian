# Gyasi AI Coach — Phase 1

> AI voice + SMS coaching system powered by Gyasi Hantman's cloned voice, Claude AI, ElevenLabs Conversational AI, and Twilio.

## What This Is

A Node.js/Express server that gives the Vitruvian Man course a real-time AI coaching presence. Men can:
- **Call** the Twilio number and speak directly with Gyasi (powered by ElevenLabs + his cloned voice)
- **Text** the Twilio number and get thoughtful SMS replies written in Gyasi's voice (powered by Claude)

Gyasi's persona, philosophy, and voice are all embedded — the AI never breaks character or uses chatbot filler.

---

## Architecture

```
Caller/Texter
     │
     ▼
Twilio (+18559364637)
     │
     ├── Voice call → POST /webhook/voice → ElevenLabs ConvAI (WebSocket)
     │                                            │
     │                                     POST /llm (custom LLM)
     │                                            │
     │                                       Claude API
     │
     └── SMS → POST /webhook/sms → Claude API → Twilio SMS reply
```

---

## Deploy to Replit

### Step 1 — Import the project

1. Go to [replit.com](https://replit.com) and click **+ Create Repl**
2. Choose **Import from GitHub** (or upload the folder as a zip)
3. Select Node.js as the language

### Step 2 — Add environment variables

In Replit, go to **Secrets** (padlock icon in sidebar) and add each variable:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic key |
| `ELEVENLABS_API_KEY` | Your ElevenLabs key |
| `ELEVENLABS_VOICE_ID` | `VcnjiECS8LNCkWQkd4p8` |
| `ELEVENLABS_AGENT_ID` | (set after Step 4) |
| `TWILIO_ACCOUNT_SID` | Your Twilio SID |
| `TWILIO_AUTH_TOKEN` | Your Twilio auth token |
| `TWILIO_PHONE_NUMBER` | `+18559364637` |

### Step 3 — Install dependencies & run

Click the **Run** button. Replit will run `node src/index.js`. You should see:

```
  ╔══════════════════════════════════════╗
  ║       Gyasi AI Coach — Phase 1       ║
  ╚══════════════════════════════════════╝

  🎙  Server running on port 3000
  ...
```

Note your Replit URL — it will be something like:
`https://gyasi-coach.YOUR_USERNAME.repl.co`

### Step 4 — Create the ElevenLabs agent

In the Replit shell, run:

```bash
node scripts/create-agent.js
```

This will output an `agent_id`. Add it to Replit Secrets as `ELEVENLABS_AGENT_ID`.

Then go to the [ElevenLabs dashboard](https://elevenlabs.io) → **Conversational AI** → your Gyasi agent → **Custom LLM** and update the URL to:

```
https://YOUR_REPLIT_URL/llm
```

### Step 5 — Configure Twilio webhooks

1. Log into [Twilio Console](https://console.twilio.com)
2. Go to **Phone Numbers** → **+18559364637** → **Configure**
3. Under **Voice & Fax**:
   - When a call comes in: **Webhook** → `https://YOUR_REPLIT_URL/webhook/voice` → `HTTP POST`
4. Under **Messaging**:
   - When a message comes in: **Webhook** → `https://YOUR_REPLIT_URL/webhook/sms` → `HTTP POST`
5. Save

---

## Testing

### Test SMS
Text `+18559364637` from your phone. You should get a reply from Gyasi within a few seconds.

### Test Voice
Call `+18559364637`. You should hear Gyasi's voice say:
> "Hey, this is Gyasi. I'm glad you called. How are you doing right now?"

### Test the /llm endpoint directly
```bash
curl -X POST https://YOUR_REPLIT_URL/llm \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "I keep relapsing and I feel like a failure"}], "stream": true}'
```

### Health check
```bash
curl https://YOUR_REPLIT_URL/
```

---

## Project Structure

```
gyasi-coach/
├── package.json
├── .env.example              # Template for env vars
├── .env                      # Real credentials (never commit this)
├── .replit                   # Replit run config
├── replit.nix                # Replit nix config
├── README.md
├── scripts/
│   └── create-agent.js       # One-time ElevenLabs agent setup
└── src/
    ├── index.js              # Express server + middleware
    ├── routes/
    │   ├── twilio.js         # POST /webhook/voice + /webhook/sms
    │   └── elevenlabs.js     # POST /llm (custom LLM streaming endpoint)
    ├── services/
    │   ├── claude.js         # Claude API wrapper (streaming + non-streaming)
    │   ├── twilio.js         # Outbound SMS helper
    │   └── member.js         # In-memory member context store
    └── prompts/
        └── gyasi.js          # Gyasi system prompt builder
```

---

## Phase 2 Roadmap

- **Replit DB** — persist member context across server restarts
- **Intake flow** — structured onboarding via SMS (name, why they're here, goals)
- **Streak tracking** — daily check-ins, streak counters
- **Caller ID lookup** — link voice callers to their SMS member context
- **ElevenLabs webhooks** — receive call summaries after voice sessions
- **Admin dashboard** — view member stats, conversation logs

---

## Notes

- Member context is **in-memory only** in Phase 1. Server restarts wipe all context.
- The `/debug/members` endpoint lists all active members (disabled in production).
- SMS replies from Claude are capped at 1024 tokens and split across multiple texts if needed.
- Voice calls use ElevenLabs' own turn detection and audio handling — we only provide the LLM brain.

### ⚠️ Custom LLM Limitation

The Gyasi voice (`VcnjiECS8LNCkWQkd4p8`) is an **Instant Voice Clone (IVC)**. ElevenLabs does **not** allow Custom LLM endpoints with IVC voices. The voice agent uses ElevenLabs' native **Claude 3.5 Sonnet** integration with the full Gyasi system prompt embedded directly.

This means voice calls can't access real-time member context (like the caller's name or history). To enable this:
- Upgrade the Gyasi voice to a **Professional Voice Clone (PVC)** in ElevenLabs
- Then configure the agent to use `llm: "custom-llm"` with the `/llm` endpoint

SMS coaching is unaffected — it goes through our Claude wrapper and has full member context.
