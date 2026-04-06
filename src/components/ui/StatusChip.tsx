import React from 'react';

type ChipVariant = 'primary' | 'secondary' | 'tertiary' | 'error' | 'success' | 'surface';

interface StatusChipProps {
  label: string;
  variant?: ChipVariant;
  icon?: React.ReactNode;
  className?: string;
}

export const StatusChip = ({ label, variant = 'surface', icon, className = '' }: StatusChipProps) => {
  const baseStyles = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border whitespace-nowrap";
  
  const variants = {
    primary: "bg-primary-container text-on-primary-container border-primary/20",
    secondary: "bg-secondary-container text-on-secondary-container border-secondary/20",
    tertiary: "bg-tertiary-container text-on-tertiary-container border-tertiary/20",
    error: "bg-error-container text-error border-error/20",
    success: "bg-green-100 text-green-800 border-green-200",
    surface: "bg-surface-container text-on-surface-variant border-outline/30"
  };

  return (
    <span className={`${baseStyles} ${variants[variant]} ${className}`}>
      {icon && <span className="opacity-80 flex items-center -ml-0.5">{icon}</span>}
      {label}
    </span>
  );
};
