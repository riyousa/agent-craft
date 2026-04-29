/**
 * AssignmentSheet — push an admin tool/skill out to selected users.
 *
 * Right-side Sheet opened from the row's "下发" icon button on
 * AdminToolsPage / AdminSkillsPage. Encapsulates the entire user
 * picker (mode tabs, tag filter, eligibility-aware user grid) so the
 * admin pages just open it with `{ kind, item }` and forget.
 *
 * Was previously inline inside GlobalManagement; extracted here so
 * each admin page (admin-tools / admin-skills) can drive assignment
 * from a row action without leaving the list view.
 */
import React, { useEffect, useState } from 'react';
import { Check, Tag, Users } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { adminUserApi, ManagedUser, AssignmentResponse } from '../api/client';
import { useToast } from '../hooks/use-toast';
import { TablePagination } from './design';
import { cn } from '../lib/utils';

const USERS_PAGE_SIZE = 20;

type Kind = 'tool' | 'skill';
type Mode = 'assign' | 'update' | 'revoke';

interface AssignmentSheetProps {
  kind: Kind;
  /** Current item (admin tool or skill row); null = sheet closed. */
  item: any | null;
  open: boolean;
  onClose: () => void;
  /** Optional callback after a successful assign/update/revoke — the
   *  admin page can refresh its list to reflect new assigned counts. */
  onSuccess?: () => void;
}

