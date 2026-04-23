import { apiClient } from './client';
import {
  User,
  UserSchema,
  TokenResponse,
  TokenResponseSchema,
  ApiKeyInfo,
  ApiKeyInfoSchema,
  ApiKeyCreated,
  ApiKeyCreatedSchema,
} from './schemas';

export type { User, TokenResponse, ApiKeyInfo, ApiKeyCreated };

/**
 * 用户登录
 */
export async function login(phone: string, password: string): Promise<TokenResponse> {
  const response = await apiClient.post('/auth/login', { phone, password });
  return TokenResponseSchema.parse(response.data);
}

/**
 * 用户注册
 */
export async function register(
  phone: string,
  password: string,
  name: string,
  email?: string
): Promise<TokenResponse> {
  const response = await apiClient.post('/auth/register', {
    phone,
    password,
    name,
    email,
  });
  return TokenResponseSchema.parse(response.data);
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser(token: string): Promise<User> {
  const response = await apiClient.get('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return UserSchema.parse(response.data);
}

/**
 * 修改密码
 */
export async function changePassword(
  _token: string,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  await apiClient.post('/auth/change-password', {
    old_password: oldPassword,
    new_password: newPassword,
  });
}

/**
 * 登出
 */
export async function logout(_token: string): Promise<void> {
  await apiClient.post('/auth/logout', {});
}

// ========== API Keys ==========

export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  const response = await apiClient.get('/auth/api-keys/');
  return ApiKeyInfoSchema.array().parse(response.data);
}

export async function createApiKey(name: string, autoApprove: boolean = false): Promise<ApiKeyCreated> {
  const response = await apiClient.post('/auth/api-keys/', { name, auto_approve: autoApprove });
  return ApiKeyCreatedSchema.parse(response.data);
}

export async function deleteApiKey(keyId: number): Promise<void> {
  await apiClient.delete(`/auth/api-keys/${keyId}`);
}
