const IST_TZ = 'Asia/Kolkata';

export function getIstDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
