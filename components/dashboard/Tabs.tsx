'use client';

interface TabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: 'operations', label: 'Operations' },
  { id: 'agent-behavior', label: 'Agent Behavior' },
  { id: 'ai-performance', label: 'AI Performance' },
  { id: 'deep-dive', label: 'Deep Dive' },
];

export default function Tabs({ activeTab, onTabChange }: TabsProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            rounded-full px-5 py-2 text-sm font-medium transition-all duration-200
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
