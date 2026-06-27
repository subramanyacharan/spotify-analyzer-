export const CHART = {
  grid: "#2a2a2a",
  axis: "#666",
  tooltipBg: "#1a1a1a",
  tooltipBorder: "#333",
  green: "#1db954",
  red: "#ef4444",
  neutral: "#71717a",
  amber: "#f59e0b",
  series: ["#1db954", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4"],
};

export function formatWeekLabel(isoWeek: string): string {
  const d = new Date(isoWeek);
  if (Number.isNaN(d.getTime())) return isoWeek;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export { getWeekStart };
