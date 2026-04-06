import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState = ({ icon: Icon, title, description, action }: EmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-20 h-20 bg-surface-container rounded-full flex items-center justify-center mb-6 text-on-surface-variant/40">
        <Icon size={40} strokeWidth={1.5} />
      </div>
      <h3 className="text-lg font-bold text-on-surface mb-2">{title}</h3>
      <p className="text-sm text-on-surface-variant max-w-xs mx-auto mb-8">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="bg-primary text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm shadow-primary/20 hover:brightness-110 transition-all"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
