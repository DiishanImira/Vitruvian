# Narrative Memory for AI Coaching Agents
### A New Architecture for Persistent, Human-Centered Conversational AI

**Authors:** Diishan Imira, DiiClaw  
**Date:** March 2026  
**Application:** Vitruvian Man — AI-Powered Recovery Coaching

---

## Abstract

Current AI voice agents are stateless. Every call starts from zero. This makes them useful for transactions — booking appointments, answering FAQs, routing calls — but fundamentally inadequate for relationships that depend on continuity: coaching, therapy, mentorship, ongoing support.

This paper describes a memory architecture designed for **Vitruvian Man**, an AI coaching system for men recovering from porn addiction. The system uses a cloned voice of a real therapist (Gyasi Hantman) and maintains a persistent narrative about each member — not just facts, but patterns, insights, and evolving coaching guidance — that rewrites itself after every conversation.

The key insight: **the most effective memory format for an AI coach is the same format a human coach uses — a narrative understanding of who someone is, where they've been, and what they need next.**

---

## 1. The Problem with Stateless Voice Agents

The voice AI industry has solved speech. ElevenLabs, Vapi, Bland, Retell — all produce natural-sounding conversational agents. The unsolved problem is **continuity**.

A member calls on Day 3, ashamed, having just told his wife. He calls again on Day 14, cautiously proud of his streak. He calls on Day 18, having relapsed after his longest run. 

A stateless agent treats each of these as a new conversation with a stranger. A coach treats them as chapters in a story they're helping to write.

The gap between these two experiences is the gap between a useful tool and a transformative relationship.

### What Existing Memory Systems Offer

| Approach | How It Works | Limitation |
|----------|-------------|------------|
| **Key-value memory** | Store facts: `name=Marcus`, `days_clean=14` | No context, no patterns, no emotional understanding |
| **Conversation buffer** | Pass entire chat history in the prompt | Token limits, no synthesis, raw data instead of insight |
| **Summary memory** | Compress conversation history into a running summary | Flat — loses nuance, doesn't surface patterns |
| **Vector database retrieval** | Embed past conversations, retrieve by semantic similarity | Good for "what did we discuss?" — bad for "what does this person need?" |
| **Knowledge graphs** | Structured entity-relationship networks | Technically powerful, but the output reads like a database, not an understanding |

None of these produce what a human coach has after six sessions with a client: a **mental model** — a story about who this person is, what drives them, where they get stuck, and what approach works best with them.

---

## 2. Narrative Memory: The Architecture

### Core Concept

Instead of storing facts about a member, we store a **story** about them — a living document that an AI reads before every call and rewrites after every call, incorporating new information, surfacing patterns, and updating coaching guidance.

This is directly inspired by how human coaches maintain continuity. A therapist doesn't consult a database between sessions. They review their notes, recall the arc of treatment, and enter the session with an understanding of where this person is in their journey. Our system makes that process explicit and persistent.

### Three Layers

```
Layer 1: Index (members.json)
  What: Structured lookup — phone number → name, tier, call count, status
  Purpose: "Who is calling?" (instant, <1ms)
  Analogy: A receptionist's contact list

Layer 2: Member Story (stories/+1XXXXXXXXXX.md)
  What: AI-written narrative with patterns, insights, and coaching guidance
  Purpose: "What does the coach need to know for THIS call?"
  Analogy: A therapist's case notes — but synthesized into understanding

Layer 3: Call Archive (calls/*.json)
  What: Raw transcripts + AI-generated summaries, one per call
  Purpose: Source material for story rewrites; chronological record
  Analogy: Session recordings in a filing cabinet
```

The agent reads Layers 1 and 2 at the start of every call. Layer 3 is source material — it feeds the rewrite process but isn't read by the agent directly.

### The Story Format

Each member's story is a Markdown file with structured YAML frontmatter and free-form narrative. The frontmatter enables future machine processing (filtering, analytics, vector database ingestion). The narrative enables the AI to understand the person.

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
tags: [late-night-trigger, work-stress, shame-spiral, wife-discovered,
      relapse-after-streak, emotional-void, physical-movement-works]
---

# Marcus — The Story So Far

Marcus is 37, married, two kids. Wife found his browser history 
in January — that's what brought him here...

## Patterns
- Late-night vulnerability: 3 of 4 calls after 10pm...
- Stress → isolation → urge cycle...

## What's Working
- He keeps calling. 4 calls in 18 days — engaged...

## What's Not
- No nighttime routine despite clear trigger window...

