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
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveId(tab.id)}
              className={
                isActive
                  ? "px-3 py-2 text-sm font-semibold rounded bg-blue-600 text-white"
                  : "px-3 py-2 text-sm font-semibold rounded bg-muted/20 hover:bg-muted/40 text-foreground"
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
