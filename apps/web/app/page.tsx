export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">Content Factory</h1>
      <p className="text-lg text-gray-600 mb-8">
        AI-Powered SEO Content Production Platform
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Client Management</h2>
          <p className="text-gray-600 text-sm">
            Onboard SEO clients and manage their content pipelines.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Content Pipeline</h2>
          <p className="text-gray-600 text-sm">
            Kanban board for article production from suggestion to delivery.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-2">AI Agents</h2>
          <p className="text-gray-600 text-sm">
            6 configurable AI agents for analysis, writing, and image generation.
          </p>
        </div>
      </div>
    </main>
  );
}
