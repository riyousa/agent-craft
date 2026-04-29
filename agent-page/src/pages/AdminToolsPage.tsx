/**
 * 全局工具 — admin-only top-level page.
 *
 * Renders ToolsManager in admin mode plus an AssignmentSheet driven
 * by the per-row 下发 button. The sheet floats from the right and
 * lets a super-admin push the selected tool out to chosen users.
 */
import React, { useState } from 'react';
import { adminToolsApi, UserTool } from '../api/user';
import { ToolsManager } from '../components/ToolsManager';
import { AssignmentSheet } from '../components/AssignmentSheet';

export const AdminToolsPage: React.FC = () => {
  const [target, setTarget] = useState<UserTool | null>(null);

  return (
    <>
      <ToolsManager api={adminToolsApi} onAssignClick={setTarget} />
      <AssignmentSheet
        kind="tool"
        item={target}
        open={!!target}
        onClose={() => setTarget(null)}
      />
    </>
  );
};
