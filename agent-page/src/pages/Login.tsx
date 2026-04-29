/**
 * Login page — v3 split layout (brand + form).
 *
 * Layout:
 *   ┌────────────────────┬──────────────────────────────────┐
 *   │  Left · 480px      │  Right · flex-1 (hidden < lg)    │
 *   │  brand mark        │  hero copy + feature bullets     │
 *   │  ──────            │  · 智能编排                       │
 *   │  form              │  · 数据连通                       │
 *   │  · 手机号          │  · 安全可控                       │
 *   │  · 密码            │                                  │
 *   │  · 登录            │  (subtle gradient surface)        │
 *   │  · 注册链接         │                                  │
 *   └────────────────────┴──────────────────────────────────┘
 *
 * Light mode → 白底 + 黑字；dark mode → 深灰底 + 白字 (driven by
 * the design tokens; no hardcoded colors).
 *
 * Animations are preserved across the redesign — `animate-rise-in`
 * cascade on the brand panel + form, `animate-fade-in` on the inline
 * loader. `prefers-reduced-motion` neutralizes them via index.css.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bot, ChevronRight, Loader2, Sparkles, ShieldCheck, Workflow, Database } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useToast } from '../hooks/use-toast';
import { ThemeSwitcher } from '../components/ThemeSwitcher';
import { Pill } from '../components/design';

const FEATURES: Array<{ Icon: React.ElementType; title: string; desc: string }> = [
  {
    Icon: Workflow,
    title: '智能编排',
    desc: '把工具与技能拼装成可一键调用的工作流，复杂业务一句话搞定。',
  },
  {
    Icon: Database,
    title: '数据连通',
    desc: '内部 API、SQL、文件、MCP Server 统一抽象成 Agent 可用的能力。',
  },
  {
    Icon: ShieldCheck,
    title: '安全可控',
    desc: '基于角色的可见性、审批策略与全链路审计，让 Agent 真正落地。',
  },
];

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
      toast({ title: '登录成功', description: '欢迎回来！' });
      // Replace history entry so the browser back button can never
      // step back to /login while the user is authenticated.
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Login error:', err);
      const message = err.response?.data?.detail || '登录失败，请检查手机号和密码';
      toast({ title: '登录失败', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* ─── Left · brand panel (hidden < lg) ─── */}
      <div className="relative hidden flex-1 lg:flex border-r border-border bg-muted/30">
        {/* Subtle radial gradient surface — never overpowers content. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.08),transparent_55%),radial-gradient(circle_at_80%_80%,hsl(var(--primary)/0.05),transparent_50%)]"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col justify-between px-12 py-12 xl:px-16">
          <div className="animate-rise-in" style={{ animationDelay: '0ms' }}>
            <Pill tone="outline">
              <Sparkles className="mr-1 h-3 w-3" /> Internal Agent Platform
            </Pill>
          </div>

          <div className="max-w-xl space-y-8">
            <div
              className="space-y-3 animate-rise-in"
              style={{ animationDelay: '120ms' }}
            >
              <h2 className="text-3xl xl:text-4xl font-semibold tracking-tight leading-tight">
                把 Agent 装进你的<br />日常工作流
              </h2>
              <p className="text-[14px] text-muted-foreground leading-relaxed max-w-md">
                内部 API、流程、数据，统一管理为 AI 可调用的能力。
                工具与技能可视化编排，团队协作开箱即用。
              </p>
            </div>

            <ul className="space-y-4">
              {FEATURES.map((f, i) => (
                <li
                  key={f.title}
                  className="flex items-start gap-3 animate-rise-in"
                  style={{ animationDelay: `${240 + i * 80}ms` }}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                    <f.Icon className="h-4 w-4 text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-foreground">{f.title}</div>
                    <div className="text-[12.5px] leading-relaxed text-muted-foreground">{f.desc}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div
            className="text-[11.5px] text-muted-foreground animate-rise-in"
            style={{ animationDelay: '520ms' }}
          >
            © {new Date().getFullYear()} Agent Craft · 内部使用
          </div>
        </div>
      </div>

      {/* ─── Right · form panel (full width on mobile, fixed 480 on lg+) ─── */}
      <div className="flex w-full shrink-0 flex-col px-6 py-10 sm:px-10 lg:w-[480px] lg:px-12 lg:py-12">
        {/* Brand mark + theme toggle */}
        <div className="flex items-center justify-between animate-rise-in" style={{ animationDelay: '0ms' }}>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <span className="text-[14px] font-semibold tracking-tight">Agent Craft</span>
          </div>
          <ThemeSwitcher />
        </div>

        {/* Spacer pushes the form vertically toward the middle on tall screens. */}
        <div className="flex flex-1 flex-col justify-center py-12">
          <div className="mx-auto w-full max-w-[360px]">
            <div className="mb-7 space-y-1.5 animate-rise-in" style={{ animationDelay: '80ms' }}>
              <h1 className="text-2xl font-semibold tracking-tight leading-tight">
                登录到 Agent Craft
              </h1>
              <p className="text-[13px] text-muted-foreground">
                用手机号和密码进入你的工作区
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-4 animate-rise-in"
              style={{ animationDelay: '180ms' }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-[12.5px]">手机号</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="11 位手机号"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={11}
                  autoCapitalize="none"
                  autoCorrect="off"
                  disabled={loading}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-[12.5px]">密码</Label>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="h-10"
                />
              </div>
              <Button disabled={loading} type="submit" className="w-full h-10 gap-1.5">
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    登录中…
                  </>
                ) : (
                  <>
                    登录
                    <ChevronRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </form>

            <p
              className="mt-6 text-center text-[12.5px] text-muted-foreground animate-rise-in"
              style={{ animationDelay: '280ms' }}
            >
              还没有账户？{' '}
              <Link
                to="/register"
                className="font-medium text-foreground underline underline-offset-4 hover:opacity-80"
              >
                立即注册
              </Link>
            </p>
          </div>
        </div>

        {/* Footer terms */}
        <p
          className="text-center text-[11px] leading-relaxed text-muted-foreground animate-rise-in"
          style={{ animationDelay: '380ms' }}
        >
          登录即表示同意{' '}
          <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">
            服务条款
          </Link>{' '}
          与{' '}
          <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
            隐私政策
          </Link>
        </p>
      </div>
    </div>
  );
}
