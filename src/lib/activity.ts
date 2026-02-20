export type ActivityPoint = {
  date: string;
  count: number;
};

export function toActivitySeries(activity: ActivityPoint[]) {
  const safe = Array.isArray(activity) ? activity : [];

  return {
    labels: safe.map((point) => point.date),
    series: safe.map((point) => point.count),
  };
}
