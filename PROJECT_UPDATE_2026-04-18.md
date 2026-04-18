# Project Update — 2026-04-18

## Session scope

Tuned GyasiV2 prompt for natural voice conversation, fixed a silent bug in the post-call summary pipeline that was suppressing "Connections Made" across all branches, and stood up a full SMS conversational channel (SalesMessage) with parallel memory — including background session rollup into the existing narrative-memory story. Closed with latency tuning (instant greeting + prompt caching + cache priming) so SMS replies feel responsive.

## What got built

### Voice: GyasiV2 branch + tuned prompt

- New branch `GyasiV2` on ElevenLabs agent `agent_3601kk02sk5cfq583ned6q34k6s2` (branch_id `agtbrch_8601kpga8hcyfrn9sgcqy0x4t38m`). Branch-level versioning; pushes via `scripts/push-prompt-to-branch.js` against `PATCH /v1/convai/agents/{id}?branch_id=...`.
- `gyasi-system.v2.md` restructured from v1:
  - **DELIVERY MECHANICS** section placed first-after-identity: one-question-per-turn discipline, 2–3 sentence cap, reflect-before-respond (one-phrase mirror), explicit silence deploy moments, transition vocabulary ("The thing underneath that…", "Here's what I'm noticing…"), v3 audio tags with 1–3-per-call cap (`[pause]`, `[calm]`, `[quiet]`, `[warm]`).
  - **PACING MODES**: CRISIS / URGE-IN-PROGRESS / POST-RELAPSE / STABLE / DRIFT with explicit behavior per mode.
  - **PUSH vs PRESENCE**: read-signals for each. Default to presence.
  - **QUESTION PATTERNS BY SCENARIO**: opening / deepening / pattern-naming / challenge / crisis-presence / closing-commitment — each with ready-made questions.
  - **GOLD-STANDARD EXCHANGES**: 4 bad/good paired examples anchoring the tuning concretely.
  - Reconciled first_message vs init-webhook (v1 had redundant "greet by name…" that's now composed server-side).
  - CALLER CONTEXT block + dynamic variable placeholders (`{{member_name}}`, `{{member_story}}`, `{{recent_calls}}`, etc.) placed identically to Main so the init webhook injects cleanly.
- Verified config parity with Main: only prompt text + branch_id + version_id differ; all 6 tools, all TTS/LLM/turn settings, `dynamic_variable_placeholders`, and override flags (`enable_conversation_initiation_client_data_from_webhook`, `first_message: true`) inherited cleanly when the branch was forked.

### Summary pipeline bug fix (affects all branches)

- Root-caused a silent bug: `summarizeTranscript(transcript, memberName)` received only the transcript — no access to prior summaries. The system prompt then instructed Claude to default "Connections Made" to "No prior call history to reference." Jonathan's 4-18 summary mislabeled the call as "first or second contact" despite 5 prior documented calls.
- Extended signature: `summarizeTranscript(transcript, memberName, callDate, priorSummaries)`. Webhook handler now fetches `db.getRecentCalls(phone, 5)` and injects them as a PRIOR CALL SUMMARIES block. System prompt updated to require the summarizer to ground Themes (NEW vs RECURRING) and Connections Made in those summaries.
- Server-side change — applies to Main and GyasiV2 identically.

### Admin API (separately pushed by Diishan; used extensively during this session)

- Bearer-token auth. Endpoints: `/admin/stats`, `/admin/members`, `/admin/member/:phone` (full profile + story + recent calls), `/admin/member/:phone/story`, `/admin/member/:phone/calls`, `/admin/member/:phone/transcript`, `/admin/logs` (in-memory buffer), `DELETE /admin/member/:phone` (wipes all 4 tables).
- Made debugging the SMS rollout dramatically faster — could pull live payloads, drafts, logs without Replit console access.

### SMS channel (SalesMessage) — full stack

**Integration:**
- SalesMessage phone `+1 510-824-8194`, number_id `258910`, team "Aria" (`239511`), org `45812`, underlying vendor Twilio.
- PAT authenticated via `Authorization: Bearer {PAT}`, stored on Replit as `SALESMESSAGE_PAT`.
- Inbound webhook registered at Settings → Integrations → Webhooks → `messages` events → POSTs to `/webhooks/salesmessage/inbound`.
- Inbound payload envelope: `{ event: "message.received", data: { message: {...}, contact: {...} } }`. Key fields: `data.message.body`, `data.message.conversation_id`, `data.message.id`, `data.contact.number`.
- Outbound: `POST https://api.salesmessage.com/pub/v2.2/messages/{conversation_id}` with body `{ message: "text" }`. (First attempted `/conversations/{id}/send` from marketing docs → 404; corrected against help-center curl example.)

**Data model:**
- `sms_messages (id, phone, direction, status, body, sm_message_id UNIQUE, sm_conversation_id, session_id, created_at)` — no FK to members (SMS can arrive from unknown numbers). Idempotent on `sm_message_id` so duplicate webhook fires don't double-save.
- `sms_sessions (id, phone, started_at, ended_at, message_count, summary, created_at)`.
- Delete cascades added to `deleteMember`.

**Inbound handler:**
- Acks webhook immediately (prevents SalesMessage retries), processes async.
- Filters on `event === "message.received"`; ignores `message.sent` / `message.async.error`.
- On new session (no prior SMS from this phone in last 20 min): fires an **instant template greeting** (no Claude call) — mirrors how voice composes first_message via the convai-init webhook. Uses the same OPENERS pool.
- In parallel with the greeting, fires a **cache-priming Claude call** (1-token throwaway) so the system prompt is written to Anthropic's cache before the member replies. When turn 2 lands, the real Claude call hits the warm cache.
- On subsequent turns: persists inbound → loads merged context (member + story + merged voice/SMS timeline + last 20 SMS turns) → calls Claude with slim SMS prompt via role-alternating chat → persists draft → POSTs to SalesMessage. Updates draft row `status` to `sent`/`failed`.

**SMS prompt (`src/prompts/gyasi-sms.md`):**
- Slim variant of voice v2: drops v3 audio tags, drops voice-specific pacing cues (tone reading), tightens reply length to 1–3 sentences, strips markdown.
- Adds SMS-specific gold-standard exchanges (heavy disclosure, urge in progress, contradiction with documented story).
- Keeps identity, caller context shape, safety, framework, pacing modes, push-vs-presence.

**Session rollup worker:**
- `src/services/sms-rollup.js` runs every 5 min (configurable via `SMS_ROLLUP_INTERVAL_MINUTES`).
- Scans for phones whose latest un-rolled-up SMS is older than `SMS_SESSION_GAP_MINUTES` (default 20).
- For each stale session: summarizes the exchange (`summarizeSmsSession`), creates an `sms_sessions` row, attaches messages via `session_id`, and triggers `rewriteStory` using the merged voice/SMS timeline.
- Manual trigger available via `POST /admin/sms/rollup?gapMinutes=0` for testing.

**Unified memory:**
- `db.getMergedMemoryTimeline(phone, limit)` returns voice `call_summaries` + SMS `sms_sessions.summary` merged and sorted by date.
- `rewriteStory` accepts an optional `label` per summary entry (`"Call (date)"` vs `"SMS Session (date)"`) so the rewriter doesn't mis-number voice calls when SMS sessions are interleaved.
- Story absorbs SMS exchanges the same way it absorbs voice calls. One narrative. No channel split.

**Prompt caching:**
- `callClaudeChat` sends system as `[{ type: 'text', text: ..., cache_control: { type: 'ephemeral' } }]`. 5-min TTL.
- First real Claude call in a session pays cache-write tax (~8s). Cache prime at turn-1 pre-pays this in the background.
- Turns 2+ within 5 min read from cache (~5-10x faster for the prefill).

### Admin SMS endpoints

- `GET /admin/member/:phone/sms?limit=N` — recent messages + rolled-up sessions.
- `POST /admin/sms/rollup?gapMinutes=N` — manually trigger rollup (pass 0 to force immediately).

## Commits

| SHA | Description |
|---|---|
| `0f53d0a` | Add GyasiV2 prompt tuning for natural conversation (v2 prompt + push script) |
| `d71562f` | Inject prior call summaries into summarizeTranscript (fixes "no connections" bug across all branches) |
| `3ae74f4` | Add SalesMessage inbound diagnostic endpoint + slim SMS prompt |
| `518e78a` | Wire SMS conversation channel with session-based memory |
| `6c2fb73` | Wire SalesMessage outbound send for SMS replies |
| `39554a3` | Fix SalesMessage outbound endpoint path and body field |
| `db051f8` | Instant greeting on new SMS session + prompt caching on turn 2+ |
| `c95322d` | Prime Claude cache during turn-1 greeting |

## Current state

**Working:**
- GyasiV2 prompt live on ElevenLabs branch (0% traffic pending first live call).
- Summary pipeline now receives prior summaries; Connections Made section will populate on the next post-call pipeline run.
- SMS channel end-to-end live: inbound → context injection (full story + merged timeline) → Claude reply → outbound SalesMessage send.
- Verified on a 7-turn live thread (Jonathan test persona): first turn ~1–4s (instant greeting), turn 2 ~6s (cache hit after prime), turns 3+ ~4–8s.
- Cache prime confirmed working: `Cache primed for +13057424812 in 1599ms` appears in logs on new sessions.
- Session rollup worker running (every 5 min) — verified start log; full rollup-then-rewrite path not yet exercised with a 20-min gap.

**Quality read on the live thread:** Gyasi's SMS replies were in spec — one question per turn, short, reflective, no markdown, no "Great question!" tells. Example: *"Yeah, you do. And you also didn't use yesterday. Both things are true."* / *"What's your gut telling you?"* The delivery discipline from the slim SMS prompt is landing.

## What needs work next

### Priority 1 — Crisis-aware opening (both voice v2 and SMS)

The current opening logic ("after your opener, LISTEN; let the caller choose where to start") is correct for stable check-ins but dangerous when the documented story shows acute crisis in the last 72h. Gyasi accepted Jonathan's "clean since yesterday" framing on 4-18 despite a DV incident 24h earlier. Fix is a PRE-CALL / PRE-SMS READ section: if the story flags acute crisis (violence toward self or others, active substance crisis, suicidal ideation within N hours, "Where He Is Right Now" describing an acute state), enter in SAFETY-FIRST mode and override "let them lead." Safety-first open is specific and grounded: *"Where are you right now? Did you sleep somewhere safe? Have you heard from [named person]?"*

Patch applies to both `gyasi-system.v2.md` (voice) and `gyasi-sms.md` (SMS).

### Priority 2 — Violence-toward-others in SAFETY + handoff logic

Current SAFETY sections cover suicidal ideation / self-harm only. Need:
- Explicit guidance for violence toward another person: don't moralize, don't treat as a relapse, check the other person's safety, don't offer absolution, raise external support.
- Handoff / container-fit logic: when substance use is at clinical thresholds (e.g., 2g cocaine/day) or DV has occurred, Gyasi should acknowledge the limits of coaching and suggest parallel support (DV-informed services, substance treatment, therapy). "I want to keep working with you. And I also want to be honest — what's happening with [X] is serious. I don't want to be the only person in your corner. Have you talked to anyone about getting more support?" Framing as care, not rejection.

### Priority 3 — First live call on GyasiV2

Prompt is pushed, branch is on 0% traffic. Shift traffic in the ElevenLabs dashboard, make test calls across modes (stable, urge-in-progress, post-relapse, crisis), and evaluate whether the new delivery mechanics (one-question-per-turn, reflection-first, silence, audio tags) actually land in voice the way they landed in SMS.

### Priority 4 — SMS session rollup live verification

Worker is scheduled; full path (inactive >20 min → summarize → session row → story rewrite) hasn't been exercised with real data yet. Either let the next test thread sit for 20 min, or force-trigger via `POST /admin/sms/rollup?gapMinutes=0` after a fresh SMS exchange. Confirm:
- Session appears in `sms_sessions`
- `sms_messages.session_id` populated
- Story rewrite incorporates the SMS session as "SMS Session (date)"
- Merged timeline reflects it on the next turn

### Lower priority / known issues

- **HTML entity decoding on SMS inbound.** SalesMessage encodes apostrophes (`I&#039;m`). Claude handles it gracefully but it's grit in the pipeline. Two-line fix on `msg.body` before persisting and before passing to Claude.
- **Parallelize DB write + SalesMessage send.** Currently sequential; shaves ~500ms per turn.
- **Story truncation for SMS.** Full 17K-char story injected every SMS turn. Could trim to "Who He Is" + "Where He Is Right Now" + "Next Call Guidance" for SMS context. Faster cache reads, cheaper tokens.
- **SalesMessage message deletion via API.** Not exposed publicly (only UI archive). Email support@salesmessage.com if bulk cleanup becomes necessary. For our side, `DELETE /admin/member/:phone` wipes SMS rows; could add `/admin/member/:phone/sms` narrower delete.
- **HMAC signature verification** on both `/webhooks/conversation-end` (ElevenLabs) and `/webhooks/salesmessage/inbound`. Both running unsigned. Lower risk on Replit deployments but worth adding before any real user traffic.
- **Signup form `trim()`.** "Jonathan " still has trailing space (carried over from 4-16 list).
- **Rotate API keys** shared during debugging (ElevenLabs x2, Twilio, SalesMessage PAT, webhook bearer secrets) before onboarding real members.
- **SMS memory stress tests.** The voice stress-test list from 4-16 (long-tail recall, contradiction handling, gradual theme drift, name collisions) applies equally to SMS threads — consider extending tests to cover cross-channel memory coherence.
- **Model cost tracking.** No observability on Claude spend yet. As SMS threads grow, spend per member will too — worth adding a simple daily cost report tied to conversation_id / member.
