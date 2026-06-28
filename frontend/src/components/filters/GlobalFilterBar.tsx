"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useFilters } from "./FilterProvider";
import type { FilterKey } from "@/lib/filters/types";
import { getActiveFilterChips } from "@/lib/filters/labels";

const BASE_FILTERS: { key: FilterKey; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: "source",
    label: "Source",
    options: [
      { value: "all", label: "All sources" },
      { value: "play_store", label: "Play Store" },
      { value: "app_store", label: "App Store" },
    ],
  },
  {
    key: "theme",
    label: "Theme",
    options: [
      { value: "all", label: "All themes" },
      { value: "Recommendation Quality", label: "Recommendation Quality" },
      { value: "Playlist Fatigue", label: "Playlist Fatigue" },
      { value: "Repetitive Recommendations", label: "Repetitive Recommendations" },
      { value: "Search & Discovery UX", label: "Search & Discovery UX" },
      { value: "Discover Weekly Issues", label: "Discover Weekly Issues" },
      { value: "Algorithm Bias", label: "Algorithm Bias" },
      { value: "Niche Music Gap", label: "Niche Music Gap" },
      { value: "General App Feedback", label: "General App Feedback" },
    ],
  },
  {
    key: "sentiment",
    label: "Sentiment",
    options: [
      { value: "all", label: "All" },
      { value: "negative", label: "Negative" },
      { value: "neutral", label: "Neutral" },
      { value: "positive", label: "Positive" },
    ],
  },
  {
    key: "opportunityTier",
    label: "Priority tier",
    options: [
      { value: "all", label: "All tiers" },
      { value: "Critical", label: "Critical" },
      { value: "High", label: "High" },
      { value: "Monitor", label: "Monitor" },
    ],
  },
];

const SEGMENT_FILTERS: { key: FilterKey; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: "business",
    label: "User type",
    options: [
      { value: "all", label: "All segments" },
      { value: "premium", label: "Premium User" },
      { value: "free", label: "Free / Casual" },
      { value: "new", label: "New User" },
      { value: "heavy", label: "Heavy Listener" },
    ],
  },
  {
    key: "engagement",
    label: "Engagement level",
    options: [
      { value: "all", label: "All levels" },
      { value: "heavy", label: "Heavy / New" },
      { value: "casual", label: "Casual / Medium" },
      { value: "low", label: "Low activity" },
    ],
  },
  {
    key: "behavior",
    label: "Listening behavior",
    options: [
      { value: "all", label: "All behaviors" },
      { value: "discovery_seeker", label: "Discovery Seeker" },
      { value: "habit_listener", label: "Habit Listener" },
      { value: "playlist_driven", label: "Playlist Driven" },
      { value: "casual_listener", label: "Casual Listener" },
    ],
  },
  {
    key: "context",
    label: "Use context",
    options: [
      { value: "all", label: "All context" },
      { value: "play_store", label: "Play Store" },
      { value: "app_store", label: "App Store" },
      { value: "discovery", label: "Discovery intent" },
      { value: "comfort", label: "Comfort / habit" },
      { value: "mood", label: "Mood context" },
    ],
  },
  {
    key: "pain",
    label: "Pain point",
    options: [
      { value: "all", label: "All pain types" },
      { value: "discovery", label: "Discovery UX" },
      { value: "recommendations", label: "Recommendations" },
      { value: "playlist", label: "Playlist fatigue" },
      { value: "widget", label: "Widget issues" },
      { value: "critical", label: "Critical friction" },
    ],
  },
];

export function GlobalFilterBar() {
  const {
    filters,
    setFilter,
    resetFilters,
    applyFilters,
    presets,
    savePreset,
    loadPreset,
  } = useFilters();

  const handleSavePreset = () => {
    const name = window.prompt("Preset name");
    if (name?.trim()) savePreset(name.trim());
  };

  return (
    <section className="border-b border-zinc-800 bg-zinc-950/80 px-6 py-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[#1db954]" />
          <h2 className="text-sm font-semibold text-white">Filters</h2>
          <span className="text-[10px] text-zinc-600">Applied across all views</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.length > 0 && (
            <select
              onChange={(e) => e.target.value && loadPreset(e.target.value)}
              defaultValue=""
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300"
            >
              <option value="" disabled>
                Load preset
              </option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={handleSavePreset}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-600"
          >
            Save preset
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-600"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-lg bg-[#1db954] px-4 py-1.5 text-xs font-medium text-black hover:bg-[#1ed760]"
          >
            Apply filters
          </button>
        </div>
      </div>

      <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        Base filters
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {BASE_FILTERS.map(({ key, label, options }) => (
          <FilterSelect
            key={key}
            label={label}
            value={filters[key]}
            options={options}
            onChange={(v) => setFilter(key, v)}
          />
        ))}
      </div>

      <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        Audience segmentation
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {SEGMENT_FILTERS.map(({ key, label, options }) => (
          <FilterSelect
            key={key}
            label={label}
            value={filters[key]}
            options={options}
            onChange={(v) => setFilter(key, v)}
          />
        ))}
      </div>
    </section>
  );
}

export function ActiveFilterStrip() {
  const { appliedFilters, activeCount, clearFilter, resetFilters, setPanelOpen, panelOpen } =
    useFilters();
  const chips = getActiveFilterChips(appliedFilters);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 bg-[#0a0a0a] px-6 py-2">
      <button
        type="button"
        onClick={() => setPanelOpen(!panelOpen)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
          panelOpen
            ? "border-[#1db954] bg-[#1db954]/10 text-[#1db954]"
            : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>

      {chips.map(({ key, label }) => (
        <span
          key={`${key}-${label}`}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300"
        >
          {label}
          <button
            type="button"
            onClick={() => clearFilter(key)}
            className="text-zinc-500 hover:text-zinc-200"
            aria-label={`Remove ${label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={resetFilters}
          className="text-[10px] text-zinc-600 hover:text-zinc-400"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
