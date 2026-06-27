"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_GLOBAL_FILTERS,
  PRESETS_STORAGE_KEY,
  STORAGE_KEY,
  type FilterPreset,
  type GlobalFiltersState,
  type FilterKey,
} from "@/lib/filters/types";
import { countActiveFilters, isDefaultFilters } from "@/lib/filters/match";

interface FilterContextValue {
  filters: GlobalFiltersState;
  appliedFilters: GlobalFiltersState;
  setFilter: (key: FilterKey, value: string) => void;
  resetFilters: () => void;
  applyFilters: () => void;
  clearFilter: (key: FilterKey) => void;
  activeCount: number;
  hasActiveFilters: boolean;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  presets: FilterPreset[];
  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

function loadStoredFilters(): GlobalFiltersState {
  if (typeof window === "undefined") return DEFAULT_GLOBAL_FILTERS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GLOBAL_FILTERS;
    return { ...DEFAULT_GLOBAL_FILTERS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_GLOBAL_FILTERS;
  }
}

function loadStoredPresets(): FilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FilterPreset[]) : [];
  } catch {
    return [];
  }
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<GlobalFiltersState>(DEFAULT_GLOBAL_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<GlobalFiltersState>(DEFAULT_GLOBAL_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadStoredFilters();
    setFilters(stored);
    setAppliedFilters(stored);
    setPresets(loadStoredPresets());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: GlobalFiltersState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setFilter = useCallback((key: FilterKey, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_GLOBAL_FILTERS);
    setAppliedFilters(DEFAULT_GLOBAL_FILTERS);
    persist(DEFAULT_GLOBAL_FILTERS);
  }, [persist]);

  const applyFilters = useCallback(() => {
    setAppliedFilters({ ...filters });
    persist(filters);
    setPanelOpen(false);
  }, [filters, persist]);

  const clearFilter = useCallback(
    (key: FilterKey) => {
      const next = {
        ...appliedFilters,
        [key]: DEFAULT_GLOBAL_FILTERS[key],
      };
      setFilters(next);
      setAppliedFilters(next);
      persist(next);
    },
    [appliedFilters, persist]
  );

  const savePreset = useCallback(
    (name: string) => {
      const preset: FilterPreset = {
        id: `preset_${Date.now()}`,
        name,
        filters: { ...appliedFilters },
      };
      const next = [...presets, preset];
      setPresets(next);
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(next));
    },
    [appliedFilters, presets]
  );

  const loadPreset = useCallback(
    (id: string) => {
      const preset = presets.find((p) => p.id === id);
      if (!preset) return;
      setFilters(preset.filters);
      setAppliedFilters(preset.filters);
      persist(preset.filters);
    },
    [presets, persist]
  );

  const deletePreset = useCallback(
    (id: string) => {
      const next = presets.filter((p) => p.id !== id);
      setPresets(next);
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(next));
    },
    [presets]
  );

  const activeCount = countActiveFilters(appliedFilters);
  const hasActiveFilters = !isDefaultFilters(appliedFilters);

  const value = useMemo(
    () => ({
      filters,
      appliedFilters: hydrated ? appliedFilters : DEFAULT_GLOBAL_FILTERS,
      setFilter,
      resetFilters,
      applyFilters,
      clearFilter,
      activeCount: hydrated ? activeCount : 0,
      hasActiveFilters: hydrated ? hasActiveFilters : false,
      panelOpen,
      setPanelOpen,
      presets,
      savePreset,
      loadPreset,
      deletePreset,
    }),
    [
      filters,
      appliedFilters,
      hydrated,
      setFilter,
      resetFilters,
      applyFilters,
      clearFilter,
      activeCount,
      hasActiveFilters,
      panelOpen,
      presets,
      savePreset,
      loadPreset,
      deletePreset,
    ]
  );

  return (
    <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}

/** @deprecated use GlobalFiltersState from lib/filters/types */
export type { GlobalFiltersState as SegmentationFiltersState };
