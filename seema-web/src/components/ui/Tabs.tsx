import React from 'react';

export interface Tab {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs?: Tab[];
  activeTab?: string;
  onChange?: (tabId: string) => void;
  className?: string;
  children?: React.ReactNode;
  // Aliases used by various pages — handled inside the component.
  onTabChange?: (tabId: string) => void;
  value?: string;
  onValueChange?: (tabId: string) => void;
  options?: Array<{ id?: string; value?: string; label: string; count?: number }>;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
  options,
  value,
  onValueChange,
  onTabChange,
  children,
}) => {
  const resolvedTabs = options || tabs || [];
  const resolvedActiveTab = value || activeTab || '';
  const finalOnChange =
    onTabChange || onValueChange || onChange || ((_id: string) => {});

  return (
    <div className={className}>
      <div className="flex gap-8 border-b border-[#e2e5ed]">
        {resolvedTabs.map((tab: any) => {
          const tabId = tab.id || tab.value;
          const isActive = resolvedActiveTab === tabId;
          return (
            <button
              key={tabId}
              onClick={() => finalOnChange(tabId)}
              className={`py-4 px-1 text-sm font-medium whitespace-nowrap transition-colors duration-200 relative ${
                isActive
                  ? 'text-[#2563eb]'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                {tab.count !== undefined && (
                  <span
                    className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      isActive
                        ? 'bg-blue-100 text-[#2563eb]'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#2563eb] rounded-t" />
              )}
            </button>
          );
        })}
      </div>
      {children && <div className="pt-6">{children}</div>}
    </div>
  );
};

Tabs.displayName = 'Tabs';
