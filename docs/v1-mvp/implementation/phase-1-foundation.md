# Phase 1: Foundation + Strudel Test ✅

**Goal:** Next.js app that loads Strudel and plays audio.

## Files Created

```
cc_sick_beats/
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── .gitignore
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   └── StrudelEditor.tsx
└── types/
    └── strudel.d.ts           # Type definitions for Strudel web component
```

## Design Decision

**Why no monorepo?** Start simple. Add Turborepo later if needed.

## Key Code: StrudelEditor.tsx

```tsx
'use client';
import { useEffect, useRef } from 'react';

interface StrudelEditorElement extends HTMLElement {
  editor: {
    setCode: (code: string) => void;
    evaluate: (autostart?: boolean) => void;
    stop: () => void;
    code: string;
  };
}

export function StrudelEditor({ initialCode, onReady, onError, className }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function initStrudel() {
      await import('@strudel/repl');
      const strudelEditor = document.createElement('strudel-editor');
      if (initialCode) strudelEditor.setAttribute('code', initialCode);
      containerRef.current?.appendChild(strudelEditor);
      // Poll for editor ready state with timeout
    }
    initStrudel();
  }, []);

  return <div ref={containerRef} className={className} />;
}
```

### Key Implementation Details

1. **Dynamic Import**: `@strudel/repl` is imported dynamically to avoid SSR issues
2. **Web Component**: Strudel provides a `<strudel-editor>` custom element
3. **Editor Interface**: Access via `element.editor` for `setCode`, `evaluate`, `stop`
4. **Polling**: Editor readiness is detected by polling (not event-based)

## Verification Steps

1. `npm install && npm run dev`
2. Strudel editor renders in browser
3. Click play → audio works

## Dependencies Added

```json
{
  "@strudel/repl": "^1.x",
  "next": "^14.x",
  "react": "^18.x",
  "tailwindcss": "^3.x"
}
```

## Gotchas Discovered

- Must use `'use client'` directive for Strudel components
- Type definitions needed for the web component interface
- Audio requires user gesture (handled in Phase 3)
