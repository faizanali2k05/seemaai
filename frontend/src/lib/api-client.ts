/**
 * API Client — Functional wrapper layer over the core ApiClient.
 *
 * This file provides functional exports (get, post, put, etc.) that unwrap
 * the response envelope ({success, data, message}) for use in Zustand stores.
 * All requests route through the single ApiClient in ./api.ts which handles
 * token refresh, request queuing, and 401 retry logic.
 *
 * Pages import `apiClient` from '@/lib/api' (class-based, returns full response).
 * Stores import `get, post, put` from '@/lib/api-client' (functional, returns data).
 */
import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import { apiClient as coreClient } from './api';
import type { ApiResponse, ApiError } from './types';

/**
 * Format API errors consistently
 */
export const formatError = (error: AxiosError<ApiError> | unknown): ApiError => {
  if (axios.isAxiosError(error)) {
    return {
      message: error.response?.data?.message || error.message || 'An error occurred',
      code: error.response?.data?.code || error.code,
      details: error.response?.data?.details,
      status: error.response?.status,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'UNKNOWN_ERROR',
    };
  }

  return {
    message: 'An unknown error occurred',
    code: 'UNKNOWN_ERROR',
  };
};

/**
 * Get the underlying Axios instance (for advanced use cases)
 */
export const getApiClient = () => coreClient.getClient();
export const createApiClient = () => coreClient.getClient();

/**
 * Generic GET — unwraps envelope and returns data directly
 */
export const get = async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
  try {
    const response = await coreClient.get<ApiResponse<T>>(url, config);
    // coreClient.<verb> returns an AxiosResponse; the envelope body is at
    // `.data` and the actual payload is at `.data.data`.
    return response.data.data;
  } catch (error) {
    throw formatError(error);
  }
};

/**
 * Generic POST — unwraps envelope and returns data directly
 */
export const post = async <T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> => {
  try {
    const response = await coreClient.post<ApiResponse<T>>(url, data, config);
    // coreClient.<verb> returns an AxiosResponse; the envelope body is at
    // `.data` and the actual payload is at `.data.data`.
    return response.data.data;
  } catch (error) {
    throw formatError(error);
  }
};

/**
 * Generic PUT — unwraps envelope and returns data directly
 */
export const put = async <T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> => {
  try {
    const response = await coreClient.put<ApiResponse<T>>(url, data, config);
    // coreClient.<verb> returns an AxiosResponse; the envelope body is at
    // `.data` and the actual payload is at `.data.data`.
    return response.data.data;
  } catch (error) {
    throw formatError(error);
  }
};

/**
 * Generic PATCH — unwraps envelope and returns data directly
 */
export const patch = async <T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> => {
  try {
    const response = await coreClient.patch<ApiResponse<T>>(url, data, config);
    // coreClient.<verb> returns an AxiosResponse; the envelope body is at
    // `.data` and the actual payload is at `.data.data`.
    return response.data.data;
  } catch (error) {
    throw formatError(error);
  }
};

/**
 * Generic DELETE — unwraps envelope and returns data directly
 */
export const deleteRequest = async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
  try {
    const response = await coreClient.delete<ApiResponse<T>>(url, config);
    // coreClient.<verb> returns an AxiosResponse; the envelope body is at
    // `.data` and the actual payload is at `.data.data`.
    return response.data.data;
  } catch (error) {
    throw formatError(error);
  }
};

/**
 * Export as object for consistency with existing imports
 */
export const apiClient = {
  get,
  post,
  put,
  patch,
  delete: deleteRequest,
  getClient: getApiClient,
  createClient: createApiClient,
  formatError,
};

export default apiClient;
