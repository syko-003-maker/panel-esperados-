import React from 'react';

export function Table({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto border rounded-lg bg-white shadow-sm">
      <table className={`w-full text-sm ${className}`}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
      {children}
    </thead>
  );
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-slate-200 transition ${
        onClick ? 'hover:bg-slate-50 cursor-pointer' : 'hover:bg-slate-50'
      } ${className}`}
    >
      {children}
    </tr>
  );
}

export function TableCell({
  children,
  header = false,
  className = '',
}: {
  children: React.ReactNode;
  header?: boolean;
  className?: string;
}) {
  const Tag = header ? 'th' : 'td';
  return (
    <Tag
      className={`px-4 py-3 text-left ${header ? 'font-semibold text-slate-900' : 'text-slate-700'} ${className}`}
    >
      {children}
    </Tag>
  );
}
