import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import {
  User, Phone, Mail, Shield, ShieldCheck, Calendar, KeyRound, Tag,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { changePassword } from '../api/auth';
import { useToast } from '../hooks/use-toast';

const ROLE_MAP: Record<number, { label: string; icon: React.ElementType; color: string }> = {
  1: { label: '普通用户', icon: User, color: '' },
  2: { label: '管理员', icon: Shield, color: 'text-chart-1' },
  3: { label: '超级管理员', icon: ShieldCheck, color: 'text-chart-4' },
};

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProfileDialog: React.FC<ProfileDialogProps> = ({ open, onOpenChange }) => {
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [showPwForm, setShowPwForm] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const handleChangePassword = async () => {
    if (newPw.length < 6) {
      toast({ variant: 'destructive', title: '密码太短', description: '新密码至少6位' });
      return;
    }
    if (newPw !== confirmPw) {
      toast({ variant: 'destructive', title: '密码不一致' });
      return;
    }
    setPwLoading(true);
    try {
      await changePassword(token!, oldPw, newPw);
      toast({ title: '密码已修改' });
      setShowPwForm(false);
      setOldPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: '修改失败', description: err.response?.data?.detail || '请检查旧密码' });
    } finally { setPwLoading(false); }
  };

  const handleClose = (v: boolean) => {
    if (!v) { setShowPwForm(false); setOldPw(''); setNewPw(''); setConfirmPw(''); }
    onOpenChange(v);
  };

  if (!user) return null;

  const role = ROLE_MAP[user.role_level] || ROLE_MAP[1];
  const RoleIcon = role.icon;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>个人资料</DialogTitle>
          <DialogDescription>查看您的账户信息</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 py-2">
          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold">
            {user.name.charAt(0)}
          </div>
          <div>
            <h3 className="text-lg font-semibold">{user.name}</h3>
            <Badge variant="outline" className={`mt-1 ${role.color}`}>
              <RoleIcon className="w-3 h-3 mr-1" />
              {role.label}
            </Badge>
          </div>
        </div>

        <Separator />

        <div className="space-y-3 py-2">
          <div className="flex items-center gap-3 text-sm">
            <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground w-16">手机号</span>
            <span className="font-medium">{user.phone}</span>
          </div>
          {user.email && (
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground w-16">邮箱</span>
              <span className="font-medium">{user.email}</span>
            </div>
          )}
          {user.tags && user.tags.length > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <Tag className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground w-16">标签</span>
              <div className="flex gap-1 flex-wrap">
                {user.tags.map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground w-16">注册时间</span>
            <span className="font-medium">{new Date(user.created_at).toLocaleDateString('zh-CN')}</span>
          </div>
        </div>

        <Separator />

        {!showPwForm ? (
          <Button variant="outline" className="w-full" onClick={() => setShowPwForm(true)}>
            <KeyRound className="w-4 h-4 mr-2" />
            修改密码
          </Button>
        ) : (
          <div className="space-y-4">
            <h4 className="font-medium text-sm">修改密码</h4>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>当前密码</Label>
                <Input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>新密码</Label>
                <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="至少6位" />
              </div>
              <div className="space-y-1.5">
                <Label>确认新密码</Label>
                <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setShowPwForm(false); setOldPw(''); setNewPw(''); setConfirmPw(''); }}>取消</Button>
              <Button size="sm" onClick={handleChangePassword} disabled={pwLoading || !oldPw || !newPw || !confirmPw}>
                {pwLoading ? '提交中...' : '确认修改'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
