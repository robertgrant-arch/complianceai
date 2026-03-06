'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, ArrowRight, TrendingUp, TrendingDown, Minus, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScoreGauge } from '@/components/shared/score-gauge';
import { getScoreBg } from '@/lib/utils';

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [days, setDays] = useState(30);

  useEffect(() => {
    const fetchAgents = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/agents?days=${days}`);
        const data = await res.json();
        setAgents(data.agents || []);
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, [days]);

  const filtered = agents.filter((a) =>
    a.agentName.toLowerCase().includes(search.toLowerCase()) ||
    a.agentId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Scorecards</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{agents.length} agents tracked</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                days === d ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search agents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((agent) => (
            <Link key={agent.agentId} href={`/agents/${agent.agentId}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center mb-2">
                        <span className="text-sm font-bold text-blue-400">
                          {agent.agentName.charAt(0)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-sm">{agent.agentName}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{agent.agentId}</p>
                    </div>
                    {agent.avgScore !== null && (
                      <ScoreGauge score={agent.avgScore} size="sm" showLabel={false} />
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center">
                      <p className="text-lg font-bold">{agent.totalCalls}</p>
                      <p className="text-xs text-muted-foreground">Calls</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-lg font-bold ${agent.avgScore !== null ? (agent.avgScore >= 80 ? 'text-green-400' : agent.avgScore >= 65 ? 'text-yellow-400' : 'text-red-400') : 'text-muted-foreground'}`}>
                        {agent.avgScore ?? '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">Avg Score</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-red-400">{agent.criticalFlags}</p>
                      <p className="text-xs text-muted-foreground">Critical</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Compliance: <span className={agent.avgComplianceScore >= 80 ? 'text-green-400' : agent.avgComplianceScore >= 65 ? 'text-yellow-400' : 'text-red-400'}>{agent.avgComplianceScore ?? '—'}</span></span>
                    <span>Tone: <span className={agent.avgToneScore >= 80 ? 'text-green-400' : agent.avgToneScore >= 65 ? 'text-yellow-400' : 'text-red-400'}>{agent.avgToneScore ?? '—'}</span></span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No agents found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
