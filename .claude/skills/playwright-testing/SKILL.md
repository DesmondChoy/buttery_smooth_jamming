---
name: playwright-testing
description: Comprehensive Playwright MCP testing guide for the Strudel live coding app. Use this skill to systematically validate the frontend using structured checklists. Trigger with /playwright-testing.
allowed-tools: Bash(npm run dev:*), Bash(npm run build:*), Bash(npx playwright:*), mcp__plugin_playwright_playwright__*, Read, Edit, Glob, Grep
---

# Playwright MCP Testing Guide for Strudel Live Coding App

This comprehensive testing document outlines a systematic approach to validate the Strudel Live Coding frontend using Playwright MCP.

## Prerequisites

1. **Start the dev server** (in a separate terminal or background):
   ```bash
   npm run dev
   ```

2. **Verify server is running** at `http://localhost:3000`

3. **Use Playwright MCP tools** for all browser interactions

## Core Testing Methodology

### Golden Rule
Work through the structured checklists systematically. Do NOT skip items or test ad-hoc.

### Critical: Test Through the User's Code Path

**IMPORTANT:** When testing MCP/WebSocket integration, ALWAYS test through the **Claude Terminal** in the browser, NOT by calling MCP tools directly from Playwright.

**Why?** Direct MCP calls (like `mcp__strudel__execute_pattern`) bypass part of the code path:
- Direct MCP: Playwright → MCP Server → WebSocket → Browser
- Claude Terminal: Browser → Claude WS → Claude CLI → MCP Server → WebSocket → Browser

Testing through Claude Terminal exercises the **complete integration** and catches bugs that direct MCP calls miss (e.g., WebSocket connection issues, ref timing problems).

### How to Test Through Claude Terminal

1. Navigate to the app with Playwright
2. Enable audio (click the audio button)
3. Wait for Claude Terminal to show "Ready" status
4. Use Playwright to type in the Claude Terminal input field
5. Submit the message and wait for Claude's response
6. Verify the editor updates and audio plays

```typescript
// Example: Type in Claude Terminal input
await page.getByRole('textbox', { name: 'Chat input' }).fill('Make me a simple beat');
await page.getByRole('textbox', { name: 'Chat input' }).press('Enter');
// Wait for Claude to respond and execute pattern
await page.waitForSelector('button:has-text("Playing")');
```

### When You Find a Bug
1. **STOP** current testing
2. **DOCUMENT** the issue clearly
3. **FIX** the code
4. **RESTART** dev server if needed
5. **VERIFY** the fix works
6. **RESUME** testing from where you stopped

---

## Phase 1: Initial Load & Layout

### Navigation
- [ ] Navigate to `http://localhost:3000`
- [ ] Page loads without errors
- [ ] Title is correct

### Layout Structure (Normal Mode — before jam starts)
- [ ] "CC Sick Beats" heading and subtitle visible
- [ ] Terminal panel visible on left (1/3 width)
- [ ] Right content area with Play/Stop buttons and JamControls
- [ ] StrudelPanel visible at bottom of page (full width, below both panels)
- [ ] Control buttons visible (play/stop)
- [ ] JamControls panel visible (with Start Jam button)
- [ ] Keyboard shortcut hints visible ("Ctrl+Enter to play • Ctrl+. to stop")
- [ ] AudioStartButton overlay shown before audio is enabled

---

## Phase 2: Strudel Editor Functionality

### Editor Display
- [ ] Code editor is visible and rendered
- [ ] Editor has syntax highlighting
- [ ] Editor shows default/example code pattern
- [ ] Line numbers are displayed (if configured)

### Code Editing
- [ ] Can click into the editor
- [ ] Can type new code
- [ ] Can select and delete code
- [ ] Can use keyboard shortcuts (Ctrl+A, etc.)
- [ ] Changes persist in editor state

### Audio Controls
- [ ] Play button is visible
- [ ] Stop button is visible (or play toggles)
- [ ] Buttons are clickable
- [ ] Button states update appropriately

---

## Phase 3: Audio Behavior

### Autoplay Policy
- [ ] Audio does NOT autoplay on page load
- [ ] Audio only starts after user interaction
- [ ] No browser autoplay warnings in console

### Code Execution
- [ ] Clicking play evaluates the code
- [ ] Valid patterns produce audio (verify visually via waveform or state change)
- [ ] Clicking stop halts audio playback
- [ ] Can restart after stopping

