import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useToast } from '../hooks/use-toast';
import { ThemeSwitcher } from '../components/ThemeSwitcher';

export default function Register() {
  const [formData, setFormData] = useState({
    phone: '',
    password: '',
    confirmPassword: '',
    name: '',
    email: '',
  });
  const [loading, setLoading] = useState(false);
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Mirror Login: an authenticated user landing on /register goes
  // straight to the app, replacing the entry so back doesn't bring
  // them back here.
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证必填项
    if (!formData.phone || !formData.password || !formData.name) {
      toast({
        title: '验证失败',
        description: '请填写所有必填项',
        variant: 'destructive',
      });
      return;
    }

    // 验证手机号
    if (formData.phone.length !== 11) {
      toast({
        title: '验证失败',
        description: '请输入正确的11位手机号',
        variant: 'destructive',
      });
      return;
    }

    // 验证密码长度
    if (formData.password.length < 6) {
      toast({
        title: '验证失败',
        description: '密码长度至少6位',
        variant: 'destructive',
      });
      return;
    }

    // 验证密码一致性
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: '验证失败',
        description: '两次输入的密码不一致',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      await register(
        formData.phone,
        formData.password,
        formData.name,
        formData.email || undefined
      );
      toast({
        title: '注册成功',
        description: '欢迎加入！正在跳转...',
      });
      // Replace history entry so the browser back button can't step
      // back to /register or /login once the user is authenticated.
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Register error:', err);
      const message = err.response?.data?.detail || '注册失败，请重试';
      toast({
        title: '注册失败',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      {/* Theme Switcher - Top Right */}
      <div className="absolute right-4 top-4 md:right-8 md:top-8 z-10">
        <ThemeSwitcher />
      </div>
      {/* Left side - Branding/Image */}
      <div className="relative hidden h-full flex-col bg-muted p-10 text-foreground dark:border-r lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-secondary/20" />
        <div className="relative z-20 flex items-center text-lg font-medium">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-2 h-6 w-6"
          >
            <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
          </svg>
          智能助手平台
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              "通过自定义工具和技能，我们的团队能够快速构建符合业务需求的智能化解决方案，大幅提升了响应速度。"
            </p>
            <footer className="text-sm">李华 - 技术总监</footer>
          </blockquote>
        </div>
      </div>

      {/* Right side - Register Form */}
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              创建账户
            </h1>
            <p className="text-sm text-muted-foreground">
              填写以下信息以创建您的账户
            </p>
          </div>

          <div className="grid gap-6">
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">姓名</Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="请输入姓名"
                    value={formData.name}
                    onChange={handleChange}
                    autoCapitalize="words"
                    autoCorrect="off"
                    disabled={loading}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="phone">手机号</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="请输入11位手机号"
                    value={formData.phone}
                    onChange={handleChange}
                    maxLength={11}
                    autoCapitalize="none"
                    autoCorrect="off"
                    disabled={loading}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">
                    邮箱
                    <span className="text-xs text-muted-foreground ml-1">(可选)</span>
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="请输入邮箱"
                    value={formData.email}
                    onChange={handleChange}
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    disabled={loading}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="password">密码</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="请输入密码（至少6位）"
                    value={formData.password}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="confirmPassword">确认密码</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="请再次输入密码"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>

                <Button disabled={loading} type="submit">
                  {loading ? (
                    <>
                      <svg
                        className="mr-2 h-4 w-4 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      注册中...
                    </>
                  ) : (
                    '创建账户'
                  )}
                </Button>
              </div>
            </form>
          </div>

          <p className="px-8 text-center text-sm text-muted-foreground">
            已有账户？{' '}
            <Link
              to="/login"
              className="underline underline-offset-4 hover:text-primary"
            >
              立即登录
            </Link>
          </p>

          <p className="px-8 text-center text-xs text-muted-foreground">
            注册即表示您同意我们的{' '}
            <Link
              to="/terms"
              className="underline underline-offset-4 hover:text-primary"
            >
              服务条款
            </Link>{' '}
            和{' '}
            <Link
              to="/privacy"
              className="underline underline-offset-4 hover:text-primary"
            >
              隐私政策
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
