import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook for debouncing values
 * Delays updates until user has stopped typing/changing for specified duration
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 500)
 * @returns The debounced value
 *
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearchTerm = useDebounce(searchTerm, 300);
 *
 * useEffect(() => {
 *   if (debouncedSearchTerm) {
 *     // Make API call
 *   }
 * }, [debouncedSearchTerm]);
 */
export function useDebounce<T>(value: T, delay = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up the timeout
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timeout if value changes before delay is reached
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for debouncing callback functions
 * Useful for expensive operations like API calls
 *
 * @param callback - The callback function to debounce
 * @param delay - Delay in milliseconds (default: 500)
 * @returns The debounced callback function
 *
 * @example
 * const handleSearch = useDebouncedCallback((term: string) => {
 *   // Make API call with term
 * }, 300);
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay = 500
): T {
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup timeout on unmount
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [timeoutId]);

  const debouncedCallback = ((...args: any[]) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const newTimeoutId = setTimeout(() => {
      callback(...args);
      setTimeoutId(null);
    }, delay);

    setTimeoutId(newTimeoutId);
  }) as T;

  return debouncedCallback;
}

/**
 * Hook for debouncing with immediate invocation option
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds
 * @param immediate - Whether to invoke immediately on first change (default: false)
 * @returns The debounced value
 */
export function useDebouncedValue<T>(
  value: T,
  delay = 500,
  immediate = false
): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    if (immediate) {
      setDebouncedValue(value);
    }

    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, immediate ? delay : delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay, immediate]);

  return debouncedValue;
}

/**
 * Hook for throttling values
 * Only updates at most once per specified interval
 *
 * @param value - The value to throttle
 * @param interval - Interval in milliseconds (default: 500)
 * @returns The throttled value
 *
 * @example
 * const throttledScroll = useThrottle(scrollY, 100);
 */
export function useThrottle<T>(value: T, interval = 500): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdatedRef = useRef<number>(Date.now());

  useEffect(() => {
    const now = Date.now();

    if (now >= lastUpdatedRef.current + interval) {
      lastUpdatedRef.current = now;
      setThrottledValue(value);
    } else {
      const handler = setTimeout(() => {
        lastUpdatedRef.current = Date.now();
        setThrottledValue(value);
      }, interval - (now - lastUpdatedRef.current));

      return () => clearTimeout(handler);
    }
  }, [value, interval]);

  return throttledValue;
}
