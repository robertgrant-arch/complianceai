"use client";

import { useState, useEffect } from "react";

interface CoachingTask {
  id: string;
  agentId: string;
  agentName: string;
  type: string;
  title: string;
  description: string;
  status: string;
  dueDate: string;
  completedAt: string | null;
}

export default function CoachingPage() {
  const [tasks, setTasks] = useState<CoachingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({
    agentId: "",
    type: "REVIEW_CALL",
    title: "",
    description: "",
    dueDate: "",
  });

  useEffect(() => {
    fetchTasks();
  }, [filter]);

  async function fetchTasks() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    const res = await fetch(`/api/coaching?${params}`);
    const data = await res.json();
    setTasks(data.tasks || []);
    setLoading(false);
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/coaching", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm({ agentId: "", type: "REVIEW_CALL", title: "", description: "", dueDate: "" });
    fetchTasks();
  }

  async function completeTask(id: string) {
    await fetch("/api/coaching", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "COMPLETED" }),
    });
    fetchTasks();
  }

  const statusColor = (s: string) => {
    if (s === "COMPLETED") return "bg-green-900 text-green-300";
    if (s === "IN_PROGRESS") return "bg-blue-900 text-blue-300";
    if (s === "OVERDUE") return "bg-red-900 text-red-300";
    return "bg-yellow-900 text-yellow-300";
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Coaching Tasks</h1>
          <p className="text-gray-400 text-sm">Assign and track agent coaching activities</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          + New Task
        </button>
      </div>

      {showForm && (
        <form onSubmit={createTask} className="bg-gray-800 rounded-lg p-4 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Agent ID"
              value={form.agentId}
              onChange={(e) => setForm({ ...form, agentId: e.target.value })}
              className="bg-gray-700 text-white px-3 py-2 rounded text-sm"
              required
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="bg-gray-700 text-white px-3 py-2 rounded text-sm"
            >
              <option value="REVIEW_CALL">Review Call</option>
              <option value="TRAINING">Training</option>
              <option value="SHADOW_SESSION">Shadow Session</option>
              <option value="SCRIPT_PRACTICE">Script Practice</option>
            </select>
            <input
              placeholder="Task title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="bg-gray-700 text-white px-3 py-2 rounded text-sm col-span-2"
              required
            />
            <textarea
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="bg-gray-700 text-white px-3 py-2 rounded text-sm col-span-2"
            />
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="bg-gray-700 text-white px-3 py-2 rounded text-sm"
              required
            />
            <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm">
              Create Task
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-2 mb-4">
        {["all", "PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded text-xs font-medium ${
              filter === s ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
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
              <th className="text-left text-gray-300 px-4 py-3">Task</th>
              <th className="text-left text-gray-300 px-4 py-3">Type</th>
              <th className="text-left text-gray-300 px-4 py-3">Status</th>
              <th className="text-left text-gray-300 px-4 py-3">Due</th>
              <th className="text-left text-gray-300 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center text-gray-400 py-8">Loading...</td></tr>
            ) : tasks.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-gray-400 py-8">No coaching tasks</td></tr>
            ) : tasks.map((task) => (
              <tr key={task.id} className="border-t border-gray-700">
                <td className="px-4 py-3 text-white">{task.agentName || task.agentId}</td>
                <td className="px-4 py-3 text-white">{task.title}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{task.type.replace("_", " ")}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor(task.status)}`}>
                    {task.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(task.dueDate).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  {task.status !== "COMPLETED" && (
                    <button
                      onClick={() => completeTask(task.id)}
                      className="text-green-400 hover:text-green-300 text-xs"
                    >
                      Complete
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
