'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, Phone, AlertTriangle, Ban, FileCheck } from 'lucide-react';

interface DncEntry {
  id: string;
  phone: string;
  source: string;
  reason?: string;
  addedBy?: string;
  createdAt: string;
}

interface PreDialCheck {
  id: string;
  phone: string;
  allowed: boolean;
  violations: any[];
  checkedAt: string;
}

export default function CompliancePage() {
  const [dncEntries, setDncEntries] = useState<DncEntry[]>([]);
  const [recentChecks, setRecentChecks] = useState<PreDialCheck[]>([]);
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<'dnc' | 'checks'>('dnc');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [dncRes, checksRes] = await Promise.all([
      fetch('/api/compliance/dnc'),
      fetch('/api/compliance/pre-dial-check'),
    ]);
    const dncData = await dncRes.json();
    const checksData = await checksRes.json();
    setDncEntries(dncData.entries ?? []);
    setRecentChecks(checksData.checks ?? []);
    setLoading(false);
  }

  async function addToDnc() {
    if (!newPhone.trim()) return;
    setAdding(true);
    await fetch('/api/compliance/dnc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: newPhone, reason: newReason }),
    });
    setNewPhone('');
    setNewReason('');
    setAdding(false);
    fetchData();
  }

  async function removeFromDnc(phone: string) {
    await fetch(`/api/compliance/dnc?phone=${encodeURIComponent(phone)}`, { method: 'DELETE' });
    fetchData();
  }

  const blockedCount = recentChecks.filter(c => !c.allowed).length;
  const allowedCount = recentChecks.filter(c => c.allowed).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Compliance Controls</h1>
        <p className="text-gray-400 text-sm mt-1">DNC list management, pre-dial checks, and consent tracking</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1"><Ban className="w-4 h-4 text-red-400" /><span className="text-gray-400 text-xs">DNC Entries</span></div>
          <p className="text-2xl font-bold text-white">{dncEntries.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1"><Phone className="w-4 h-4 text-blue-400" /><span className="text-gray-400 text-xs">Recent Checks</span></div>
          <p className="text-2xl font-bold text-white">{recentChecks.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1"><ShieldCheck className="w-4 h-4 text-green-400" /><span className="text-gray-400 text-xs">Allowed</span></div>
          <p className="text-2xl font-bold text-green-400">{allowedCount}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-yellow-400" /><span className="text-gray-400 text-xs">Blocked</span></div>
          <p className="text-2xl font-bold text-red-400">{blockedCount}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700">
        <button onClick={() => setTab('dnc')} className={`px-4 py-2 text-sm font-medium ${ tab === 'dnc' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}>DNC List</button>
        <button onClick={() => setTab('checks')} className={`px-4 py-2 text-sm font-medium ${ tab === 'checks' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-white'}`}>Pre-Dial Checks</button>
      </div>

      {tab === 'dnc' && (
        <div className="space-y-4">
          {/* Add to DNC */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-white font-semibold mb-3">Add to DNC List</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Phone number"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-lg text-sm outline-none"
              />
              <input
                type="text"
                placeholder="Reason (optional)"
                value={newReason}
                onChange={e => setNewReason(e.target.value)}
                className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-lg text-sm outline-none"
              />
              <button
                onClick={addToDnc}
                disabled={adding || !newPhone.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>

          {/* DNC Table */}
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-700">
                <tr>
                  <th className="text-left text-gray-300 px-4 py-3">Phone</th>
                  <th className="text-left text-gray-300 px-4 py-3">Source</th>
                  <th className="text-left text-gray-300 px-4 py-3">Reason</th>
                  <th className="text-left text-gray-300 px-4 py-3">Added</th>
                  <th className="text-left text-gray-300 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-8">Loading...</td></tr>
                ) : dncEntries.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-8">No DNC entries</td></tr>
                ) : dncEntries.map(entry => (
                  <tr key={entry.id} className="border-t border-gray-700 hover:bg-gray-750">
                    <td className="px-4 py-3 text-white font-mono">{entry.phone}</td>
                    <td className="px-4 py-3 text-gray-300">{entry.source}</td>
                    <td className="px-4 py-3 text-gray-400">{entry.reason ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{new Date(entry.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => removeFromDnc(entry.phone)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'checks' && (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left text-gray-300 px-4 py-3">Phone</th>
                <th className="text-left text-gray-300 px-4 py-3">Result</th>
                <th className="text-left text-gray-300 px-4 py-3">Violations</th>
                <th className="text-left text-gray-300 px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center text-gray-400 py-8">Loading...</td></tr>
              ) : recentChecks.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-gray-400 py-8">No checks yet</td></tr>
              ) : recentChecks.map(check => (
                <tr key={check.id} className="border-t border-gray-700">
                  <td className="px-4 py-3 text-white font-mono">{check.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${ check.allowed ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                      {check.allowed ? 'ALLOWED' : 'BLOCKED'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {(check.violations as any[]).length > 0
                      ? (check.violations as any[]).map((v: any) => v.code).join(', ')
                      : 'None'
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-400">{new Date(check.checkedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
