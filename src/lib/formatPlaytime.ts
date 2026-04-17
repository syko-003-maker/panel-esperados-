export function formatPlaytime(minutes: number | null | undefined): string {
  const total = Number.isFinite(minutes as number) ? Math.max(0, Number(minutes)) : 0;
  const rounded = Math.floor(total);

  if (rounded < 60) {
    return `${rounded}m`;
  }

  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;

  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;

  if (remHours > 0) {
    return `${days}j ${remHours}h`;
  }

  return `${days}j`;
}
