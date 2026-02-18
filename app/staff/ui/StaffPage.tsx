import { ReactNode } from "react";

type StaffPageProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function StaffPage({ title, subtitle, actions, children }: StaffPageProps) {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle ? <p className="text-sm text-gray-600 mt-1">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex-shrink-0">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
