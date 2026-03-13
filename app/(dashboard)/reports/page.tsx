"use client";

import { useState } from "react";

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [exporting, setExporting] = useState(false);

  async function exportCases() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (dateRange.from) params.set("from", dateRange.from);
      if (dateRange.to) params.set("to", dateRange.to);
      const res = await fetch(`/api/export/cases?${params}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
    }
    setExporting(false);
  }

  const reports = [
    { name: "Compliance Cases", description: "Export all compliance check results with violations", action: exportCases },
    { name: "DNC Registry", description: "Export current Do Not Call list entries", action: exportCases },
    { name: "Scorecard Summary", description: "Export QA scorecard results by agent", action: exportCases },
    { name: "Coaching Activity", description: "Export coaching task completion rates", action: exportCases },
    { name: "Consent Audit Log", description: "Export consent events for regulatory audit", action: exportCases },
    { name: "Alert History", description: "Export triggered alert history", action: exportCases },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Reports & Exports</h1>
        <p className="text-gray-400 text-sm">Generate and download compliance reports</p>
      </div>

      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <h2 className="text-white font-medium mb-3">Date Range</h2>
        <div className="flex gap-3 items-center">
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
            className="bg-gray-700 text-white px-3 py-2 rounded text-sm"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
            className="bg-gray-700 text-white px-3 py-2 rounded text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((report) => (
          <div key={report.name} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium">{report.name}</h3>
              <p className="text-gray-400 text-xs mt-1">{report.description}</p>
            </div>
            <button
              onClick={report.action}
              disabled={exporting}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm whitespace-nowrap"
            >
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
