/**
 * 全局技能 — admin-only top-level page.
 *
 * Renders SkillsManager in admin mode plus an AssignmentSheet driven
 * by the per-row 下发 button. Skill assignment cascades onto required
 * tools — that side-effect surfaces in a second toast inside the sheet.
 */
import React, { useState } from 'react';
import { adminSkillsApi, adminToolsApi, UserSkill } from '../api/user';
import { SkillsManager } from '../components/SkillsManager';
import { AssignmentSheet } from '../components/AssignmentSheet';

export const AdminSkillsPage: React.FC = () => {
  const [target, setTarget] = useState<UserSkill | null>(null);

  return (
    <>
      <SkillsManager
        api={adminSkillsApi}
        toolsApi={adminToolsApi}
        onAssignClick={setTarget}
      />
      <AssignmentSheet
        kind="skill"
        item={target}
        open={!!target}
        onClose={() => setTarget(null)}
      />
    </>
  );
};
