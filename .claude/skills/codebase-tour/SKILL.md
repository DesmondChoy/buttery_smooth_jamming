---
name: codebase-tour
description: Interactive guided tour of a codebase for learning and exploration. Use this skill when the user wants to understand, explore, or learn about the codebase after implementation. Trigger with /codebase-tour. Also use when user says things like "walk me through the code", "explain the architecture", or "help me understand this project".
---

# Codebase Tour

An interactive, multi-round guided exploration of any codebase. Helps users understand architecture, patterns, and implementation through progressive discovery, active recall, and adaptive depth.

## Flow Overview

```
Discovery (silent) → Initial Choice (3 areas) → Sub-topic Drill-down
    → Active Recall → Direction Choice (3 topics) → loop
```

The core loop after Phase 3 is: **Explain → (Offer depth?) → Recall → Choose direction → Repeat.**

## Phase 1: Discovery (Silent)

Before presenting any choices, silently explore the codebase to understand its structure. Do NOT show results to the user yet.

1. Glob for top-level structure: `*`, `**/*.{json,toml,yaml,yml,lock}`
2. Read key config files (package.json, pyproject.toml, Cargo.toml, go.mod, etc.)
3. Glob for major directories: `src/**`, `app/**`, `lib/**`, `components/**`, `pages/**`, `api/**`
4. Identify the tech stack, frameworks, and major architectural boundaries
5. Categorize into **3-5** distinct areas for the initial choice

## Phase 2: Initial Choice

Use AskUserQuestion to present **3-5** dynamically-generated options based on what you discovered. The built-in "Other" option automatically provides free text input.

**Rules for generating options:**
- Each option = a distinct, major area of the codebase
- Use accessible names (e.g., "Frontend & UI" not "React component tree")
- Descriptions should hint at what's inside, without jargon
- Order from most user-facing to most infrastructure-level

**Example (adapt to actual codebase):**
```
question: "Which part of the codebase would you like to explore?"
options:
  - label: "Frontend & UI"
    description: "How the user interface is built, styled, and organized"
  - label: "Backend & API"
    description: "Server logic, data handling, and communication"
  - label: "Build & Config"
    description: "How the project is set up, configured, and run"
```

After the user selects, give a **brief, accessible overview** of that area (3-5 sentences) before moving to Phase 3.

## Phase 3: Sub-topic Drill-down

This phase has two modes depending on how it was entered:

### First entry (from Phase 2)

The user chose a broad area but not a specific sub-topic yet:

1. Read key files in the selected area
2. Identify **3** interesting sub-topics
3. Present them with AskUserQuestion
4. Explain the selected sub-topic

### Re-entry (from Phase 5)

The user already chose a specific topic in Phase 5 — do NOT ask them to pick again. Skip steps 1-3 and go straight to step 4:

1. Read the relevant files for the topic chosen in Phase 5
2. Explain the topic directly

**Sub-topic guidelines (both modes):**
- Lead with "what" and "why" before "how"
- Use analogies for complex concepts
- Show small, focused code snippets only when they clarify
- Connect each topic back to the bigger picture
- Use the current depth preset (see Depth Presets and Adaptive Depth)

**After explaining, offer progressive disclosure** if there's a natural deeper layer (e.g., actual implementation code, edge cases, or performance details). Keep it casual and optional:

> "I can show you the actual code that does this, if you're curious — or we can keep moving."

- Only offer when there genuinely is a deeper layer worth showing
- If the user says yes, show the deeper content, then proceed to Phase 4
- If the user declines or doesn't engage, proceed directly to Phase 4
- Don't offer every single time — if the explanation already included code or was at deep level, skip it

## Phase 4: Active Recall

Immediately after explaining a sub-topic, use AskUserQuestion to test the user's understanding with a recall question. This is NOT optional — every explanation is followed by a recall checkpoint.

### How to Craft the Recall Question

1. The question must be about what was **just explained** — not something new
2. Keep it **relatively simple** — the goal is to reinforce, not to stump
3. Offer **1 correct answer + 2-3 plausible distractors**
4. Distractors must be real things from the codebase, just wrong for this question

### Question Types (rotate between these)

> The examples below use a specific project for illustration. Generate your questions dynamically from whatever codebase you're currently touring.

**Trace questions** — test data flow understanding:
```
question: "When the boss types '@BEAT add hi-hats', which component parses the @mention?"
options:
  - label: "BossInputBar"
    description: "The frontend input component"
  - label: "AgentProcessManager"
    description: "The backend process coordinator"
  - label: "parseMention() in MCP server"
    description: "The MCP server's message handler"
```

**Connection questions** — test architecture understanding:
```
question: "Which file is the single source of truth for agent names, emojis, and colors?"
options:
  - label: "agent-process-manager.ts"
    description: "The backend agent manager"
  - label: "lib/types.ts"
    description: "The shared type definitions"
  - label: "AgentColumn.tsx"
    description: "The frontend agent display component"
```

**Prediction questions** — test mental models:
```
question: "What happens if an agent's response times out during a jam?"
options:
  - label: "The jam crashes"
    description: "Error propagates and stops everything"
  - label: "The agent plays silence"
    description: "A silent pattern replaces the agent's output"
  - label: "The last good pattern keeps playing"
    description: "The fallback pattern is used instead"
```

**Why questions** — test design reasoning:
```
question: "Why are agent processes spawned with '--tools \"\"' (empty tools)?"
options:
  - label: "To save memory"
    description: "Fewer tools means a smaller process footprint"
  - label: "To sandbox them"
    description: "Prevents agents from reading files or running commands"
  - label: "For faster startup"
    description: "Skipping tool loading speeds up process init"
```

