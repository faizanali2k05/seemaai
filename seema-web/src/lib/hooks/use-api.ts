import { useState, useEffect, useCallback } from 'react';
import type { AxiosRequestConfig } from 'axios';
import type { ApiError } from '../types';
import { get as apiGet, post as apiPost } from '../api-client';

interface UseApiOptions extends AxiosRequestConfig {
  autoFetch?: boolean;
  onError?: (error: ApiError) => void;
  onSuccess?: (data: any) => void;
}

interface UseApiReturn<T> {
  data: T | null;
  error: ApiError | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
  mutate: (newData: T) => void;
  reset: () => void;
}

/**
 * Custom hook for API calls with loading and error state
 * Generic typed with auto-fetch on mount support
 */
export function useApi<T>(
  url: string | null,
  options: UseApiOptions = {}
): UseApiReturn<T> {
  const {
    autoFetch = true,
    onError,
    onSuccess,
    ...axiosConfig
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Fetch data from API
   */
  const fetchData = useCallback(async () => {
    if (!url) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await apiGet<T>(url, axiosConfig);
      setData(result);
      onSuccess?.(result);
    } catch (err: any) {
      const apiError: ApiError = {
        message: err?.message || 'An error occurred',
        code: err?.code,
        status: err?.status,
        details: err?.details,
      };

      setError(apiError);
      onError?.(apiError);
    } finally {
      setIsLoading(false);
    }
  }, [url, axiosConfig, onError, onSuccess]);

  /**
   * Auto-fetch on mount or when URL changes
   */
  useEffect(() => {
    if (autoFetch && url) {
      fetchData();
    }
  }, [url, autoFetch, fetchData]);

  /**
   * Manual refetch
   */
  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  /**
   * Optimistic update
   */
  const mutate = useCallback((newData: T) => {
    setData(newData);
  }, []);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    data,
    error,
    isLoading,
    refetch,
    mutate,
    reset,
  };
}

/**
 * Hook for POST requests
 */
export function useApiMutation<TData = unknown, TResponse = unknown>(
  options: UseApiOptions = {}
) {
  const [data, setData] = useState<TResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { onError, onSuccess, ...axiosConfig } = options;

  const mutate = useCallback(
    async (url: string, payload?: TData): Promise<TResponse> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await apiPost<TResponse>(url, payload, axiosConfig);
        setData(result);
        onSuccess?.(result);
        return result;
      } catch (err: any) {
        const apiError: ApiError = {
          message: err?.message || 'An error occurred',
          code: err?.code,
          status: err?.status,
          details: err?.details,
        };

        setError(apiError);
        onError?.(apiError);
        throw apiError;
      } finally {
        setIsLoading(false);
      }
    },
    [axiosConfig, onError, onSuccess]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    mutate,
    data,
    error,
    isLoading,
    reset,
  };
}

/**
 * Hook for fetching list data with pagination
 */
export function useApiList<T>(
  url: string | null,
  options: UseApiOptions & { page?: number; perPage?: number } = {}
) {
  const { page = 1, perPage = 20, ...restOptions } = options;

  const [currentPage, setCurrentPage] = useState(page);
  const [perPageCount, setPerPageCount] = useState(perPage);

  const paginatedUrl = url
    ? `${url}?page=${currentPage}&per_page=${perPageCount}`
    : null;

  const {
    data: paginatedData,
    error,
    isLoading,
    refetch,
  } = useApi<any>(paginatedUrl, {
    ...restOptions,
    autoFetch: restOptions.autoFetch !== false,
  });

  const items = paginatedData?.items || [];
  const total = paginatedData?.total || 0;

  const goToPage = useCallback((newPage: number) => {
    setCurrentPage(Math.max(1, newPage));
  }, []);

  const nextPage = useCallback(() => {
    const maxPage = Math.ceil(total / perPageCount);
    goToPage(Math.min(currentPage + 1, maxPage));
  }, [currentPage, total, perPageCount, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(Math.max(1, currentPage - 1));
  }, [currentPage, goToPage]);

  const changePerPage = useCallback((newPerPage: number) => {
    setPerPageCount(newPerPage);
    setCurrentPage(1); // Reset to first page
  }, []);

  return {
    items,
    total,
    page: currentPage,
    perPage: perPageCount,
    isLoading,
    error,
    refetch,
    goToPage,
    nextPage,
    prevPage,
    changePerPage,
    hasNextPage: currentPage * perPageCount < total,
    hasPrevPage: currentPage > 1,
    totalPages: Math.ceil(total / perPageCount),
  };
}
