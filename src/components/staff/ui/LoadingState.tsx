export function LoadingState({
  title = "Chargement en cours",
  description = "Les données staff arrivent, merci de patienter.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,hsl(var(--sunset-surface)/0.72),hsl(var(--sunset-surface2)/0.82))] px-6 py-8 text-center shadow-[0_30px_80px_-38px_hsl(var(--sunset-surface2)/0.75)] backdrop-blur-xl">
      <div className="mx-auto h-10 w-10 animate-pulse rounded-full border border-amber-400/25 bg-amber-400/8" />
      <h3 className="mt-4 text-base font-semibold text-slate-100">{title}</h3>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  );
}