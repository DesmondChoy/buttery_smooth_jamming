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

## Phase 4: WebSocket Integration

### Strudel MCP Connection
- [ ] Strudel MCP WebSocket connects on load
- [ ] Pattern updates from MCP reflected in editor
- [ ] Audio responds to MCP execute_pattern commands

### Claude WebSocket Connection
- [ ] Terminal panel shows connection status indicator
- [ ] Status transitions: Connecting → Ready (within ~3 seconds)
- [ ] No rapid reconnection loop (client IDs should stabilize, not increment endlessly)
- [ ] Reconnection attempts on disconnect (up to 5 retries with exponential backoff)
- [ ] Error message displayed after max reconnection failures

### Claude Terminal Interaction
- [ ] Can type message in terminal input
- [ ] Enter key sends message to Claude
- [ ] User message appears in terminal (prefixed with ">")
- [ ] Claude response appears after a few seconds
- [ ] Tool use displays (e.g., "[mcp__strudel__execute_pattern]")
- [ ] Claude can execute patterns that play audio

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
4. [ ] Terminal status indicator visible
5. [ ] Strudel editor visible with code
6. [ ] Can type in the editor
7. [ ] Play button clickable
8. [ ] Stop button clickable
9. [ ] No console errors on load
10. [ ] No console errors after play/stop

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
