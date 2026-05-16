import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';

// IMPORTANT: NEXT_PUBLIC_* env vars are inlined at BUILD time, not runtime.
// To override this for production, pass --build-arg NEXT_PUBLIC_API_URL=... when
// building the web image (see seema-web/Dockerfile + docker-compose.yml).
//
// Default points DIRECTLY at the Node API (port 4000), bypassing nginx.
// Why: in local dev, going through nginx fails CORS preflight because
// nginx isn't propagating Access-Control-Allow-Origin headers correctly.
// The Node API itself has explicit CORS for http://localhost:3000.
//
// In production both web and api should be on the same origin (e.g.
// seemaai.co.uk + seemaai.co.uk/api), so CORS doesn't apply — just
// pass --build-arg NEXT_PUBLIC_API_URL=https://seemaai.co.uk/api.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

// Token refresh queue — prevents concurrent refresh requests
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token as string);
    }
  });
  isRefreshing = false;
  failedQueue = [];
};

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      // 60s default. AI/PDF endpoints can take 30-60s on a cold cache;
      // 30s was too tight and caused frequent client-side timeouts even
      // when the server was still processing. Specific long-running calls
      // (policy generation, scans) pass a higher per-request timeout.
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add token
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor with token refresh
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
          _retry?: boolean;
        };

        // Not a 401 — reject immediately
        if (error.response?.status !== 401) {
          return Promise.reject(error);
        }

        // Already retried — redirect to login
        if (originalRequest._retry) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
          }
          return Promise.reject(error);
        }

        // Another request is already refreshing — queue this one
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({
              resolve: (token: string) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                resolve(this.client(originalRequest));
              },
              reject: (err: unknown) => {
                reject(err);
              },
            });
          });
        }

        // Start refresh process
        originalRequest._retry = true;
        isRefreshing = true;

        if (typeof window !== 'undefined') {
          const refreshToken = localStorage.getItem('refreshToken');

          if (!refreshToken) {
            processQueue(error, null);
            localStorage.removeItem('accessToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return Promise.reject(error);
          }

          // Attempt token refresh
          return this.client
            .post('/auth/refresh', { refresh_token: refreshToken })
            .then((res) => {
              const { accessToken, refreshToken: newRefreshToken } = res.data?.data || res.data || {};

              if (accessToken) {
                localStorage.setItem('accessToken', accessToken);
                if (newRefreshToken) {
                  localStorage.setItem('refreshToken', newRefreshToken);
                }

                this.client.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
                originalRequest.headers.Authorization = `Bearer ${accessToken}`;

                processQueue(null, accessToken);
                return this.client(originalRequest);
              }

              // No access token in response — treat as failed
              throw new Error('No access token in refresh response');
            })
            .catch((refreshError) => {
              processQueue(refreshError, null);
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('user');
              window.location.href = '/login';
              return Promise.reject(refreshError);
            });
        }

        return Promise.reject(error);
      }
    );
  }

  public getClient(): AxiosInstance {
    return this.client;
  }

  // These methods return the full AxiosResponse — pages access `.data` for
  // the body. We default the generic to `any` so untyped callers don't
  // propagate `unknown`. Use getClient() for direct axios access.
  public async get<T = any>(url: string, config?: any) {
    return this.client.get<T>(url, config);
  }

  public async post<T = any>(url: string, data?: any, config?: any) {
    return this.client.post<T>(url, data, config);
  }

  public async put<T = any>(url: string, data?: any, config?: any) {
    return this.client.put<T>(url, data, config);
  }

  public async patch<T = any>(url: string, data?: any, config?: any) {
    return this.client.patch<T>(url, data, config);
  }

  public async delete<T = any>(url: string, config?: any) {
    return this.client.delete<T>(url, config);
  }
}

export const apiClient = new ApiClient();
export default apiClient;
