import React, { useState, useEffect, useCallback } from 'react';
import { adminUserApi, ManagedUser, AssignmentResponse } from '../api/client';
import { adminToolsApi, adminSkillsApi } from '../api/user';
import {
  Wrench, Zap, Users, Check, Tag, Plus, Edit2, Sparkles,
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';
import { useToast } from '../hooks/use-toast';
import { ToolsManager } from './ToolsManager';
import { SkillsManager } from './SkillsManager';
import { ModelsManager } from './ModelsManager';

type Tab = 'tools' | 'skills' | 'models';
type Mode = 'list' | 'manage-tools' | 'manage-skills';

export const GlobalManagement: React.FC = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('tools');
  const [mode, setMode] = useState<Mode>('list');
  const [tools, setTools] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Assignment
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [assignMode, setAssignMode] = useState<'assign' | 'update' | 'revoke'>('assign');
  const [assignedUserIds, setAssignedUserIds] = useState<Set<number>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [toolsRes, skillsRes, usersRes, tagsRes] = await Promise.all([
        adminUserApi.listAdminTools(),
        adminUserApi.listAdminSkills(),
        adminUserApi.listUsers({ page: 1, page_size: 100 }),
        adminUserApi.listTags(),
      ]);
      // Disabled admin tools/skills aren't eligible for assignment — hide them
      // so super-admins don't accidentally push broken items onto users. They
      // remain visible in the "全局工具/技能管理" screen where `enabled` can
      // be toggled back on.
      setTools((toolsRes || []).filter((t: any) => t?.enabled !== false));
      setSkills((skillsRes || []).filter((s: any) => s?.enabled !== false));
      setUsers(usersRes.users);
      setAllTags(tagsRes);
    } catch (err: any) {
      if (err.response?.status !== 401) {
        toast({ variant: 'destructive', title: '加载失败', description: err.message });
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // --- Tag-based user selection ---
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  };

  useEffect(() => {
    if (selectedTags.size === 0) return;
    const ids = users
      .filter(u => u.tags && u.tags.some(t => selectedTags.has(t)))
      .map(u => u.id);
    setSelectedUserIds(new Set(ids));
  }, [selectedTags, users]);

  const toggleUser = (id: number) => {
    setSelectedTags(new Set());
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedTags(new Set());
    const eligible = users.filter(u =>
      assignMode === 'assign' ? !assignedUserIds.has(u.id) : assignedUserIds.has(u.id)
    );
    setSelectedUserIds(new Set(eligible.map(u => u.id)));
  };
  const selectNone = () => { setSelectedTags(new Set()); setSelectedUserIds(new Set()); };

  const handleAssign = async () => {
    if (!selectedItem || selectedUserIds.size === 0) return;
    setAssigning(true);
    try {
      const userIds = Array.from(selectedUserIds);
      const itemId = tab === 'tools' ? selectedItem.tool_id : selectedItem.skill_id;
      let res;

      if (assignMode === 'revoke') {
        res = tab === 'tools'
          ? await adminUserApi.revokeTool(itemId, userIds)
          : await adminUserApi.revokeSkill(itemId, userIds);
        toast({ title: '撤回成功', description: res.message });
      } else {
        const assignRes: AssignmentResponse = tab === 'tools'
          ? await adminUserApi.assignTool(itemId, userIds, assignMode)
          : await adminUserApi.assignSkill(itemId, userIds, assignMode);

        const title = assignMode === 'update' ? '更新成功' : '下发成功';
        const primaryDesc = `已${assignMode === 'update' ? '更新' : '下发'}至 ${assignRes.assigned_count} 个用户`;

        toast({ title, description: primaryDesc });

        // Skill assignments cascade onto required tools — surface that in a
        // second toast so the admin actually notices what happened.
        const inserted = assignRes.tools_inserted ?? 0;
        const updated = assignRes.tools_updated ?? 0;
        if (tab === 'skills' && (inserted > 0 || updated > 0)) {
          const parts = [];
          if (inserted > 0) parts.push(`新增 ${inserted} 个工具`);
          if (updated > 0) parts.push(`更新 ${updated} 个工具`);
          toast({
            title: '依赖工具已同步',
            description: parts.join('，') + '（技能依赖的工具已自动下发给相同用户）',
          });
        }

        const missing = assignRes.missing_tool_names ?? [];
        if (missing.length > 0) {
          toast({
            variant: 'destructive',
            title: '缺少依赖工具',
            description: `以下工具未在管理员工具库中：${missing.join('、')}。请先在"全局工具"中创建它们。`,
          });
        }

        res = assignRes;
      }
      setSelectedItem(null);
      setSelectedUserIds(new Set());
      setSelectedTags(new Set());
    } catch (err: any) {
      toast({ variant: 'destructive', title: '操作失败', description: err.response?.data?.detail || err.message });
    } finally {
      setAssigning(false);
    }
  };

  // --- Manage tools/skills mode: reuse existing full-featured components ---
  const backToList = () => { setMode('list'); loadData(); };

  if (mode === 'manage-tools') {
    return <ToolsManager api={adminToolsApi} onBack={backToList} />;
  }
  if (mode === 'manage-skills') {
    return <SkillsManager api={adminSkillsApi} toolsApi={adminToolsApi} onBack={backToList} />;
  }

  const items = tab === 'tools' ? tools : skills;

  if (loading && tab !== 'models') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
      </div>
    );
  }

  // --- List Mode ---
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Tab switch + manage */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant={tab === 'tools' ? 'default' : 'outline'} size="sm" onClick={() => { setTab('tools'); setSelectedItem(null); }}>
            <Wrench className="w-4 h-4 mr-1.5" />全局工具
          </Button>
          <Button variant={tab === 'skills' ? 'default' : 'outline'} size="sm" onClick={() => { setTab('skills'); setSelectedItem(null); }}>
            <Zap className="w-4 h-4 mr-1.5" />全局技能
          </Button>
          <Button variant={tab === 'models' ? 'default' : 'outline'} size="sm" onClick={() => { setTab('models'); setSelectedItem(null); }}>
            <Sparkles className="w-4 h-4 mr-1.5" />模型管理
          </Button>
          {tab !== 'models' && <span className="text-sm text-muted-foreground ml-2">共 {items.length} 个</span>}
        </div>
        {tab !== 'models' && (
          <Button onClick={() => setMode(tab === 'tools' ? 'manage-tools' : 'manage-skills')}>
            <Edit2 className="w-4 h-4 mr-1.5" />
            管理{tab === 'tools' ? '工具' : '技能'}
          </Button>
        )}
      </div>

      {tab === 'models' ? (
        <ModelsManager />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: item list */}
        <div className="lg:col-span-1 space-y-3">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            选择要下发的{tab === 'tools' ? '工具' : '技能'}
          </p>
          {items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-10">
                {tab === 'tools' ? <Wrench className="w-8 h-8 text-muted-foreground mb-2" /> : <Zap className="w-8 h-8 text-muted-foreground mb-2" />}
                <p className="text-sm text-muted-foreground mb-3">暂无全局{tab === 'tools' ? '工具' : '技能'}</p>
                <Button size="sm" onClick={() => setMode(tab === 'tools' ? 'manage-tools' : 'manage-skills')}>
                  <Plus className="w-3.5 h-3.5 mr-1" />创建
                </Button>
              </CardContent>
            </Card>
          ) : (
            items.map((item) => {
              const id = tab === 'tools' ? item.tool_id : item.skill_id;
              const isSelected = selectedItem && (tab === 'tools' ? selectedItem.tool_id === id : selectedItem.skill_id === id);
              return (
                <Card
                  key={id}
                  className={`cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                  onClick={async () => {
                    setSelectedItem(item);
                    setSelectedUserIds(new Set());
                    setSelectedTags(new Set());
                    setAssignMode('assign');
                    try {
                      const ids = tab === 'tools'
                        ? await adminUserApi.getToolAssignedUsers(item.tool_id)
                        : await adminUserApi.getSkillAssignedUsers(item.skill_id);
                      setAssignedUserIds(new Set(ids));
                    } catch { setAssignedUserIds(new Set()); }
                  }}
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center gap-2">
                      {tab === 'tools' ? <Wrench className="w-4 h-4 text-primary" /> : <Zap className="w-4 h-4 text-primary" />}
                      <CardTitle className="text-sm">{item.display_name}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <CardDescription className="text-xs line-clamp-2">{item.description}</CardDescription>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Right: user selection */}
        <div className="lg:col-span-2">
          {!selectedItem ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Users className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">请先从左侧选择一个{tab === 'tools' ? '工具' : '技能'}</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">「{selectedItem.display_name}」</CardTitle>
                <CardDescription>
                  已下发 {assignedUserIds.size} 个用户
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Mode tabs */}
                <div className="flex gap-1">
                  <Button size="sm" variant={assignMode === 'assign' ? 'default' : 'ghost'}
                    onClick={() => { setAssignMode('assign'); setSelectedUserIds(new Set()); setSelectedTags(new Set()); }}>
                    新下发
                  </Button>
                  <Button size="sm" variant={assignMode === 'update' ? 'default' : 'ghost'}
                    onClick={() => { setAssignMode('update'); setSelectedUserIds(new Set()); setSelectedTags(new Set()); }}>
                    更新下发
                  </Button>
                  <Button size="sm" variant={assignMode === 'revoke' ? 'default' : 'ghost'}
                    className={assignMode === 'revoke' ? 'bg-chart-5 hover:bg-chart-5/90' : ''}
                    onClick={() => { setAssignMode('revoke'); setSelectedUserIds(new Set()); setSelectedTags(new Set()); }}>
                    撤回
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  {assignMode === 'assign' && '选择未拥有的用户进行首次下发'}
                  {assignMode === 'update' && '选择已拥有的用户更新配置到最新版本'}
                  {assignMode === 'revoke' && '选择已拥有的用户撤回此工具/技能'}
                </p>

                {/* Quick actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>全选可用</Button>
                  <Button variant="outline" size="sm" onClick={selectNone}>取消</Button>

                  {allTags.length > 0 && (
                    <>
                      <Separator orientation="vertical" className="h-4 mx-1" />
                      <div className="flex flex-wrap gap-1.5">
                        {allTags.map(tag => {
                          const active = selectedTags.has(tag);
                          return (
                            <Badge key={tag} variant={active ? 'default' : 'outline'} className="cursor-pointer"
                              onClick={() => toggleTag(tag)}>
                              <Tag className="w-3 h-3 mr-1" />{tag}
                              {active && <Check className="w-3 h-3 ml-1" />}
                            </Badge>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <span className="text-sm text-muted-foreground ml-auto">
                    已选 {selectedUserIds.size}
                  </span>
                </div>

                {/* User grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                  {users.map(u => {
                    const hasIt = assignedUserIds.has(u.id);
                    const disabled = assignMode === 'assign' ? hasIt : !hasIt;
                    const checked = selectedUserIds.has(u.id);
                    return (
                      <div
                        key={u.id}
                        onClick={() => !disabled && toggleUser(u.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          disabled ? 'opacity-40 cursor-not-allowed' :
                          checked ? 'bg-primary/5 border-primary cursor-pointer' : 'hover:bg-accent cursor-pointer'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                          disabled ? 'border-muted bg-muted' :
                          checked ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                        }`}>
                          {(checked || (disabled && hasIt)) && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{u.name}</span>
                            {hasIt && <Badge variant="secondary" className="text-[10px] px-1 py-0">已有</Badge>}
                          </div>
                          {u.tags && u.tags.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {u.tags.map(t => (
                                <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">{t}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Action button */}
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleAssign}
                    disabled={selectedUserIds.size === 0 || assigning}
                    className={assignMode === 'revoke' ? 'bg-chart-5 hover:bg-chart-5/90' : ''}
                  >
                    {assigning ? '执行中...' :
                      assignMode === 'assign' ? `下发给 ${selectedUserIds.size} 个用户` :
                      assignMode === 'update' ? `更新 ${selectedUserIds.size} 个用户` :
                      `从 ${selectedUserIds.size} 个用户撤回`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      )}
    </div>
  );
};
