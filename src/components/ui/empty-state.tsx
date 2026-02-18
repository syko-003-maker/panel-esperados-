export default function EmptyState({
  icon = '📭',
  title = 'No items',
  description = 'Nothing to show here.',
}: {
  icon?: string;
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600 mt-1">{description}</p>
    </div>
  );
}