### Keyboard Shortcuts (Critical State Sync Test)
- [ ] Ctrl+Enter inside editor starts playback AND updates Play button to "Playing" state
- [ ] Ctrl+. inside editor stops playback AND updates Stop button to disabled
- [ ] Button states stay in sync regardless of play/stop method (button click vs keyboard)

### Error Handling
- [ ] Invalid code shows error message
- [ ] Error message is user-friendly
- [ ] Can recover from errors by fixing code
- [ ] App doesn't crash on syntax errors

---

## Phase 4: WebSocket Integration (CRITICAL - Use Claude Terminal)

**WARNING:** Do NOT test this phase using direct MCP tool calls. Always test through the Claude Terminal UI to exercise the complete code path.

### Pre-flight Checks
- [ ] No "WebSocket connection error" banner visible
- [ ] Console shows no WebSocket connection failures for `/api/ws`
- [ ] Console shows no WebSocket connection failures for `/api/claude-ws`

### Claude Terminal Connection
- [ ] Terminal panel shows connection status indicator
- [ ] Status transitions: Connecting → Ready (within ~3 seconds)
- [ ] No rapid reconnection loop (client IDs should stabilize, not increment endlessly)
- [ ] Reconnection attempts on disconnect (up to 5 retries with exponential backoff)
- [ ] Error message displayed after max reconnection failures

### Claude Terminal → MCP → Editor Flow (THE CRITICAL TEST)

This tests the complete integration path:

1. [ ] Type "Make me a simple beat" in Claude Terminal input
2. [ ] Press Enter to send message
3. [ ] User message appears in terminal (prefixed with ">")
4. [ ] Claude responds (may take a few seconds)
5. [ ] Tool use displays: `[mcp__strudel__execute_pattern]` with code
6. [ ] **Editor updates to show the new pattern code** (not default code!)
7. [ ] **Play button changes to "Playing"** (audio starts)
8. [ ] Audio is audible (or samples are loading in console)

If step 6 or 7 fails, there's a WebSocket or ref-forwarding bug.

### Additional Claude Terminal Tests
- [ ] Can request different music styles ("classical", "techno", "ambient")
- [ ] Can ask Claude to stop the music
- [ ] Can ask Claude to modify the current pattern
- [ ] Multiple requests work consecutively

---

## Phase 5: Terminal Panel (Normal Mode)

**Note:** The Terminal Panel is only visible in **normal mode** (before a jam starts). During a jam, it is replaced by the Jam Mode UI (see Phase 10).

### Layout
- [ ] Terminal panel visible on left side (1/3 width, `min-w-[300px]`)
- [ ] Right content area contains heading, Play/Stop buttons, JamControls
- [ ] StrudelPanel renders at the bottom (always visible, both modes)

### Header
- [ ] Header shows "Claude Terminal" title
- [ ] Status indicator visible (dot + text)
- [ ] Ctrl+L hint displayed for clearing

### Content Area
- [ ] Empty state message: "Ask Claude to create music patterns. Try: \"Make me a funky beat\""
- [ ] Messages display with proper formatting
- [ ] User messages distinguishable from Claude responses
- [ ] Auto-scroll to latest message

### Input
- [ ] Input field present at bottom
- [ ] Placeholder text visible
- [ ] Can type in input field
- [ ] Enter key submits message (when connected)

---

## Phase 6: Desktop Layout

### Desktop (1280px+)
- [ ] Full layout renders correctly in normal mode
- [ ] All controls accessible
- [ ] StrudelPanel has adequate height at bottom
- [ ] Terminal panel (left) and content area (right) side-by-side, StrudelPanel below
- [ ] Jam mode layout renders correctly: sidebar (380px) + JamChat + StrudelPanel

---

## Phase 7: Error Handling

### Network Errors
- [ ] Graceful handling of failed API calls
- [ ] User-friendly error messages
- [ ] Retry mechanisms work (if implemented)

### Invalid Routes
- [ ] 404 page displays for unknown routes
- [ ] Navigation back to app works

---

## Phase 8: Jam Controls

### Static Rendering
- [ ] JamControls panel visible below Play/Stop buttons
- [ ] "Start Jam" button visible

### Connection Gate
- [ ] "Start Jam" button disabled when Claude status is NOT "Ready"
- [ ] Helper text "Connect to Claude to start a jam" shown when disconnected
- [ ] "Start Jam" button enabled when Claude terminal shows "Ready"

