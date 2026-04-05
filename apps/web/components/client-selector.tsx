"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  listClients,
  getActiveClientId,
  setActiveClientId,
  type Client,
} from "../lib/api";

export function ClientSelector() {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setActiveId(getActiveClientId());
    listClients()
      .then((r) => setClients(r.clients.filter((c) => c.active)))
      .catch(() => {});
  }, []);

  function select(id: string | null) {
    setActiveClientId(id);
    setActiveId(id);
    setOpen(false);
  }

  const active = clients.find((c) => c.id === activeId);

  return (
    <div className="relative px-3 py-2 border-b border-gray-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100 transition-colors"
      >
        <span className="truncate text-gray-700 font-medium">
          {active ? active.name : "Select client…"}
        </span>
        <svg
          className={`ml-2 h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
          {clients.length === 0 && (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">
              No clients yet.{" "}
              <Link href="/clients" className="text-blue-600 hover:underline">
                Create one
              </Link>
            </div>
          )}
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => select(c.id)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors ${
                c.id === activeId ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
              }`}
            >
              <span className="truncate">{c.name}</span>
              {c.id === activeId && (
                <svg className="ml-auto h-4 w-4 shrink-0 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
          {activeId && (
            <>
              <div className="border-t border-gray-100" />
              <button
                onClick={() => select(null)}
                className="w-full px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 text-left transition-colors"
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