## Next Call Guidance
Lead with normalizing the relapse. Push the "Compounding Machine" 
frame. Probe the nighttime routine gap...
```

The "Next Call Guidance" section is what makes this more than memory — it's **coaching intelligence**. The system doesn't just remember Marcus; it has an opinion about what Marcus needs next, informed by everything that came before.

---

## 3. The Rewrite Process

### When a New Member Signs Up

A web-based intake form collects eight questions:

1. What brought you here?
2. How long have you been struggling with this?
3. Are you currently in a relationship?
4. Does your partner know?
5. Have you tried to quit before?
6. When do urges hit hardest?
7. How ready are you to make a change? (1-10)
8. Anything else you want your coach to know?

These answers are sent to Claude, which generates the **initial Member Story** — a narrative that humanizes the intake data and provides first-call coaching guidance. When the member calls for the first time, the agent already knows their name, their situation, and how to approach them.

### After Every Call

The post-call pipeline runs automatically:

```
Call ends
  → Save transcript to call archive
  → Claude generates a 3-4 sentence summary
  → Claude rewrites the full Member Story using:
      - Previous story (preserves insights that still hold)
      - ALL call summaries (chronological — the full timeline)
      - Mid-call notes (observations the agent captured during the call)
      - Member profile data
  → New story overwrites the old one
  → Index updated (call count, last call, status)
