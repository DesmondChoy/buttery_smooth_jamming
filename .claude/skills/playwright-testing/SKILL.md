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
- [ ] Layout is responsive to viewport

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

### Error Handling
- [ ] Invalid code shows error message
- [ ] Error message is user-friendly
- [ ] Can recover from errors by fixing code
- [ ] App doesn't crash on syntax errors

---

## Phase 4: WebSocket Integration (Future)

### Connection Status
- [ ] WebSocket connection indicator visible (if implemented)
- [ ] Shows connected/disconnected state
- [ ] Reconnects automatically on disconnect

### MCP Commands (Future)
- [ ] Can receive pattern updates from MCP
- [ ] Editor updates when receiving new patterns
- [ ] Audio responds to remote commands

---

## Phase 5: Chat Panel (Future)

### Layout
- [ ] Chat panel visible alongside editor
- [ ] Proper split/resize behavior
- [ ] Panel can be collapsed/expanded

### Messages
- [ ] Can send messages
- [ ] Messages display in chat history
- [ ] AI responses render correctly

---

## Phase 6: Responsive Layout

### Desktop (1280px+)
- [ ] Full layout renders correctly
- [ ] All controls accessible
- [ ] Editor has adequate space

### Tablet (1024px)
- [ ] Layout adapts appropriately
- [ ] Controls remain accessible
- [ ] No horizontal overflow

### Mobile (768px and below)
- [ ] Layout stacks vertically (if applicable)
- [ ] Touch targets are adequate size
- [ ] Editor remains usable

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

Use this 8-item checklist for rapid validation:

1. [ ] App loads at localhost:3000
2. [ ] Strudel editor visible with code
3. [ ] Can type in the editor
4. [ ] Play button clickable
5. [ ] Stop button clickable
6. [ ] No console errors on load
7. [ ] No console errors after play/stop
8. [ ] Code changes persist in editor

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
