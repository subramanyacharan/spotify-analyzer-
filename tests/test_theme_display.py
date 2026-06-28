from collections import Counter

from src.phase2_analysis.prompts import GENERAL_APP_THEME, rank_themes_by_count


def test_rank_themes_by_count_includes_all_taxonomy_themes():
    counter = Counter(
        {
            GENERAL_APP_THEME: 1000,
            "Playlist Fatigue": 420,
            "Recommendation Quality": 310,
        }
    )
    ranked = rank_themes_by_count(counter, 3)
    themes = [theme for theme, _ in ranked]

    assert themes[0] == GENERAL_APP_THEME
    assert "Playlist Fatigue" in themes
