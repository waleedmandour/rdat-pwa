"use client";

import {
  FileText,
  BookOpen,
  Database,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [activeItem, setActiveItem] = useState("editor");

  const menuItems = [
    {
      id: "editor",
      label: "Editor",
      icon: FileText,
      badge: null,
    },
    {
      id: "glossary",
      label: "GTR Glossary",
      icon: BookOpen,
      badge: "Phase 3",
    },
    {
      id: "vector-db",
      label: "Vector DB",
      icon: Database,
      badge: "Phase 3",
    },
    {
      id: "ai-models",
      label: "AI Models",
      icon: Sparkles,
      badge: "Phase 4",
    },
  ];

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    workspace: true,
    ai: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <aside className="flex flex-col w-56 min-w-56 border-r border-[var(--ide-border)] bg-[var(--ide-sidebar)] overflow-y-auto">
      {/* Explorer Header */}
      <div className="flex items-center justify-between h-8 px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--ide-text-muted)]">
        <span>Explorer</span>
      </div>

      {/* Workspace Section */}
      <div className="flex flex-col">
        <button
          onClick={() => toggleSection("workspace")}
          className="flex items-center gap-1 h-6 px-3 text-[11px] font-medium text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)] transition-colors"
        >
          {expandedSections.workspace ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <span>WORKSPACE</span>
        </button>

        {expandedSections.workspace &&
          menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeItem === item.id;
            const isDisabled = item.badge !== null;

            return (
              <button
                key={item.id}
                onClick={() => !isDisabled && setActiveItem(item.id)}
                className={cn(
                  "flex items-center gap-2 h-7 pl-6 pr-3 text-[12px] transition-colors",
                  isActive
                    ? "text-[var(--ide-text)] bg-[var(--ide-active)] border-l-2 border-teal-400"
                    : isDisabled
                    ? "text-[var(--ide-text-dim)] cursor-not-allowed"
                    : "text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)]"
                )}
                disabled={isDisabled}
                title={
                  isDisabled
                    ? `${item.label} — Available in ${item.badge}`
                    : item.label
                }
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.badge && (
                  <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--ide-badge-bg)] text-[var(--ide-badge-text)]">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {/* AI Section (collapsed by default) */}
      <div className="flex flex-col mt-2">
        <button
          onClick={() => toggleSection("ai")}
          className="flex items-center gap-1 h-6 px-3 text-[11px] font-medium text-[var(--ide-text-muted)] hover:text-[var(--ide-text)] hover:bg-[var(--ide-hover)] transition-colors"
        >
          {expandedSections.ai ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <span>AI ENGINES</span>
        </button>

        {expandedSections.ai && (
          <div className="flex flex-col">
            <div className="flex items-center gap-2 h-7 pl-6 pr-3 text-[12px] text-[var(--ide-text-dim)]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sovereign Track</span>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400">
                Phase 4
              </span>
            </div>
            <div className="flex items-center gap-2 h-7 pl-6 pr-3 text-[12px] text-[var(--ide-text-dim)]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Reasoning Track</span>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-400">
                Phase 5
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom info */}
      <div className="mt-auto p-3 border-t border-[var(--ide-border)]">
        <p className="text-[10px] text-[var(--ide-text-dim)] leading-relaxed">
          RDAT Copilot uses a dual-track AI architecture for adaptive
          translation co-writing. Features unlock progressively across
          development phases.
        </p>
      </div>
    </aside>
  );
}