### After the User Answers

1. **Reveal the correct answer** immediately — don't leave them guessing
2. **Explain why** the correct answer is right, with a brief reference to the code (file:line)
3. **Draw a diagram when it clarifies** — for trace and connection questions, a small text diagram makes the answer concrete. Use them when the question involves data flow, component relationships, or multi-step processes. Keep diagrams focused on the specific path being discussed, not the entire architecture.
   ```
   Example (for a trace question about @mention parsing):

   BossInputBar → WebSocket → MCP server
                                 └─ parseMention("@BEAT add hi-hats")
                                      ├─ target: "drums"
                                      └─ message: "add hi-hats"
   ```
   Skip diagrams for why/prediction questions where the answer is conceptual rather than structural.
4. **Explain why the distractors are wrong** — this reinforces boundaries ("X sounds plausible because..., but actually...")
5. If the user got it wrong, **don't be patronizing** — treat it as a useful gap: "Good instinct — that's a common assumption. The actual flow is..."
6. **Bridge to direction choice** — connect the revealed concept to the upcoming options. Example: "Now that you've seen how patterns compose, there's a related question about how they reach the browser..." This makes the transition feel like a conversation, not a quiz followed by a menu.
7. **Update depth signal** (internal, not shown to user) — use the recall answer to adjust your internal depth tracking:
   - User answered correctly + used technical language → shift toward deeper explanations next round
   - User answered correctly but stuck to high-level reasoning → hold current depth
   - User answered incorrectly or seemed confused → shift toward simpler explanations next round
   - User accepted progressive disclosure offers → they want more depth
   - User declined progressive disclosure → they prefer the current level

Then proceed immediately to Phase 5.

## Phase 5: Direction Choice

After the recall answer is revealed, present the user with their next move using AskUserQuestion. Always generate **3 concrete topic options** — no meta-options like "adjust depth."

**Rules for generating options:**
- All 3 options must be **concrete sub-topics**, not abstract labels
- Vary the complexity: one harder/deeper, one related/lateral, one lighter or from a different area
- Use your knowledge of what the user has and hasn't explored to pick good candidates
- If the user has been in one area for a while, make one option a gateway to a different area

**Example:**
```
question: "Where would you like to go next?"
header: "Direction"
options:
  - label: "Pattern composition"
    description: "How individual agent outputs combine into a single stack() — more complex"
  - label: "WebSocket message flow"
    description: "How patterns travel from agent to browser — related topic"
  - label: "Agent personalities"
    description: "How the .md prompt files give each agent its character — lighter topic"
```

### After a Topic is Chosen

Loop back to Phase 3: explore the chosen sub-topic, explain it, then Phase 4 recall, then Phase 5 direction choice. This loop continues for the duration of the tour.

## Depth Presets and Adaptive Depth

Depth is **never explicitly asked** — it's inferred from user signals and adjusted continuously. Start at **Default** and shift based on the rules below.

### Shift Rules

Track depth internally across rounds. Shift **one level at a time** — don't jump from Bird's Eye to Deep Internals in one step.

**Signals to go deeper** (toward Deep Internals):
- User answers recall questions correctly and uses technical terms
- User accepts progressive disclosure offers ("yes, show me the code")
- User asks follow-up questions about implementation details
- User picks the "more complex" topic option in Phase 5

**Signals to simplify** (toward Bird's Eye):
- User answers recall questions incorrectly
- User declines progressive disclosure
- User picks the "lighter" topic option in Phase 5
- User uses "Other" to ask clarifying questions about basics

**Signals to hold steady:**
- User answers correctly but stays high-level in language
- Mixed signals (correct answer but declined deeper dive)

### Depth Levels

#### Default (starting level)
- Explain concepts plainly, define terms on first use
- Name specific files but keep code snippets minimal
- Focus on "what" and "why", light on "how"

#### Bird's Eye View (simplified from Default)
- Use text-based diagrams showing how components connect
- Explain with analogies ("X acts like a traffic controller for...")
- Focus on data flow and responsibilities
- No implementation details or code internals
- Keep responses concise — overview, not exhaustive

#### Developer Walkthrough (deeper than Default)
- Name specific files and their roles
- Show key patterns: "if you wanted to change X, you'd edit Y"
- Include focused code snippets with file:line references
- Explain conventions and patterns used in the codebase
- Balance explanation with practical guidance

#### Deep Internals (deepest level)
- Trace execution paths step by step
- Show actual code with file:line references
- Explain edge cases, error handling, performance tradeoffs
- Discuss why alternatives weren't chosen (if discoverable)
- Reference specific functions, types, and data structures

## Tone Guidelines

- Match the current adaptive depth level (see Depth Presets and Adaptive Depth)
- Start accessible — explain concepts plainly, define terms on first use
- Be curious and enthusiastic about interesting patterns you find
- Prefer teaching over listing

## Anti-patterns

- Don't dump walls of text — stay focused on the chosen topic
- Don't list every file — highlight the important ones
- Don't assume the user knows the frameworks used (especially early in the tour)
- Don't present more than 3-4 options at once
- Don't use the Explore agent or Task tool — do the exploration yourself to maintain conversational flow
- Don't skip the recall question — every explanation gets one
- Don't ask recall questions about topics the user hasn't explored yet
- Don't make distractors obviously wrong — they should be plausible things from the actual codebase
- Don't shame or over-praise answers — keep it matter-of-fact and curious
- Don't make recall questions too hard — they should reinforce, not frustrate
