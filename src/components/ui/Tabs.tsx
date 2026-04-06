import React, { useState } from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  value?: string;
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  className?: string;
}

export const Tabs = ({ tabs, value, defaultTab, onChange, className = '' }: TabsProps) => {
  const [internalActive, setInternalActive] = useState(defaultTab || tabs[0]?.id);
  const active = value !== undefined ? value : internalActive;

  const handleTabClick = (id: string) => {
    if (value === undefined) {
      setInternalActive(id);
    }
    if (onChange) onChange(id);
  };

  return (
    <div className={`flex items-center border-b border-outline w-full ${className}`}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => handleTabClick(tab.id)}
          className={`px-4 py-3 text-sm font-medium transition-all flex items-center gap-2 border-b-2 
            ${active === tab.id 
              ? 'border-primary text-primary font-bold' 
              : 'border-transparent text-on-surface-variant hover:text-primary'
            }`}
        >
          {tab.icon && <span className="opacity-80">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  );
};
