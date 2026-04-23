import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
// All first-party APIs are mounted under /api/v1. Health and /assets/*
// (signed public URLs) remain at the origin root — the handful of
// callers that need those hit them directly without apiClient.
const API_V1_URL = `${API_BASE_URL}/api/v1`;

const apiClient = axios.create({
  baseURL: API_V1_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 添加请求拦截器，自动添加token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 添加响应拦截器，处理401错误
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // 如果是health检查或登录/注册接口，不自动跳转
    const publicPaths = ['/health', '/auth/login', '/auth/register'];
    const isPublicPath = publicPaths.some(path => error.config?.url?.includes(path));

    if (error.response?.status === 401 && !isPublicPath) {
      const errorData = error.response?.data;
      const errorCode = errorData?.detail?.code || errorData?.code;
      const errorMessage = errorData?.detail?.message || errorData?.message;

      // 根据错误类型显示不同提示
      let displayMessage = '认证失败，请重新登录';

      if (errorCode === 'TOKEN_EXPIRED') {
        displayMessage = '登录已过期，请重新登录';
      } else if (errorCode === 'TOKEN_INVALID') {
        displayMessage = '登录信息无效，请重新登录';
      } else if (errorCode === 'TOKEN_MISSING') {
        displayMessage = '请先登录';
      } else if (errorMessage) {
        displayMessage = errorMessage;
      }

      // 显示提示（如果页面上有toast组件）
      const toastEvent = new CustomEvent('auth-error', {
        detail: { message: displayMessage, code: errorCode }
      });
      window.dispatchEvent(toastEvent);

      // 清除本地存储并跳转到登录页
      localStorage.removeItem('token');

      // 延迟跳转，让用户看到提示
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    }
    return Promise.reject(error);
  }
);

export { apiClient };

export interface UserInfo {
  user_id: number;
  name: string;
  role_level: number;
  enable_reasoning?: boolean;  // 是否启用推理模式
}

export interface ChatRequest {
  thread_id: string;
  message: string;
  user_info: UserInfo;
  file_urls?: string[];
  checkpoint_id?: string;
  model_id?: string;
}

export interface ChatResponse {
  thread_id: string;
  response: string;
  status: string;
  requires_approval: boolean;
}

export interface Message {
  role: string;
  content: string;
  timestamp?: string;
  tool_calls?: any[];
  steps?: Array<{
    type: 'tool_call' | 'tool_result' | 'thinking';
    name?: string;
    args?: Record<string, any>;
    content?: string;
    timestamp?: string;
  }>;
}

export interface HistoryResponse {
  thread_id: string;
  messages: Message[];
  total_count: number;
}

export interface ConversationListItem {
  id: number;
  thread_id: string;
  title: string;
  message_count: number;
  last_message: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessagesResponse {
  thread_id: string;
  messages: Message[];
  total_count: number;
}

export interface StreamEvent {
  type: 'user_message' | 'ai_message' | 'tool_calls' | 'tool_result' | 'thinking' | 'final' | 'error';
  content?: string;
  tool_calls?: Array<{
    name: string;
    args: Record<string, any>;
    id: string;
  }>;
  tool_call_id?: string;
  name?: string;
  requires_approval?: boolean;
  approval_details?: Array<{
    name: string;
    display_name?: string;
    description?: string;
    args: Record<string, any>;
  }>;
  error?: string;
}

export const chatApi = {
  sendMessage: async (request: ChatRequest): Promise<ChatResponse> => {
    const response = await apiClient.post<ChatResponse>('/chat', request);
    return response.data;
  },

  streamMessage: async (
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void,
    onComplete: () => void,
    onError: (error: string) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    // Guarantee exactly one completion signal. The caller (ChatInterface)
    // releases its `loading` lock in onComplete/onError — if the stream ends
    // in an exotic path (e.g. network drop between events) we still need to
    // fire one of them, or the UI freezes.
    let settled = false;
    const complete = () => {
      if (!settled) {
        settled = true;
        onComplete();
      }
    };
    const fail = (msg: string) => {
      if (!settled) {
        settled = true;
        onError(msg);
      }
    };

    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_V1_URL}/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              complete();
              return;
            }

