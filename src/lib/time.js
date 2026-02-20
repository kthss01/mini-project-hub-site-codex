export function formatRelativeTime(dateIso, locale = 'en') {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diffMs = date.getTime() - Date.now();
  const units = [
    ['year', 1000 * 60 * 60 * 24 * 365],
    ['month', 1000 * 60 * 60 * 24 * 30],
    ['day', 1000 * 60 * 60 * 24],
    ['hour', 1000 * 60 * 60],
    ['minute', 1000 * 60],
  ];

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (const [unit, unitMs] of units) {
    const value = Math.round(diffMs / unitMs);
    if (Math.abs(value) >= 1) {
      return rtf.format(value, unit);
    }
  }

  return rtf.format(0, 'minute');
}
