import { ReactNode } from "react";

type MemberTableProps = {
  headers: ReactNode[];
  children: ReactNode;
  stickyHeader?: boolean;
};

export function MemberTable({ headers, children, stickyHeader = false }: MemberTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20 backdrop-blur-xl shadow-2xl">
      <table className="min-w-full border-collapse text-sm">
        <thead className={stickyHeader ? "sticky top-0 z-10" : undefined}>
          <tr className="border-b border-white/10 bg-white/5">
            {headers.map((h, idx) => (
              <th
                key={idx}
                className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider"
                scope="col"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
    </div>
  );
}

export function MemberTableEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 mb-4">
        <span className="text-3xl">📭</span>
      </div>
      <p className="text-gray-400 font-medium">Aucune donnée disponible</p>
      <p className="text-gray-600 text-sm mt-1">Les informations apparaîtront ici une fois disponibles</p>
    </div>
  );
}
