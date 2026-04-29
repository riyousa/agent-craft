/**
 * User API client for managing tools, skills, files, and conversations
 */

import { apiClient } from './client';

// ========== Types ==========

export interface ToolParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: any;
  constraints?: Record<string, any>;
}

export interface ToolInputSchema {
  parameters: ToolParameter[];
}

export interface ToolOutputField {
  name: string;
  type: string;
  description: string;
}

export interface ToolOutputSchema {
  type: string;
  item_fields: ToolOutputField[];
}

export interface ToolPollingConfig {
  enabled?: boolean;
  status_endpoint?: string;
  task_id_path?: string;
  status_field?: string;
  completed_value?: string;
  failed_value?: string;
  result_path?: string;
  interval_seconds?: number;
  max_attempts?: number;
}

export interface ToolExecution {
  type?: string;
  config?: Record<string, any>;
  polling?: ToolPollingConfig;
  request_mapping?: Record<string, any>;
  response_mapping?: Record<string, any>;
  function_ref?: string;
  mcp?: McpExecutionConfig;
}

export interface McpExecutionConfig {
  transport?: 'http' | 'sse' | 'stdio';
  url?: string;
  command?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  auth?: {
    type?: 'none' | 'bearer_token' | 'api_key' | 'basic';
    env_key?: string;
    header_name?: string;
    username_env?: string;
    password_env?: string;
  };
  timeout?: number;
  tool_name?: string;
}

export interface DiscoveredMcpTool {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

export interface ToolCallingExample {
  scenario: string;
  params: Record<string, any>;
}

export interface UserTool {
  id?: number;
  tool_id?: string;
  name: string;
  display_name: string;
  description: string;
  calling_guide?: string;
  calling_examples?: ToolCallingExample[];
  input_schema: ToolInputSchema;
  output_schema: ToolOutputSchema;
  execution: ToolExecution;
  requires_approval?: boolean;
  enabled?: boolean;
  source?: string;
  created_at?: string;
}

export interface UserSkill {
  id?: number;
  skill_id?: string;
  name: string;
  display_name: string;
  description: string;
  category: string;
  calling_guide?: string;
  input_schema?: Record<string, any>;
  output_schema?: Record<string, any>;
  prompt_template: string;
  required_tools?: string[];
  quality_criteria?: string[];
  examples?: Record<string, any>;
  requires_approval?: boolean;
  enabled?: boolean;
  source?: string;
  created_at?: string;
}

export interface UserFile {
  id: number;
  filename: string;
  filepath: string;
  file_type: string;
  size_bytes: number;
  description?: string;
  created_at: string;
  updated_at?: string;
  asset_url?: string | null;
}

export interface WorkspaceInfo {
  id: number;
  user_id: number;
  workspace_path: string;
  max_storage_mb: number;
  used_storage_mb: number;
  file_count: number;
}

export interface Conversation {
  id: number;
  thread_id: string;
  title?: string;
  message_count: number;
  last_message?: string;
  created_at: string;
  updated_at?: string;
}

export interface ConversationMessages {
  thread_id: string;
  messages: any[];
  total_count: number;
}

// ========== User API Client ==========

// Per-tool / per-skill 7-day aggregates served by
// `GET /user/tools/metrics` and `GET /user/skills/metrics`.
export interface ToolMetric {
  calls_7d: number;
  p95_ms: number;
}
export interface SkillMetric {
  runs_7d: number;
  users_using: number;
  p95_ms: number;
}
export type ToolMetricsMap = Record<string, ToolMetric>;
export type SkillMetricsMap = Record<string, SkillMetric>;


class UserApiClient {
  // Tools

  async listTools(): Promise<UserTool[]> {
    const response = await apiClient.get('/user/tools');
    return response.data;
  }

  async listToolMetrics(): Promise<ToolMetricsMap> {
    const response = await apiClient.get('/user/tools/metrics');
    return response.data || {};
  }

  async listSkillMetrics(): Promise<SkillMetricsMap> {
    const response = await apiClient.get('/user/skills/metrics');
    return response.data || {};
  }

  async createTool(tool: UserTool): Promise<UserTool> {
    const response = await apiClient.post('/user/tools', tool);
    return response.data;
  }

  async updateTool(toolId: string, tool: Partial<UserTool>): Promise<UserTool> {
    const response = await apiClient.put(`/user/tools/${toolId}`, tool);
    return response.data;
  }

  async deleteTool(toolId: string): Promise<void> {
    await apiClient.delete(`/user/tools/${toolId}`);
  }

  async testTool(toolId: string, testParams: any = {}): Promise<any> {
    const response = await apiClient.post(`/user/tools/${toolId}/test`, testParams);
    return response.data;
  }

