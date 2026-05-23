---
name: voice-prod-sync
description: Daily sync of Corey's Mayvenn/ambassadors production repo into Voice_Onboarding strategy docs, mapped against the 7-phase First50 activation funnel.
---

Sync the Mayvenn/ambassadors GitHub production repo into the Voice_Onboarding strategy repo. This is a daily automated sync that reads Corey's development activity and produces a structured status report.

## What To Do

### Step 1: Pull GitHub Data

Use `gh` CLI (already authenticated) to pull from `Mayvenn/ambassadors`:

```bash
# Recent commits on main (last 14 days)
gh api repos/Mayvenn/ambassadors/commits \
  --jq '.[] | {sha: .sha[0:7], date: .commit.author.date, message: .commit.message, author: .commit.author.name}' \
  -X GET -F since="$(date -v-14d -u +%Y-%m-%dT%H:%M:%SZ)" \
  --paginate

# PRs merged in last 30 days
gh pr list --repo Mayvenn/ambassadors --state merged --limit 50 \
  --json number,title,body,mergedAt,files,labels,author

# Open PRs
gh pr list --repo Mayvenn/ambassadors --state open --limit 20 \
  --json number,title,body,labels,author,createdAt

# Open issues
gh issue list --repo Mayvenn/ambassadors --state open --limit 50 \
  --json number,title,body,labels,assignees,createdAt

# Recently closed issues (14 days)
gh issue list --repo Mayvenn/ambassadors --state closed --limit 30 \
  --json number,title,body,labels,closedAt
```

If the repo is not accessible, stop and log the error. Do not generate a report.

### Step 1b: Pull Context Directory (Specs, Strategies, Tracks)

The `context/` directory contains specs, strategies, and planning docs that define what's planned vs what's shipped. Pull these key files to enrich the phase mapping:

```bash
# Onboarding call spec (Phase 1 + 2)
gh api repos/Mayvenn/ambassadors/contents/context/specs/onboarding-calls.md --jq '.content' | base64 -d

# Lead timing and acquisition (Phase 1)
gh api repos/Mayvenn/ambassadors/contents/context/specs/lead-timing.md --jq '.content' | base64 -d

# Consent system (Phase 5 opt-in)
gh api repos/Mayvenn/ambassadors/contents/context/specs/consent-system.md --jq '.content' | base64 -d

# Twilio overview — current infra state
gh api repos/Mayvenn/ambassadors/contents/context/specs/twilio/overview.md --jq '.content' | base64 -d

# AI SMS interface strategy (Phases 1, 3, 5, 6, 7)
gh api repos/Mayvenn/ambassadors/contents/context/specs/twilio/strategy.ai-sms-interface.md --jq '.content' | base64 -d

# Three-way MMS strategy (Phase 5)
gh api repos/Mayvenn/ambassadors/contents/context/specs/twilio/strategy.three-way-mms.md --jq '.content' | base64 -d

# Consent flows strategy (Phase 5 opt-in)
gh api repos/Mayvenn/ambassadors/contents/context/specs/twilio/strategy.consent-flows.md --jq '.content' | base64 -d

# Twilio account status
gh api repos/Mayvenn/ambassadors/contents/context/specs/twilio/status.account.md --jq '.content' | base64 -d

# Onboarding area KPIs
gh api repos/Mayvenn/ambassadors/contents/context/areas/onboarding/kpis.md --jq '.content' | base64 -d

# Strategic tracks relevant to voice onboarding
gh api repos/Mayvenn/ambassadors/contents/context/tracks/006-onboarding-acquisition.md --jq '.content' | base64 -d
gh api repos/Mayvenn/ambassadors/contents/context/tracks/007-distribution-activation.md --jq '.content' | base64 -d
```

Also check for any new or changed files in `context/specs/` and `context/specs/twilio/` since the last sync:
```bash
# List all specs to detect new files
gh api repos/Mayvenn/ambassadors/contents/context/specs --jq '.[].name'
gh api repos/Mayvenn/ambassadors/contents/context/specs/twilio --jq '.[].name'
```

Use the context docs to:
- Distinguish **Planned** (spec exists but no PR/code) from **In Progress** (PR open or code committed) from **Built** (merged and deployed)
- Identify blockers called out in specs (e.g., toll-free verification rejected, no 10DLC campaign registered)
- Surface infrastructure prerequisites that specs depend on (e.g., Conversations API, Messaging Service, local number config)

