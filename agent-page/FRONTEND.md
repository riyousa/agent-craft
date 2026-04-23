# 前端开发说明

## 开发规范

### 组件使用

**必须使用 shadcn/ui 组件**，禁止使用原生 HTML 元素：

| 禁止 | 使用 | 导入 |
|------|------|------|
| `<button>` | `<Button>` | `import { Button } from './ui/button'` |
| `<input>` | `<Input>` | `import { Input } from './ui/input'` |
| `<textarea>` | `<Textarea>` | `import { Textarea } from './ui/textarea'` |
| `<select>` | `<Select>` | `import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select'` |
| `<label>` | `<Label>` | `import { Label } from './ui/label'` |
| 弹窗 | `<Dialog>` / `<AlertDialog>` | 对应 ui 组件 |
| 卡片容器 | `<Card>` | `import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card'` |

### 颜色使用

**禁止硬编码颜色**，使用 Tailwind 语义类：

```tsx
// 正确
className="bg-primary text-primary-foreground"
className="bg-muted text-muted-foreground"
className="bg-destructive text-destructive-foreground"
className="border-border bg-background"

// 错误
className="bg-blue-500 text-white"
style={{ color: '#333' }}
```

暗色模式自动适配（CSS 变量在 `index.css` 的 `.dark` 选择器中定义）。

### API 调用

所有请求通过 `apiClient`（`api/client.ts`），自动处理：
- Token 注入（从 localStorage 读取）
- 401 拦截（清除 token + 跳转登录页）

```tsx
import { apiClient } from '../api/client';

// 直接使用
const res = await apiClient.get('/some-endpoint');

// 或使用封装好的 API
import { userApi } from '../api/user';
const tools = await userApi.listTools();
```

### 组件复用模式

工具/技能管理组件通过 API 适配器支持用户模式和管理员模式：

```tsx
// 用户模式（默认）
<UserToolsManager />

// 管理员模式（传入 admin API + 返回回调）
import { adminToolsApi } from '../api/user';
<UserToolsManager api={adminToolsApi} onBack={() => setMode('list')} />
```

接口定义：
```typescript
interface ToolsApi {
  listTools(): Promise<UserTool[]>;
  createTool(tool: UserTool): Promise<UserTool>;
  updateTool(toolId: string, tool: Partial<UserTool>): Promise<UserTool>;
  deleteTool(toolId: string): Promise<void>;
  testTool(toolId: string, testParams?: any): Promise<any>;
}
```

### Toast 消息

```tsx
import { useToast } from '../hooks/use-toast';

const { toast } = useToast();

// 普通提醒 (5秒自动关闭)
toast({ title: '操作成功' });

// 错误提醒 (10秒自动关闭)
toast({ variant: 'destructive', title: '操作失败', description: '详细原因' });

// 成功提醒
toast({ variant: 'success', title: '创建成功' });
```

### 确认弹窗

```tsx
import { useConfirmDialog } from './ui/confirm-dialog';

const { showConfirm, ConfirmDialog } = useConfirmDialog();

showConfirm({
  title: '确认删除',
  description: '此操作无法撤销',
  confirmText: '删除',
  variant: 'danger',
  onConfirm: async () => { await deleteItem(); },
});

// JSX 中渲染
return <><ConfirmDialog />...</>;
```

### 页面布局

列表页标准结构：
```tsx
<div className="container mx-auto p-6 max-w-7xl">
  <div className="flex items-center justify-between mb-6">
    <p className="text-sm text-muted-foreground">共 {items.length} 个</p>
    <Button onClick={handleCreate}><Plus />创建</Button>
  </div>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {/* Card 列表 */}
  </div>
</div>
```

编辑页标准头部：
```tsx
<div className="flex items-center justify-between mb-6">
  <div className="flex items-center gap-3">
    <Button variant="ghost" size="sm" onClick={handleBack}>← 返回</Button>
    <Separator orientation="vertical" className="h-4" />
    <span className="text-sm text-muted-foreground">编辑 · {name}</span>
  </div>
  <div className="flex gap-3">
    <Button variant="outline" onClick={handleCancel}>取消</Button>
    <Button onClick={handleSave}>保存</Button>
  </div>
</div>
```

## 注意事项

- 项目使用 CRA (react-scripts)，路径别名用相对路径，不用 `@/`
- shadcn CLI 安装组件后需手动将 `@/lib/utils` 改为 `../../lib/utils`
- `SidebarProvider` 自带 `min-h-svh`，在 Layout 中用 `!min-h-0 h-full` 覆盖以支持内容滚动
- 侧边栏菜单按权限动态显示：`role >= 2` 显示用户管理，`role >= 3` 显示全局管理

## 开发命令

```bash
cd agent-page && npm start           # 开发服务器 (http://localhost:3000)
cd agent-page && npm run build       # 生产构建
cd agent-page && npx tsc --noEmit    # 类型检查

# 或从项目根目录
make run-page
make install-page
```
