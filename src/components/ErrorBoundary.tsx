"use client";

import React from "react";

/**
 * ErrorBoundary — Catches unhandled client-side exceptions to prevent
 * the blank "Application error" screen. Shows a recovery UI instead.
 */
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[RDAT] Unhandled error caught by ErrorBoundary:", error);
    console.error("[RDAT] Component stack:", errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0d1117] text-center p-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 mb-6">
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-[#c9d1d9] mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-[#8b949e] mb-6 max-w-md leading-relaxed">
            RDAT Copilot encountered an unexpected error. This is usually
            caused by a browser compatibility issue. Try refreshing the page.
          </p>
          {this.state.error && (
            <pre className="text-xs text-red-400/70 bg-red-500/5 border border-red-500/10 rounded-lg p-4 max-w-lg overflow-auto mb-6 text-left">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="px-4 py-2 rounded-lg bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 transition-colors text-sm font-medium"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="ml-3 px-4 py-2 rounded-lg bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d] transition-colors text-sm"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
