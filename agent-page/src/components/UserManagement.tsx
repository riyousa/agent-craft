import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { adminUserApi, ManagedUser } from '../api/client';
import {
  Users, Plus, Edit2, Trash2, KeyRound, Search, Tag,
  Shield, ShieldCheck, User as UserIcon, Ban, CheckCircle, ArrowUpDown,
  MoreHorizontal, Upload, Loader2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useToast } from '../hooks/use-toast';
import { useAuth } from '../contexts/AuthContext';
import {
  PageHeader, PageTitle, Pill, StatCard, EmptyState, Toolbar,
} from './design';
import {
  usageFor, formatTokens as fmtTokens, formatRelativeFromSeconds,
} from '../mock/user_usage';
import { cn } from '../lib/utils';

const ROLE_MAP: Record<number, { label: string; icon: React.ElementType; color: string }> = {
  1: { label: '普通用户', icon: UserIcon, color: '' },
  2: { label: '管理员', icon: Shield, color: 'text-chart-1' },
  3: { label: '超级管理员', icon: ShieldCheck, color: 'text-chart-4' },
};

export const UserManagement: React.FC = () => {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [resetPwUser, setResetPwUser] = useState<ManagedUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<ManagedUser | null>(null);

  // Form
  const [formData, setFormData] = useState({ name: '', phone: '', password: '', email: '', role_level: '1', tags: '' });
  const [editData, setEditData] = useState({ name: '', email: '', role_level: '1', is_active: true, tags: '' });
  const [newPassword, setNewPassword] = useState('');

  const [sortBy, setSortBy] = useState<string>('role-desc');
  const pageSize = 20;

  const sortedUsers = useMemo(() => {
    const sorted = [...users];
    switch (sortBy) {
      case 'role-desc':
        sorted.sort((a, b) => b.role_level - a.role_level || new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
        break;
      case 'role-asc':
        sorted.sort((a, b) => a.role_level - b.role_level || new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
        break;
      case 'time-desc':
        sorted.sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
        break;
      case 'time-asc':
        sorted.sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        break;
    }
    return sorted;
  }, [users, sortBy]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminUserApi.listUsers({ page, page_size: pageSize, search: search || undefined });
      setUsers(res.users);
      setTotal(res.total);
    } catch (err: any) {
      if (err.response?.status !== 401) {
        toast({ variant: 'destructive', title: '加载失败', description: err.message });
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const handleCreate = async () => {
    try {
      await adminUserApi.createUser({
        name: formData.name,
        phone: formData.phone,
        password: formData.password,
        email: formData.email || undefined,
        role_level: parseInt(formData.role_level),
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      });
      toast({ title: '创建成功' });
      setShowCreateDialog(false);
      setFormData({ name: '', phone: '', password: '', email: '', role_level: '1', tags: '' });
      loadUsers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: '创建失败', description: err.response?.data?.detail || err.message });
    }
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    try {
      await adminUserApi.updateUser(editingUser.id, {
        name: editData.name,
        email: editData.email || undefined,
        role_level: parseInt(editData.role_level),
        is_active: editData.is_active,
        tags: editData.tags ? editData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      });
      toast({ title: '更新成功' });
      setEditingUser(null);
      loadUsers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: '更新失败', description: err.response?.data?.detail || err.message });
    }
  };

  const handleResetPassword = async () => {
    if (!resetPwUser) return;
    try {
      await adminUserApi.resetPassword(resetPwUser.id, newPassword);
      toast({ title: '密码已重置' });
      setResetPwUser(null);
      setNewPassword('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: '重置失败', description: err.response?.data?.detail || err.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    try {
      await adminUserApi.deleteUser(deleteUser.id);
      toast({ title: '已删除' });
      setDeleteUser(null);
      loadUsers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: '删除失败', description: err.response?.data?.detail || err.message });
    }
  };

  const openEdit = (u: ManagedUser) => {
    setEditingUser(u);
    setEditData({
      name: u.name,
      email: u.email || '',
      role_level: String(u.role_level),
      is_active: u.is_active,
      tags: (u.tags || []).join(', '),
    });
  };

  const totalPages = Math.ceil(total / pageSize);

  // Stat cards aggregate from the in-memory user list. Numbers like
  // active-7d / monthly token spend / pending review come from the
  // mock layer until the backend exposes them (Phase 4).
  const activeUsers = users.filter((u) => u.is_active).length;
  const disabledUsers = users.filter((u) => !u.is_active).length;
  const monthlyTokens = users.reduce(
    (acc, u) => acc + usageFor(u.id, u.is_active).monthly_tokens,
    0,
  );
  const monthlySpend = users.reduce(
    (acc, u) => acc + usageFor(u.id, u.is_active).monthly_spend_cny,
    0,
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <PageHeader
        breadcrumb={['管理', '用户管理']}
        subtitle={`共 ${total} 人 · ${disabledUsers} 已停用`}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-7 pt-6 pb-12">
          <PageTitle
            title="用户管理"
            description="管理可访问 Agent Craft 的用户、角色与所属团队。L3 超管可指派角色，L2 编辑可创建工具与技能，L1 用户仅可发起对话。"
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    toast({
                      title: '批量导入即将开放',
                      description: '此入口尚未接通；当前先用「创建用户」手动添加。',
                    })
                  }
                  className="gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" />
                  批量导入
                </Button>
                <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  创建用户
                </Button>
              </>
            }
          />

          {/* Stat row — 4 metrics per design */}
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="活跃用户" value={activeUsers} sub={`共 ${total} 人`} trend="up" />
            <StatCard
              label="本月 Token"
              value={fmtTokens(monthlyTokens)}
              sub={`¥${monthlySpend.toFixed(2)}`}
            />
            <StatCard
              label="待审核"
              value={0}
              sub="——"
            />
            <StatCard
              label="已停用"
              value={disabledUsers}
              sub={disabledUsers > 0 ? '需要清理' : '——'}
              trend={disabledUsers > 0 ? 'down' : 'flat'}
            />
          </div>

          <Toolbar>
            <div className="relative flex-1 min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="搜索姓名 / 手机号 / 邮箱…"
                className="h-8 pl-8 text-[12.5px]"
              />
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 w-[150px] text-[12.5px]">
                <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="role-desc">角色 ↓ + 时间</SelectItem>
                <SelectItem value="role-asc">角色 ↑ + 时间</SelectItem>
                <SelectItem value="time-desc">最新创建</SelectItem>
                <SelectItem value="time-asc">最早创建</SelectItem>
                <SelectItem value="name">名称排序</SelectItem>
              </SelectContent>
            </Select>
          </Toolbar>

          {loading && users.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : sortedUsers.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="暂无用户"
              description='点击「创建用户」添加你的第一个用户。'
              action={
                <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  创建用户
                </Button>
              }
            />
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table className="table-fixed min-w-[820px]">
                <colgroup>
                  <col className="w-[24%]" />
                  <col className="w-[12%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                  <col className="w-[10%]" />
                  <col className="w-[14%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                </colgroup>
                <TableHeader>
                  <TableRow className="border-b-border bg-muted/40 hover:bg-muted/40">
                    <TableHead className="h-9 px-3">用户</TableHead>
                    <TableHead className="h-9 px-3">角色</TableHead>
                    <TableHead className="h-9 px-3">团队</TableHead>
                    <TableHead className="h-9 px-3 text-right">本月 TOKEN</TableHead>
                    <TableHead className="h-9 px-3 text-right">消耗</TableHead>
                    <TableHead className="h-9 px-3">最近活跃</TableHead>
                    <TableHead className="h-9 px-3">状态</TableHead>
                    <TableHead className="h-9 px-3"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedUsers.map((u) => {
                    const usage = usageFor(u.id, u.is_active);
                    return (
                      <TableRow key={u.id} className="cursor-default">
                        <TableCell className="min-w-0 px-3 py-1.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                              u.is_active
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground',
                            )}>
                              {u.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-[13px] font-medium text-foreground">
                                  {u.name}
                                </span>
                                {u.id === currentUser?.id && (
                                  <Pill tone="outline">当前</Pill>
                                )}
                              </div>
                              <div className="truncate font-mono text-[11px] text-muted-foreground">
                                {u.email || u.phone}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-1.5">
                          {u.role_level === 3 ? (
                            <Pill tone="accent">L3 超管</Pill>
                          ) : u.role_level === 2 ? (
                            <Pill tone="info">L2 管理</Pill>
                          ) : (
                            <Pill tone="outline">L1 用户</Pill>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-1.5 text-[12px] text-muted-foreground whitespace-nowrap">
                          {usage.team}
                        </TableCell>
                        <TableCell className="px-3 py-1.5 text-right font-mono text-[12px] text-foreground">
                          {fmtTokens(usage.monthly_tokens)}
                        </TableCell>
                        <TableCell className="px-3 py-1.5 text-right font-mono text-[12px] text-muted-foreground">
                          ¥{usage.monthly_spend_cny.toFixed(2)}
                        </TableCell>
                        <TableCell className="px-3 py-1.5 text-[12px] text-muted-foreground whitespace-nowrap">
                          {u.is_active
                            ? formatRelativeFromSeconds(usage.last_active_seconds)
                            : '——'}
                        </TableCell>
                        <TableCell className="px-3 py-1.5">
                          {u.is_active ? (
                            <Pill tone="success" dot>活跃</Pill>
                          ) : (
                            <Pill tone="neutral" dot>已停用</Pill>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-1.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(u)}>
                                <Edit2 className="mr-2 h-3.5 w-3.5" />
                                编辑
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setResetPwUser(u); setNewPassword(''); }}>
                                <KeyRound className="mr-2 h-3.5 w-3.5" />
                                重置密码
                              </DropdownMenuItem>
                              {currentUser?.role_level === 3 && u.id !== currentUser?.id && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setDeleteUser(u)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    删除
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <span className="font-mono text-[11.5px] text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                下一页
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <AlertDialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>创建用户</AlertDialogTitle>
            <AlertDialogDescription>填写新用户信息</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>姓名 *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>手机号 *</Label>
              <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} maxLength={11} />
            </div>
            <div className="space-y-2">
              <Label>密码 *</Label>
              <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>邮箱</Label>
              <Input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={formData.role_level} onValueChange={(v) => setFormData({ ...formData, role_level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">普通用户</SelectItem>
                  {(currentUser?.role_level || 0) >= 3 && <SelectItem value="2">管理员</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>标签（逗号分隔）</Label>
              <Input value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} placeholder="研发, 产品, 运营" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreate} disabled={!formData.name || !formData.phone || !formData.password}>创建</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <AlertDialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>编辑用户</AlertDialogTitle>
            <AlertDialogDescription>修改 {editingUser?.name} 的信息</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>姓名</Label>
              <Input value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>邮箱</Label>
              <Input value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={editData.role_level} onValueChange={(v) => setEditData({ ...editData, role_level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">普通用户</SelectItem>
                  {(currentUser?.role_level || 0) >= 3 && <SelectItem value="2">管理员</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>标签（逗号分隔）</Label>
              <Input value={editData.tags} onChange={(e) => setEditData({ ...editData, tags: e.target.value })} placeholder="研发, 产品, 运营" />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={editData.is_active}
                onChange={(e) => setEditData({ ...editData, is_active: e.target.checked })}
                className="h-4 w-4 rounded"
              />
              <Label htmlFor="edit-active" className="font-normal">
                {editData.is_active ? <><CheckCircle className="w-4 h-4 inline mr-1 text-chart-2" />启用</> : <><Ban className="w-4 h-4 inline mr-1 text-chart-5" />禁用</>}
              </Label>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdate}>保存</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <AlertDialog open={!!resetPwUser} onOpenChange={(open) => !open && setResetPwUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重置密码</AlertDialogTitle>
            <AlertDialogDescription>为 {resetPwUser?.name} 设置新密码</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-2">
            <Label>新密码</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少6位" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPassword} disabled={newPassword.length < 6}>确认重置</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除用户 "{deleteUser?.name}" 吗？此操作无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-chart-5 text-white hover:opacity-90">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