  async testConfig(execution: any, testParams: any = {}): Promise<any> {
    const response = await apiClient.post('/user/tools/test-config', { execution, test_params: testParams });
    return response.data;
  }

  async discoverMcpTools(mcp: McpExecutionConfig): Promise<{ ok: boolean; tools: DiscoveredMcpTool[] }> {
    const response = await apiClient.post('/user/tools/mcp/discover', { mcp });
    return response.data;
  }

  async importMcpTools(
    mcp: McpExecutionConfig,
    tools: Array<{ name: string; display_name?: string; description?: string; input_schema?: any; requires_approval?: boolean }>
  ): Promise<{ ok: boolean; inserted: string[]; skipped: string[]; message: string }> {
    const response = await apiClient.post('/user/tools/mcp/import', { mcp, tools });
    return response.data;
  }

  // Skills

  async listSkills(): Promise<UserSkill[]> {
    const response = await apiClient.get('/user/skills');
    return response.data;
  }

  async createSkill(skill: UserSkill): Promise<UserSkill> {
    const response = await apiClient.post('/user/skills', skill);
    return response.data;
  }

  async updateSkill(skillId: string, skill: Partial<UserSkill>): Promise<UserSkill> {
    const response = await apiClient.put(`/user/skills/${skillId}`, skill);
    return response.data;
  }

  async deleteSkill(skillId: string): Promise<void> {
    await apiClient.delete(`/user/skills/${skillId}`);
  }

  // Files

  async listFiles(fileType?: string): Promise<UserFile[]> {
    const params = fileType ? { file_type: fileType } : undefined;
    const response = await apiClient.get('/user/files/', { params });
    return response.data;
  }

  async uploadFile(file: File, fileType: string = 'files', description: string = ''): Promise<UserFile> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', fileType);
    formData.append('description', description);

    const response = await apiClient.post('/user/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async deleteFile(fileId: number): Promise<void> {
    await apiClient.delete(`/user/files/${fileId}`);
  }

  async downloadFileRaw(fileId: number): Promise<string> {
    const response = await apiClient.get(`/user/files/${fileId}/download`, {
      responseType: 'text',
    });
    return response.data;
  }

  async downloadFileBlob(fileId: number): Promise<Blob> {
    const response = await apiClient.get(`/user/files/${fileId}/view`, {
      responseType: 'blob',
    });
    return response.data;
  }

  async downloadFile(fileId: number, filename: string): Promise<void> {
    const response = await apiClient.get(`/user/files/${fileId}/download`, {
      responseType: 'blob',
    });

    const url = window.URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  async getWorkspaceInfo(): Promise<WorkspaceInfo> {
    const response = await apiClient.get('/user/files/workspace/info');
    return response.data;
  }

  // Conversations

  async listConversations(): Promise<Conversation[]> {
    const response = await apiClient.get('/user/conversations/');
    return response.data;
  }

  async getConversationMessages(threadId: string): Promise<ConversationMessages> {
    const response = await apiClient.get(`/user/conversations/${threadId}/messages`);
    return response.data;
  }

  async deleteConversation(threadId: string): Promise<void> {
    await apiClient.delete(`/user/conversations/${threadId}`);
  }

  async updateConversationTitle(threadId: string, title: string): Promise<void> {
    await apiClient.put(`/user/conversations/${threadId}/title`, null, {
      params: { title },
    });
  }
}

export const userApi = new UserApiClient();

// ========== Admin API Adapter (same interface, admin endpoints) ==========

export interface ToolsApi {
  listTools(): Promise<UserTool[]>;
  createTool(tool: UserTool): Promise<UserTool>;
  updateTool(toolId: string, tool: Partial<UserTool>): Promise<UserTool>;
  deleteTool(toolId: string): Promise<void>;
  testTool(toolId: string, testParams?: any): Promise<any>;
  testConfig(execution: any, testParams?: any): Promise<any>;
  discoverMcpTools(mcp: McpExecutionConfig): Promise<{ ok: boolean; tools: DiscoveredMcpTool[] }>;
  importMcpTools(
    mcp: McpExecutionConfig,
    tools: Array<{ name: string; display_name?: string; description?: string; input_schema?: any; requires_approval?: boolean }>
  ): Promise<{ ok: boolean; inserted: string[]; skipped: string[]; message: string }>;
}

export interface SkillsApi {
  listSkills(): Promise<UserSkill[]>;
  createSkill(skill: UserSkill): Promise<UserSkill>;
  updateSkill(skillId: string, skill: Partial<UserSkill>): Promise<UserSkill>;
  deleteSkill(skillId: string): Promise<void>;
}

class AdminToolsApiAdapter implements ToolsApi {
  async listTools(): Promise<UserTool[]> {
    const response = await apiClient.get('/admin/tools/');
    return response.data;
  }