            try {
              const event: StreamEvent = JSON.parse(data);
              onEvent(event);
            } catch (e) {
              console.error('Failed to parse event:', data);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        complete(); // Treat cancel as complete, not error
        return;
      }
      fail(error.message || 'Stream error');
    } finally {
      // Fallback: if we fell out of the while-loop without seeing [DONE]
      // (server closed the connection cleanly but didn't send the marker),
      // still call onComplete so the UI unlocks.
      complete();
    }
  },

  getHistory: async (threadId: string): Promise<HistoryResponse> => {
    const response = await apiClient.get<HistoryResponse>(`/history/${threadId}`);
    return response.data;
  },

  // Conversations API
  listConversations: async (page = 1, pageSize = 20): Promise<{ items: ConversationListItem[]; total: number; has_more: boolean }> => {
    const response = await apiClient.get('/user/conversations/', { params: { page, page_size: pageSize } });
    return response.data;
  },

  getConversationMessages: async (threadId: string): Promise<ConversationMessagesResponse> => {
    const response = await apiClient.get(`/user/conversations/${threadId}/messages`);
    return response.data;
  },

  deleteConversation: async (threadId: string): Promise<void> => {
    await apiClient.delete(`/user/conversations/${threadId}`);
  },

  updateConversationTitle: async (threadId: string, title: string): Promise<void> => {
    await apiClient.put(`/user/conversations/${threadId}/title`, null, {
      params: { title },
    });
  },

  approve: async (threadId: string): Promise<any> => {
    const response = await apiClient.post('/callback', {
      thread_id: threadId,
      action: 'approve',
    });
    return response;
  },

  reject: async (threadId: string): Promise<any> => {
    const response = await apiClient.post('/callback', {
      thread_id: threadId,
      action: 'reject',
    });
    return response;
  },

  // State management
  getThreadState: async (threadId: string, checkpointId?: string): Promise<any> => {
    const params = checkpointId ? { checkpoint_id: checkpointId } : undefined;
    const response = await apiClient.get(`/state/thread/${threadId}`, { params });
    return response.data;
  },

  getThreadHistory: async (threadId: string, limit = 20): Promise<any> => {
    const response = await apiClient.get(`/state/thread/${threadId}/history`, { params: { limit } });
    return response.data;
  },

  rollbackThread: async (threadId: string, checkpointId?: string, steps?: number): Promise<any> => {
    const response = await apiClient.post(`/state/thread/${threadId}/rollback`, null, {
      params: { checkpoint_id: checkpointId, steps: steps || 1 },
    });
    return response.data;
  },

  resumeThread: async (threadId: string): Promise<any> => {
    const response = await apiClient.post(`/state/thread/${threadId}/resume`);
    return response.data;
  },

  // Observability
  getObservabilityStatus: async (): Promise<any> => {
    const response = await apiClient.get('/observability/status');
    return response.data;
  },

  getObservabilityRuns: async (params?: { limit?: number; offset?: number; hours?: number; status?: string }): Promise<any> => {
    const response = await apiClient.get('/observability/runs', { params });
    return response.data;
  },

  getObservabilityRunDetail: async (runId: string): Promise<any> => {
    const response = await apiClient.get(`/observability/runs/${runId}`);
    return response.data;
  },

  getObservabilityStats: async (hours?: number): Promise<any> => {
    const response = await apiClient.get('/observability/stats', { params: { hours } });
    return response.data;
  },

  checkHealth: async (): Promise<{ status: string; version: string }> => {
    // /health is unversioned; bypass apiClient's /api/v1 baseURL.
    const response = await axios.get(`${API_BASE_URL}/health`);
    return response.data;
  },

  // AI Helper
  parseToolConfig: async (description: string): Promise<{ tool_config: any; explanation: string }> => {
    const response = await apiClient.post('/ai-helper/parse-tool-config', {
      description,
    });
    return response.data;
  },

  parseSkillConfig: async (
    description: string,
    availableTools: Array<{
      name: string;
      display_name: string;
      description: string;
      requires_approval?: boolean;
      input_schema?: Record<string, any>;
      output_schema?: Record<string, any>;
    }>
  ): Promise<{
    skill_config: any;
    suggested_tools: string[];
    requires_approval: boolean;
    explanation: string;
  }> => {
    const response = await apiClient.post('/ai-helper/parse-skill-config', {
      description,
      available_tools: availableTools,
    });
    return response.data;
  },
};

