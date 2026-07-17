"use client";

import { useMemo, useState } from "react";

export type TabDef = {
  id: string;
  label: string;
  content: React.ReactNode;
};

export function Tabs({
  tabs,
  defaultTabId,
}: {
  tabs: TabDef[];
  defaultTabId?: string;
}) {
  const initialId = useMemo(() => {
    if (defaultTabId && tabs.some((t) => t.id === defaultTabId)) return defaultTabId;
    return tabs[0]?.id ?? "";
  }, [defaultTabId, tabs]);

  const [activeId, setActiveId] = useState(initialId);

  if (!tabs.length) {
    return (
      <div className="rounded border border-muted/30 p-4 text-sm text-muted-foreground">
        Aucun onglet
      </div>
    );
  }

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveId(tab.id)}
              className={
                isActive
                  ? "rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-100 shadow-[0_10px_24px_-16px_rgba(245,158,11,0.6)] transition-colors"
                  : "rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-slate-100"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div>{activeTab?.content}</div>
    </div>
  );
}
