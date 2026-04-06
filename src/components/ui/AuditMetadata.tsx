import React from 'react';
import { History, BadgeCheck } from 'lucide-react';

interface AuditMetadataProps {
  lastModifiedDate: string;
  verifiedBy?: string;
  className?: string;
}

export const AuditMetadata = ({ lastModifiedDate, verifiedBy, className = '' }: AuditMetadataProps) => {
  return (
    <div className={`flex items-center gap-6 mt-4 pt-4 border-t border-outline/30 ${className}`}>
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-on-surface-variant">
        <History size={14} className="opacity-80" />
        Last Modified: {lastModifiedDate}
      </div>
      
      {verifiedBy && (
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary">
          <BadgeCheck size={14} />
          Authorized By: {verifiedBy}
        </div>
      )}
    </div>
  );
};
