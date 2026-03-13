/// <reference lib="dom" />
// API客户端，用于处理HTTP请求

import { toast } from 'sonner';

// 定义RequestInit类型以确保TypeScript正确识别
interface RequestInit {
  method?: string;
  headers?: Headers | Record<string, string>;
  body?: BodyInit | null;
  mode?: string;
  credentials?: string;
  cache?: string;
  redirect?: string;
  referrerPolicy?: string;
  integrity?: string;
  keepalive?: boolean;
  signal?: AbortSignal;
}

// API基础URL
const API_BASE_URL = '/api';

// 请求配置接口
interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: any;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
}

// 错误处理
class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// 构建完整URL
function buildUrl(endpoint: string, params?: Record<string, string | number | boolean>): string {
  let url = `${API_BASE_URL}${endpoint}`;
  
  // 处理URL参数
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    }
    const paramsString = searchParams.toString();
    if (paramsString) {
      url += `?${paramsString}`;
    }
  }
  
  return url;
}

// 处理响应
async function handleResponse(response: Response): Promise<any> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.message || `API请求失败: ${response.status}`);
  }
  
  // 处理空响应
  if (response.status === 204) {
    return null;
  }
  
  return response.json();
}

// 基本请求函数
async function request<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  try {
    // 合并默认头信息
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    
    // 添加认证token
    const token = localStorage.getItem('authToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // 构建请求配置
    const requestConfig: RequestInit = {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    };
    
    // 发送请求
    const url = buildUrl(endpoint, options.params);
    const response = await fetch(url, requestConfig);
    
    // 处理响应
    return await handleResponse(response);
  } catch (error) {
    // 处理网络错误
    if (error instanceof Error) {
      toast.error(error.message);
    } else {
      toast.error('网络请求失败，请检查您的连接');
    }
    
    throw error;
  }
}

// API客户端
const apiClient = {
  // GET请求
  get<T = any>(
    endpoint: string,
    params?: Record<string, string | number | boolean>,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<T> {
    return request<T>(endpoint, {
      ...options,
      method: 'GET',
      params,
    });
  },
  
  // POST请求
  post<T = any>(
    endpoint: string,
    body?: any,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<T> {
    return request<T>(endpoint, {
      ...options,
      method: 'POST',
      body,
    });
  },
  
  // PUT请求
  put<T = any>(
    endpoint: string,
    body?: any,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<T> {
    return request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body,
    });
  },
  
  // PATCH请求
  patch<T = any>(
    endpoint: string,
    body?: any,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<T> {
    return request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body,
    });
  },
  
  // DELETE请求
  delete<T = any>(
    endpoint: string,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<T> {
    return request<T>(endpoint, {
      ...options,
      method: 'DELETE',
    });
  },
  
  // 上传文件
  upload<T = any>(
    endpoint: string,
    file: File,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);
    
    return request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
      headers: {
        ...options.headers,
        // 不需要Content-Type，浏览器会自动设置
      },
    });
  },
  
  // 下载文件
  download(
    endpoint: string,
    filename?: string,
    params?: Record<string, string | number | boolean>
  ): void {
    const url = buildUrl(endpoint, params);
    const link = document.createElement('a');
    link.href = url;
    
    // 添加认证token到URL
    const token = localStorage.getItem('authToken');
    if (token) {
      link.href += (link.href.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`;
    }
    
    if (filename) {
      link.download = filename;
    }
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
};

export default apiClient;
export { ApiError };