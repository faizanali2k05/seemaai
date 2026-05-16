import React, { useState, useMemo } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  header: string;
  accessor: keyof T | string;
  render?: (value: any, row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pageSize?: number;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  searchPlaceholder?: string;
  className?: string;
  /** Per-row class — either a static string or a function of the row. */
  rowClassName?: string | ((row: T) => string);
}

type SortDirection = 'asc' | 'desc' | null;

interface SortConfig {
  key: string;
  direction: SortDirection;
}

export const DataTable = React.forwardRef<
  HTMLDivElement,
  DataTableProps<any>
>(
  (
    {
      columns,
      data,
      pageSize = 10,
      onRowClick,
      loading = false,
      emptyStateTitle = 'No data',
      emptyStateDescription = 'No records found matching your criteria.',
      searchPlaceholder = 'Search...',
      className = '',
      rowClassName,
    },
    ref
  ) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<SortConfig>({
      key: '',
      direction: null,
    });

    const filteredData = useMemo(() => {
      if (!searchTerm) return data;

      return data.filter((row) =>
        columns.some((column) => {
          const accessor = column.accessor as keyof typeof row;
          const value = row[accessor];
          if (value == null) return false;
          return String(value).toLowerCase().includes(searchTerm.toLowerCase());
        })
      );
    }, [data, searchTerm, columns]);

    const sortedData = useMemo(() => {
      if (!sortConfig.key || !sortConfig.direction) return filteredData;

      const sorted = [...filteredData].sort((a, b) => {
        const accessor = sortConfig.key as keyof typeof a;
        const aValue = a[accessor];
        const bValue = b[accessor];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });

      return sorted;
    }, [filteredData, sortConfig]);

    const paginatedData = useMemo(() => {
      const startIndex = (currentPage - 1) * pageSize;
      return sortedData.slice(startIndex, startIndex + pageSize);
    }, [sortedData, currentPage, pageSize]);

    const totalPages = Math.ceil(sortedData.length / pageSize);

    const handleSort = (accessor: string) => {
      let direction: SortDirection = 'asc';
      if (sortConfig.key === accessor) {
        if (sortConfig.direction === 'asc') {
          direction = 'desc';
        } else if (sortConfig.direction === 'desc') {
          direction = null;
        }
      }

      setSortConfig({ key: accessor, direction });
      setCurrentPage(1);
    };

    const getSortIcon = (accessor: string) => {
      if (sortConfig.key !== accessor) {
        return (
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
            />
          </svg>
        );
      }

      if (sortConfig.direction === 'asc') {
        return (
          <svg
            className="w-4 h-4 text-[#2563eb]"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zM3 7a1 1 0 000 2h5a1 1 0 000-2H3zM3 11a1 1 0 100 2h4a1 1 0 100-2H3zM15 8a1 1 0 10-2 0v5.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L15 13.586V8z" />
          </svg>
        );
      }

      return (
        <svg
          className="w-4 h-4 text-[#2563eb]"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zM3 7a1 1 0 000 2h5a1 1 0 000-2H3zM3 11a1 1 0 100 2h4a1 1 0 100-2H3zM15 20a1 1 0 01-1.414-1.414l1.293-1.293H9a1 1 0 100 2h6.586l-1.293 1.293A1 1 0 0115 20z" />
        </svg>
      );
    };

    return (
      <div ref={ref} className={`bg-white rounded-lg border border-[#e2e5ed] ${className}`}>
        {/* Search Bar */}
        <div className="p-4 border-b border-[#e2e5ed]">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-[#e2e5ed] rounded-lg text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <LoadingSpinner size="md" />
            </div>
          ) : paginatedData.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={
                  <svg
                    className="w-12 h-12"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                }
                title={emptyStateTitle}
                description={emptyStateDescription}
              />
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#e2e5ed] bg-gray-50">
                  {columns.map((column) => (
                    <th
                      key={String(column.accessor)}
                      className={`px-6 py-3 text-left text-sm font-semibold text-gray-700 ${
                        column.sortable
                          ? 'cursor-pointer hover:bg-gray-100'
                          : ''
                      } ${column.width || ''}`}
                      onClick={() => {
                        if (column.sortable !== false) {
                          handleSort(String(column.accessor));
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {column.header}
                        {column.sortable !== false && (
                          getSortIcon(String(column.accessor))
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((row, rowIndex) => {
                  const extraRowClass =
                    typeof rowClassName === 'function'
                      ? rowClassName(row)
                      : rowClassName || '';
                  return (
                  <tr
                    key={rowIndex}
                    className={`border-b border-[#e2e5ed] transition-colors ${
                      onRowClick
                        ? 'cursor-pointer hover:bg-gray-50'
                        : ''
                    } ${extraRowClass}`}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((column) => {
                      const value = row[column.accessor as keyof typeof row];
                      // If the value is already a React element (e.g. a page
                      // passes <span>…</span> or <StatusBadge…/> as the data),
                      // render it directly. Without this guard, the
                      // fallback `String(value)` produces "[object Object]"
                      // for every JSX cell.
                      const isRenderable =
                        React.isValidElement(value) ||
                        (Array.isArray(value) && value.every(React.isValidElement));
                      return (
                      <td
                        key={String(column.accessor)}
                        className="px-6 py-4 text-sm text-gray-900"
                      >
                        {column.render
                          ? column.render(value, row)
                          : isRenderable
                            ? (value as React.ReactNode)
                            : value !== null && value !== undefined
                            ? String(value)
                            : '-'}
                      </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && paginatedData.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#e2e5ed]">
            <div className="text-sm text-gray-600">
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, sortedData.length)} of{' '}
              {sortedData.length} results
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-[#e2e5ed] text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === page
                      ? 'bg-[#2563eb] text-white'
                      : 'border border-[#e2e5ed] text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-[#e2e5ed] text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
);

DataTable.displayName = 'DataTable';
