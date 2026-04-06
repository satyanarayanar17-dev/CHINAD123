import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export interface ErrorBoundaryProps {
  children?: ReactNode;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught component error in module:', this.props.moduleName || 'Unknown', error, errorInfo);
  }

  public handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-error/5 border border-error/20 rounded-xl flex flex-col items-center justify-center text-center space-y-3 shadow-sm hover:shadow-md transition-shadow">
          <AlertCircle className="text-error" size={32} />
          <div>
            <h3 className="font-bold text-error text-[10px] uppercase tracking-widest block mb-1">
              Module Offline
            </h3>
            <p className="text-sm font-semibold text-on-surface">
              {this.props.moduleName || 'This component'} encountered a critical failure.
            </p>
          </div>
          <button
            onClick={this.handleRetry}
            className="mt-2 px-5 py-2.5 bg-white border border-error/30 rounded-lg text-xs font-bold text-error hover:bg-error/10 hover:border-error transition-all flex items-center gap-2 shadow-sm"
          >
            <RefreshCw size={14} /> Reload Panel
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
