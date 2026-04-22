export default function MemberLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-6 text-center">
        <p className="text-sm font-medium text-amber-300/90 animate-pulse">
          Chargement…
        </p>
      </div>
      <div className="h-28 rounded-2xl border border-white/15 bg-white/[0.08] animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-36 rounded-2xl border border-white/15 bg-white/[0.08] animate-pulse"
          />
        ))}
      </div>
      <div className="h-48 rounded-2xl border border-white/15 bg-white/[0.08] animate-pulse" />
    </div>
  );
}