export const AssignmentSheet: React.FC<AssignmentSheetProps> = ({
  kind,
  item,
  open,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  // The full user list is loaded eagerly so tag-based selection can
  // reach users on later pages (selecting a tag with 30 matches must
  // pick all 30, not just the 20 visible on page 1). The visible page
  // is then sliced client-side from `allUsers`.
  const [allUsers, setAllUsers] = useState<ManagedUser[]>([]);
  const [page, setPage] = useState(1);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [assignedUserIds, setAssignedUserIds] = useState<Set<number>>(new Set());
  // Selection persists across page changes so an admin can build up a
  // multi-page selection before submitting.
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('assign');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Derived: client-side pagination over allUsers.
  const total = allUsers.length;
  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const users = allUsers.slice(
    (safePage - 1) * USERS_PAGE_SIZE,
    safePage * USERS_PAGE_SIZE,
  );

  // Single load when a new item opens: pulls every user (page-by-page,
  // server cap = 100/page), then tags + already-assigned ids. This
  // avoids the "tag selects only visible page" bug at the cost of one
  // extra round-trip when total > 100 — acceptable for an admin tool.
  useEffect(() => {
    if (!open || !item) return;
    let cancelled = false;
    setLoading(true);
    setSelectedUserIds(new Set());
    setSelectedTags(new Set());
    setMode('assign');
    setPage(1);
    setAllUsers([]);

    const itemId = kind === 'tool' ? item.tool_id : item.skill_id;
    const assignedP =
      kind === 'tool'
        ? adminUserApi.getToolAssignedUsers(itemId).catch(() => [] as number[])
        : adminUserApi.getSkillAssignedUsers(itemId).catch(() => [] as number[]);
    const tagsP = adminUserApi.listTags();

    (async () => {
      try {
        const SERVER_PAGE = 100;
        const first = await adminUserApi.listUsers({
          page: 1,
          page_size: SERVER_PAGE,
        });
        if (cancelled) return;
        const accum: ManagedUser[] = [...first.users];
        const totalServerPages = Math.ceil((first.total || 0) / SERVER_PAGE);
        if (totalServerPages > 1) {
          const rest = await Promise.all(
            Array.from({ length: totalServerPages - 1 }, (_, i) =>
              adminUserApi.listUsers({
                page: i + 2,
                page_size: SERVER_PAGE,
              }),
            ),
          );
          if (cancelled) return;
          rest.forEach((r) => accum.push(...r.users));
        }
        const [tags, assigned] = await Promise.all([tagsP, assignedP]);
        if (cancelled) return;
        setAllUsers(accum);
        setAllTags(tags);
        setAssignedUserIds(new Set(assigned));
      } catch (err: any) {
        if (!cancelled) {
          toast({
            variant: 'destructive',
            title: '加载失败',
            description: err?.response?.data?.detail || err?.message,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, item, kind, toast]);

  // Tag filter scans the FULL user list, not just the visible page,
  // so tags with > USERS_PAGE_SIZE matches still select everyone.
  useEffect(() => {
    if (selectedTags.size === 0) return;
    const ids = allUsers
      .filter((u) => u.tags && u.tags.some((t) => selectedTags.has(t)))
      .map((u) => u.id);
    setSelectedUserIds(new Set(ids));
  }, [selectedTags, allUsers]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const toggleUser = (id: number) => {
    setSelectedTags(new Set());
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Now scoped to the currently visible page since we paginate the
  // user list. We add to (rather than replace) selectedUserIds so the
  // admin can build a multi-page selection by paging + clicking 本页全选.
  const selectAllOnPage = () => {
    setSelectedTags(new Set());
    const eligible = users.filter((u) =>
      mode === 'assign' ? !assignedUserIds.has(u.id) : assignedUserIds.has(u.id),
    );
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      eligible.forEach((u) => next.add(u.id));
      return next;
    });
  };

  const selectNone = () => {
    setSelectedTags(new Set());
    setSelectedUserIds(new Set());
  };

  const handleSubmit = async () => {
    if (!item || selectedUserIds.size === 0) return;
    setSubmitting(true);
    try {
      const userIds = Array.from(selectedUserIds);
      const itemId = kind === 'tool' ? item.tool_id : item.skill_id;

      if (mode === 'revoke') {
        const res =
          kind === 'tool'
            ? await adminUserApi.revokeTool(itemId, userIds)
            : await adminUserApi.revokeSkill(itemId, userIds);
        toast({ title: '撤回成功', description: res.message });
      } else {
        const assignRes: AssignmentResponse =
          kind === 'tool'
            ? await adminUserApi.assignTool(itemId, userIds, mode)
            : await adminUserApi.assignSkill(itemId, userIds, mode);

        const title = mode === 'update' ? '更新成功' : '下发成功';
        const desc = `已${mode === 'update' ? '更新' : '下发'}至 ${assignRes.assigned_count} 个用户`;
        toast({ title, description: desc });

        // Skill assignments cascade onto required tools — surface the
        // dependency-tool side-effect so the admin sees what happened.
        const inserted = assignRes.tools_inserted ?? 0;
        const updated = assignRes.tools_updated ?? 0;
        if (kind === 'skill' && (inserted > 0 || updated > 0)) {
          const parts: string[] = [];
          if (inserted > 0) parts.push(`新增 ${inserted} 个工具`);
          if (updated > 0) parts.push(`更新 ${updated} 个工具`);
          toast({
            title: '依赖工具已同步',
            description:
              parts.join('，') + '（技能依赖的工具已自动下发给相同用户）',
          });
        }

        const missing = assignRes.missing_tool_names ?? [];
        if (missing.length > 0) {
          toast({
            variant: 'destructive',
            title: '缺少依赖工具',
            description: `以下工具未在管理员工具库中：${missing.join('、')}。请先在"全局工具"中创建。`,
          });
        }
      }
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '操作失败',
        description: err?.response?.data?.detail || err?.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const noun = kind === 'tool' ? '工具' : '技能';

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col gap-0 overflow-hidden p-0"
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="text-base">
            下发{noun} ·「{item?.display_name || ''}」
          </SheetTitle>
          <SheetDescription>
            已下发 {assignedUserIds.size} 个用户。选择新增、更新或撤回。
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={mode === 'assign' ? 'default' : 'ghost'}
              onClick={() => {
                setMode('assign');
                selectNone();
              }}
            >
              新下发
            </Button>
            <Button
              size="sm"
              variant={mode === 'update' ? 'default' : 'ghost'}
              onClick={() => {
                setMode('update');
                selectNone();
              }}
            >
              更新下发
            </Button>
            <Button
              size="sm"
              variant={mode === 'revoke' ? 'default' : 'ghost'}
              className={cn(
                mode === 'revoke' && 'bg-chart-5 hover:bg-chart-5/90',
              )}
              onClick={() => {
                setMode('revoke');
                selectNone();
              }}
            >
              撤回
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === 'assign' && `选择未拥有的用户进行首次下发`}
            {mode === 'update' && `选择已拥有的用户更新到最新配置`}
            {mode === 'revoke' && `选择已拥有的用户撤回此${noun}`}
          </p>

          {/* Quick actions + tag filter */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAllOnPage}>
              本页全选
            </Button>
            <Button variant="outline" size="sm" onClick={selectNone}>
              取消选中
            </Button>
            {allTags.length > 0 && (
              <>
                <Separator orientation="vertical" className="h-4 mx-1" />
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => {
                    const active = selectedTags.has(tag);
                    return (
                      <Badge
                        key={tag}
                        variant={active ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleTag(tag)}
                      >
                        <Tag className="w-3 h-3 mr-1" />
                        {tag}
                        {active && <Check className="w-3 h-3 ml-1" />}
                      </Badge>
                    );
                  })}
                </div>
              </>
            )}
            <span className="ml-auto text-sm text-muted-foreground">
              已选 {selectedUserIds.size}
            </span>
          </div>

          {/* User grid */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-primary border-r-transparent" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <Users className="h-8 w-8 mb-2" />
              <p className="text-sm">暂无可下发的用户</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {users.map((u) => {
                const hasIt = assignedUserIds.has(u.id);
                const disabled = mode === 'assign' ? hasIt : !hasIt;
                const checked = selectedUserIds.has(u.id);
                return (
                  <div
                    key={u.id}
                    onClick={() => !disabled && toggleUser(u.id)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                      disabled && 'opacity-40 cursor-not-allowed',
                      !disabled && checked && 'bg-primary/5 border-primary cursor-pointer',
                      !disabled && !checked && 'hover:bg-accent cursor-pointer',
                    )}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded border flex items-center justify-center flex-shrink-0',
                        disabled && 'border-muted bg-muted',
                        !disabled && checked && 'bg-primary border-primary text-primary-foreground',
                        !disabled && !checked && 'border-input',
                      )}
                    >
                      {(checked || (disabled && hasIt)) && (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{u.name}</span>
                        {hasIt && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            已有
                          </Badge>
                        )}
                      </div>
                      {u.tags && u.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {u.tags.map((t) => (
                            <Badge
                              key={t}
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <TablePagination
            page={safePage}
            totalPages={totalPages}
            totalItems={total}
            onPageChange={setPage}
            hint={`共 ${total} 个用户 · 每页 ${USERS_PAGE_SIZE}`}
          />
        </div>

        <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={selectedUserIds.size === 0 || submitting}
            className={cn(mode === 'revoke' && 'bg-chart-5 hover:bg-chart-5/90')}
          >
            {submitting
              ? '执行中...'
              : mode === 'assign'
                ? `下发给 ${selectedUserIds.size} 个用户`
                : mode === 'update'
                  ? `更新 ${selectedUserIds.size} 个用户`
                  : `从 ${selectedUserIds.size} 个用户撤回`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
