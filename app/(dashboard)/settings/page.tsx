'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, Loader2, Eye, EyeOff, TestTube2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [testingFive9, setTestingFive9] = useState(false);
  const [five9TestResult, setFive9TestResult] = useState<'success' | 'error' | null>(null);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data.settings || {});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSave = async (section: Record<string, any>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(section),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Settings saved');
      fetchSettings();
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestFive9 = async () => {
    setTestingFive9(true);
    setFive9TestResult(null);
    try {
      const res = await fetch('/api/five9/test', { method: 'POST' });
      if (res.ok) {
        setFive9TestResult('success');
        toast.success('Five9 connection successful');
      } else {
        setFive9TestResult('error');
        toast.error('Five9 connection failed');
      }
    } catch {
      setFive9TestResult('error');
      toast.error('Five9 connection failed');
    } finally {
      setTestingFive9(false);
    }
  };

  const toggleShowPassword = (key: string) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return <div className="h-64 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure integrations and system behavior
        </p>
      </div>

      <Tabs defaultValue="five9">
        <TabsList>
          <TabsTrigger value="five9">Five9 Integration</TabsTrigger>
          <TabsTrigger value="ai">AI Pipeline</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>

        {/* Five9 Settings */}
        <TabsContent value="five9" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Five9 SOAP API Configuration</CardTitle>
              <CardDescription>Connect to your Five9 VCC instance for call ingestion</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Five9 Username</Label>
                  <Input
                    value={settings.five9_username || ''}
                    onChange={(e) => setSettings((p: any) => ({ ...p, five9_username: e.target.value }))}
                    placeholder="admin@yourcompany.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Five9 Password</Label>
                  <div className="relative">
                    <Input
                      type={showPasswords.five9_password ? 'text' : 'password'}
                      value={settings.five9_password || ''}
                      onChange={(e) => setSettings((p: any) => ({ ...p, five9_password: e.target.value }))}
                      placeholder="••••••••"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowPassword('five9_password')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPasswords.five9_password ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Five9 Domain</Label>
                  <Input
                    value={settings.five9_domain || ''}
                    onChange={(e) => setSettings((p: any) => ({ ...p, five9_domain: e.target.value }))}
                    placeholder="app.five9.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Polling Interval (minutes)</Label>
                  <Input
                    type="number"
                    min="5"
                    max="60"
                    value={settings.five9_poll_interval || '15'}
                    onChange={(e) => setSettings((p: any) => ({ ...p, five9_poll_interval: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium">Enable Five9 Ingestion</p>
                  <p className="text-xs text-muted-foreground">Automatically pull new calls from Five9</p>
                </div>
                <Switch
                  checked={settings.five9_enabled === true || settings.five9_enabled === 'true'}
                  onCheckedChange={(v) => setSettings((p: any) => ({ ...p, five9_enabled: v }))}
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => handleSave({
                    five9_username: settings.five9_username,
                    five9_password: settings.five9_password,
                    five9_domain: settings.five9_domain,
                    five9_poll_interval: settings.five9_poll_interval,
                    five9_enabled: settings.five9_enabled,
                  })}
                  disabled={saving}
                  className="gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </Button>
                <Button variant="outline" onClick={handleTestFive9} disabled={testingFive9} className="gap-2">
                  {testingFive9 ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : five9TestResult === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : five9TestResult === 'error' ? (
                    <XCircle className="w-4 h-4 text-red-400" />
                  ) : (
                    <TestTube2 className="w-4 h-4" />
                  )}
                  Test Connection
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Pipeline Settings */}
        <TabsContent value="ai" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">AI Pipeline Configuration</CardTitle>
              <CardDescription>Configure Whisper transcription and GPT-4o analysis</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>OpenAI API Key</Label>
                  <div className="relative">
                    <Input
                      type={showPasswords.openai_key ? 'text' : 'password'}
                      value={settings.openai_api_key || ''}
                      onChange={(e) => setSettings((p: any) => ({ ...p, openai_api_key: e.target.value }))}
                      placeholder="sk-..."
                      className="pr-10"
                    />
                    <button type="button" onClick={() => toggleShowPassword('openai_key')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPasswords.openai_key ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Whisper Model</Label>
                  <Select
                    value={settings.whisper_model || 'whisper-1'}
                    onValueChange={(v) => setSettings((p: any) => ({ ...p, whisper_model: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whisper-1">whisper-1 (Standard)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>GPT Model</Label>
                  <Select
                    value={settings.gpt_model || 'gpt-4o'}
                    onValueChange={(v) => setSettings((p: any) => ({ ...p, gpt_model: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o">GPT-4o (Recommended)</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster)</SelectItem>
                      <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Max Concurrent Workers</Label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={settings.worker_concurrency || '5'}
                    onChange={(e) => setSettings((p: any) => ({ ...p, worker_concurrency: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium">Enable Speaker Diarization</p>
                  <p className="text-xs text-muted-foreground">Identify agent vs. customer in transcripts</p>
                </div>
                <Switch
                  checked={settings.enable_diarization === true || settings.enable_diarization === 'true'}
                  onCheckedChange={(v) => setSettings((p: any) => ({ ...p, enable_diarization: v }))}
                />
              </div>

              {/* H-05: System prompt editor — loaded from DB, editable without code deploy */}
              <div className="space-y-1.5">
                <Label>Compliance Auditor System Prompt</Label>
                <p className="text-xs text-muted-foreground">
                  This prompt is sent to GPT-4o as the system message. Edit it to customize scoring
                  criteria, required disclosures, or industry-specific compliance rules.
                  Changes take effect on the next call processed.
                </p>
                <Textarea
                  value={settings.compliance_auditor_prompt || ''}
                  onChange={(e) => setSettings((p: any) => ({ ...p, compliance_auditor_prompt: e.target.value }))}
                  placeholder="You are an expert compliance auditor..."
                  className="min-h-[200px] font-mono text-xs"
                />
              </div>

              <Button
                onClick={() => handleSave({
                  openai_api_key: settings.openai_api_key,
                  whisper_model: settings.whisper_model,
                  gpt_model: settings.gpt_model,
                  worker_concurrency: settings.worker_concurrency,
                  enable_diarization: settings.enable_diarization,
                  compliance_auditor_prompt: settings.compliance_auditor_prompt,
                })}
                disabled={saving}
                className="gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save AI Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Notification Settings</CardTitle>
              <CardDescription>Configure alerts for compliance violations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Slack Webhook URL</Label>
                <Input
                  value={settings.slack_webhook_url || ''}
                  onChange={(e) => setSettings((p: any) => ({ ...p, slack_webhook_url: e.target.value }))}
                  placeholder="https://hooks.slack.com/services/..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Alert Email</Label>
                <Input
                  type="email"
                  value={settings.alert_email || ''}
                  onChange={(e) => setSettings((p: any) => ({ ...p, alert_email: e.target.value }))}
                  placeholder="compliance@company.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Critical Score Threshold</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.critical_score_threshold || '60'}
                  onChange={(e) => setSettings((p: any) => ({ ...p, critical_score_threshold: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Send alerts when score falls below this value</p>
              </div>

              {[
                { key: 'notify_critical_flags', label: 'Notify on Critical Flags', desc: 'Alert when a call receives a CRITICAL flag' },
                { key: 'notify_low_scores', label: 'Notify on Low Scores', desc: 'Alert when overall score is below threshold' },
                { key: 'notify_errors', label: 'Notify on Processing Errors', desc: 'Alert when call processing fails' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch
                    checked={settings[key] === true || settings[key] === 'true'}
                    onCheckedChange={(v) => setSettings((p: any) => ({ ...p, [key]: v }))}
                  />
                </div>
              ))}

              <Button
                onClick={() => handleSave({
                  slack_webhook_url: settings.slack_webhook_url,
                  alert_email: settings.alert_email,
                  critical_score_threshold: settings.critical_score_threshold,
                  notify_critical_flags: settings.notify_critical_flags,
                  notify_low_scores: settings.notify_low_scores,
                  notify_errors: settings.notify_errors,
                })}
                disabled={saving}
                className="gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Notifications
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* General */}
        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">General Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Organization Name</Label>
                <Input
                  value={settings.org_name || ''}
                  onChange={(e) => setSettings((p: any) => ({ ...p, org_name: e.target.value }))}
                  placeholder="Acme Insurance"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Select
                  value={settings.timezone || 'America/New_York'}
                  onValueChange={(v) => setSettings((p: any) => ({ ...p, timezone: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern Time</SelectItem>
                    <SelectItem value="America/Chicago">Central Time</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={() => handleSave({
                  org_name: settings.org_name,
                  timezone: settings.timezone,
                })}
                disabled={saving}
                className="gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save General Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