### Step 2: Determine What's New

Check for the most recent file in `~/Library/Mobile Documents/com~apple~CloudDocs/workcloud/Voice_Onboarding/docs/sync-logs/` to find the last sync date. Everything after that date is "new." If no prior sync exists, treat the last 30 days as the initial window.

### Step 3: Map Against 7-Phase Funnel

Categorize every PR, issue, and commit against these phases from the First50 Video Activation Strategy:

| Phase | What to Look For (Code/PRs) | Context Docs to Cross-Reference |
|-------|------------------------------|--------------------------------|
| Phase 1: Lead Capture + First Contact | Registration webhook, pre-call SMS, outbound call trigger, inbound call handling, voicemail detection | `specs/onboarding-calls.md` (call sequence), `specs/lead-timing.md` (lead demographics + timing) |
| Phase 2: Onboarding Call | System prompt changes, ElevenLabs agent config, call flow logic, voice selection | `specs/onboarding-calls.md` (vendor snapshotting: ElevenLabs) |
| Phase 3: Post-Call SMS + Assets | Asset delivery SMS, one-tap share link, video hosting, post-call triggers | `specs/onboarding-calls.md` (direct share link section) |
| Phase 4: Ambassador Posts Video | Post-back tracking, link detection, engagement monitoring | `tracks/007-distribution-activation.md` |
| Phase 5: DMs → Leads → 3-Way Threads | Group thread SMS handling, Mya-as-closer behavior, opt-in detection, product recommendation logic | `specs/twilio/strategy.three-way-mms.md`, `specs/consent-system.md`, `specs/twilio/strategy.consent-flows.md` |
| Phase 6: Mya Closes + Ongoing Thread | Coupon delivery, sales closing flow, follow-up drip within threads, reorder reminders | `specs/twilio/strategy.ai-sms-interface.md` |
| Phase 7: Post-Call Drip | Timed follow-up sequences, ambassador profile building, drip scheduling | `specs/twilio/strategy.ai-sms-interface.md` |
| Infrastructure | Database, auth, deployment, monitoring, error handling, Twilio config, Salesmsg, Shopify | `specs/twilio/overview.md`, `specs/twilio/status.account.md`, `specs/twilio/reference.10dlc-campaigns.md` |

**Status definitions — use all four levels:**
- **Built** — Code merged and deployed. Feature is live or ready to go live.
- **In Progress** — Open PR or active commits. Code exists but isn't merged yet.
- **Planned** — Spec or strategy doc exists in `context/` but no corresponding PR or code yet.
- **Not Started** — No spec and no code. The phase has no visible work.

### Step 4: Write Two Files

**File 1: `~/Library/Mobile Documents/com~apple~CloudDocs/workcloud/Voice_Onboarding/docs/production-status.md`** (overwrite each time)

Use this structure:
```
# Voice Onboarding — Production Build Status
> Last synced: YYYY-MM-DD HH:MM UTC
> Source: Mayvenn/ambassadors

## Funnel Coverage
| Phase | Status | Key PRs/Issues | Context Docs |
(Built / In Progress / Planned / Not Started for each phase — include which context doc informed the status)

## Infrastructure Status
### Twilio / SMS
(Current state from specs/twilio/status.account.md — what's configured, what's blocking)
### Salesmsg
(Sync worker status, API integration health)
### Shopify
(Discount code mechanism, app function status)
### ElevenLabs / Voice
(Agent config status, voice selection)

## What's New Since Last Sync
### Merged PRs
### Open PRs (In Progress)
### Issues (Open + Recently Closed)

## Recent Commits (not in PRs)

## Detected Components
### New Endpoints
### New Environment Variables
### Database Changes

## Blockers / Open Questions
```

**File 2: `~/Library/Mobile Documents/com~apple~CloudDocs/workcloud/Voice_Onboarding/docs/sync-logs/YYYY-MM-DD.md`** (new dated file, never overwrite)

Same content as production-status.md but archived as a dated snapshot.

### Step 5: Summary

If there are meaningful changes (new merged PRs, status changes in funnel coverage), output a brief summary. If nothing changed since last sync, just note "No new activity" and update the timestamp.