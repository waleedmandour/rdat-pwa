"use client";

import React from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/**
 * ErrorBoundary — Catches unhandled client-side exceptions to prevent
 * the blank "Application error" screen. Shows a detailed recovery UI.
 */
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
  copied: boolean;
}

function truncateStack(stack: string | undefined, maxLines = 20): string {
  if (!stack) return "(no stack trace available)";
  const lines = stack.split("\n");
  if (lines.length <= maxLines) return stack;
  return `…${lines.length - maxLines} lines omitted\n${lines.slice(-maxLines).join("\n")}`;
}

function buildErrorReport(error: Error): string {
  const parts = [
    `Error: ${error.message}`,
    "",
    "--- Stack Trace ---",
    error.stack || "(no stack trace available)",
  ];
  if (error.cause) {
    parts.push("", "--- Cause ---", String(error.cause));
  }
  return parts.join("\n");
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false, copied: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, showDetails: false, copied: false };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[RDAT] Unhandled error caught by ErrorBoundary:", error);
    console.error("[RDAT] Component stack:", errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false, copied: false });
  };

  handleCopy = async () => {
    if (!this.state.error) return;
    try {
      await navigator.clipboard.writeText(buildErrorReport(this.state.error));
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = buildErrorReport(this.state.error);
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const error = this.state.error!;
      const truncatedStack = truncateStack(error.stack);

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0d1117] text-center p-8">
          {/* Icon */}
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

          {/* Title */}
          <h1 className="text-xl font-semibold text-[#c9d1d9] mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-[#8b949e] mb-6 max-w-md leading-relaxed">
            RDAT Copilot encountered an unexpected error. This is usually
            caused by a browser compatibility issue. Try refreshing the page.
          </p>

          {/* Error message */}
          <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-4 max-w-lg w-full mb-6 text-left">
            <p className="text-sm font-medium text-red-400 break-words">
              {error.message}
            </p>
          </div>

          {/* Collapsible stack trace */}
          <Collapsible
            open={this.state.showDetails}
            onOpenChange={(open) => this.setState({ showDetails: open })}
            className="w-full max-w-lg mb-6"
          >
            <CollapsibleTrigger className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#21262d] text-[#8b949e] hover:bg-[#30363d] hover:text-[#c9d1d9] transition-colors text-sm">
              {this.state.showDetails ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                  Hide Details
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15.75L15.75 8.25M8.25 8.25l7.5 7.5" />
                  </svg>
                  Show Details
                </>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <pre className="text-xs text-red-300/80 bg-[#161b22] border border-[#30363d] rounded-lg p-4 max-h-96 overflow-y-auto text-left font-mono leading-relaxed whitespace-pre-wrap break-words [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#30363d] [&::-webkit-scrollbar-track]:bg-transparent">
                {truncatedStack}
              </pre>
            </CollapsibleContent>
          </Collapsible>

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 transition-colors text-sm font-medium"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d] transition-colors text-sm"
            >
              Reload Page
            </button>
            <button
              onClick={this.handleCopy}
              className="px-4 py-2 rounded-lg bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d] transition-colors text-sm flex items-center gap-2"
            >
              {this.state.copied ? (
                <>
                  <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                  </svg>
                  Copy Error
                </>
              )}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
