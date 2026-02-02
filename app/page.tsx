export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">CC Sick Beats</h1>
      <p className="text-gray-400 text-lg">
        AI-assisted live coding music with Strudel
      </p>
      <div className="mt-8 p-4 bg-gray-800 rounded-lg">
        <p className="text-green-400 font-mono text-sm">
          Setup complete. Ready for Strudel integration.
        </p>
      </div>
    </main>
  );
}
