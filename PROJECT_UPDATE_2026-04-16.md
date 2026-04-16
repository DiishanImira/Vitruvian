# Project Update — 2026-04-16

## Session scope

Resolved the call-connection issue (dead-air on inbound), built out the full pre-call + post-call memory pipeline to match the narrative-memory architecture in PRD, and verified the memory loop end-to-end with four test calls against a fresh member (Jonathan).

## What got built

### Pre-call personalization
- ElevenLabs fires `POST /webhooks/convai-init` before each inbound call. Replit server composes a personalized first_message ("Hey {first_name}, {random_opener}") from a 10-opener pool for returning members, "Hey {first_name}, Jyasi here — glad you called" for first-time members, "Hey, this is Jyasi — who am I talking to?" for unknowns.
- Dynamic variables (`member_name`, `member_story`, `days_sober`, `total_calls`, `tier`, `caller_status`, `recent_calls`) populate the system prompt's CALLER CONTEXT block before Gyasi speaks turn-0.
- Workspace-level webhook URL configured in ElevenLabs workspace settings (bearer auth).
- Agent flags flipped: `overrides.conversation_config_override.agent.first_message: true` and `overrides.enable_conversation_initiation_client_data_from_webhook: true`.

### Post-call pipeline
- Transcript now correctly formatted as "Gyasi: ... / Member: ..." dialogue (was previously `[object Object]` garbage).
- Summary generation produces 5-6K-char structured output: themes (NEW/RECURRING), verbatim quotes, connections, open questions with timing, explicit directives for story rewrite.
- Story rewrite produces 15-19K-char clinical narrative: Who He Is, Where He Is Right Now, Works/Doesn't Work, Meaningful Themes (with call attribution), Key Facts, Open Questions (with rationale + approach), Next Call Guidance (actionable roadmap).
- Story rewrite input simplified to: previous story + last 3 summaries + mid-call notes (was 50 summaries; story itself is the long-term memory).
- Idempotency guard on conversation-end webhook to protect against duplicate ElevenLabs fires (in-memory Set + DB check).

### Notes persistence
- `call_notes` table added; `saveNote` dual-writes to filesystem (transient scratchpad for rewrite) and DB (permanent audit trail).
- `GET /debug/notes/:phone` endpoint for inspection.

### Tool fixes
- `send_sms` auto-fills `phone_number` from `system__caller_id` (was broken, silently sending with empty phone).
- `get_member_context` description updated — was "CALL THIS AT THE VERY START OF EVERY CONVERSATION" (stale now that context loads via init webhook).

### Token budget
- Summary `max_tokens` 1500 → 8000, story `max_tokens` 2000 → 16000. Output now runs to natural length without truncating Next Call Guidance.

### Story attribution accuracy
- Call summaries in rewrite prompt labeled with absolute call numbers (`totalCalls - i`) rather than array index, and `callCountNow` is fetched after saveCall so labels reflect the just-saved call.

## Commits

| SHA | Description |
|---|---|
| `2ea5f28` | Pre-call init webhook for personalized greetings |
| `d3962aa` | Fix post-call webhook payload parsing (data wrapper) |
| `1cd8fe6` | Format transcript array into readable dialogue |
| `e098b37` | Lift token caps; persist notes to DB; add debug endpoint |
| `80cd33a` | Idempotency guard on conversation-end webhook |
| `10815de` | Narrow story rewrite to last 3 summaries |
| `2dd4ca4` | Use actual call numbers in story labels |

## ElevenLabs-side changes

- Gyasi agent (`agent_3601kk02sk5cfq583ned6q34k6s2`) prompt rewritten with `{{dynamic_variable}}` placeholders, `dynamic_variable_placeholders` set for unknown-caller defaults.
- Post-call webhook registered in workspace (`webhook_id: b59eb9e375834c4eae7740a4646fd7dc`) with HMAC auth (handler does NOT yet verify signature).
- `get_member_context` tool description updated.
- `send_sms` tool schema fixed to auto-fill phone_number.

## Current state

