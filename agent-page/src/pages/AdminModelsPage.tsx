/**
 * 模型管理 — admin-only top-level page.
 *
 * Composition:
 *   PageHeader · breadcrumb 管理 / 模型管理
 *   PageTitle  · "模型管理" + description
 *   ModelsManager — vendor cards + drawer editor
 */
import React, { useEffect, useState } from 'react';
import { adminModelsApi, AdminLLMModel } from '../api/user';
import { ModelsManager } from '../components/ModelsManager';
import { PageHeader, PageTitle } from '../components/design';

export const AdminModelsPage: React.FC = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adminModelsApi
      .list()
      .then((list: AdminLLMModel[]) => {
        if (!cancelled) setCount(list.length);
      })
      .catch(() => {
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-background">
      <PageHeader
        breadcrumb={['管理', '模型管理']}
        subtitle={`${count} 个模型`}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-7 pt-6 pb-12">
          <PageTitle
            title="模型管理"
            description="管理可用的 LLM 模型与 provider 配置；启用、可见性、默认模型与 API Key 都在这里维护。"
          />

          <div className="mt-6">
            <ModelsManager />
          </div>
        </div>
      </div>
    </div>
  );
};
