import { toast } from 'sonner';

const API_BASE_URL = '/api';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | object | null;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function buildApiUrl(endpoint: string, params?: Record<string, string | number | boolean>): string {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = new URL(`${API_BASE_URL}${normalizedEndpoint}`, window.location.origin);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return `${url.pathname}${url.search}`;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({} as { message?: string }));
    throw new ApiError(response.status, errorData.message || `API request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  try {
    const headers: Record<string, string> = {
      ...options.headers,
    };

    const token = localStorage.getItem('authToken');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (!isFormData && options.body !== undefined && options.body !== null) {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    }

    const requestConfig: RequestInit = {
      ...options,
      headers,
      body: isFormData
        ? (options.body as BodyInit)
        : options.body !== undefined && options.body !== null
          ? JSON.stringify(options.body)
          : undefined,
    };

    const response = await fetch(buildApiUrl(endpoint, options.params), requestConfig);
    return handleResponse<T>(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    toast.error(message);
    throw error;
  }
}

const apiClient = {
  get<T>(endpoint: string, params?: Record<string, string | number | boolean>, options: Omit<RequestOptions, 'method' | 'body' | 'params'> = {}) {
    return request<T>(endpoint, { ...options, method: 'GET', params });
  },

  post<T>(endpoint: string, body?: RequestOptions['body'], options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return request<T>(endpoint, { ...options, method: 'POST', body });
  },

  put<T>(endpoint: string, body?: RequestOptions['body'], options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return request<T>(endpoint, { ...options, method: 'PUT', body });
  },

  patch<T>(endpoint: string, body?: RequestOptions['body'], options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return request<T>(endpoint, { ...options, method: 'PATCH', body });
  },

  delete<T>(endpoint: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return request<T>(endpoint, { ...options, method: 'DELETE' });
  },
};

export default apiClient;
