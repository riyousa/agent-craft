import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { adminUserApi, ManagedUser } from '../api/client';
import {
  Users, Plus, Edit2, Trash2, KeyRound, Search, Tag,
  Shield, ShieldCheck, User as UserIcon, Ban, CheckCircle, ArrowUpDown,
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
import { useToast } from '../hooks/use-toast';
import { useAuth } from '../contexts/AuthContext';

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

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted-foreground">共 {total} 个用户</p>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <Input
              placeholder="搜索姓名或手机号"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-56"
            />
            <Button variant="outline" size="icon" onClick={handleSearch}>
              <Search className="w-4 h-4" />
            </Button>
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40">
              <ArrowUpDown className="w-4 h-4 mr-2" />
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
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            创建用户
          </Button>
        </div>
      </div>

      {/* User Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedUsers.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">暂无用户</h3>
              <p className="text-muted-foreground">点击"创建用户"添加</p>
            </CardContent>
          </Card>
        ) : (
          sortedUsers.map((u) => {
            const role = ROLE_MAP[u.role_level] || ROLE_MAP[1];
            const RoleIcon = role.icon;
            return (
              <Card key={u.id} className={`flex flex-col transition-all hover:shadow-md ${!u.is_active ? 'opacity-60' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm ${u.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {u.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">{u.name}</CardTitle>
                      <CardDescription>{u.phone}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 pb-3">
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline" className={role.color}>
                      <RoleIcon className="w-3 h-3 mr-1" />
                      {role.label}
                    </Badge>
                    {!u.is_active && <Badge variant="destructive">已禁用</Badge>}
                    {u.id === currentUser?.id && <Badge variant="secondary">当前用户</Badge>}
                  </div>
                  {u.email && <p className="text-xs text-muted-foreground mt-2 truncate">{u.email}</p>}
                  {u.tags && u.tags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {u.tags.map(t => (
                        <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
                          <Tag className="w-2.5 h-2.5 mr-0.5" />{t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
                <Separator />
                <div className="flex items-center justify-end gap-1 p-3">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                    <Edit2 className="w-4 h-4 mr-1.5" />
                    编辑
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setResetPwUser(u); setNewPassword(''); }}>
                    <KeyRound className="w-4 h-4 mr-1.5" />
                    重置密码
                  </Button>
                  {currentUser?.role_level === 3 && u.id !== currentUser?.id && (
                    <Button variant="ghost" size="sm" className="text-chart-5 hover:text-chart-5" onClick={() => setDeleteUser(u)}>
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      删除
                    </Button>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-6">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</Button>
        </div>
      )}

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
