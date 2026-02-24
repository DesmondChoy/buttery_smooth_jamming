---
name: playwright-testing
description: Comprehensive Playwright MCP testing guide for the Strudel live coding app. Use this skill to systematically validate the frontend using structured checklists. Trigger with /playwright-testing.
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

**IMPORTANT:** When testing MCP/WebSocket integration, ALWAYS test through the **AI terminal** (currently labeled "Claude Terminal" in the UI) in the browser, NOT by calling MCP tools directly from Playwright.

**Why?** Direct MCP calls (like `mcp__strudel__execute_pattern`) bypass part of the code path:
- Direct MCP: Playwright → MCP Server → WebSocket → Browser
- AI terminal path: Browser → app WS route (`/api/claude-ws`, legacy name) → runtime CLI process → MCP Server → WebSocket → Browser

Testing through the AI terminal exercises the **complete integration** and catches bugs that direct MCP calls miss (e.g., WebSocket connection issues, ref timing problems).

### How to Test Through the AI Terminal

1. Navigate to the app with Playwright
2. Enable audio (click the audio button)
3. Wait for the AI terminal to show "Ready" status
4. Use Playwright to type in the terminal input field
5. Submit the message and wait for the assistant response
6. Verify the editor updates and audio plays

```typescript
// Example: Type in the AI terminal input
await page.getByRole('textbox', { name: 'Chat input' }).fill('Make me a simple beat');
await page.getByRole('textbox', { name: 'Chat input' }).press('Enter');
// Wait for the assistant to respond and execute pattern
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
- [ ] "Buttery Smooth Jamming" heading and subtitle visible
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

## Phase 4: WebSocket Integration (CRITICAL - Use AI Terminal)

**WARNING:** Do NOT test this phase using direct MCP tool calls. Always test through the AI terminal UI to exercise the complete code path.

### Pre-flight Checks
- [ ] No "WebSocket connection error" banner visible
- [ ] Console shows no WebSocket connection failures for `/api/ws`
- [ ] Console shows no WebSocket connection failures for `/api/claude-ws`

### AI Terminal Connection
- [ ] Terminal panel shows connection status indicator
- [ ] Status transitions: Connecting → Ready (within ~3 seconds)
- [ ] No rapid reconnection loop (client IDs should stabilize, not increment endlessly)
- [ ] Reconnection attempts on disconnect (up to 5 retries with exponential backoff)
- [ ] Error message displayed after max reconnection failures

### AI Terminal → MCP → Editor Flow (THE CRITICAL TEST)

This tests the complete integration path:

1. [ ] Type "Make me a simple beat" in the AI terminal input
2. [ ] Press Enter to send message
3. [ ] User message appears in terminal (prefixed with ">")
4. [ ] assistant responds (may take a few seconds)
5. [ ] Tool use displays: `[mcp__strudel__execute_pattern]` with code
6. [ ] **Editor updates to show the new pattern code** (not default code!)
7. [ ] **Play button changes to "Playing"** (audio starts)
8. [ ] Audio is audible (or samples are loading in console)

If step 6 or 7 fails, there's a WebSocket or ref-forwarding bug.

### Additional AI Terminal Tests
- [ ] Can request different music styles ("classical", "techno", "ambient")
- [ ] Can ask the assistant to stop the music
- [ ] Can ask the assistant to modify the current pattern
- [ ] Multiple requests work consecutively

---

## Phase 5: Terminal Panel (Normal Mode)

**Note:** The Terminal Panel is only visible in **normal mode** (before a jam starts). During a jam, it is replaced by the Jam Mode UI (see Phase 10).

### Layout
- [ ] Terminal panel visible on left side (1/3 width, `min-w-[300px]`)
- [ ] Right content area contains heading, Play/Stop buttons, JamControls
- [ ] StrudelPanel renders at the bottom (visible in normal mode; hidden via `h-0 overflow-hidden` in jam mode, but still rendered so audio continues)

### Header
- [ ] Header shows terminal title (currently `Claude Terminal` in legacy UI copy)
- [ ] Status indicator visible (dot + text)
- [ ] Ctrl+L hint displayed for clearing

### Content Area
- [ ] Empty state message appears (legacy copy may still reference Claude)
- [ ] Messages display with proper formatting
- [ ] User messages distinguishable from assistant responses
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
- [ ] Jam mode layout renders correctly: JamTopBar + Agent Columns (CSS grid) + BossInputBar + PatternDisplay (StrudelPanel hidden)

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
- [ ] "Start Jam" button disabled when terminal status is NOT "Ready"
- [ ] Helper text `Connect to Claude to start a jam` is shown when disconnected (legacy copy still acceptable until UI rename)
- [ ] "Start Jam" button enabled when terminal shows "Ready"

### Jam Session Lifecycle (requires terminal connection)
- [ ] Clicking "Start Jam" → Agent Selection Modal appears
- [ ] Modal shows all 4 agents (BEAT, GROOVE, ARIA, GLITCH) with emoji and checkboxes
- [ ] Can toggle individual agents on/off
- [ ] "Start Jam (N agents)" button shows count of selected agents
- [ ] Cannot deselect the last agent (minimum 1 required)
- [ ] Enter key confirms selection (same as clicking "Start Jam" button)
- [ ] Confirming modal → **layout switches to jam mode** (Terminal panel disappears, AgentColumns appear)
- [ ] All selected agents show "thinking" status during initial jam start
- [ ] Agents respond with opening patterns (all transition to green "playing")
- [ ] Clicking "Stop" → returns to normal mode layout
- [ ] Cancel button / Esc dismisses modal without starting jam

### Jam Admission Limits (Concurrency + Process Caps)
- [ ] Default server limits are `MAX_CONCURRENT_JAMS=1` and `MAX_TOTAL_AGENT_PROCESSES=4` (unless overridden in env)
- [ ] With one active jam in Tab A, starting a jam in Tab B returns an error message containing "Jam capacity reached"
- [ ] The rejection frame on `/api/claude-ws` includes `code: "jam_capacity_exceeded"` plus `details` with active/projected counts
- [ ] If env is configured for >1 concurrent jam but limited total processes (example: `MAX_CONCURRENT_JAMS=2`, `MAX_TOTAL_AGENT_PROCESSES=4`), a second jam that exceeds process cap returns `code: "agent_capacity_exceeded"`
- [ ] Stopping the existing jam frees capacity and allows a new jam start

---

## Phase 9: Jam WebSocket Events (During Active Jam)

**Prerequisite:** Start a jam session (Phase 8 lifecycle tests must pass first).

Note: v2 uses a directive-driven architecture — agents respond on-demand to boss directives, plus autonomous auto-ticks every ~30s for organic evolution. WebSocket events fire per-directive AND per-tick.

### Agent Status Broadcasts
- [ ] Open browser DevTools → Network → WS tab → filter `/api/claude-ws` (jam-manager broadcasts); optionally also watch `/api/ws` for MCP bridge traffic
- [ ] When a directive is sent, `agent_status` messages appear for targeted agent(s)
- [ ] Each contains `{ agent: "drums"|"bass"|"melody"|"fx", status: "thinking"|"playing"|"idle"|"error"|"timeout" }`

### Agent Thought Broadcasts
- [ ] `agent_thought` messages appear with agent reactions
- [ ] Each contains `{ agent, emoji, thought, reaction, pattern, timestamp }`
- [ ] Agent columns show reactions inline (e.g., "🥁 BEAT: ...")

### Musical Context Updates
- [ ] Boss directives that change context (key/BPM/energy) are reflected in subsequent `jam_state_update` payloads
- [ ] `jamState.musicalContext` contains updated values (e.g., key/scale/bpm/energy)

### Jam State Broadcasts
- [ ] `jam_state_update` messages appear after agents respond to directives
- [ ] Contains full `{ jamState: {...}, combinedPattern: "stack(...)" }`

### Auto-Tick Events (Autonomous Evolution)
Every ~30 seconds, the system sends an auto-tick to all agents. This triggers the same WebSocket event types as boss directives but without user input:
- [ ] `agent_status` messages appear for ALL agents (each goes "thinking" briefly)
- [ ] `agent_thought` messages appear — agents may respond with new patterns or `no_change`
- [ ] `jam_state_update` with updated `currentRound` (round number increments per tick)
- [ ] Auto-tick resets when a boss directive is sent (avoids double-triggering)
- [ ] **`no_change` sentinel**: Agents can respond with `"no_change"` as their pattern to keep playing their current pattern — thoughts/reactions update but the pattern row stays the same

**Impact on testing:** Auto-ticks mean the system state can change without user input. Tests that assert pattern stability (e.g., Test 4.5) must complete within the ~30s tick window, or account for auto-tick changes.

### Console Health
- [ ] No WebSocket errors in console during jam
- [ ] No rapid reconnection loops
- [ ] Messages flow consistently across directives and auto-ticks

---

## Phase 10: Jam Mode UI (During Active Jam)

**Prerequisite:** Start a jam session (Phase 8 lifecycle tests must pass first). When the jam starts, the layout **switches entirely** from normal mode to jam mode.

### Layout Switch
- [ ] Clicking "Start Jam" (after agent selection) swaps normal mode layout to jam mode layout
- [ ] Terminal panel (left) disappears
- [ ] Heading ("Buttery Smooth Jamming") and Play/Stop buttons disappear from right area
- [ ] JamTopBar appears at top (Stop button, musical context, energy bar)
- [ ] Agent Columns appear in CSS grid (one column per selected agent)
- [ ] BossInputBar appears below the agent columns
- [ ] PatternDisplay appears below BossInputBar (shows per-agent patterns with emoji/names)
- [ ] StrudelPanel is **hidden** during jam mode (`h-0 overflow-hidden`) but still rendered — audio is not interrupted by layout switch

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
- [ ] Round numbers auto-increment with both boss directives and auto-ticks (~30s), so `R2` → `R5` gaps are normal
- [ ] Pattern code shown below thoughts (may be unchanged if agent responded with `no_change`)
- [ ] Reactions displayed in italics below pattern
- [ ] Boss directives shown inline in the targeted agent's column ("BOSS (to you)")

### Agent Status Lifecycle (StatusDot) — Five-State Model
The status dot in each column header reflects whether the agent is contributing sound. Five states:
- **Green** (playing) — agent has a non-silence pattern in the composed stack
- **Yellow** (thinking) — agent is processing a directive
- **Gray** (idle) — agent has no pattern yet, or pattern is `silence`
- **Red** (error) — agent process/runtime error detected
- **Orange** (timeout) — agent failed to respond and no non-silence fallback is active

Verify the full transition cycle:
- [ ] **Initial state**: Gray dot, label "idle" — shown before agents have responded
- [ ] **Thinking state**: Yellow pulsing dot, label "thinking" — shown when agent is processing a directive
- [ ] **Playing state**: Green gently-pulsing dot, label "playing" — shown after agent responds with a non-silence pattern
- [ ] **Jam start transition**: After starting a jam, all agents go yellow (thinking) → green (playing) once they respond with patterns
- [ ] **Targeted directive transition**: Send "@BEAT double time" and verify:
  - [ ] Target agent's dot turns yellow/pulsing ("thinking") immediately after sending
  - [ ] Non-targeted agents remain green ("playing") — they already have patterns
  - [ ] After agent responds (~3-15s, model/load dependent), dot returns to green ("playing")
- [ ] **Silence pattern**: If an agent returns `silence` as its pattern, dot should be gray ("idle")
- [ ] **Timeout fallback behavior**: If an agent times out but fallback/non-silence pattern exists, dot can remain green ("playing"); if not, dot should be orange ("timeout")
- [ ] **Error/timeout visibility**: In fault-injection or failure scenarios, status label should explicitly show `error` or `timeout` (not collapse to `idle`)

### BossInputBar (`data-testid="boss-input"`)
- [ ] Input field with "BOSS >" label
- [ ] Placeholder states: "Connecting..." (not connected), "Start a jam first..." (connected but not jamming), "Give a directive... (@ to mention an agent)" (jamming)
- [ ] Input is disabled when not connected or not jamming
- [ ] Send button visible (disabled when input is empty or not connected/jamming)
- [ ] Can type a directive (e.g., "@BEAT double time on the hi-hats")
- [ ] @mention syntax targets specific agents
- [ ] Send button submits directive
- [ ] Targeted directive appears in the target agent's column as "BOSS (to you)"
- [ ] Non-targeted agents see "BOSS spoke to {agent} privately." for targeted directives sent to others

### @Mention Autocomplete (MentionSuggestions)
- [ ] Typing "@" shows autocomplete dropdown with matching agents
- [ ] Dropdown filters as you type (e.g., "@B" shows BEAT only)
- [ ] ArrowUp/ArrowDown navigates suggestions
- [ ] Tab or Enter selects highlighted agent (inserts `@NAME `)
- [ ] Esc dismisses dropdown
- [ ] Clicking an agent in dropdown selects it

### PatternDisplay
- [ ] Shows each agent's current pattern with emoji and name label
- [ ] Each agent listed: 🥁 BEAT, 🎸 GROOVE, 🎹 ARIA, 🎛️ GLITCH
- [ ] Patterns shown as code (monospace)
- [ ] "silence" shown when agent has no pattern
- [ ] Collapsible via "▶ Patterns" toggle

### Returning to Normal Mode
- [ ] Clicking "Stop" (JamTopBar button) → layout switches back to normal mode
- [ ] Terminal panel reappears on left
- [ ] Heading and Play/Stop buttons reappear on right
- [ ] StrudelPanel reappears at bottom (was hidden during jam; audio continues if playing)

### Agent Context Isolation & Latency

These tests use `data-testid` attributes for reliable element targeting:
- `agent-column-{key}` — column wrapper (drums, bass, melody, fx)
- `status-label-{key}` — status text (shows "idle", "thinking", "playing", "error", or "timeout")
- `agent-messages-{key}` — message list container
- `pattern-display` — PatternDisplay container
- `pattern-row-{key}` — per-agent pattern row
- `boss-input` — the `<input>` element itself (not a wrapper — use ref directly, no descendant selectors)

**Prerequisite:** Start jam with all 4 agents, wait ~10-15s for all agents to respond with initial patterns (all status dots green/"playing").

#### Test 4.1: Context Isolation — Thoughts Don't Leak Across Columns
**Goal:** Verify that agent thoughts are isolated to their own column.

1. Send a targeted directive `@BEAT double time` via `boss-input`
2. Wait for drums status to return to "playing" (response received)
3. Use `browser_evaluate` to extract the last thought text from the drums column:
   ```javascript
   () => {
     const msgs = document.querySelector('[data-testid="agent-messages-drums"]');
     const thoughts = msgs?.querySelectorAll('p.text-gray-300');
     return thoughts?.length ? thoughts[thoughts.length - 1].textContent : null;
   }
   ```
4. For each non-targeted agent (bass, melody, fx), use `browser_evaluate` to check that text does NOT appear:
   ```javascript
   (element) => element.textContent.includes('<drums thought text>')
   ```
   on `agent-messages-{key}` for each key.
5. **Pass:** The drums thought text is NOT found in any other agent's message container.

#### Test 4.2: Composed stack() Contains All Agent Patterns
**Goal:** Verify PatternDisplay shows patterns from all active agents and the Strudel editor contains a composed `stack()`.

1. Ensure PatternDisplay is expanded (click "Patterns" toggle if collapsed)
2. Use `browser_evaluate` to read each agent's pattern:
   ```javascript
   () => {
     const keys = ['drums', 'bass', 'melody', 'fx'];
     const patterns = {};
     for (const key of keys) {
       const row = document.querySelector(`[data-testid="pattern-row-${key}"]`);
       const code = row?.querySelector('code');
       patterns[key] = code?.textContent?.trim() || null;
     }
     return patterns;
   }
   ```
3. Assert every active agent has a non-null, non-"silence" pattern string
4. Use `browser_evaluate` to read the Strudel editor content:
   ```javascript
   () => document.querySelector('.cm-content')?.textContent || ''
   ```
5. Assert editor content contains `stack(` and includes snippets from each agent's pattern
6. **Pass:** All agents have patterns AND the editor contains a composed `stack()`.

#### Test 4.3: Targeted Directive Only Sets Target to "Thinking"
**Goal:** When sending `@BEAT do a fill`, only drums goes to "thinking" — other agents stay "playing".

Use a two-phase approach to avoid Playwright command queue deadlock:

**IMPORTANT:** `page.evaluate(() => new Promise(...))` blocks Playwright's command queue — you cannot interleave it with `fill()`/`press()` calls. Instead, use a synchronous `evaluate` to set up the observer, interact with the page, then read the result.

**Phase 1:** Use `browser_evaluate` to set up MutationObserver (stores result on `window`):
```javascript
() => {
  window.__statusCapture = null;
  const drumsLabel = document.querySelector('[data-testid="status-label-drums"]');
  const observer = new MutationObserver(() => {
    if (drumsLabel.textContent === 'thinking') {
      observer.disconnect();
      const statuses = {};
      for (const key of ['drums', 'bass', 'melody', 'fx']) {
        const label = document.querySelector(`[data-testid="status-label-${key}"]`);
        statuses[key] = label?.textContent || 'not found';
      }
      window.__statusCapture = statuses;
    }
  });
  observer.observe(drumsLabel, { childList: true, characterData: true, subtree: true });
  setTimeout(() => observer.disconnect(), 30000);
  return { observerSetup: true, currentStatus: drumsLabel.textContent };
}
```

**Phase 2:** Use `browser_type` on the boss-input ref with `submit: true` to send `@BEAT do a fill`.

Note: `data-testid="boss-input"` is on the `<input>` element itself, not a wrapper — use the ref directly.

**Phase 3:** Use `browser_evaluate` to read captured statuses:
```javascript
() => window.__statusCapture
```
**Pass:** `drums === "thinking"` AND all others === `"playing"`.

#### Test 4.4: Directive-to-Response Latency Measurement
**Goal:** Measure time from directive submission to agent response and compare against historical baseline.

Use `browser_run_code` for timing:
```javascript
async (page) => {
  const start = Date.now();

  // Wait for drums to go to "thinking" first (proves directive was received)
  await page.waitForFunction(() => {
    const label = document.querySelector('[data-testid="status-label-drums"]');
    return label?.textContent === 'thinking';
  }, { timeout: 5000 }).catch(() => {});

  // Then wait for drums to return to "playing" (response received)
  await page.waitForFunction(() => {
    const label = document.querySelector('[data-testid="status-label-drums"]');
    return label?.textContent === 'playing';
  }, { timeout: 15000 });

  const latencyMs = Date.now() - start;
  return { latencyMs };
}
```
**Note:** Since Test 4.3 uses separate tool calls, drums may already be "playing" by the time this test runs. For accurate measurement, either: (1) combine with Test 4.5 by sending a fresh directive with a `browser_evaluate` timestamp before and latency check after, or (2) store `window.__directiveSentAt = Date.now()` before sending the directive and read it in the latency check. Auto-tick collisions (all agents going to "thinking" simultaneously) can inflate measurements.
**Pass (functional):** Directive completes before timeout (`AGENT_TIMEOUT_MS` is 15s).
**Performance assessment:** Log measured `latencyMs` with date/model and compare against historical references (2026-02-09 targeted: 5.3s, broadcast: 7.0s). Treat large sustained drift as regression candidate rather than immediate hard-fail on a fixed 7s SLA.

#### Test 4.5: Non-Targeted Patterns Unchanged
**Goal:** After a targeted directive, only the targeted agent's pattern changes.

1. **Before** sending a targeted directive, capture all pattern values:
   ```javascript
   () => {
     const patterns = {};
     for (const key of ['drums', 'bass', 'melody', 'fx']) {
       const row = document.querySelector(`[data-testid="pattern-row-${key}"]`);
       patterns[key] = row?.querySelector('code')?.textContent?.trim() || null;
     }
     return patterns;
   }
   ```
2. Send targeted directive `@BEAT double time` and wait for drums to return to "playing"
3. **After** response, capture all pattern values again using the same evaluate
4. Compare: non-targeted agents (bass, melody, fx) should have identical patterns before/after
5. **Pass:** `before[key] === after[key]` for all non-targeted agents. The targeted agent (drums) MAY have changed.

**Auto-tick caveat:** The system sends auto-ticks every ~30s which can change any agent's pattern. Run this test quickly after a known state change (directive response or auto-tick completion) to stay within the tick window. If a non-targeted pattern changes, verify it was due to an auto-tick (check for `agent_thought` messages on that agent) rather than directive leakage.

---

## Quick Smoke Test

Use this 15-item checklist for rapid validation:

1. [ ] App loads at localhost:3000
2. [ ] Normal mode layout: Terminal (left), content area (right), StrudelPanel (bottom)
3. [ ] Terminal panel shows the terminal header (currently `Claude Terminal` in legacy UI copy)
4. [ ] Terminal status shows "Ready" (not "Disconnected" or "Connecting...")
5. [ ] No "WebSocket connection error" banner visible
6. [ ] Strudel editor visible with code at bottom
7. [ ] Play button clickable (after enabling audio)
8. [ ] **AI terminal chat works: type message → assistant responds**
9. [ ] **Assistant can execute patterns: editor updates + audio plays**
10. [ ] No WebSocket errors in console
11. [ ] JamControls panel visible with "Start Jam" button
12. [ ] "Start Jam" button disabled when terminal is not connected, enabled when ready
13. [ ] Starting a jam → agent selection modal → layout switches to jam mode (AgentColumns + BossInputBar)
14. [ ] Agent columns show thoughts/reactions per agent, PatternDisplay shows patterns with emoji/names
15. [ ] Stopping jam (via "Stop" button in JamTopBar) → layout reverts to normal mode

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
