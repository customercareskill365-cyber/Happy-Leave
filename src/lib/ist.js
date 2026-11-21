const IST_TZ = 'Asia/Kolkata';

export function formatIstClock(date = new Date()) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .toUpperCase() + ' IST';
}

export function formatIstDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatIstTimestamp(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '—';
  return formatIstClock(d);
}
