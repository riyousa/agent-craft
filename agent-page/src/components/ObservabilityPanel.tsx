import React, { useState, useEffect, useCallback } from 'react';
import { chatApi } from '../api/client';
import {
  Activity, Clock, Zap, AlertCircle, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Loader2, RefreshCw,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useToast } from '../hooks/use-toast';

export const ObservabilityPanel: React.FC = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hours, setHours] = useState('24');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [runDetail, setRunDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, statsRes, runsRes] = await Promise.all([
        chatApi.getObservabilityStatus(),
        chatApi.getObservabilityStats(parseInt(hours)),
        chatApi.getObservabilityRuns({
          hours: parseInt(hours),
          limit: 50,
          status: statusFilter === 'all' ? undefined : statusFilter,
        }),
      ]);
      setStatus(statusRes);
      setStats(statsRes);
      setRuns(runsRes.items || []);
    } catch (err: any) {
      if (err.response?.status !== 401) {
        toast({ variant: 'destructive', title: '加载失败', description: err.response?.data?.detail || err.message });
      }
    } finally {
      setLoading(false);
    }
  }, [hours, statusFilter, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const openDetail = async (run: any) => {
    setSelectedRun(run);
    setDetailLoading(true);
    try {
      const detail = await chatApi.getObservabilityRunDetail(run.id);
      setRunDetail(detail);
    } catch {
      setRunDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  if (!status) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status.enabled) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Activity className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">观测未启用</h3>
            <p className="text-muted-foreground text-center">
              请在 .env 中配置 LANGCHAIN_TRACING_V2=true 和 LANGCHAIN_API_KEY 以启用 LangSmith 观测
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            项目: <code className="bg-muted px-1.5 rounded">{status.project}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-28 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1小时</SelectItem>
              <SelectItem value="6">6小时</SelectItem>
              <SelectItem value="24">24小时</SelectItem>
              <SelectItem value="72">3天</SelectItem>
              <SelectItem value="168">7天</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="success">成功</SelectItem>
              <SelectItem value="error">错误</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Activity className="w-4 h-4" /> 总调用
              </div>
              <div className="text-2xl font-bold">{stats.total_runs}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <CheckCircle2 className="w-4 h-4 text-chart-2" /> 成功率
              </div>
              <div className="text-2xl font-bold">{stats.success_rate}%</div>
              <div className="text-xs text-muted-foreground">{stats.success} 成功 / {stats.errors} 失败</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Zap className="w-4 h-4 text-chart-4" /> Token 用量
              </div>
              <div className="text-2xl font-bold">{(stats.total_tokens / 1000).toFixed(1)}K</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Clock className="w-4 h-4 text-chart-1" /> 平均延迟
              </div>
              <div className="text-2xl font-bold">
                {stats.avg_latency_ms > 1000 ? `${(stats.avg_latency_ms / 1000).toFixed(1)}s` : `${stats.avg_latency_ms}ms`}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Runs List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">追踪记录</CardTitle>
          <CardDescription>{runs.length} 条记录</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && runs.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">暂无记录</p>
          ) : (
            <div className="space-y-1">
              {runs.map(run => (
                <div
                  key={run.id}
                  onClick={() => openDetail(run)}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                >
                  {run.status === 'success'
                    ? <CheckCircle2 className="w-4 h-4 text-chart-2 shrink-0" />
                    : <XCircle className="w-4 h-4 text-chart-5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium truncate">{run.name}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{run.run_type}</Badge>
                    </div>
                    {run.input_preview && (
                      <p className="text-xs text-muted-foreground truncate">{run.input_preview}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 text-xs text-muted-foreground">
                    {run.latency_ms != null && (
                      <div>{run.latency_ms > 1000 ? `${(run.latency_ms/1000).toFixed(1)}s` : `${run.latency_ms}ms`}</div>
                    )}
                    {run.total_tokens > 0 && <div>{run.total_tokens} tokens</div>}
                    {run.start_time && (
                      <div>{new Date(run.start_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Run Detail Dialog */}
      <Dialog open={!!selectedRun} onOpenChange={(open) => !open && setSelectedRun(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {runDetail?.status === 'success'
                ? <CheckCircle2 className="w-5 h-5 text-chart-2" />
                : <XCircle className="w-5 h-5 text-chart-5" />}
              {runDetail?.name || selectedRun?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
            {detailLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : runDetail && (
              <>
                {/* Metrics */}
                <div className="flex gap-4 text-sm flex-wrap">
                  <div><span className="text-muted-foreground">状态:</span> <Badge variant={runDetail.status === 'success' ? 'outline' : 'destructive'}>{runDetail.status}</Badge></div>
                  {runDetail.latency_ms != null && <div><span className="text-muted-foreground">耗时:</span> {runDetail.latency_ms}ms</div>}
                  {runDetail.total_tokens > 0 && <div><span className="text-muted-foreground">Token:</span> {runDetail.prompt_tokens}+{runDetail.completion_tokens}={runDetail.total_tokens}</div>}
                  {runDetail.metadata?.thread_id && <div><span className="text-muted-foreground">Thread:</span> <code className="text-xs">{runDetail.metadata.thread_id}</code></div>}
                </div>

                {runDetail.error && (
                  <pre className="p-3 bg-chart-5/10 text-chart-5 rounded-md text-xs overflow-auto">{runDetail.error}</pre>
                )}

                {/* Child Runs */}
                {runDetail.children && runDetail.children.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-2">子步骤 ({runDetail.children.length})</h4>
                      <div className="space-y-1">
                        {runDetail.children.map((child: any) => (
                          <div key={child.id} className="flex items-center gap-2 p-2 rounded border text-sm">
                            {child.status === 'success'
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-chart-2 shrink-0" />
                              : <XCircle className="w-3.5 h-3.5 text-chart-5 shrink-0" />}
                            <span className="font-medium truncate flex-1">{child.name}</span>
                            <Badge variant="outline" className="text-[10px]">{child.run_type}</Badge>
                            {child.latency_ms != null && <span className="text-xs text-muted-foreground">{child.latency_ms}ms</span>}
                            {child.total_tokens > 0 && <span className="text-xs text-muted-foreground">{child.total_tokens}tok</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Input/Output */}
                {runDetail.inputs && (
                  <>
                    <Separator />
                    <details className="text-xs">
                      <summary className="cursor-pointer text-sm font-medium">输入</summary>
                      <pre className="mt-2 p-3 bg-muted rounded-md overflow-auto max-h-48">{JSON.stringify(runDetail.inputs, null, 2)}</pre>
                    </details>
                  </>
                )}
                {runDetail.outputs && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-sm font-medium">输出</summary>
                    <pre className="mt-2 p-3 bg-muted rounded-md overflow-auto max-h-48">{JSON.stringify(runDetail.outputs, null, 2)}</pre>
                  </details>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
