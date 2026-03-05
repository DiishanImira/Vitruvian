# Gyasi AI Coach

## Overview

A Phase 1 AI coaching backend server for the Vitruvian Man platform. It provides AI voice and SMS coaching powered by Anthropic Claude, ElevenLabs, and Twilio.

## Architecture

- **Runtime**: Node.js (>=18)
- **Framework**: Express.js
- **Package manager**: npm

## Project Structure

```
gyasi-coach/
  src/
    index.js              # Main Express server entry point
    routes/
      elevenlabs.js       # POST /llm — ElevenLabs custom LLM endpoint (SSE streaming)
      twilio.js           # POST /webhook/voice and /webhook/sms — Twilio webhooks
    services/
      claude.js           # Anthropic Claude API integration (streaming + non-streaming)
      member.js           # In-memory member store with history tracking
      twilio.js           # Twilio SMS sending helper
    prompts/
      gyasi.js            # Gyasi AI coach system prompt builder
  scripts/
    create-agent.js       # ElevenLabs agent creation script
  .env.example            # Template for required environment variables
```

## API Endpoints

- `GET /` — Health check (returns service info JSON)
- `POST /llm` — ElevenLabs custom LLM endpoint (OpenAI streaming SSE format)
- `POST /webhook/voice` — Twilio voice webhook (bridges to ElevenLabs Conversational AI)
- `POST /webhook/sms` — Twilio SMS webhook (Claude-powered SMS replies)
- `GET /debug/members` — Debug endpoint (dev only)

## Required Environment Variables / Secrets

These secrets must be configured for full functionality:

- `ANTHROPIC_API_KEY` — Claude API key
- `ELEVENLABS_API_KEY` — ElevenLabs API key
- `ELEVENLABS_VOICE_ID` — ElevenLabs voice ID (default: VcnjiECS8LNCkWQkd4p8)
- `ELEVENLABS_AGENT_ID` — ElevenLabs Conversational AI agent ID
- `TWILIO_ACCOUNT_SID` — Twilio account SID
- `TWILIO_AUTH_TOKEN` — Twilio auth token
- `TWILIO_PHONE_NUMBER` — Twilio phone number (e.g. +18559364637)

## Configuration

- `PORT` — Set to `5000` (configured in shared env vars)
- Server binds to `0.0.0.0` on port 5000

## Workflow

- **Start application**: `cd gyasi-coach && npm start` — runs on port 5000

## Deployment

- Target: autoscale
- Run: `node gyasi-coach/src/index.js`
