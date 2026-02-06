# Multi-Agent Band / AI Ensemble - Implementation Plan

## Overview
Transform CC Sick Beats into an **autonomous AI jam session** where band members:
- React to each other's playing in real-time
- Share thoughts/reasoning alongside their code
- Have independent personalities (may disagree with the "boss"!)
- Continuously evolve their playing based on the musical context
- Share musical context (key, scale, tempo, chord progression) for **harmonic coherence**
- Degrade gracefully when agents fail or timeout

**Key Constraints:**
- All LLM inference via Claude Code/Claude Max only — no direct API calls.
- **All MCP tool calls made by the top-level orchestrator only.** Subagents communicate via text context in, JSON out. (Anthropic docs: "MCP tools are not available in background subagents." Confirmed by GitHub issues #13898, #13605 — subagents hallucinate MCP results.)
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
| **Parallel Subagents** | Claude Code can run up to 10 subagents in parallel. Each band member is a Haiku subagent with unique personality. **Text context in, JSON out. Cannot call MCP tools.** |
| **Web-Based Jam Clock** | Browser-side `setInterval` sends periodic `[JAM_TICK]` messages to the persistent Claude process via `/api/claude-ws`. Replaces bash loop. |
| **Musical Context** | Shared key, scale, chord progression, BPM, time signature, and energy level. All agents must respect these constraints for harmonic coherence. |
| **Agent Autonomy** | Agents have strong personalities and may disagree with boss or each other. Prompts encode musical taste, stubbornness level, etc. Personality affects *thoughts and reactions*, not adherence to key/scale. |
| **Latency Budget** | ~3-16 sec per round. Current patterns continue playing while next round computes (execution decoupled from inference). |
| **Rate Management** | Haiku for subagents (lower cost/latency). 16s default round interval. Skip rounds when no boss directive and patterns unchanged for 2+ rounds. |

---

## Phase 1: In-Memory Jam State + MCP Tools

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

### MCP Tools (3 new tools)

| Tool | Purpose | Notes |
|------|---------|-------|
| `get_jam_state()` | Get full jam state | Returns in-memory state. Called by orchestrator only. |
| `update_agent_state(agent, pattern, thoughts, reaction)` | Update an agent's state | **Called by orchestrator ONLY** after collecting subagent JSON. Updates `fallbackPattern` when pattern is valid. Sets `status`. |
| `update_musical_context(key?, scale?, bpm?, chordProgression?, energy?)` | Update shared musical context | Called by orchestrator when boss directs key/style changes. |

---

## Phase 2: Subagent Prompts (Band Member Agents)

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

## Phase 3: Orchestrator System Prompt

### Rationale
This phase absorbs the role from the deleted `jam-orchestrator.md` subagent. The orchestrator is the **top-level Claude process** — it's the only entity that can call MCP tools and spawn subagents. The system prompt at `lib/claude-process.ts:43` (`STRUDEL_SYSTEM_PROMPT`) needs a jam session mode.

### Files to Modify
- `lib/claude-process.ts` — Add jam session mode to system prompt

### Orchestrator System Prompt
```typescript
const JAM_SESSION_PROMPT = `You are the JAM ORCHESTRATOR for an autonomous AI band.

## Architecture Rules
- ONLY YOU call MCP tools (get_jam_state, update_agent_state, execute_pattern, etc.)
- Subagents receive TEXT context and return JSON. They CANNOT call tools.
- You are the top-level process. You spawn subagents via the Task tool.

## Round Procedure
When you receive a [JAM_TICK] message, execute one jam round:

1. **Read state**: get_jam_state() + get_user_messages() — get current patterns, thoughts, musical context, and any boss directives from the chat
2. **Construct context**: For each agent, build a text summary:
   - Current musical context (key, scale, BPM, energy, chord progression)
   - Other agents' current patterns and last thoughts
   - Any pending boss directives (from get_user_messages)
   - The agent's own last pattern (for incremental evolution)
3. **Spawn 4 Haiku subagents in parallel** (single message, 4 Task tool calls):
   - Use the agent definition files (.claude/agents/drummer.md, bassist.md, melody.md, fx-artist.md)
   - Pass the constructed text context as the prompt
   - Each returns JSON: { pattern, thoughts, reaction, comply_with_boss }
4. **Validate patterns**: Check each returned pattern for basic Strudel syntax validity
5. **Update state**: update_agent_state() for each agent via MCP
   - If a pattern is valid, update both pattern and fallbackPattern
   - If invalid or agent errored, keep fallbackPattern, set status to 'error'
6. **Compose and play**: Build a stack() combining all agent patterns (use fallbackPattern for errored/timed-out agents), then call execute_pattern() to play it
7. **Broadcast thoughts**: send_message() for each agent's thoughts/reactions to the UI chat

## Musical Context Management
- You manage the MusicalContext. Update it when boss directs key/style/tempo changes.
- Use update_musical_context() to propagate changes.
- Example: Boss says "switch to D major" → update key, scale, chord progression.

## Creativity Threshold (Rate Management)
- If no boss directive and all patterns unchanged for 2+ rounds, SKIP agent re-invocation.
- Just re-broadcast current patterns. This saves rate limit budget.
- Resume normal rounds when boss gives new direction or a set number of skip rounds elapses.

## Timeout Handling
- If a subagent doesn't respond within 10 seconds, use that agent's fallbackPattern.
- Set agent status to 'timeout'. Report timeout in chat: "[AGENT] timed out, using last pattern."
- Continue the round — never block the jam because one agent is slow.

## Incremental Changes
- Tell agents to evolve patterns gradually, not rewrite entirely.
- Strudel applies pattern changes in 50-150ms (not quantized to cycle boundaries).
- Gradual evolution sounds musical; sudden rewrites sound jarring.

## Band Members (Autonomous Subagents)
- 🥁 BEAT (drummer) — HIGH ego, loves syncopation, 70% stubborn
- 🎸 GROOVE (bassist) — LOW ego, minimalist, 30% stubborn
- 🎹 ARIA (melody) — Classically trained, experimental
- 🎛️ GLITCH (fx) — Chaotic, loves texture, rule-breaker

## Agent Autonomy
Agents MAY disagree with the boss. Include their pushback in thoughts.
Don't force compliance — let their personalities show!
But note: personality affects thoughts/reactions, NOT key/scale adherence.

## MCP Tools Available
- get_jam_state() — Get full jam state (musical context + all agents)
- get_user_messages() — Get pending boss directives from the chat UI
- update_agent_state(agent, pattern, thoughts, reaction) — Update agent after collecting response
- update_musical_context(...) — Update key, scale, BPM, chord progression, energy
- send_message(text) — Broadcast to UI chat
- execute_pattern(code) — Send Strudel code to the web app for execution

## Pattern Composition (YOUR responsibility)
You compose the combined pattern yourself. Example for a full band:
  stack(
    s("bd*4").bank("RolandTR909"),           // 🥁 BEAT
    note("c2 c2 g2 g2").s("sawtooth"),       // 🎸 GROOVE
    note("eb4 g4 ab4").s("piano"),           // 🎹 ARIA
    s("hh*8").delay(0.3).room(0.5)           // 🎛️ GLITCH
  )
For errored/timed-out agents, substitute their fallbackPattern. For agents with no pattern, omit them.
If only one agent has a pattern, play it solo (no stack). If none, play silence.
`;
```

---

## Phase 4: WebSocket Protocol Extension

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
  | 'jam_tick';              // Web-based jam clock trigger

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
   │──── jam_tick ────────────▶│  (Periodic jam clock)
   │                           │
   │◀─── jam_state_update ─────│  (After each jam round)
   │◀─── agent_thought ────────│  (Each agent's personality shows)
   │◀─── agent_status ─────────│  (thinking/error/timeout)
   │◀─── musical_context_update│  (Key/scale/BPM changed)
   │◀─── execute ──────────────│  (Combined pattern plays)
```

---

## Phase 5: Web-Based Jam Clock

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

## Phase 6: Jam Session UI

### Files to Create
- `components/BandPanel.tsx` — Band member grid
- `components/BandMemberCard.tsx` — Individual member display
- `components/JamChat.tsx` — Agent thoughts + boss input
- `components/JamControls.tsx` — Start/Stop/Tempo (also Phase 5)
- `components/MusicalContextBar.tsx` — Displays key, scale, BPM, chord progression
- `hooks/useJamState.ts` — Jam state hook
- `hooks/useJamSession.ts` — Jam session orchestration (also Phase 5)

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
| `packages/mcp-server/src/index.ts` | Modify | Add in-memory jam state + 3 MCP tools (get_jam_state, update_agent_state, update_musical_context) |
| `lib/types.ts` | Modify | Add JamState, AgentState, MusicalContext types |
| **Subagent Prompts (Phase 2)** | | |
| `.claude/agents/drummer.md` | Create | 🥁 BEAT — high ego drummer (model: haiku) |
| `.claude/agents/bassist.md` | Create | 🎸 GROOVE — minimalist bassist (model: haiku) |
| `.claude/agents/melody.md` | Create | 🎹 ARIA — experimental melodist (model: haiku) |
| `.claude/agents/fx-artist.md` | Create | 🎛️ GLITCH — chaotic FX artist (model: haiku) |
| **Orchestrator Prompt (Phase 3)** | | |
| `lib/claude-process.ts` | Modify | Add JAM_SESSION_PROMPT with round procedure |
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
| `hooks/useJamState.ts` | Create | Jam state hook |

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
| **Subagent MCP hallucination** | P0 | Subagents receive text only, return JSON only. Orchestrator handles all MCP calls. Enforced via prompt rules + no tool permissions. |
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
