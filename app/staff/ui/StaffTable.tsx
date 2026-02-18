import { ReactNode } from "react";

type StaffTableProps = {
  headers: ReactNode[];
  children: ReactNode;
  stickyHeader?: boolean;
};

export function StaffTable({ headers, children, stickyHeader = false }: StaffTableProps) {
  return (
    <div className="overflow-x-auto border border-slate-800 rounded-lg bg-slate-900/40">
      <table className="min-w-full border-collapse text-sm">
        <thead className={stickyHeader ? "sticky top-0 z-10 bg-slate-900/20" : undefined}>
          <tr className="bg-slate-900/20 border-b border-slate-800">
            {headers.map((h, idx) => (
              <th
                key={idx}
                className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide align-middle"
                scope="col"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}
