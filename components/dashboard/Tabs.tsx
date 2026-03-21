'use client';

import { useCallback } from 'react';

interface TabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: 'command-center', label: 'Command Center' },
  { id: 'team', label: 'Team' },
  { id: 'ai-automation', label: 'AI & Automation' },
  { id: 'reports', label: 'Reports' },
];

export default function Tabs({ activeTab, onTabChange }: TabsProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = tabs.findIndex((t) => t.id === activeTab);
      let nextIndex = currentIndex;

      if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else if (e.key === 'End') {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }

      e.preventDefault();
      onTabChange(tabs[nextIndex].id);

      // Focus the newly active tab button
      const container = e.currentTarget;
      const buttons = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons[nextIndex]?.focus();
    },
    [activeTab, onTabChange],
  );

  return (
    <div
      role="tablist"
      aria-label="Dashboard sections"
      onKeyDown={handleKeyDown}
      className="no-print flex gap-1 border-b border-slate-200 overflow-x-auto"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => onTabChange(tab.id)}
          className={`
            relative px-4 py-3 text-sm font-medium transition-colors duration-150 whitespace-nowrap
            ${activeTab === tab.id ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}
          `}
        >
          {tab.label}
          {activeTab === tab.id && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-ironside-gold rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
