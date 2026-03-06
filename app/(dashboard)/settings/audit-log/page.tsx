'use client';

import { useState, useEffect } from 'react';
import { ClipboardList, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/utils';

const ACTION_COLORS: Record<string, string> = {
  READ: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  CREATE: 'bg-green-500/10 text-green-400 border-green-500/20',
  UPDATE: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  DELETE: 'bg-red-500/10 text-red-400 border-red-500/20',
  LOGIN: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  LOGOUT: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  EXPORT: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (action) params.set('action', action);
      if (resource) params.set('resource', resource);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/audit-log?${params}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setPagination(data.pagination || {});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [page, action, resource, dateFrom, dateTo]);

  const clearFilters = () => {
    setAction(''); setResource(''); setDateFrom(''); setDateTo(''); setPage(1);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Complete record of all user actions and data access
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={action} onValueChange={(v) => { setAction(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {Object.keys(ACTION_COLORS).map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Filter by resource..."
          value={resource}
          onChange={(e) => { setResource(e.target.value); setPage(1); }}
          className="w-48 h-8 text-xs"
        />

        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="w-36 h-8 text-xs"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="w-36 h-8 text-xs"
        />

        {(action || resource || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 text-xs">
            <X className="w-3 h-3" />
            Clear
          </Button>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Timestamp</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Action</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Resource</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Details</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden xl:table-cell">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No audit log entries found</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-muted-foreground">
                        {formatDateTime(log.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-xs font-medium">{log.user?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{log.user?.role}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ACTION_COLORS[log.action] || 'bg-muted text-muted-foreground border-border'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-xs font-medium">{log.resource}</span>
                        {log.resourceId && (
                          <p className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                            {log.resourceId}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {log.details && (
                        <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px] block">
                          {JSON.stringify(log.details).slice(0, 60)}...
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-xs text-muted-foreground font-mono">{log.ipAddress || '—'}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {pagination.total?.toLocaleString()} total entries
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="xs" onClick={() => setPage(page - 1)} disabled={!pagination.hasPrev}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs px-2">Page {page} of {pagination.totalPages}</span>
              <Button variant="outline" size="xs" onClick={() => setPage(page + 1)} disabled={!pagination.hasNext}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
