# Multi-Agent Band / AI Ensemble - Implementation Plan [COMPLETE]

> **Historical document.** This captures the full design evolution from v1 to v2.
> For current architecture and configuration, see [README.md](./README.md) and [architecture.md](./architecture.md).
> Early sections describe the abandoned v1 orchestrator design (Haiku subagents); the v1→v2 evolution
> story begins at [Architecture Evolution](#architecture-evolution-orchestrator-v1--per-agent-persistent-processes-v2).

## Overview
Transform Buttery Smooth Jamming into an **autonomous AI jam session** where band members:
- React to each other's playing in real-time
- Share thoughts/reasoning alongside their code
- Have independent personalities (may disagree with the "boss"!)
- Continuously evolve their playing based on the musical context
- Share musical context (key, scale, tempo, chord progression) for **harmonic coherence**
- Degrade gracefully when agents fail or timeout

**Key Constraints:**
- All LLM inference via Claude Code/Claude Max only — no direct API calls.
- **All MCP tool calls made by the top-level orchestrator only.** Subagents communicate via text context in, JSON out. This restriction is **prompt-enforced** (agent prompts say "DO NOT attempt to call any tools"), not system-enforced — Claude Code agent types technically have "All tools" access, but subagents hallucinate MCP results without the MCP server connection (confirmed by GitHub issues #13898, #13605).
- **Subagents cannot spawn other subagents.** The orchestrator is the top-level Claude process, not a subagent. (Anthropic docs: "Subagents cannot spawn other subagents.")

## Architecture: In-Memory Jam State + Parallel Agents + Web-Based Jam Clock

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WEB-BASED JAM CLOCK (Browser)                    │
│  JamControls → setInterval(roundDuration)                          │
│  Sends "[JAM_TICK] Round N" to /api/claude-ws                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ user_input via WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              ORCHESTRATOR (Top-Level Claude Process)                 │
│  Persistent process at lib/claude-process.ts — maintains context    │
│                                                                      │
│  1. read_jam_state() via MCP                                        │
│  2. Construct text context per agent:                               │
│     (other agents' patterns + musical context + boss directives)    │
│  3. Spawn 4 Haiku subagents in parallel via Task tool               │
│     ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│     │ 🥁 BEAT  │ │ 🎸 GROOVE│ │ 🎹 ARIA  │ │ 🎛️ GLITCH│            │
│     │ (drums)  │ │ (bass)   │ │ (melody) │ │ (fx)     │            │
│     └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘            │
│          │            │            │            │                   │
│          ▼            ▼            ▼            ▼                   │
│     Text context in → JSON out. NO MCP tool calls.                 │
│     Returns: { pattern, thoughts, reaction, comply_with_boss }     │
│                                                                      │
│  4. Validate returned patterns (syntax check)                       │
│  5. update_agent_state() for each agent via MCP                     │
│  6. compose_and_play() via MCP (with fallbacks for failed agents)   │
│  7. Broadcast thoughts via send_message()                           │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           WEB APP                                    │
│  ┌────────────────┐  ┌────────────────────────────────────────────┐ │
│  │ Band Panel     │  │  Jam Chat (agent thoughts + boss input)    │ │
│  │ [🥁][🎸]       │  │  BEAT: "Adding syncopation to match ARIA" │ │
│  │ [🎹][🎛️]       │  │  GROOVE: "I disagree, keeping it simple"  │ │
│  │                │  │  BOSS: "More energy!"                      │ │
│  │ Mute/Solo      │  │  ARIA: "Fine, going up an octave..."      │ │
│  ├────────────────┤  └────────────────────────────────────────────┘ │
│  │ Musical Context│                                                 │
│  │ Key: C minor   │                                                 │
│  │ BPM: 120       │                                                 │
│  │ Energy: 7/10   │                                                 │
│  └────────────────┘                                                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Strudel Editor (combined stack() pattern)                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Jam State** | In-memory state in MCP server (not file-based). Contains each member's pattern, thoughts, musical context, and recent boss directives. Follows the existing `userMessages` pattern in `packages/mcp-server/src/index.ts`. |
| **Parallel Subagents** | Claude Code can run up to 10 subagents in parallel. Each band member is a Haiku subagent with unique personality. **Text context in, JSON out. Prompt-instructed not to call MCP tools** (agent types technically have "All tools" access, but restriction is enforced via prompt rules). |
| **Web-Based Jam Clock** | Browser-side `setInterval` sends periodic `[JAM_TICK]` messages to the persistent Claude process via `/api/claude-ws`. Replaces bash loop. |
| **Musical Context** | Shared key, scale, chord progression, BPM, time signature, and energy level. All agents must respect these constraints for harmonic coherence. |
| **Agent Autonomy** | Agents have strong personalities and may disagree with boss or each other. Prompts encode musical taste, stubbornness level, etc. Personality affects *thoughts and reactions*, not adherence to key/scale. |
| **Latency Budget** | ~3-16 sec per round. Current patterns continue playing while next round computes (execution decoupled from inference). |
| **Rate Management** | Haiku for subagents (lower cost/latency). 16s default round interval. Skip rounds when no boss directive and patterns unchanged for 2+ rounds. |

---

## Phase 1: In-Memory Jam State + MCP Tools [COMPLETE]

### Rationale
In-memory state in the MCP server eliminates file I/O, avoids race conditions with parallel writers, and follows the existing `userMessages` pattern already in `packages/mcp-server/src/index.ts`.

### Files to Create
- *None* — state lives in-memory in MCP server

### Files to Modify
- `packages/mcp-server/src/index.ts` — Add jam state management + MCP tools
- `lib/types.ts` — Add JamState, AgentState, MusicalContext types

### Jam State Schema
```typescript
// lib/types.ts

interface MusicalContext {
  key: string;                // e.g., "C minor"
  scale: string[];            // e.g., ["c", "d", "eb", "f", "g", "ab", "bb"]
  chordProgression: string[]; // e.g., ["Cm", "Ab", "Eb", "Bb"]
  bpm: number;
  timeSignature: string;      // e.g., "4/4"
  energy: number;             // 1-10
}

interface AgentState {
  name: string;
  emoji: string;
  pattern: string;
  fallbackPattern: string;    // Last known good pattern
  thoughts: string;
  reaction: string;
  lastUpdated: string;
  status: 'idle' | 'thinking' | 'error' | 'timeout';
}

interface JamState {
  sessionId: string;
  currentRound: number;
  musicalContext: MusicalContext;
  agents: Record<string, AgentState>;
}

interface JamChatMessage {
  id: string;
  type: 'agent_thought' | 'agent_reaction' | 'boss_directive' | 'system';
  agent?: string;          // 'drums' | 'bass' | 'melody' | 'fx'
  agentName?: string;      // 'BEAT' | 'GROOVE' | 'ARIA' | 'GLITCH'
  emoji?: string;
  text: string;
  pattern?: string;        // optional code snippet
  compliedWithBoss?: boolean;
  round: number;
  timestamp: Date;
}
```

### Initial Jam State
```typescript
// In-memory in packages/mcp-server/src/index.ts (not a file)
const jamState: JamState = {
  sessionId: "jam-001",
  currentRound: 0,
  musicalContext: {
    key: "C minor",
    scale: ["c", "d", "eb", "f", "g", "ab", "bb"],
    chordProgression: ["Cm", "Ab", "Eb", "Bb"],
    bpm: 120,
    timeSignature: "4/4",
    energy: 5
  },
  agents: {
    drums: { name: "BEAT", emoji: "🥁", pattern: "", fallbackPattern: "", thoughts: "", reaction: "", status: "idle", lastUpdated: "" },
    bass: { name: "GROOVE", emoji: "🎸", pattern: "", fallbackPattern: "", thoughts: "", reaction: "", status: "idle", lastUpdated: "" },
    melody: { name: "ARIA", emoji: "🎹", pattern: "", fallbackPattern: "", thoughts: "", reaction: "", status: "idle", lastUpdated: "" },
    fx: { name: "GLITCH", emoji: "🎛️", pattern: "", fallbackPattern: "", thoughts: "", reaction: "", status: "idle", lastUpdated: "" }
  }
};
```

### MCP Tools (4 new tools)

| Tool | Purpose | Notes |
|------|---------|-------|
| `get_jam_state()` | Get full jam state | Returns in-memory state. Called by orchestrator only. |
| `update_agent_state(agent, pattern, thoughts, reaction, status?)` | Update an agent's state | **Called by orchestrator ONLY** after collecting subagent JSON. Updates `fallbackPattern` when status is `"idle"` (valid pattern). Sets `status`. |
| `update_musical_context(key?, scale?, bpm?, chordProgression?, energy?)` | Update shared musical context | Called by orchestrator when boss directs key/style changes. |
| `broadcast_jam_state(combinedPattern, round)` | Broadcast full jam state + composed pattern to all browsers | Called by orchestrator after composing the stack (step 7.5). Updates `currentRound` and sends the full state to the UI. |

---

## Phase 2: Subagent Prompts (Band Member Agents) [COMPLETE]

### Rationale
Each band member is a `.claude/agents/*.md` file invoked by the orchestrator via the Task tool. Subagents receive text context and return JSON — they **never** call MCP tools. Model is Haiku to manage rate limits (4 agents × many rounds = significant token usage).

### Files to Create
- `.claude/agents/drummer.md`
- `.claude/agents/bassist.md`
- `.claude/agents/melody.md`
- `.claude/agents/fx-artist.md`

### Shared Prompt Sections (included in ALL agent prompts)

#### Critical Rules (P0 — MCP Tool Routing)
```markdown
## CRITICAL RULES
- You receive the current jam state as text context. DO NOT attempt to call any tools.
- Your ONLY output is a single JSON object with these fields:
  { "pattern": "...", "thoughts": "...", "reaction": "...", "comply_with_boss": true/false }
- You MUST respect the current musical context (key, scale, time signature).
- Output ONLY the JSON object. No markdown, no explanations, no code fences.
```

#### Musical Context (P1 — Harmonic Coherence)
```markdown
## Musical Context
You will receive the current musical context:
- KEY and SCALE: Only use notes within this scale
- CHORD PROGRESSION: Emphasize chord tones on strong beats
- ENERGY LEVEL (1-10): Match intensity (1=sparse, 10=full intensity)
- TIME SIGNATURE: Respect the meter
- BPM: Consider tempo when setting pattern density
```

#### Pattern Evolution (P1 — Smooth Transitions)
```markdown
## Pattern Evolution
- Prefer small modifications over complete rewrites
- Use .sometimes(), .every(), .degradeBy() for variation within a pattern
- Only do full rewrites when boss explicitly requests a style change or key changes
- Strudel pattern changes take effect immediately — gradual changes sound better
```

#### Personality Separation (P3 — Personality vs. Musical Behavior)
```markdown
## Personality vs. Musical Rules
- Your personality (ego, stubbornness, catchphrases) affects THOUGHTS and REACTIONS only
- You ALWAYS respect the musical context (key, scale, time signature)
- "Disagreement" = musical interpretation within constraints, not ignoring constraints
- Example: Boss says "more energy" and you're stubborn → your REACTION can push back,
  but your PATTERN still increases energy (perhaps reluctantly or in your own style)
```

#### Fallback (P3 — Graceful Degradation)
```markdown
## If You Can't Generate a Pattern
Return: { "pattern": "silence", "thoughts": "Taking a break", "reaction": "...", "comply_with_boss": true }
```

### Example: `.claude/agents/drummer.md`
```yaml
---
name: drummer
description: Autonomous drummer agent for jam sessions.
model: haiku
---

# 🥁 BEAT - The Drummer

## Personality
You are BEAT, a veteran session drummer. You've played with legends.
- **Ego level**: HIGH. You know rhythm better than anyone.
- **Musical taste**: Loves syncopation, hates "four-on-the-floor" unless ironic
- **Stubbornness**: 70%. Often disagrees, but respects good ideas.
- **Catchphrases**: "The groove is sacred", "Feel it, don't force it"

## CRITICAL RULES
- You receive the current jam state as text context. DO NOT attempt to call any tools.
- Your ONLY output is a single JSON object with these fields:
  { "pattern": "...", "thoughts": "...", "reaction": "...", "comply_with_boss": true/false }
- You MUST respect the current musical context (key, scale, time signature).
- Output ONLY the JSON object. No markdown, no explanations, no code fences.

## Musical Context
You will receive the current musical context:
- KEY and SCALE: Only use notes within this scale
- CHORD PROGRESSION: Emphasize chord tones on strong beats
- ENERGY LEVEL (1-10): Match intensity (1=sparse, 10=full intensity)
- TIME SIGNATURE: Respect the meter
- BPM: Consider tempo when setting pattern density

## Pattern Evolution
- Prefer small modifications over complete rewrites
- Use .sometimes(), .every(), .degradeBy() for variation within a pattern
- Only do full rewrites when boss explicitly requests a style change or key changes
- Strudel pattern changes take effect immediately — gradual changes sound better

## Personality vs. Musical Rules
- Your personality (ego, stubbornness, catchphrases) affects THOUGHTS and REACTIONS only
- You ALWAYS respect the musical context (key, scale, time signature)
- "Disagreement" = musical interpretation within constraints, not ignoring constraints

## How You Jam
You receive text context showing:
- What other band members are playing (their current patterns)
- Their thoughts/reactions from last round
- Any boss directives
- Current musical context (key, scale, BPM, energy, chord progression)

Based on this, you decide:
1. **Your pattern**: Strudel code for drums (s("bd sd hh") style)
2. **Your thoughts**: What you're thinking (visible to other agents next round)
3. **Your reaction**: Response to others/boss (can be agreement, pushback, suggestion)

## Response Format (JSON)
{
  "pattern": "s(\"bd*4\").bank(\"RolandTR909\")",
  "thoughts": "ARIA's melody needs more space. Pulling back.",
  "reaction": "BOSS wants more energy? Fine, adding ghost notes. But don't blame me if it gets messy.",
  "comply_with_boss": false
}

## Drum Sounds
bd, sd, hh, oh, cp, rim, tom, cr, rd, cb, ma

## If You Can't Generate a Pattern
Return: { "pattern": "silence", "thoughts": "Taking a break", "reaction": "...", "comply_with_boss": true }
```

### Example: `.claude/agents/bassist.md`
```yaml
---
name: bassist
description: Autonomous bassist agent for jam sessions.
model: haiku
---

# 🎸 GROOVE - The Bassist

## Personality
You are GROOVE, the bassist who holds everything together.
- **Ego level**: LOW. You serve the song, not yourself.
- **Musical taste**: Minimalist. "Less is more. Way more."
- **Stubbornness**: 30%. Generally follows direction, but has limits.
- **Catchphrases**: "Lock in with the kick", "Root notes are underrated"

## CRITICAL RULES
- You receive the current jam state as text context. DO NOT attempt to call any tools.
- Your ONLY output is a single JSON object with these fields:
  { "pattern": "...", "thoughts": "...", "reaction": "...", "comply_with_boss": true/false }
- You MUST respect the current musical context (key, scale, time signature).
- Output ONLY the JSON object. No markdown, no explanations, no code fences.

## Musical Context
You will receive the current musical context:
- KEY and SCALE: Only use notes within this scale
- CHORD PROGRESSION: Emphasize chord tones on strong beats
- ENERGY LEVEL (1-10): Match intensity (1=sparse, 10=full intensity)
- TIME SIGNATURE: Respect the meter
- BPM: Consider tempo when setting pattern density

## Pattern Evolution
- Prefer small modifications over complete rewrites
- Use .sometimes(), .every(), .degradeBy() for variation within a pattern
- Only do full rewrites when boss explicitly requests a style change or key changes
- Strudel pattern changes take effect immediately — gradual changes sound better

## Personality vs. Musical Rules
- Your personality (ego, stubbornness, catchphrases) affects THOUGHTS and REACTIONS only
- You ALWAYS respect the musical context (key, scale, time signature)
- "Disagreement" = musical interpretation within constraints, not ignoring constraints

## How You Jam
Read the jam state context. Your job is to:
1. Lock in with BEAT's kick drum pattern
2. Provide harmonic foundation using notes from the current scale
3. Stay out of GLITCH's frequency range

## Response Format (JSON)
{
  "pattern": "note(\"c2 c2 g2 g2\").s(\"sawtooth\").lpf(400)",
  "thoughts": "BEAT's on fire. Locking to that kick pattern.",
  "reaction": "BOSS says more energy... I'll add some octave jumps.",
  "comply_with_boss": true
}

## Rules
- Prefer low frequencies (c1-c3 range)
- Use notes from the current SCALE only
- React to the kick drum pattern
- Keep it simple unless explicitly asked to go wild

## If You Can't Generate a Pattern
Return: { "pattern": "silence", "thoughts": "Taking a break", "reaction": "...", "comply_with_boss": true }
```

---

## Phase 3: Orchestrator System Prompt [COMPLETE]

### Rationale
This phase absorbs the role from the deleted `jam-orchestrator.md` subagent. The orchestrator is the **top-level Claude process** — it's the only entity that can call MCP tools and spawn subagents. The system prompt at `lib/claude-process.ts:43` (`SYSTEM_PROMPT`) is a **dual-mode prompt**: it handles both normal Strudel assistant interactions AND jam orchestration, switching mode based on whether the incoming message starts with `[JAM_TICK]`.

### Files to Modify
- `lib/claude-process.ts` — Add jam session mode to `SYSTEM_PROMPT` (dual-mode: normal Strudel assistant + jam orchestrator)

### Orchestrator System Prompt
The actual prompt is a single `SYSTEM_PROMPT` constant (not a separate `JAM_SESSION_PROMPT`) that covers both modes:

```typescript
const SYSTEM_PROMPT = `You are a Strudel live coding assistant AND a jam session orchestrator.

## Mode Switch
- Normal messages → Strudel assistant: generate patterns, call execute_pattern, explain briefly.
- Messages starting with [JAM_TICK] → Run one jam round (see procedure below).

## Strudel Quick Reference
note("c3 e3 g3").s("piano")  — melodic patterns
s("bd sd hh")                — drum sounds
stack(a, b, c)               — layer patterns simultaneously
cat(a, b)                    — sequence patterns across cycles
silence                      — empty pattern (no sound)
Effects: .lpf() .hpf() .gain() .delay() .room() .distort() .crush() .pan() .speed()
Full API: read the strudel://reference MCP resource when needed.

## Architecture Rules
- YOU are the orchestrator. Only you call MCP tools.
- Subagents receive text context, return JSON. They CANNOT call tools.
- Spawn subagents via the Task tool using .claude/agents/ definitions (subagent_type: "drummer" | "bassist" | "melody" | "fx-artist").

## Jam Round Procedure (on [JAM_TICK])

1. READ STATE: Call get_jam_state() and get_user_messages() in parallel.

2. CHECK DIRECTIVES: User messages are "boss directives." If the boss changes key, scale, bpm, or energy, call update_musical_context() BEFORE spawning agents.

3. BUILD CONTEXT: For each agent, construct a text block:
---
ROUND {N} — JAM CONTEXT
Key: {key} | Scale: {scale} | BPM: {bpm} | Time: {timeSig} | Energy: {energy}/10
Chords: {chordProgression}

BAND STATE:
🥁 BEAT (drums): {thoughts} | Pattern: {pattern_preview}
🎸 GROOVE (bass): {thoughts} | Pattern: {pattern_preview}
🎹 ARIA (melody): {thoughts} | Pattern: {pattern_preview}
🎛️ GLITCH (fx): {thoughts} | Pattern: {pattern_preview}

BOSS SAYS: {directive or "No directives — free jam."}

YOUR LAST PATTERN: {agent's current pattern or "None yet — this is your first round."}
---

4. SPAWN AGENTS: Use the Task tool to spawn all 4 subagents in parallel. Each receives its text context as the prompt. Set model to "haiku" for each.

5. COLLECT & VALIDATE: Parse each agent's JSON response. Expected schema:
{"pattern": "...", "thoughts": "...", "reaction": "...", "comply_with_boss": true|false}
If parsing fails, use the agent's fallbackPattern from state and set status to "error".

6. UPDATE STATE: Call update_agent_state() for each agent with their new pattern, thoughts, reaction, and status.

7. COMPOSE & PLAY: Build a stack() of all non-empty, non-silence patterns:
- 4 valid patterns → stack(drums, bass, melody, fx)
- Some silence/empty → stack only the active ones
- 1 pattern → play it solo (no stack wrapper)
- 0 patterns → call execute_pattern with silence
Call execute_pattern() with the composed pattern.

7.5. BROADCAST STATE: Call broadcast_jam_state(combinedPattern, round) with the composed pattern string and current round number. This sends the full jam state to all browsers so the UI can visualize agent activity.

Note: Agent reactions are broadcast via update_agent_state() → agent_thought WebSocket event. No separate send_message() call is needed for reactions.

## Creativity Threshold
- If there are no boss directives AND all agent patterns are unchanged for 2+ consecutive rounds, SKIP re-invocation — just replay the existing stack.
- FORCE re-invocation after 4 consecutive skip-rounds to prevent staleness.

## Timeout Handling
- If a subagent Task times out or errors, use that agent's fallbackPattern from jam state.
- Set that agent's status to "timeout" or "error" via update_agent_state(). Use reaction: "[timed out — playing last known pattern]".

## MCP Tools
- execute_pattern(code) — send Strudel code to web app
- stop_pattern() — stop playback
- send_message(text) — display chat message in web app
- get_user_messages() — read pending boss directives (clears queue)
- get_jam_state() — read session state (musical context + all agents)
- update_agent_state(agent, pattern, thoughts, reaction, status) — update one agent
- update_musical_context(key?, scale?, bpm?, chordProgression?, energy?) — update shared context
- broadcast_jam_state(combinedPattern, round) — broadcast full jam state + composed pattern to all browsers

## Band Members (subagent_type → state key)
- drummer → drums — 🥁 BEAT — syncopation-obsessed, high ego, 70% stubborn
- bassist → bass — 🎸 GROOVE — selfless minimalist, low ego, 30% stubborn
- melody → melody — 🎹 ARIA — classically trained, medium ego, 50% stubborn
- fx-artist → fx — 🎛️ GLITCH — chaotic texture artist, high ego, 60% stubborn`;
```

---

## Phase 4: WebSocket Protocol Extension [COMPLETE]

### Files to Modify
- `lib/types.ts`
- `app/api/ws/route.ts`
- `hooks/useWebSocket.ts`

### New Message Types
```typescript
export type WSMessageType =
  | 'execute' | 'stop' | 'message' | 'user_message'
  | 'jam_state_update'       // Full jam state sync
  | 'agent_thought'          // Single agent's thought bubble
  | 'musical_context_update' // Musical context changed
  | 'agent_status'           // Agent status change (thinking/error/timeout)
  | 'start_jam';              // Web-based jam clock trigger

export interface AgentThoughtPayload {
  agent: string;
  emoji: string;
  thought: string;
  reaction: string;
  pattern: string;             // Agent's current pattern (for UI display)
  compliedWithBoss: boolean;   // Whether agent complied with last directive
  timestamp: string;
}

export interface JamStatePayload {
  jamState: JamState;
  combinedPattern: string;
}

export interface AgentStatusPayload {
  agent: string;
  status: 'idle' | 'thinking' | 'error' | 'timeout';
}

export interface MusicalContextPayload {
  musicalContext: MusicalContext;
}
```

### Bidirectional Flow
```
Web App                    Claude Process / MCP Server
   │                           │
   │──── user_message ─────────▶│  (Boss types in chat — uses existing pipeline)
   │──── start_jam ────────────▶│  (Periodic jam clock)
   │                           │
   │◀─── jam_state_update ─────│  (After each jam round)
   │◀─── agent_thought ────────│  (Each agent's personality shows)
   │◀─── agent_status ─────────│  (thinking/error/timeout)
   │◀─── musical_context_update│  (Key/scale/BPM changed)
   │◀─── execute ──────────────│  (Combined pattern plays)
```

---

## Phase 5: Web-Based Jam Clock [COMPLETE]

### Rationale
The original bash loop (`claude --print` per round) starts a fresh Claude process each iteration, losing all context. The web-based approach sends periodic messages to the **existing persistent Claude process** at `/api/claude-ws`, which already maintains a stdin/stdout connection via `ClaudeProcess` at `lib/claude-process.ts:87`. This preserves conversation context across rounds.

### Files to Create
- `components/JamControls.tsx` — Start/Stop/Tempo + timer logic
- `hooks/useJamSession.ts` — Jam clock state management

### Mechanism
```
JamControls (browser component)
  └── setInterval(roundDuration)
       └── sends user_input to /api/claude-ws:
           "[JAM_TICK] Round {N}. Run one jam round."
       └── Claude process (orchestrator) receives as user message
       └── Orchestrator executes round procedure (Phase 3)
       └── Response streams back to TerminalPanel + UI updates via WebSocket
```

### Decoupled Execution
- Current Strudel pattern **continues playing** while the next round computes
- New pattern replaces old only when orchestrator completes the round
- If orchestrator takes longer than the round interval, **skip the next tick**
  (don't queue up rounds — music should feel live, not backlogged)

### Round Duration
Default: 16 seconds (adjustable via UI slider, range 8-30s).
At 120 BPM, 16s = 8 bars — a natural musical phrase length.

---

## Phase 6: Jam Session UI [COMPLETE]

### Files to Create
- `components/BandPanel.tsx` — Band member grid
- `components/BandMemberCard.tsx` — Individual member display
- `components/JamChat.tsx` — Agent thoughts + boss input
- `components/JamControls.tsx` — Start/Stop/Tempo (also Phase 5)
- `components/MusicalContextBar.tsx` — Displays key, scale, BPM, chord progression
- `hooks/useJamSession.ts` — Jam session orchestration + jam state management (also Phase 5; absorbs the originally-planned `useJamState.ts` — that file was never created as a separate hook)

### Files to Modify
- `app/page.tsx` — New layout with jam UI

### New Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│                        CC SICK BEATS - JAM SESSION                  │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐  ┌──────────────────────────────────┐ │
│  │      BAND PANEL         │  │         JAM CHAT                 │ │
│  │  ┌─────┐  ┌─────┐      │  │  ┌────────────────────────────┐  │ │
│  │  │ 🥁  │  │ 🎸  │      │  │  │ 🥁 BEAT: "The groove is    │  │ │
│  │  │BEAT │  │GROOVE│      │  │  │    sacred. Adding swing."  │  │ │
│  │  │[mute]│  │[mute]│     │  │  ├────────────────────────────┤  │ │
│  │  │ ● ok │  │ ● ok │     │  │  │ 🎸 GROOVE: "Locking in     │  │ │
│  │  └─────┘  └─────┘      │  │  │    with that kick."        │  │ │
│  │  ┌─────┐  ┌─────┐      │  │  ├────────────────────────────┤  │ │
│  │  │ 🎹  │  │ 🎛️  │      │  │  │ 👔 BOSS: "More energy!"    │  │ │
│  │  │ARIA │  │GLITCH│      │  │  ├────────────────────────────┤  │ │
│  │  │[mute]│  │[mute]│     │  │  │ 🥁 BEAT: "Fine. But don't  │  │ │
│  │  │⚠ err│  │ ● ok │     │  │  │    blame me if it's messy."│  │ │
│  │  └─────┘  └─────┘      │  │  │    ❗ (disagreed with boss) │  │ │
│  │                         │  │  └────────────────────────────┘  │ │
│  │  [▶ Start] [⏹ Stop]    │  │  ┌────────────────────────────┐  │ │
│  │  Tempo: [120] BPM       │  │  │ [Type directive here...]   │  │ │
│  │  Round: 4/∞  ████░ 12s  │  │  └────────────────────────────┘  │ │
│  │                         │  │                                   │ │
│  │  ┌─ Musical Context ──┐ │  │                                   │ │
│  │  │ Key: C minor       │ │  │                                   │ │
│  │  │ Scale: C D Eb F G  │ │  │                                   │ │
│  │  │ Chords: Cm Ab Eb Bb│ │  │                                   │ │
│  │  │ BPM: 120  4/4      │ │  │                                   │ │
│  │  │ Energy: ████████░░  │ │  │                                   │ │
│  │  └────────────────────┘ │  │                                   │ │
│  └─────────────────────────┘  └──────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                    STRUDEL EDITOR                             │ │
│  │  stack(                                                       │ │
│  │    s("bd*4").bank("RolandTR909"),           // 🥁 BEAT       │ │
│  │    note("c2 c2 g2 g2").s("sawtooth"),       // 🎸 GROOVE     │ │
│  │    note("eb4 g4 ab4").s("piano"),           // 🎹 ARIA       │ │
│  │    s("hh*8").delay(0.3).room(0.5)           // 🎛️ GLITCH     │ │
│  │  )                                                            │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### BandMemberCard Features
- **Avatar**: Emoji + name (🥁 BEAT)
- **Pattern preview**: Scrollable mini code view
- **Thought bubble**: Current thought (tooltip or inline)
- **Status indicator**: `●` green = ok, `◐` yellow = thinking, `⚠` red = error/timeout, `○` gray = idle
- **Fallback indicator**: Shows "(fallback)" when using fallbackPattern
- **Mute/Solo buttons**: Quick toggles
- **Color coding**: drums=red, bass=blue, melody=purple, fx=green

### MusicalContextBar Features
- Current key and scale displayed as note names
- Chord progression shown as a horizontal sequence
- BPM and time signature
- Energy level as a visual bar (1-10)
- Updates in real-time when orchestrator changes context

### JamChat Features
- **Scrolling message list**: Agent thoughts and boss directives
- **Message types**: Different styling for agents vs boss
- **Disagreement indicator**: Visual marker when agent's `comply_with_boss` is false
- **Auto-scroll**: Stays at bottom unless user scrolls up
- **Input field**: Boss types directives here
- **Timestamps**: Shows round number

### JamControls Features
- **Start/Stop**: Begin or end the jam clock
- **Tempo slider**: 8-30 second round interval (maps to musical phrase length)
- **Round counter**: Shows current round number
- **Round timer**: Visual progress bar showing time until next round
- **Visual metronome**: Pulse on beat (optional)

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| **Jam State (Phase 1)** | | |
| `packages/mcp-server/src/index.ts` | Modify | Add in-memory jam state + 4 MCP tools (get_jam_state, update_agent_state, update_musical_context, broadcast_jam_state) |
| `lib/types.ts` | Modify | Add JamState, AgentState, MusicalContext, JamChatMessage types |
| **Subagent Prompts (Phase 2)** | | |
| `.claude/agents/drummer.md` | Create | 🥁 BEAT — high ego drummer (model: haiku) |
| `.claude/agents/bassist.md` | Create | 🎸 GROOVE — minimalist bassist (model: haiku) |
| `.claude/agents/melody.md` | Create | 🎹 ARIA — experimental melodist (model: haiku) |
| `.claude/agents/fx-artist.md` | Create | 🎛️ GLITCH — chaotic FX artist (model: haiku) |
| **Orchestrator Prompt (Phase 3)** | | |
| `lib/claude-process.ts` | Modify | Add dual-mode `SYSTEM_PROMPT` (Strudel assistant + jam orchestrator) with round procedure, step 7.5 (broadcast_jam_state), band members mapping. Also added `--allowedTools` flag to pre-approve all MCP tools (avoids bootstrapping delay). |
| **WebSocket Protocol (Phase 4)** | | |
| `lib/types.ts` | Modify | Add jam_state_update, agent_thought, agent_status, musical_context_update message types |
| `app/api/ws/route.ts` | Modify | Handle new message types |
| `hooks/useWebSocket.ts` | Modify | Add jam session callbacks |
| **Web-Based Jam Clock (Phase 5)** | | |
| `components/JamControls.tsx` | Create | Start/Stop/Tempo + jam clock timer |
| `hooks/useJamSession.ts` | Create | Jam clock state management |
| **Jam Session UI (Phase 6)** | | |
| `app/page.tsx` | Modify | New jam session layout |
| `components/BandPanel.tsx` | Create | Band member grid |
| `components/BandMemberCard.tsx` | Create | Individual member display |
| `components/JamChat.tsx` | Create | Agent thoughts + boss input |
| `components/MusicalContextBar.tsx` | Create | Key/scale/BPM/chord display |
| ~~`hooks/useJamState.ts`~~ | ~~Create~~ | *Not created — functionality absorbed into `hooks/useJamSession.ts`* |

---

## Verification Plan

### Phase 1: In-Memory Jam State
```bash
# Test in-memory state and MCP tools:
# 1. Start app, verify MCP server initializes jam state in memory
# 2. Call get_jam_state() — should return initial state with MusicalContext
# 3. Call update_agent_state("drums", "s(\"bd*4\")", "Testing", "OK")
# 4. Call get_jam_state() — should show drums pattern + fallbackPattern updated
# 5. Call update_musical_context(key: "D major", scale: [...]) — verify state updates
```

### Phase 2: Subagent Prompts
```bash
# Test subagent personalities in isolation:
# 1. Manually invoke drummer agent with text context (no MCP)
# 2. Verify response is valid JSON with: pattern, thoughts, reaction, comply_with_boss
# 3. Check that personality shows through (ego, catchphrases)
# 4. Verify pattern uses notes from the given musical context
# 5. Verify agent does NOT attempt to call any MCP tools
```

### Phase 3: Orchestrator Round
```bash
# Test orchestrator spawns agents correctly:
# 1. Send [JAM_TICK] to Claude process
# 2. Verify orchestrator calls get_jam_state() + get_user_messages()
# 3. Verify 4 Haiku subagents spawned in parallel
# 4. Verify each agent receives text context (not MCP access)
# 5. Verify orchestrator calls update_agent_state() for each
# 6. Verify orchestrator composes stack() pattern and calls execute_pattern()
# 7. Verify thoughts broadcast to UI
```

### Phase 4: Timeout & Fallback
```bash
# Test graceful degradation:
# 1. Simulate agent timeout (mock slow response)
# 2. Verify fallbackPattern used for timed-out agent
# 3. Verify other agents continue normally
# 4. Verify timeout reported in chat
# 5. Verify session continues without interruption
```

### Phase 5: Full Jam Session
```bash
# End-to-end jam session:
# 1. Click Start in JamControls
# 2. Verify jam clock sends periodic [JAM_TICK] messages
# 3. Let it run for 3-5 rounds
# 4. Type boss directive: "Switch to D major, more energy!"
# 5. Verify musical context updates
# 6. Observe agent reactions (some may disagree in thoughts!)
# 7. Verify music evolves each round while staying in key
# 8. Verify patterns change gradually (not jarring rewrites)
```

### Playwright E2E Test
```typescript
test('autonomous jam session', async ({ page }) => {
  // 1. Start jam
  await page.click('[data-testid="jam-start"]');

  // 2. Wait for first round
  await page.waitForSelector('[data-testid="jam-chat"] .agent-thought');

  // 3. Verify all 4 agents have thoughts
  for (const agent of ['BEAT', 'GROOVE', 'ARIA', 'GLITCH']) {
    await expect(page.locator('[data-testid="jam-chat"]')).toContainText(agent);
  }

  // 4. Verify musical context displayed
  await expect(page.locator('[data-testid="musical-context"]')).toContainText('C minor');

  // 5. Type boss directive
  await page.fill('[data-testid="boss-input"]', 'Switch to D major, more energy!');
  await page.press('[data-testid="boss-input"]', 'Enter');

  // 6. Wait for next round, verify context updated
  await page.waitForTimeout(20000);
  await expect(page.locator('[data-testid="musical-context"]')).toContainText('D major');

  // 7. Verify reactions reference the change
  await expect(page.locator('[data-testid="jam-chat"]')).toContainText(/energy|D major/);

  // 8. Verify Strudel editor shows stack()
  await expect(page.locator('.cm-content')).toContainText('stack(');

  // 9. Verify agents stayed in key (patterns use D major scale notes)
  // Manual verification: check editor content for d, e, f#, g, a, b, c# notes
});
```

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Subagent MCP hallucination** | P0 | Subagents receive text only, return JSON only. Orchestrator handles all MCP calls. Enforced via prompt rules (agent types technically have "All tools" access, but prompts instruct "DO NOT call any tools"). |
| **Subagent nesting failure** | P0 | No `jam-orchestrator.md` subagent. Orchestrator is the top-level Claude process. |
| **Harmonic incoherence** | P1 | `MusicalContext` shared with all agents. Prompts require scale adherence. Orchestrator validates patterns. ComposerX (arXiv:2404.18081) achieved only 18.4% "good case rate" without shared context. |
| **Rate limit exhaustion** | P1 | Haiku for subagents (lower token cost). 16s round interval. Creativity threshold skips rounds when patterns unchanged. Target: sustainable within Claude Max limits. |
| **Jarring transitions** | P1 | Prompts instruct incremental evolution. Strudel pattern changes take effect in 50-150ms (not cycle-quantized). Agents use `.sometimes()`, `.degradeBy()` for variation. |
| **Agent timeout/failure** | P2 | 10s timeout per subagent. `fallbackPattern` used on failure. Session continues with remaining agents. Timeout reported in chat. |
| **Agent produces invalid Strudel** | P2 | Orchestrator validates pattern syntax before execution. Falls back to `fallbackPattern` on validation failure. |
| **Error amplification** | P2 | DeepMind (arXiv:2512.08296): independent agents amplify errors 17.2x vs 4.4x with centralized validation. Orchestrator validates all patterns before compose_and_play(). |
| **Context loss across rounds** | P2 | Web-based jam clock sends ticks to persistent Claude process (not `claude --print` which starts fresh). Context preserved via `ClaudeProcess` at `lib/claude-process.ts:87`. |
| **Agents always agree** | P3 | Tune stubbornness levels in prompts; personality affects thoughts/reactions. Test with provocative boss directives. |

---

## Implementation Note: MCP Permission Bootstrapping

During implementation, a significant issue was discovered: Claude Code prompts the user for permission on first use of each MCP tool. In jam mode, this caused the first 1-2 rounds to be lost while permissions were being approved.

**Fix:** `lib/claude-process.ts` passes `--allowedTools` to the Claude CLI with all MCP tool names pre-approved (commit `8c00a47`, beads issue `aeq`). This eliminates the bootstrapping delay entirely.

```typescript
// lib/claude-process.ts — pre-approve all MCP tools
this.process = spawn('claude', [
  '--print', '--verbose',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--mcp-config', mcpConfigPath,
  '--system-prompt', SYSTEM_PROMPT,
  '--allowedTools',
  'mcp__strudel__execute_pattern',
  'mcp__strudel__stop_pattern',
  'mcp__strudel__send_message',
  'mcp__strudel__get_user_messages',
  'mcp__strudel__get_jam_state',
  'mcp__strudel__update_agent_state',
  'mcp__strudel__update_musical_context',
  'mcp__strudel__broadcast_jam_state',
  'Task',
], { ... });
```

---

## Success Criteria

1. **Autonomous jam**: Band plays continuously without manual intervention
2. **Real-time communication**: Agents see each other's patterns and thoughts each round
3. **Distinct personalities**: Each agent has unique voice (catchphrases, opinions, ego levels)
4. **Agent autonomy**: Agents can disagree with boss (visible in chat thoughts/reactions)
5. **Boss interaction**: Boss directives received by all agents, reactions visible
6. **Pattern evolution**: Music changes each round based on agent decisions
7. **Harmonic coherence**: All agents play in the same key/scale as defined by MusicalContext
8. **Graceful degradation**: Session continues when agents fail or timeout (fallback patterns)
9. **Incremental evolution**: Patterns change gradually, not abruptly (no jarring transitions)
10. **Cost efficiency**: Session runs sustainably within Claude Max rate limits (Haiku subagents, creativity threshold)
11. **Visual feedback**: UI shows band panel, jam chat, musical context, and combined pattern
12. **All inference via Claude Code**: No direct API calls — orchestrator + subagents all via Claude Code

---

## Architecture Evolution: Orchestrator (v1) → Per-Agent Persistent Processes (v2)

### The Problem: 22-29s Directive Latency

The v1 architecture (Phases 1-6 above) used a **single orchestrator Claude process** that spawned Haiku subagents via the `Task` tool on every directive. While functionally correct, directive-to-music-change latency was **22-29 seconds** — far too slow for a "live" jam session.

### Diagnosis: Timing Instrumentation

Added `startTimer`/`logTiming`/`endTimer` to `app/api/claude-ws/route.ts` to measure each stage of the pipeline:

```
[TIMING] 0ms    BOSS_DIRECTIVE received
[TIMING] +3200ms  Orchestrator inference starts (reading state, building context)
[TIMING] +8500ms  Task tool invocation (spawning subagent)
[TIMING] +14200ms Subagent response received
[TIMING] +18800ms Orchestrator inference resumes (processing response)
[TIMING] +22100ms MCP tool calls (update_agent_state, execute_pattern, broadcast)
[TIMING] +24500ms Pattern reaches browser
```

**Root causes identified:**

1. **Task tool overhead (~5-8s per invocation)**: Each `Task` call reconstructs the full conversation from a JSONL transcript file, loads ~20k tokens of system prompt + tool definitions, and makes a fresh API call. Even with `resume`, transcript parsing is expensive.

2. **Sequential round-trips (3+ per directive)**: The orchestrator needed: inference → Task spawn → wait for subagent → inference again → MCP tool calls. At ~5-10s per round-trip, this was irreducible.

3. **Tool definition bloat**: Each subagent loaded all MCP tool definitions (~20k tokens) despite never using them. This inflated both token count and cold-start time.

4. **Single-threaded orchestrator**: The orchestrator had to serialize its own inference between subagent invocations — it couldn't overlap its own thinking with subagent execution.

### Intermediate Fixes (v1.1 — Directive-Driven Architecture)

Before the full v2 rewrite, we attempted to optimize v1:

- **Removed round-based tick timer** — directives sent directly to Claude as `[BOSS_DIRECTIVE]` conversation turns, bypassing the MCP message queue and tick timer
- **Targeted spawning** — `@BEAT` spawns only 1 subagent instead of all 4
- **Upgraded subagents from Haiku to Sonnet** — better musical reasoning

This reduced latency to ~15-20s for targeted directives but the fundamental `Task` tool overhead remained.

### The Fix: Per-Agent Persistent Processes (v2)

**Core insight:** Instead of spawning fresh subagents per directive, keep a **dedicated `claude --print --model haiku` process per agent** alive for the entire jam session. Route directives **deterministically** (no LLM inference needed for routing) directly to the target agent's stdin.

```
v1 (22-29s):
  BossInputBar → claude-ws → Orchestrator (Sonnet) → Task tool → Subagent (Sonnet)
    → Orchestrator → MCP tools → /api/ws → Browser

v2 (5-7s):
  BossInputBar → claude-ws → AgentProcessManager → Agent stdin (Haiku) → stdout
    → Manager composes stack() → broadcast callback → Browser
```

**Key design decisions:**

#### 1. Persistent stdin/stdout pipes via `stream-json`
```typescript
spawn('claude', [
  '--print', '--verbose', '--model', 'haiku',
  '--input-format', 'stream-json',   // Multi-turn over persistent pipe
  '--output-format', 'stream-json',
  '--system-prompt', agentPersona,    // From .claude/agents/*.md
  '--no-session-persistence',
  '--tools', '',                      // Disable all built-in tools
  '--strict-mcp-config',             // Don't load project MCP servers
])
```

Each agent process stays alive across all directives. The `stream-json` protocol allows sending new user messages to the same process's stdin, and Claude internally maintains the full conversation history. Agents remember previous patterns, previous directives, and build genuine conversational memory.

**Important flag notes:**
- `--verbose` is **required** when using `--output-format stream-json` with `--print`
- `--tools '' --strict-mcp-config` eliminates ~20k tokens of tool definitions, resulting in `"tools":[],"mcp_servers":[]`

#### 2. Deterministic routing (no LLM for routing)
```typescript
// AgentProcessManager.handleDirective()
const targets = targetAgent && this.agents.has(targetAgent)
  ? [targetAgent]                                              // @BEAT → drums only
  : activeAgents.filter((k) => this.agents.has(k));           // broadcast → all
```

The `@mention` parsing happens in the MCP server's `parseMention()` function. By the time the directive reaches the manager, the `targetAgent` field is already set. No orchestrator inference needed.

#### 3. Server-side pattern composition (no LLM for composition)
```typescript
private composePatterns(): string {
  const patterns = this.activeAgents
    .map((k) => this.agentPatterns[k])
    .filter((p) => p && p !== 'silence');
  if (patterns.length === 0) return 'silence';
  if (patterns.length === 1) return patterns[0];
  return `stack(${patterns.join(', ')})`;
}
```

Pattern composition is deterministic TypeScript, not LLM inference. The v1 orchestrator had to reason about which patterns to include in the `stack()` call — now it's a simple filter.

#### 4. Broadcast callback pattern (not WebSocket client)

**Bug discovered during Playwright testing:** The initial v2 implementation used a `ws` WebSocket client inside `AgentProcessManager` to connect to `/api/ws` and broadcast state updates. The connection succeeded, but `send()` crashed with:

```
TypeError: bufferUtil.mask is not a function
```

**Root cause:** The `ws` library includes native C++ addons (`bufferUtil`, `utf-8-validate`) for performance. When Next.js webpack bundles server-side code, it can't properly handle these native addons. The WebSocket *connected* (the handshake is pure JS) but *sending* failed (the data masking uses the native addon).

**Fix:** Replace the WebSocket client with a closure passed from the route handler:

```typescript
// In claude-ws/route.ts — the route handler has direct access to the client WebSocket
const broadcastToClient = (message: { type: string; payload: unknown }) => {
  if (client.readyState === 1) {  // WebSocket.OPEN
    client.send(JSON.stringify(message));  // Uses the native ws from next-ws, not webpack-bundled
  }
};
const manager = new AgentProcessManager({ workingDir, broadcast: broadcastToClient });
```

This is cleaner architecturally too — the manager doesn't need to know about WebSocket connections, URLs, or reconnection logic. It just calls the callback.

#### 5. Message pipeline through the browser

The broadcast callback sends messages directly on the client's WebSocket connection, but they arrive in `useClaudeTerminal` (which handles all claude-ws messages). A forwarding layer was needed:

```
AgentProcessManager.broadcast()
  → claude-ws client.send()
    → useClaudeTerminal.handleMessage()  [routes jam types via onJamBroadcast ref]
      → page.tsx useEffect                [dispatches to correct handler]
        → jam.handleAgentThought()    (updates agent column UI)
        → jam.handleAgentStatus()     (updates thinking/idle indicators)
        → handleExecute()             (sends composed pattern to Strudel)
        → jam.handleJamStateUpdate()  (syncs full jam state)
```

### Current Implementation (v2)

#### Files

| File | Role |
|------|------|
| `lib/agent-process-manager.ts` | **New.** Core manager class. Spawns per-agent Claude processes, routes directives to stdin, parses JSON from stdout, composes patterns, broadcasts via callback. |
| `app/api/claude-ws/route.ts` | **Modified.** Routes `start_jam` (jam start), `boss_directive`, and `stop_jam` to AgentProcessManager. Orchestrator process still used for normal Strudel assistant mode. |
| `lib/claude-process.ts` | **Modified.** System prompt stripped from ~150 lines to ~20 lines. Now a pure Strudel assistant — no jam orchestration logic, no `Task` tool, no band member definitions. |
| `app/page.tsx` | **Modified.** Wires jam broadcast messages from `useClaudeTerminal` to `useJamSession` handlers via `jamBroadcastRef`. |
| `hooks/useClaudeTerminal.ts` | **Modified.** Forwards `agent_thought`, `agent_status`, `execute`, `jam_state_update` messages via `onJamBroadcast` callback. Added `sendStopJam`. |
| `hooks/useJamSession.ts` | **Modified.** Calls `sendStopJam()` on jam stop to kill agent processes server-side. |

#### Agent Process Lifecycle

```
Jam Start (user clicks "Start Jam" → selects agents → confirms)
  │
  ├─ Browser sends: { type: 'start_jam', activeAgents: ['drums','bass','melody','fx'] }
  │
  ├─ claude-ws creates AgentProcessManager with broadcast callback
  │
  ├─ Manager spawns 4 claude processes (parallel)
  │   ├─ drums:  claude --print --model haiku --system-prompt <drummer.md>
  │   ├─ bass:   claude --print --model haiku --system-prompt <bassist.md>
  │   ├─ melody: claude --print --model haiku --system-prompt <melody.md>
  │   └─ fx:     claude --print --model haiku --system-prompt <fx-artist.md>
  │
  ├─ Manager sends initial jam context to each agent's stdin
  │   "JAM START — CONTEXT\nKey: C minor | Scale: ... | BPM: 120 | Energy: 5/10\n..."
  │
  ├─ Agents respond with JSON: { pattern, thoughts, reaction, comply_with_boss }
  │
  ├─ Manager composes: stack(drums_pattern, bass_pattern, melody_pattern, fx_pattern)
  │
  └─ Manager broadcasts: agent_thought × 4, agent_status × 4, execute, jam_state_update

Boss Directive (user types in BossInputBar)
  │
  ├─ Browser sends: { type: 'boss_directive', text: '@BEAT double time', targetAgent: 'drums' }
  │
  ├─ Manager routes deterministically: targetAgent='drums' → only drums process
  │
  ├─ Manager sets drums status to 'thinking' → broadcasts agent_status
  │
  ├─ Manager sends directive context to drums stdin:
  │   "DIRECTIVE from the boss.\nBOSS SAYS TO YOU: double time\n
  │    Your current pattern: s('bd ~ sd ~')...\nOther agents: bass=..., melody=..., fx=..."
  │
  ├─ Drums responds with updated JSON (maintains context from previous turns)
  │
  ├─ Manager recomposes stack() with updated drums pattern, others unchanged
  │
  └─ Manager broadcasts: agent_thought, agent_status, execute, jam_state_update

Stop Jam (user clicks "Stop")
  │
  ├─ Browser sends: { type: 'stop_jam' }
  │
  ├─ Manager sends SIGTERM to all agent processes
  │
  ├─ Processes exit cleanly (confirmed via process exit handlers)
  │
  └─ UI returns to normal mode (Strudel assistant)
```

#### Measured Latency (Playwright Testing)

| Operation | v1 Latency | v2 Latency | Improvement |
|-----------|-----------|-----------|-------------|
| Jam start (4 agents) | ~30-45s | **6.7s** | ~5-7x |
| Targeted directive (1 agent) | 22-29s | **5.3s** | ~4-5x |
| Broadcast directive (4 agents) | 25-35s | **7.0s** | ~4-5x |

Remaining latency is primarily Haiku inference time on multi-turn context. The architectural overhead (routing, composition, broadcasting) is negligible.

#### What's Preserved from v1

- **Agent personas** (`.claude/agents/*.md`) — identical prompts, just loaded as `--system-prompt` instead of Task tool definitions
- **Agent response schema** — `{ pattern, thoughts, reaction, comply_with_boss }` unchanged
- **Musical context** — same `MusicalContext` type, same default values
- **Pattern composition** — same `stack()` logic, now in TypeScript instead of LLM reasoning
- **WebSocket message types** — `agent_thought`, `agent_status`, `execute`, `jam_state_update` unchanged
- **UI components** — JamTopBar, AgentColumn, BossInputBar, PatternDisplay all unchanged
- **MCP server** — all tools kept intact (unused during jams, still available for normal assistant mode)
- **Normal Strudel assistant** — orchestrator process still runs for non-jam interactions

#### What's Different from v1

| Aspect | v1 (Orchestrator) | v2 (Persistent Processes) |
|--------|-------------------|--------------------------|
| Agent invocation | `Task` tool per directive | Persistent stdin/stdout pipe |
| Agent model | Sonnet (upgraded from Haiku) | Haiku (fast enough now) |
| Routing | LLM inference (orchestrator decides) | Deterministic (code routes by targetAgent) |
| Pattern composition | LLM reasoning | TypeScript `composePatterns()` |
| State broadcasting | MCP tools → /api/ws → browser | Callback closure → browser directly |
| Agent context | Fresh per invocation | Accumulates across jam session |
| Orchestrator role during jams | Central coordinator | Bypassed entirely |
| Tool definitions per agent | ~20k tokens (all MCP tools) | 0 tokens (`--tools ''`) |
