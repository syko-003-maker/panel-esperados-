import { ReactNode } from "react";
import { MotionSection } from "@/components/staff/ui";

type StaffTableProps = {
  headers: ReactNode[];
  children: ReactNode;
  stickyHeader?: boolean;
};

export function StaffTable({ headers, children, stickyHeader = false }: StaffTableProps) {
  return (
    <MotionSection className="overflow-x-auto rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.8),hsl(var(--sunset-surface3)/0.9))] shadow-[0_24px_64px_-38px_hsl(var(--sunset-surface3)/0.92)]">
      <table className="min-w-full border-collapse text-sm">
        <thead className={stickyHeader ? "sticky top-0 z-10 bg-slate-950/95" : undefined}>
          <tr className="border-b border-white/8 bg-white/[0.03]">
            {headers.map((h, idx) => (
              <th
                key={idx}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 align-middle"
                scope="col"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/8">{children}</tbody>
      </table>
    </MotionSection>
  );
}