### Jam Session Lifecycle (requires Claude connection)
- [ ] Clicking "Start Jam" → Agent Selection Modal appears
- [ ] Modal shows all 4 agents (BEAT, GROOVE, ARIA, GLITCH) with emoji and checkboxes
- [ ] Can toggle individual agents on/off
- [ ] "Start Jam (N agents)" button shows count of selected agents
- [ ] Confirming modal → **layout switches to jam mode** (Terminal panel disappears, AgentColumns appear)
- [ ] All selected agents show "thinking" status during initial jam start
- [ ] Agents respond with opening patterns (all transition to green "playing")
- [ ] Clicking "Stop" → returns to normal mode layout
- [ ] Cancel button / Esc dismisses modal without starting jam

---

## Phase 9: Jam WebSocket Events (During Active Jam)

**Prerequisite:** Start a jam session (Phase 8 lifecycle tests must pass first).

Note: v2 uses a directive-driven architecture — agents respond on-demand to boss directives, not on timed rounds. WebSocket events fire per-directive, not per-round.

### Agent Status Broadcasts
- [ ] Open browser DevTools → Network → WS tab → filter `/api/ws`
- [ ] When a directive is sent, `agent_status` messages appear for targeted agent(s)
- [ ] Each contains `{ agent: "drums"|"bass"|"melody"|"fx", status: "thinking"|"playing"|"idle" }`

### Agent Thought Broadcasts
- [ ] `agent_thought` messages appear with agent reactions
- [ ] Each contains `{ agent, emoji, thought, reaction, pattern, timestamp }`
- [ ] Agent columns show reactions inline (e.g., "🥁 BEAT: ...")

### Musical Context Updates
- [ ] `musical_context_update` messages appear if boss directives change context
- [ ] Contains `{ musicalContext: { key, scale, bpm, ... } }`

### Jam State Broadcasts
- [ ] `jam_state_update` messages appear after agents respond to directives
- [ ] Contains full `{ jamState: {...}, combinedPattern: "stack(...)" }`

### Console Health
- [ ] No WebSocket errors in console during jam
- [ ] No rapid reconnection loops
- [ ] Messages flow consistently across directives

---

## Phase 10: Jam Mode UI (During Active Jam)

**Prerequisite:** Start a jam session (Phase 8 lifecycle tests must pass first). When the jam starts, the layout **switches entirely** from normal mode to jam mode.

### Layout Switch
- [ ] Clicking "Start Jam" (after agent selection) swaps normal mode layout to jam mode layout
- [ ] Terminal panel (left) disappears
- [ ] Heading ("CC Sick Beats") and Play/Stop buttons disappear from right area
- [ ] JamTopBar appears at top (Stop button, musical context, energy bar)
- [ ] Agent Columns appear in CSS grid (one column per selected agent)
- [ ] BossInputBar appears below the agent columns
- [ ] PatternDisplay appears below BossInputBar (shows per-agent patterns with emoji/names)
- [ ] StrudelPanel **remains at bottom** (audio is not interrupted by layout switch)

### JamTopBar
- [ ] Stop button visible at left
- [ ] Musical key displayed (e.g., "C minor")
- [ ] BPM displayed (e.g., "120 BPM")
- [ ] Chord progression displayed as pill-shaped chips (e.g., Cm, Ab, Eb, Bb)
- [ ] Energy bar with colored segments visible (labeled "E:")

### Agent Columns
- [ ] One column per selected agent in CSS grid layout
- [ ] Each column header shows agent emoji and name (e.g., "🥁 BEAT")
- [ ] Status indicator (StatusDot) visible per column
- [ ] Color-coding per agent: drums=red, bass=blue, melody=purple, fx=green
- [ ] "Waiting for {AGENT}..." placeholder shown before first response
- [ ] After agent responds: thoughts displayed with round marker (e.g., "R0")
- [ ] Pattern code shown below thoughts
- [ ] Reactions displayed in italics below pattern
- [ ] Boss directives shown inline in the targeted agent's column ("BOSS (to you)")

### Agent Status Lifecycle (StatusDot) — Three-State Model
The status dot in each column header reflects whether the agent is contributing sound. Three states:
- **Green** (playing) — agent has a non-silence pattern in the composed stack
- **Yellow** (thinking) — agent is processing a directive
- **Gray** (idle) — agent has no pattern yet, or pattern is `silence`

