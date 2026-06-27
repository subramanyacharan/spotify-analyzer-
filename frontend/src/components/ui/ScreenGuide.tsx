interface GuideItem {
  label: string;
  text: string;
}

interface ScreenGuideProps {
  items: GuideItem[];
}

/** Short bullets that explain what the screen shows and how to read it. */
export function ScreenGuide({ items }: ScreenGuideProps) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        How to read this page
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="text-xs leading-relaxed text-zinc-400">
            <span className="font-medium text-zinc-300">{item.label}:</span> {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
