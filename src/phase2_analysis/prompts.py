"""Shared theme taxonomy for discovery-related review classification."""

INTERNAL_THEME = "Unrelated to Discovery"

THEME_TAXONOMY = [
    "Repetitive Recommendations",
    "Discover Weekly Issues",
    "Niche Music Gap",
    "Playlist Fatigue",
    "Algorithm Bias",
    "Recommendation Quality",
    "Search & Discovery UX",
    INTERNAL_THEME,
]

ANALYSIS_WINDOW_DAYS = 90


def rank_themes_by_count(theme_counts, limit: int = 5):
    """Return top themes by mention count across the full project taxonomy."""
    return theme_counts.most_common(limit)
