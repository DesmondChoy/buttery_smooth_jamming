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

### Layout Structure
- [ ] Main heading/logo visible
- [ ] Strudel editor container present
- [ ] Control buttons visible (play/stop)

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

## Phase 5: Terminal Panel

### Layout
- [ ] Terminal panel visible on left side (1/3 width)
- [ ] Strudel editor on right side (2/3 width)
- [ ] Two-panel layout renders correctly

### Header
- [ ] Header shows "Claude Terminal" title
- [ ] Status indicator visible (dot + text)
- [ ] Ctrl+L hint displayed for clearing

### Content Area
- [ ] Empty state message: "Ask Claude to create music patterns"
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
- [ ] Full layout renders correctly
- [ ] All controls accessible
- [ ] Editor has adequate space
- [ ] Terminal panel and editor side-by-side

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

## Quick Smoke Test

Use this 10-item checklist for rapid validation:

1. [ ] App loads at localhost:3000
2. [ ] Two-panel layout renders (Terminal left, Editor right)
3. [ ] Terminal panel shows "Claude Terminal" header
4. [ ] Terminal status shows "Ready" (not "Disconnected" or "Connecting...")
5. [ ] No "WebSocket connection error" banner visible
6. [ ] Strudel editor visible with code
7. [ ] Play button clickable (after enabling audio)
8. [ ] **Claude Terminal chat works: type message → Claude responds**
9. [ ] **Claude can execute patterns: editor updates + audio plays**
10. [ ] No WebSocket errors in console

Items 8 and 9 are the most critical - they test the complete integration.

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