Verify the full transition cycle:
- [ ] **Initial state**: Gray dot, label "idle" — shown before agents have responded
- [ ] **Thinking state**: Yellow pulsing dot, label "thinking" — shown when agent is processing a directive
- [ ] **Playing state**: Green gently-pulsing dot, label "playing" — shown after agent responds with a non-silence pattern
- [ ] **Jam start transition**: After starting a jam, all agents go yellow (thinking) → green (playing) once they respond with patterns
- [ ] **Targeted directive transition**: Send "@BEAT double time" and verify:
  - [ ] Target agent's dot turns yellow/pulsing ("thinking") immediately after sending
  - [ ] Non-targeted agents remain green ("playing") — they already have patterns
  - [ ] After agent responds (~3-7s), dot returns to green ("playing")
- [ ] **Silence pattern**: If an agent returns `silence` as its pattern, dot should be gray ("idle")
- [ ] **Timeout with fallback**: If an agent times out but has a previous pattern, dot stays green ("playing")

### BossInputBar (`data-testid="boss-input"`)
- [ ] Input field with "BOSS >" label
- [ ] Placeholder: "Give a directive... (@ to mention an agent)"
- [ ] Send button visible (disabled when input is empty)
- [ ] Can type a directive (e.g., "@BEAT double time on the hi-hats")
- [ ] @mention syntax targets specific agents
- [ ] Send button submits directive
- [ ] Targeted directive appears in the target agent's column

### PatternDisplay
- [ ] Shows each agent's current pattern with emoji and name label
- [ ] Each agent listed: 🥁 BEAT, 🎸 GROOVE, 🎹 ARIA, 🎛️ GLITCH
- [ ] Patterns shown as code (monospace)
- [ ] "silence" shown when agent has no pattern
- [ ] Collapsible via "▶ Patterns" toggle

### Returning to Normal Mode
- [ ] Clicking "Stop Jam" → layout switches back to normal mode
- [ ] Terminal panel reappears on left
- [ ] Heading and Play/Stop buttons reappear on right
- [ ] StrudelPanel remains at bottom (audio continues if playing)

### Agent Context Isolation & Latency
- [ ] Agent columns show individual thoughts/reactions (visual isolation per column)
- [ ] Composed `stack()` pattern in PatternDisplay/StrudelPanel contains patterns from all active agents
- [ ] Directive latency: time from boss input submission to agent response appearing <7s
- [ ] Negative test: agent thoughts shown in one agent's column do NOT appear in another agent's column
- [ ] Verify by sending a targeted directive (e.g., "@BEAT double time") — only drums agent should go to "thinking" state
- [ ] After response, other agents' patterns remain unchanged in the composed stack

---

## Quick Smoke Test

Use this 15-item checklist for rapid validation:

1. [ ] App loads at localhost:3000
2. [ ] Normal mode layout: Terminal (left), content area (right), StrudelPanel (bottom)
3. [ ] Terminal panel shows "Claude Terminal" header
4. [ ] Terminal status shows "Ready" (not "Disconnected" or "Connecting...")
5. [ ] No "WebSocket connection error" banner visible
6. [ ] Strudel editor visible with code at bottom
7. [ ] Play button clickable (after enabling audio)
8. [ ] **Claude Terminal chat works: type message → Claude responds**
9. [ ] **Claude can execute patterns: editor updates + audio plays**
10. [ ] No WebSocket errors in console
11. [ ] JamControls panel visible with "Start Jam" button
12. [ ] "Start Jam" button disabled when Claude not connected, enabled when ready
13. [ ] Starting a jam → agent selection modal → layout switches to jam mode (AgentColumns + BossInputBar)
14. [ ] Agent columns show thoughts/reactions per agent, PatternDisplay shows patterns with emoji/names
15. [ ] Stopping jam → layout reverts to normal mode

Items 8 and 9 are the most critical - they test the complete integration.
Items 13-15 test the jam mode UI lifecycle.

---

## Reporting

After completing testing, provide:

```
## Testing Summary

**Phases Completed:** <list phases tested>

**Issues Found:**
- <component>: <description of issue>

**Issues Fixed:**
- <component>: <what was fixed>

**Remaining Issues:** (if any)
- <component>: <issue requiring further work>

**Overall Status:** <Pass/Fail/Partial>
```
