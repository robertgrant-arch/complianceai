'use client';

import { useState, useEffect } from 'react';
import { Archive, AlertTriangle, Trash2, Loader2, Save, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

export default function RetentionPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [form, setForm] = useState({
    retentionDays: 365,
    deleteAudio: false,
    deleteTranscripts: false,
  });

  const fetchData = async () => {
    try {
      const res = await fetch('/api/retention');
      const json = await res.json();
      setData(json);
      setForm({
        retentionDays: json.policy.retentionDays,
        deleteAudio: json.policy.deleteAudio,
        deleteTranscripts: json.policy.deleteTranscripts,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    if (form.retentionDays < 30) {
      toast.error('Minimum retention period is 30 days');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Retention policy saved');
      fetchData();
    } catch {
      toast.error('Failed to save retention policy');
    } finally {
      setSaving(false);
    }
  };

  const handlePurge = async () => {
    if (!confirm(`This will permanently delete audio files for ${data?.stats?.affectedByRetention} calls older than ${form.retentionDays} days. This cannot be undone. Continue?`)) return;
    setPurging(true);
    try {
      const res = await fetch('/api/retention', { method: 'DELETE' });
      const result = await res.json();
      toast.success(`Purged ${result.purgedCount} records, deleted ${result.audioDeleted} audio files`);
      fetchData();
    } catch {
      toast.error('Purge failed');
    } finally {
      setPurging(false);
    }
  };

  if (loading) {
    return <div className="h-64 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Retention Policy</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure how long call recordings and data are retained
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{data?.stats?.totalCalls?.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Calls</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{data?.stats?.callsWithAudio?.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">With Audio</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className={`text-2xl font-bold ${data?.stats?.affectedByRetention > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
              {data?.stats?.affectedByRetention?.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Eligible for Purge</p>
          </CardContent>
        </Card>
      </div>

      {/* Policy settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Archive className="w-4 h-4" />
            Retention Settings
          </CardTitle>
          <CardDescription>
            Data older than the retention period will be eligible for purging
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Retention Period (days)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="30"
                max="3650"
                value={form.retentionDays}
                onChange={(e) => setForm((p) => ({ ...p, retentionDays: parseInt(e.target.value) || 365 }))}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">
                Cutoff: {data?.policy?.cutoffDate ? formatDate(data.policy.cutoffDate) : '—'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Minimum 30 days. Recommended: 365 days for compliance.</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">Delete Audio Recordings</p>
                <p className="text-xs text-muted-foreground">Remove .wav files from S3 storage after retention period</p>
              </div>
              <Switch
                checked={form.deleteAudio}
                onCheckedChange={(v) => setForm((p) => ({ ...p, deleteAudio: v }))}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">Delete Transcripts</p>
                <p className="text-xs text-muted-foreground">Remove transcript data from database after retention period</p>
              </div>
              <Switch
                checked={form.deleteTranscripts}
                onCheckedChange={(v) => setForm((p) => ({ ...p, deleteTranscripts: v }))}
              />
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300">
              Call metadata (agent, duration, scores) is always retained for reporting purposes.
              Only audio files and transcript text are deleted.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Policy
          </Button>
        </CardContent>
      </Card>

      {/* Manual purge */}
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
            <Trash2 className="w-4 h-4" />
            Manual Purge
          </CardTitle>
          <CardDescription>
            Immediately purge all data older than the current retention period
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 mb-4">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">
              This action is irreversible. {data?.stats?.affectedByRetention} records are currently eligible for purging.
              Make sure your retention policy is correctly configured before proceeding.
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={handlePurge}
            disabled={purging || data?.stats?.affectedByRetention === 0}
            className="gap-2"
          >
            {purging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Purge {data?.stats?.affectedByRetention} Records
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
