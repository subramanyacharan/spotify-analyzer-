"use client";

interface WeekRangeFilterProps {
  totalWeeks: number;
  fromWeek: number;
  toWeek: number;
  onFromChange: (week: number) => void;
  onToChange: (week: number) => void;
}

export function WeekRangeFilter({
  totalWeeks,
  fromWeek,
  toWeek,
  onFromChange,
  onToChange,
}: WeekRangeFilterProps) {
  const options = Array.from({ length: totalWeeks }, (_, i) => i + 1);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Week range</p>
          <p className="text-xs text-zinc-500">
            Showing aggregated data for weeks {fromWeek}–{toWeek} ({toWeek - fromWeek + 1}{" "}
            {toWeek - fromWeek + 1 === 1 ? "week" : "weeks"})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onFromChange(1);
              onToChange(totalWeeks);
            }}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-600"
          >
            All weeks
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            From week
          </span>
          <select
            value={fromWeek}
            onChange={(e) => {
              const v = Number(e.target.value);
              onFromChange(v);
              if (v > toWeek) onToChange(v);
            }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          >
            {options.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            To week
          </span>
          <select
            value={toWeek}
            onChange={(e) => {
              const v = Number(e.target.value);
              onToChange(v);
              if (v < fromWeek) onFromChange(v);
            }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          >
            {options.map((w) => (
              <option key={w} value={w} disabled={w < fromWeek}>
                Week {w}
              </option>
            ))}
          </select>
        </label>
      </div>

      <input
        type="range"
        min={1}
        max={totalWeeks}
        value={toWeek}
        onChange={(e) => {
          const v = Number(e.target.value);
          onToChange(v);
          if (fromWeek > v) onFromChange(1);
        }}
        className="mt-4 w-full accent-[#1db954]"
        aria-label="Week range slider"
      />
      <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
        <span>Week 1</span>
        <span>Week {totalWeeks}</span>
      </div>
    </section>
  );
}
