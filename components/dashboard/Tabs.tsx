'use client';

import { useCallback } from 'react';

interface TabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: 'operations', label: 'Operations' },
  { id: 'agent-behavior', label: 'Agent Behavior' },
  { id: 'automation-control', label: 'Automation Control' },
  { id: 'feedback-loop', label: 'Feedback Loop' },
  { id: 'ai-performance', label: 'AI Performance' },
  { id: 'deep-dive', label: 'Deep Dive' },
  { id: 'reporting', label: 'Reporting' },
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
      className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-1 overflow-x-auto max-w-full"
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
            rounded-full px-5 py-2 text-sm font-medium transition-all duration-200 whitespace-nowrap
            ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
