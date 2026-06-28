"""Shared theme taxonomy for review classification."""

GENERAL_APP_THEME = "General App Feedback"
# Legacy label — still normalized when reading older pipeline rows.
LEGACY_GENERAL_THEME = "Unrelated to Discovery"

THEME_TAXONOMY = [
    "Repetitive Recommendations",
    "Discover Weekly Issues",
    "Niche Music Gap",
    "Playlist Fatigue",
    "Algorithm Bias",
    "Recommendation Quality",
    "Search & Discovery UX",
    GENERAL_APP_THEME,
]

ANALYSIS_WINDOW_DAYS = 90


def rank_themes_by_count(theme_counts, limit: int = 5):
    """Return top themes by mention count across the full project taxonomy."""
    return theme_counts.most_common(limit)