**Working:**
- End-to-end memory loop verified across 4 real calls
- Call 4's story correctly carried forward Susan, Billy, tennis, execution collapse; added premeditated coping, humor as release valve, post-work trigger window, "I feel control today" moment, 10-min workout follow-up question
- Stories absorb summary directives cleanly (summary's "For the Story Rewrite" section lands as new Meaningful Themes in story)
- Scalability solved for long-tenure members (rewrite input stays ~constant regardless of call count)

**Notes observation:** Under current prompt, `save_note` and `log_mood` fire sparsely (1 tool call on call 1, 0 on calls 2-4). Summary now does the interpretive work previously hoped from notes. User accepted this — notes will remain as optional supplement, not primary memory.

## What needs work next

### Priority 1 — System prompt: Gyasi's voice, pacing, questioning

Core memory infrastructure is working. Next focus is tuning how Gyasi actually coaches within a call — currently the prompt gives approach guidance but is soft on delivery mechanics.

Specific areas worth tightening:

- **One-question-per-turn discipline.** Mya's prompt enforces this aggressively ("Ask ONE question at a time. Then stop talking. Wait. Do not ask two questions in the same turn. Ever."). Gyasi's prompt has "Short responses are fine. Don't monologue." — weaker. Recovery coaching needs more space than onboarding; push harder on this than Mya does.
- **Pacing for crisis vs. stable calls.** Call 3 (crisis, friend's apartment) and call 4 (interrupt, premeditated) needed different paces. The prompt doesn't differentiate — Gyasi reads it correctly emergently, but explicit guidance would be more reliable.
- **When to push vs. when to stay in presence.** "Wanting connection, not action" was the correct read on call 3. Needs to be in the prompt explicitly.
- **Natural transitions between topics.** Mya uses phrases like "And here's the other thing..." / "Oh and get this..." / "Now what's really cool is..." to make delivery feel unfolding rather than scripted. Gyasi should have his own, darker register of these.
- **Expressive mode audio tags.** v3 is now active. Automatic interpretation is good, but strategic tags (`[pause]`, `[calm]`, `[quiet]`) for safety moments and heavy disclosures would add precision.
- **Question patterns.** Open-ended vs. specific. Mya has explicit prompts for discovery; Gyasi's coaching context is different but similarly benefits from a menu of question types by scenario.

### Priority 2 — Memory system stress tests

Memory is working at 4 calls. Need to validate it holds up under adversarial conditions.

Proposed tests:

- **Long-tail theme persistence.** Name a specific detail in call 1 (e.g., "my grandfather used to bring me to the park on Saturdays"). Don't mention it again for 20 calls. Then in call 22, bring it up casually. Does Gyasi's `search_call_history` surface it, or does it die in the archive?

- **Contradiction handling.** In call 5, disclose something that contradicts call 3's story (e.g., "Actually, Susan already knew — I lied about that before"). Does the rewrite handle the contradiction gracefully, or does the story carry both narratives incoherently?

- **Long silence gap.** Simulate a member who calls 3 times then disappears for 3 weeks. When they come back, does Gyasi correctly orient around "it's been a while" without either ignoring the gap or overdramatizing it?

- **Very short call (30-60s).** Member calls, says "I just used — gotta go" and hangs up. Does summary produce useful output or degrade? Does story absorb it without pollution?

- **Very long call (20+ min).** Does summary stay structured or collapse? Does transcript volume exceed practical token budget?

- **Rapid-fire same-day calls.** We tested 3-4 calls same day. Extend to 8-10. Does the story become incoherent from over-revision?

- **Two themes with overlapping names.** Member mentions their wife Sarah in call 1, then their work colleague Sarah in call 4. Does the system conflate them in Meaningful Themes?

- **Tool-call burst.** Manually trigger `save_note` 15 times in one call with varied content. Does the rewrite absorb cleanly or get distorted?

- **Emotional extremes.** Crisis moment (suicidal ideation), euphoric moment (announcement of breakthrough), flat moment (member goes silent for 2 minutes). How does v3 expressiveness handle each, and how does the summary capture them?

- **Caller-ID spoofing / shared phone.** Member hands phone to their partner. Can the system detect "this isn't Jonathan"? (Edge case — probably graceful failure acceptable.)

- **Gradual theme drift.** Pick a theme (e.g., "shame spiral post-relapse"). Check its description in the story at call 3, 5, 10, 15. Does Claude keep it consistent, or does it drift into a different concept?

- **Name drift.** Gyasi occasionally mis-attributes calls (Call 1 vs Call 2). Check whether at call 20+ this compounds or self-corrects.

### Lower priority / deferred

- **HMAC verification** on `/webhooks/conversation-end`. Currently the webhook is registered with HMAC but the handler doesn't verify signature — anyone with the URL could forge a transcript. Worth adding before real members.
- **Rotate API keys** shared during debugging (ElevenLabs × 2, Twilio auth token, webhook bearer secret).
- **Signup form trim()** — "Jonathan " was saved with trailing space.
- **Duplicate webhook root cause.** Logs still show doubled "Generating summary" lines even with idempotency guard in place. Unclear whether this is Replit's log-viewer display artifact or actual duplicate processing that the guard is catching silently. Could be verified by counting Claude API calls per post-call webhook in ElevenLabs billing dashboard.
