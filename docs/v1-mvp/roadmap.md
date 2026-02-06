# Roadmap: Optional Features

Features not yet built. Add only when genuinely needed.

## Feature Backlog

| Feature | When to Build | Considerations |
|---------|---------------|----------------|
| **Pattern Persistence** | When saving patterns becomes essential | Add Prisma + SQLite; consider pattern versioning |
| **Session Management** | When conversation continuity is needed | Track user sessions; reconnection handling |
| **Audio Recording** | When exporting audio is needed | MediaRecorder API; file format choices |
| **Learning Features** | When structured learning is needed | Curriculum design; progress tracking UI |

## Pattern Persistence

**Problem:** Patterns are lost on page refresh.

**Solution:** Add Prisma with SQLite for local persistence.

```
Future files:
├── prisma/
│   └── schema.prisma
├── lib/
│   └── db.ts
```

**When:** Users request saving/loading patterns.

## Session Management

**Problem:** No continuity between browser sessions.

**Solution:** Session tokens + localStorage or cookies.

**When:** Users want to resume conversations.

## Audio Recording

**Problem:** Can't export created music.

**Solution:** MediaRecorder API to capture audio output.

```typescript
// Future implementation sketch
const mediaRecorder = new MediaRecorder(audioContext.destination);
mediaRecorder.start();
// ... later
mediaRecorder.stop();
// Export as WAV/MP3
```

**When:** Users want to share their creations.

## Learning Features

**Problem:** No structured progression for learning Strudel.

**Solution:**
- Curriculum with lessons
- Progress tracking
- Skill assessments

**When:** Educational use case becomes primary.

---

## Design Principle

> **"Only build what directly contributes to the core goal."**

Each feature should be validated with real user need before implementation. The MVP demonstrates the core value proposition; these features enhance it but aren't essential.
