interface ChartAxisLabelsProps {
  xLabel: string;
  yLabel: string;
  note?: string;
}

/** Plain-language axis descriptions shown below charts. */
export function ChartAxisLabels({ xLabel, yLabel, note }: ChartAxisLabelsProps) {
  return (
    <div className="mt-3 space-y-1 border-t border-zinc-800/80 pt-3 text-[11px] leading-relaxed text-zinc-500">
      <p>
        <span className="font-medium text-zinc-400">X-axis:</span> {xLabel}
      </p>
      <p>
        <span className="font-medium text-zinc-400">Y-axis:</span> {yLabel}
      </p>
      {note && <p className="text-zinc-600">{note}</p>}
    </div>
  );
}