// ========== User Management API (Admin) ==========

export interface AssignmentResponse {
  success: boolean;
  message: string;
  assigned_count: number;
  tools_inserted?: number;
  tools_updated?: number;
  missing_tool_names?: string[];
}

export interface ManagedUser {
  id: number;
  name: string;
  phone: string;
  email?: string;
  role_level: number;
  is_active: boolean;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface UserListResponse {
  users: ManagedUser[];
  total: number;
}

export const adminUserApi = {
  listUsers: async (params?: {
    page?: number;
    page_size?: number;
    search?: string;
    role_level?: number;
    is_active?: boolean;
  }): Promise<UserListResponse> => {
    const response = await apiClient.get('/admin/users/', { params });
    return response.data;
  },

  getUser: async (userId: number): Promise<ManagedUser> => {
    const response = await apiClient.get(`/admin/users/${userId}`);
    return response.data;
  },

  createUser: async (data: {
    name: string;
    phone: string;
    password: string;
    email?: string;
    role_level?: number;
    tags?: string[];
  }): Promise<ManagedUser> => {
    const response = await apiClient.post('/admin/users/', data);
    return response.data;
  },

  updateUser: async (userId: number, data: {
    name?: string;
    email?: string;
    role_level?: number;
    is_active?: boolean;
    tags?: string[];
  }): Promise<ManagedUser> => {
    const response = await apiClient.put(`/admin/users/${userId}`, data);
    return response.data;
  },

  resetPassword: async (userId: number, newPassword: string): Promise<void> => {
    await apiClient.post(`/admin/users/${userId}/reset-password`, {
      new_password: newPassword,
    });
  },

  deleteUser: async (userId: number): Promise<void> => {
    await apiClient.delete(`/admin/users/${userId}`);
  },

  listTags: async (): Promise<string[]> => {
    const response = await apiClient.get('/admin/users/tags');
    return response.data.tags;
  },

  // Global tool/skill management
  listAdminTools: async (): Promise<any[]> => {
    const response = await apiClient.get('/admin/tools/');
    return response.data;
  },

  listAdminSkills: async (): Promise<any[]> => {
    const response = await apiClient.get('/admin/skills/');
    return response.data;
  },

  assignTool: async (toolId: string, userIds: number[], mode: string = 'assign'): Promise<AssignmentResponse> => {
    const response = await apiClient.post('/admin/tools/assign', { tool_id: toolId, user_ids: userIds, mode });
    return response.data;
  },

  assignSkill: async (skillId: string, userIds: number[], mode: string = 'assign'): Promise<AssignmentResponse> => {
    const response = await apiClient.post('/admin/skills/assign', { skill_id: skillId, user_ids: userIds, mode });
    return response.data;
  },

  getToolAssignedUsers: async (toolId: string): Promise<number[]> => {
    const response = await apiClient.get(`/admin/tools/${toolId}/assigned-users`);
    return response.data.user_ids;
  },

  getSkillAssignedUsers: async (skillId: string): Promise<number[]> => {
    const response = await apiClient.get(`/admin/skills/${skillId}/assigned-users`);
    return response.data.user_ids;
  },

  revokeTool: async (toolId: string, userIds: number[]): Promise<any> => {
    const response = await apiClient.post(`/admin/tools/${toolId}/revoke`, { user_ids: userIds });
    return response.data;
  },

  revokeSkill: async (skillId: string, userIds: number[]): Promise<any> => {
    const response = await apiClient.post(`/admin/skills/${skillId}/revoke`, { user_ids: userIds });
    return response.data;
  },
};