  async createTool(tool: UserTool): Promise<UserTool> {
    const response = await apiClient.post('/admin/tools/', { tool });
    return response.data;
  }

  async updateTool(toolId: string, tool: Partial<UserTool>): Promise<UserTool> {
    const response = await apiClient.put(`/admin/tools/${toolId}`, { tool });
    return response.data;
  }

  async deleteTool(toolId: string): Promise<void> {
    await apiClient.delete(`/admin/tools/${toolId}`);
  }

  async testTool(_toolId: string, _testParams: any = {}): Promise<any> {
    return { ok: false, message: '全局工具不支持直接测试', latency_ms: 0 };
  }

  async testConfig(execution: any, testParams: any = {}): Promise<any> {
    const response = await apiClient.post('/user/tools/test-config', { execution, test_params: testParams });
    return response.data;
  }

  async discoverMcpTools(mcp: McpExecutionConfig): Promise<{ ok: boolean; tools: DiscoveredMcpTool[] }> {
    const response = await apiClient.post('/admin/tools/mcp/discover', { mcp });
    return response.data;
  }

  async importMcpTools(
    mcp: McpExecutionConfig,
    tools: Array<{ name: string; display_name?: string; description?: string; input_schema?: any; requires_approval?: boolean }>
  ): Promise<{ ok: boolean; inserted: string[]; skipped: string[]; message: string }> {
    const response = await apiClient.post('/admin/tools/mcp/import', { mcp, tools });
    return response.data;
  }
}

class AdminSkillsApiAdapter implements SkillsApi {
  async listSkills(): Promise<UserSkill[]> {
    const response = await apiClient.get('/admin/skills/');
    return response.data;
  }

  async createSkill(skill: UserSkill): Promise<UserSkill> {
    const response = await apiClient.post('/admin/skills/', { skill });
    return response.data;
  }

  async updateSkill(skillId: string, skill: Partial<UserSkill>): Promise<UserSkill> {
    const response = await apiClient.put(`/admin/skills/${skillId}`, { skill });
    return response.data;
  }

  async deleteSkill(skillId: string): Promise<void> {
    await apiClient.delete(`/admin/skills/${skillId}`);
  }
}

export const adminToolsApi = new AdminToolsApiAdapter();
export const adminSkillsApi = new AdminSkillsApiAdapter();

// ========== LLM Models API ==========

export interface LLMProviderInfo {
  key: string;
  display_name: string;
  description: string;
  default_base_url: string | null;
  supports_reasoning: boolean;
  supports_file_upload: boolean;
  api_key_required: boolean;
  docs_url: string;
  notes: string;
}

export interface AdminLLMModel {
  id: number;
  name: string;
  display_name: string;
  description: string;
  provider: string;
  model: string;
  api_key_masked: string;
  base_url: string;
  extra_config: Record<string, any>;
  enabled: boolean;
  visible_to_users: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at?: string;
}

export interface LLMModelInput {
  name: string;
  display_name: string;
  description?: string;
  provider: string;
  model: string;
  api_key?: string;
  base_url?: string;
  extra_config?: Record<string, any>;
  enabled?: boolean;
  visible_to_users?: boolean;
  is_default?: boolean;
  sort_order?: number;
}

export interface UserVisibleModel {
  name: string;
  display_name: string;
  description: string;
  provider: string;
  supports_reasoning: boolean;
  supports_file_upload: boolean;
  is_default: boolean;
}

class AdminModelsApi {
  async listProviders(): Promise<{ providers: LLMProviderInfo[] }> {
    const r = await apiClient.get('/admin/models/providers');
    return r.data;
  }

  async list(): Promise<AdminLLMModel[]> {
    const r = await apiClient.get('/admin/models/');
    return r.data;
  }

  async create(model: LLMModelInput): Promise<AdminLLMModel> {
    const r = await apiClient.post('/admin/models/', { model });
    return r.data;
  }

  async update(id: number, model: Partial<LLMModelInput>): Promise<AdminLLMModel> {
    const r = await apiClient.put(`/admin/models/${id}`, { model });
    return r.data;
  }

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/admin/models/${id}`);
  }

  async test(id: number, prompt?: string): Promise<{ ok: boolean; message: string; latency_ms: number; data?: any }> {
    const r = await apiClient.post(`/admin/models/${id}/test`, { prompt });
    return r.data;
  }
}

class UserModelsApi {
  async list(): Promise<UserVisibleModel[]> {
    const r = await apiClient.get('/user/models');
    return r.data;
  }
}

export const adminModelsApi = new AdminModelsApi();
export const userModelsApi = new UserModelsApi();
