export default function SettingsPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Application</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Version</dt>
            <dd className="text-gray-900 font-medium">0.1.0</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Environment</dt>
            <dd className="text-gray-900 font-medium">{process.env.NODE_ENV ?? "development"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