```

The rewrite is a **full rewrite**, not an append. This is a deliberate design choice. Appending turns the story into another chronological log — we already have that in the call archive. The story's value is synthesis: a pattern that was "emerging" after Call 2 may be "confirmed" by Call 4. The language and emphasis should evolve as understanding deepens.

### The Rewrite Prompt

The Claude prompt that drives the rewrite asks for specific outputs:

- **Patterns**: Behaviors that keep showing up across calls. Not just what the member says, but what the data reveals — timing patterns, emotional cycles, trigger sequences.
- **What's Working**: Positive signals the next call should reinforce.
- **What's Not**: Gaps, stalls, avoidance patterns, risk factors.
- **Next Call Guidance**: Specific coaching direction, referencing course concepts (Compounding Machine, Depletive vs Accretive Inputs) where the member is developmentally ready for them.

The prompt instructs Claude to write as narrative, not as a report. The AI coach reads this file as prose — clinical bullet points produce clinical conversations. Human-sounding notes produce human-sounding coaching.

---

## 4. Why Files, Not a Database

A natural instinct is to store member memory in PostgreSQL — structured tables for profiles, calls, memory keys. We chose flat files instead.

**Practical reasons:**
- Zero infrastructure. No database server, no ORM, no migrations. Deploy anywhere.
- Human-readable. `cat stories/+13055551234.md` gives you instant understanding. No SQL queries needed to debug or review.
- Git-trackable. Every story change is version-controlled. Free audit trail.
- The AI reads and writes prose. A `.md` file is the native format for narrative memory. A TEXT column in a database is an indirection with no benefit.

**Scaling math:**
- A JSON index handles 10,000 members at sub-millisecond read times.
- SQLite (still a single file, zero infrastructure) handles 1 million members.
- Story files are individually addressed by phone number — filesystem lookup is O(1).
- The only scaling bottleneck is concurrent writes to the index file, which becomes relevant around 10,000+ users. At that point, swap JSON for SQLite. The stories don't change.

**What a database would add:**
- Cross-user queries ("show me all members who relapsed after 14+ days")
- Structured analytics dashboards
- ACID transaction safety for concurrent writes

These are valuable at scale. They're unnecessary for the first 10,000 members, and the YAML frontmatter on every story file means the data is pre-structured for a vector database when cross-user analysis becomes worthwhile.

---

## 5. The Intelligence Ladder

The architecture is designed to gain capability over time without restructuring:

### Level 1: Individual Memory (Launch)
Each member has a story. The agent reads it. Calls feel personal.

### Level 2: Coaching Playbook (Months 2-3)
Manual review of member stories reveals patterns. A `coaching-playbook.md` file captures system-level insights: "Members who relapse after 14+ days usually lack a nighttime routine." The agent reads this alongside individual stories. Every member benefits from accumulated wisdom.

### Level 3: Collective Intelligence (500+ members)
Add a vector database layer. Ingest all stories (frontmatter for filtering, prose for semantic search). Run cross-user queries automatically:

- "What do members who maintain 60+ day streaks have in common?"
- "Which coaching approaches correlate with longer streaks?"
- "Members stuck on Module 1 for 3+ weeks — what patterns emerge?"

Feed findings into the coaching playbook. The system learns from its entire population.

### Level 4: Adaptive Coaching (1000+ members)
The system identifies which coaching approaches work for which member archetypes and automatically adjusts. A member who responds to direct challenges gets a different coaching style than one who responds to gentle encouragement — informed by outcome data from hundreds of similar members.

Each level builds on the one before. No architecture changes required — only the addition of new data processing layers on top of the same file-based memory.

---

## 6. Relationship to Existing Research

This architecture aligns with several emerging research directions, while making different implementation choices:

**Amory (January 2026)** — An agentic working memory framework published on arXiv ([arxiv.org/abs/2601.06282](https://arxiv.org/abs/2601.06282)) that binds conversational fragments into episodic narratives and consolidates them into coherent plots. Evaluated on the LOCOMO benchmark, Amory achieved performance comparable to full-context reasoning while reducing response time by 50%. Our approach is similar in concept (fragments → narrative) but uses a simpler mechanism (Claude rewrite) instead of a specialized memory framework.

**Narrative Memory-based Intelligent Agents (2025-2026)** — A framework published in The Asian Bulletin of Big Data Management ([researchgate.net/publication/390152592](https://www.researchgate.net/publication/390152592_Narrative_Memory_based_Intelligent_Agents)) proposing that agents using story-based representation of past experiences outperform traditional approaches in tasks requiring long-term context retention and causal reasoning. While published in a smaller journal, the findings align with our core hypothesis: narrative outperforms structured data for relationship-dependent AI tasks.

**Google Memory Bank (July 2025)** — Google's on-demand long-term memory solution for AI agents, integrated with Google ADK. More structured and factual than narrative-based, but represents major industry investment in persistent agent memory.

The broader trend is clear: the research community is converging on narrative and episodic memory as superior to key-value or vector-only approaches for long-horizon agent tasks. The primary difference between our approach and the research frontier is infrastructure complexity. Academic implementations typically use knowledge graphs, vector stores, and multi-component memory pipelines. We use Markdown files and a Claude API call. The outputs are comparable; the operational simplicity is not.

---

## 7. Application: Vitruvian Man

### The Product

Vitruvian Man is a recovery program for men struggling with porn addiction, created by Gyasi Bramos Hantman (licensed social worker, certified Core Energetics practitioner) and Diishan Imira. The program includes a 7-module course covering the neuroscience of addiction, trigger management, identity reconstruction, and sustainable recovery.

### The AI Coach

The AI agent uses Gyasi's cloned voice (ElevenLabs Professional Voice Cloning) and is built on ElevenLabs Conversational AI with Claude as the language model. The agent has access to the complete Vitruvian Man curriculum as a knowledge base.

**What makes narrative memory critical for this application:**

1. **Shame sensitivity.** Making someone repeat their story is re-traumatizing. The agent must remember.

2. **Pattern recognition.** A member may not see that all three relapses happened late at night after work stress. The narrative surfaces this.

3. **Therapeutic pacing.** A member who says "I feel empty, not just horny" is arriving at a Module 3 insight organically. The story notes this, and the coaching guidance suggests introducing that framework. Timing matters — pushing too early feels clinical, too late feels irrelevant.

4. **Continuity of care.** The value of a coach compounds over time. Each call builds on the last. Without memory, each call is an intake session. With memory, each call is a chapter.

### The Target

Men aged 30-50, married or in a relationship, earning $60K-$150K, whose porn consumption is threatening their family or career. The positioning: "Your therapist's voice, available at 2am." The price: $997 one-time (vs. $800/month for traditional therapy).

At 2am, when the urge hits or the shame spiral starts, a human therapist is asleep. This system picks up the phone and already knows your name, your triggers, your streak, and what worked last time.

---

## 8. Beyond Recovery: General Applicability

While built for addiction recovery coaching, the narrative memory architecture is domain-agnostic. Any AI application where **continuity of relationship drives value** can use this pattern:

- **Sales coaching** — track selling style, celebrate wins, identify growth blockers (our Mayvenn ambassador application uses the same architecture)
- **Health coaching** — remember symptoms, medication responses, lifestyle patterns across visits
- **Executive coaching** — track goals, decisions, leadership patterns, career trajectory
- **Education** — remember what a student struggles with, their learning style, their progress
- **Elder care** — maintain continuity of conversation for patients with memory conditions
- **Customer success** — replace stateless support tickets with a continuous relationship

The pattern is the same in every case: intake seeds the story, conversations update it, a synthesis step extracts patterns and guidance, and the next conversation reads the result. The vocabulary changes. The architecture doesn't.

---

## 9. Conclusion

The current generation of AI voice agents can speak naturally. The next generation needs to **know** who it's speaking to — not as a database record, but as a person with a story that's still being written.

Narrative memory is the bridge. Not because it's technically novel — the components are simple (files, an LLM, a rewrite prompt). But because it reframes the problem. The question isn't "what facts should the AI remember?" It's "what understanding should the AI carry into the next conversation?"

The answer, it turns out, is a story.

---

*For technical implementation details, see the [Vitruvian Man PRD](../PRD.md) and the source code at [github.com/DiishanImira/Vitruvian](https://github.com/DiishanImira/Vitruvian).*
