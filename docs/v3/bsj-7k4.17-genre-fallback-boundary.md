# bsj-7k4.17 — Move Genre-Energy Generic Fallback Out of Runtime

**Parent epic**: `bsj-7k4` (Model-driven Musical Policy via Skills)
**Classification**: B (model-owned) — GEG-01
**Runtime behavior change**: None (identical fallback content, different source)

## Summary

`GENERIC_GUIDANCE` in `lib/genre-energy-guidance.ts` was a hardcoded TS constant
containing role-specific energy guidance for drums, bass, melody, and chords. The
hardcoding audit classified this as B (model-owned): pure musical guidance text
that belongs in the skill file alongside the 16 named genres it already hosts.

## What Changed

### Skill file
- Appended `## Generic` section to `.codex/skills/genre-energy-guidance/SKILL.md`
  with 4 roles × 3 energy bands (identical content to the deleted constant)

### Runtime
- Deleted `GENERIC_GUIDANCE` constant from `lib/genre-energy-guidance.ts`
- Updated fallback chain: `genreMap?.get(role) ?? guidance.get('generic')?.get(role) ?? []`
- Generic guidance is now parsed from SKILL.md like every other genre

### Tests (2 new)
1. **Known genre**: "jazz" + "drums" returns Jazz-specific lines from skill
2. **Unknown genre**: "nonexistent" + "drums" falls back to Generic section lines

## Fallback Chain

```
genre found in SKILL.md?
  ├─ yes → use genre-specific guidance for role
  └─ no  → "generic" section found in SKILL.md?
              ├─ yes → use generic guidance for role
              └─ no  → empty string (graceful degradation)
```

## Cross-References

- [Model Policy Boundary](./model-policy-boundary.md) — boundary matrix
- [Hardcoding Audit](./hardcoding-audit-bsj-7k4.8.md) — GEG-01 classification
- [Validation Gate](./bsj-7k4.10-validation-gate.md) — epic completion checklist
- `.codex/skills/genre-energy-guidance/SKILL.md` — all genre guidance (including Generic)
- `lib/genre-energy-guidance.ts` — runtime bridge
- `lib/__tests__/genre-energy-guidance.test.ts` — 2 tests
