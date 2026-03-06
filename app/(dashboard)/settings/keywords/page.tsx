'use client';

import { useState, useEffect } from 'react';
import {
  Plus, Trash2, Tag, Edit3, Save, X, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Info, Shield, Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const LIST_TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  prohibited: { label: 'Prohibited', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: AlertCircle },
  required: { label: 'Required', color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: CheckCircle2 },
  risk: { label: 'Risk', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: AlertCircle },
  competitor: { label: 'Competitor', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Shield },
};

export default function KeywordsPage() {
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState<Record<string, string>>({});
  const [addingKeyword, setAddingKeyword] = useState<Record<string, boolean>>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newListForm, setNewListForm] = useState({ name: '', description: '', type: 'prohibited' });
  const [creatingList, setCreatingList] = useState(false);

  const fetchLists = async () => {
    try {
      const res = await fetch('/api/keywords');
      const data = await res.json();
      setLists(data.lists || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLists(); }, []);

  const handleToggleList = async (listId: string, isActive: boolean) => {
    try {
      await fetch(`/api/keywords/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      setLists((prev) => prev.map((l) => l.id === listId ? { ...l, isActive } : l));
      toast.success(`List ${isActive ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to update list');
    }
  };

  const handleAddKeyword = async (listId: string) => {
    const word = newKeyword[listId]?.trim();
    if (!word) return;

    setAddingKeyword((prev) => ({ ...prev, [listId]: true }));
    try {
      const res = await fetch(`/api/keywords/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add keyword');
      }
      const keyword = await res.json();
      setLists((prev) => prev.map((l) =>
        l.id === listId ? { ...l, keywords: [...l.keywords, keyword] } : l
      ));
      setNewKeyword((prev) => ({ ...prev, [listId]: '' }));
      toast.success(`"${word}" added`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAddingKeyword((prev) => ({ ...prev, [listId]: false }));
    }
  };

  const handleDeleteKeyword = async (listId: string, keywordId: string, word: string) => {
    try {
      await fetch(`/api/keywords/${listId}/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId }),
      });
      setLists((prev) => prev.map((l) =>
        l.id === listId ? { ...l, keywords: l.keywords.filter((k: any) => k.id !== keywordId) } : l
      ));
      toast.success(`"${word}" removed`);
    } catch {
      toast.error('Failed to remove keyword');
    }
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm('Delete this keyword list? This cannot be undone.')) return;
    try {
      await fetch(`/api/keywords/${listId}`, { method: 'DELETE' });
      setLists((prev) => prev.filter((l) => l.id !== listId));
      toast.success('List deleted');
    } catch {
      toast.error('Failed to delete list');
    }
  };

  const handleCreateList = async () => {
    if (!newListForm.name.trim()) return;
    setCreatingList(true);
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newListForm),
      });
      if (!res.ok) throw new Error('Failed to create list');
      const list = await res.json();
      setLists((prev) => [...prev, list]);
      setShowCreateDialog(false);
      setNewListForm({ name: '', description: '', type: 'prohibited' });
      toast.success('Keyword list created');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreatingList(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Keyword Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure keyword lists used in AI compliance auditing
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New List
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-muted/30 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : lists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-muted-foreground">No keyword lists yet</p>
            <Button onClick={() => setShowCreateDialog(true)} className="mt-4 gap-2">
              <Plus className="w-4 h-4" />
              Create First List
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {lists.map((list) => {
            const config = LIST_TYPE_CONFIG[list.type] || LIST_TYPE_CONFIG.prohibited;
            const Icon = config.icon;
            const isExpanded = expandedList === list.id;

            return (
              <Card key={list.id} className={cn(!list.isActive && 'opacity-60')}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn('p-2 rounded-lg border', config.color)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-semibold">{list.name}</CardTitle>
                          <Badge variant="outline" className={cn('text-xs border', config.color)}>
                            {config.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {list.keywords.length} keyword{list.keywords.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {list.description && (
                          <CardDescription className="text-xs mt-0.5">{list.description}</CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{list.isActive ? 'Active' : 'Inactive'}</span>
                        <Switch
                          checked={list.isActive}
                          onCheckedChange={(checked) => handleToggleList(list.id, checked)}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setExpandedList(isExpanded ? null : list.id)}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteList(list.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0">
                    {/* Add keyword input */}
                    <div className="flex gap-2 mb-3">
                      <Input
                        placeholder="Add keyword or phrase..."
                        value={newKeyword[list.id] || ''}
                        onChange={(e) => setNewKeyword((prev) => ({ ...prev, [list.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword(list.id)}
                        className="h-8 text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleAddKeyword(list.id)}
                        disabled={addingKeyword[list.id] || !newKeyword[list.id]?.trim()}
                        className="gap-1.5 h-8"
                      >
                        {addingKeyword[list.id] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        Add
                      </Button>
                    </div>

                    {/* Keywords grid */}
                    {list.keywords.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No keywords yet. Add some above.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {list.keywords.map((kw: any) => (
                          <div
                            key={kw.id}
                            className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border',
                              config.color
                            )}
                          >
                            <span>{kw.word}</span>
                            {kw.isRegex && <span className="opacity-60 font-mono">/regex/</span>}
                            <button
                              onClick={() => handleDeleteKeyword(list.id, kw.id, kw.word)}
                              className="ml-0.5 hover:opacity-70 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create list dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Keyword List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="e.g., Prohibited Phrases"
                value={newListForm.name}
                onChange={(e) => setNewListForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={newListForm.type}
                onValueChange={(v) => setNewListForm((p) => ({ ...p, type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LIST_TYPE_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Input
                placeholder="Brief description of this list..."
                value={newListForm.description}
                onChange={(e) => setNewListForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateList} disabled={creatingList || !newListForm.name.trim()}>
              {creatingList && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
