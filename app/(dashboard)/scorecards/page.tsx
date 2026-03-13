"use client";

import { useState, useEffect } from "react";

interface Scorecard {
  id: string;
  callId: string;
  agentName: string;
  phone: string;
  overallScore: number;
  categories: { name: string; score: number; maxScore: number }[];
  status: string;
  reviewedBy: string | null;
  createdAt: string;
}

export default function ScorecardsPage() {
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchScorecards();
  }, [statusFilter]);

  async function fetchScorecards() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    const res = await fetch(`/api/scorecards?${params}`);
    const data = await res.json();
    setScorecards(data.scorecards || []);
    setLoading(false);
  }

  async function overrideScore(id: string, newScore: number) {
    await fetch("/api/calls/qa-override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scorecardId: id, overallScore: newScore, reason: "Manual QA review" }),
    });
    fetchScorecards();
  }

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const avgScore = scorecards.length > 0
    ? Math.round(scorecards.reduce((sum, s) => sum + s.overallScore, 0) / scorecards.length)
    : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">QA Scorecards</h1>
          <p className="text-gray-400 text-sm">Review and manage call quality scores</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-xs">Total Scorecards</p>
          <p className="text-2xl font-bold text-white">{scorecards.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-xs">Average Score</p>
          <p className={`text-2xl font-bold ${scoreColor(avgScore)}`}>{avgScore}%</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-xs">Needs Review</p>
          <p className="text-2xl font-bold text-yellow-400">
            {scorecards.filter((s) => s.status === "PENDING_REVIEW").length}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {["all", "AUTO_SCORED", "PENDING_REVIEW", "REVIEWED", "OVERRIDDEN"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded text-xs font-medium ${
              statusFilter === s ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {s === "all" ? "All" : s.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-700">
            <tr>
              <th className="text-left text-gray-300 px-4 py-3">Agent</th>
              <th className="text-left text-gray-300 px-4 py-3">Phone</th>
              <th className="text-left text-gray-300 px-4 py-3">Score</th>
              <th className="text-left text-gray-300 px-4 py-3">Status</th>
              <th className="text-left text-gray-300 px-4 py-3">Date</th>
              <th className="text-left text-gray-300 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center text-gray-400 py-8">Loading...</td></tr>
            ) : scorecards.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-gray-400 py-8">No scorecards yet</td></tr>
            ) : scorecards.map((sc) => (
              <tr key={sc.id} className="border-t border-gray-700">
                <td className="px-4 py-3 text-white">{sc.agentName}</td>
                <td className="px-4 py-3 text-white font-mono">{sc.phone}</td>
                <td className="px-4 py-3">
                  <span className={`font-bold ${scoreColor(sc.overallScore)}`}>{sc.overallScore}%</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    sc.status === "REVIEWED" ? "bg-green-900 text-green-300" :
                    sc.status === "OVERRIDDEN" ? "bg-purple-900 text-purple-300" :
                    "bg-yellow-900 text-yellow-300"
                  }`}>
                    {sc.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(sc.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {sc.status !== "REVIEWED" && (
                    <button
                      onClick={() => {
                        const score = prompt("Enter new score (0-100):");
                        if (score) overrideScore(sc.id, parseInt(score));
                      }}
                      className="text-blue-400 hover:text-blue-300 text-xs"
                    >
                      Override
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
