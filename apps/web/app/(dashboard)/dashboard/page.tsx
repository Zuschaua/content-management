"use client";

import { useEffect, useState } from "react";
import { getDashboardStats, type DashboardStats } from "@/lib/api";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch(() => {
        // leave stats null — display "—" on error
      });
  }, []);

  const fmt = (n: number | undefined) =>
    n !== undefined ? String(n) : "—";

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="Active Clients" value={stats ? fmt(stats.activeClients) : "—"} />
        <StatCard label="Articles in Progress" value={stats ? fmt(stats.articlesInProgress) : "—"} />
        <StatCard label="Ready to Export" value={stats ? fmt(stats.readyToExport) : "—"} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
