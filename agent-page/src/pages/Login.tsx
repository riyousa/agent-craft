import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useToast } from '../hooks/use-toast';
import { ThemeSwitcher } from '../components/ThemeSwitcher';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // If a logged-in user lands on /login (browser back, manual URL),
  // bounce them straight into the app — never show the login form to
  // someone who is already authenticated. Use replace so /login
  // never sticks on the history stack.
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone || !password) {
      toast({
        title: '验证失败',
        description: '请输入手机号和密码',
        variant: 'destructive',
      });
      return;
    }

    if (phone.length !== 11) {
      toast({
        title: '验证失败',
        description: '请输入正确的11位手机号',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      await login(phone, password);
      toast({
        title: '登录成功',
        description: '欢迎回来！',
      });
      // Replace history entry so the browser back button can never
      // step back to /login while the user is authenticated.
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Login error:', err);
      const message = err.response?.data?.detail || '登录失败，请检查手机号和密码';
      toast({
        title: '登录失败',
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
            {/* <p className="text-lg">
              "这个平台极大提升了我们团队的工作效率，通过智能化的工具编排和技能组合，让复杂的业务流程变得简单高效。"
            </p>
            <footer className="text-sm">张明 - 产品经理</footer> */}
          </blockquote>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              登录账户
            </h1>
            <p className="text-sm text-muted-foreground">
              输入手机号和密码以登录您的账户
            </p>
          </div>

          <div className="grid gap-6">
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="phone">手机号</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="请输入11位手机号"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={11}
                    autoCapitalize="none"
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
                    placeholder="请输入密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                      登录中...
                    </>
                  ) : (
                    '登录'
                  )}
                </Button>
              </div>
            </form>
          </div>

          <p className="px-8 text-center text-sm text-muted-foreground">
            还没有账户？{' '}
            <Link
              to="/register"
              className="underline underline-offset-4 hover:text-primary"
            >
              立即注册
            </Link>
          </p>

          <p className="px-8 text-center text-xs text-muted-foreground">
            登录即表示您同意我们的{' '}
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
