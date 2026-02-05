# Technical Notes

Critical gotchas discovered during implementation. **Reference this first when debugging.**

---

## 1. No API Keys Required

This project uses **Claude Code (CLI)** directly, not the Anthropic API. Claude Code auto-discovers the MCP server from `.mcp.json` at the project root.

## 2. Strudel SSR Incompatibility

Strudel uses browser APIs not available during server-side rendering.

**Solution:** Use `'use client'` directive + dynamic imports:
```tsx
const StrudelPanel = dynamic(() => import('@/components/StrudelPanel'), { ssr: false });
```

## 3. Browser Audio Context

Browsers require a user gesture before playing audio.

**Solution:** `AudioStartButton` component that unlocks audio on first click.

## 4. next-ws WebSocket Setup

Use the `next-ws` package with a `SOCKET` export (not `UPGRADE`).

**Critical:** Run `npx next-ws-cli@latest patch` after `npm install`.

## 5. AGPL License

Strudel is AGPL-licensed. This project must be open source.

## 6. Connection Timeout

MCP server uses a 5-second WebSocket connection timeout to prevent hanging.

```typescript
const CONNECTION_TIMEOUT_MS = 5000;
```

## 7. Strudel Visualizations

Strudel's default visualizations create full-screen canvas overlays.

**Solution:** CSS to hide them:
```css
/* In globals.css */
canvas[style*="position: fixed"] { display: none !important; }
```

## 8. Claude CLI Stream-JSON Format

User messages must follow the exact format:
```typescript
// ✅ Correct
{ type: 'user', message: { role: 'user', content: text } }

// ❌ Wrong
{ type: 'user', content: text }
```

## 9. React StrictMode WebSocket

StrictMode mounts, unmounts, then remounts components in development.

**Solution:** Add a delay before spawning processes:
```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    // Spawn WebSocket connection
  }, 100);
  return () => clearTimeout(timer);
}, []);
```

## 10. useCallback Dependencies

Avoid putting state in WebSocket callback dependencies.

**Problem:** State changes trigger new callbacks, causing reconnection loops.

**Solution:** Use refs instead:
```typescript
const messagesRef = useRef(messages);
messagesRef.current = messages;

const onMessage = useCallback((msg) => {
  // Use messagesRef.current instead of messages
}, []); // Empty deps - stable callback
```

---

## Quick Reference Table

| Issue | Symptom | Fix |
|-------|---------|-----|
| No audio | Silent playback | Check AudioStartButton clicked |
| SSR error | "window not defined" | Add `'use client'` + dynamic import |
| WebSocket fails | Connection refused | Run `npx next-ws-cli@latest patch` |
| Claude can't connect | MCP not found | Check `.mcp.json` at project root |
| Reconnection loop | Constant WebSocket reconnects | Check useCallback dependencies |
| Full-screen canvas | Strudel viz blocking UI | Add CSS hiding rules |
