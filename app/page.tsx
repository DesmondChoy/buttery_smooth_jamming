'use client';

import dynamic from 'next/dynamic';

const StrudelEditor = dynamic(
  () => import('@/components/StrudelEditor'),
  { ssr: false }
);

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <h1 className="text-4xl font-bold mb-4">CC Sick Beats</h1>
      <p className="text-gray-400 text-lg mb-8">
        AI-assisted live coding music with Strudel
      </p>
      <div className="w-full max-w-4xl">
        <StrudelEditor
          initialCode={`// Welcome to CC Sick Beats!
// Press play or Ctrl+Enter to start
note("c3 e3 g3 c4").sound("piano")`}
          onReady={(editor) => {
            console.log('Strudel editor ready:', editor);
          }}
          className="rounded-lg overflow-hidden"
        />
      </div>
    </main>
  );
}
