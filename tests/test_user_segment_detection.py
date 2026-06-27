"""Unit tests for Phase 2.4 user segment detection — no network/Supabase required."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.phase2_analysis.user_segment_detection import (
    detect_segment,
    SEGMENT_NEW_USER, SEGMENT_PREMIUM, SEGMENT_HEAVY,
    SEGMENT_NICHE, SEGMENT_CASUAL, ALL_SEGMENTS,
)

# ---------------------------------------------------------------------------
# New User
# ---------------------------------------------------------------------------

def test_new_user_just_started():
    assert detect_segment("I just started using Spotify last week") == SEGMENT_NEW_USER

def test_new_user_downloaded():
    assert detect_segment("I just downloaded the app and it's confusing") == SEGMENT_NEW_USER

def test_new_user_first_time():
    assert detect_segment("This is my first time trying Spotify") == SEGMENT_NEW_USER

def test_new_user_recently_switched():
    assert detect_segment("I recently switched from Apple Music to Spotify") == SEGMENT_NEW_USER

# ---------------------------------------------------------------------------
# Premium User
# ---------------------------------------------------------------------------

def test_premium_explicit():
    assert detect_segment("I'm a Premium user and the recommendations are terrible") == SEGMENT_PREMIUM

def test_premium_paying():
    assert detect_segment("I've been paying for Spotify for 3 years and discover weekly is useless") == SEGMENT_PREMIUM

def test_premium_family_plan():
    assert detect_segment("I pay for the family plan and still get ads somehow") == SEGMENT_PREMIUM

def test_premium_paid_subscriber():
    assert detect_segment("As a paid subscriber I expect better recommendations") == SEGMENT_PREMIUM

# ---------------------------------------------------------------------------
# Heavy Listener
# ---------------------------------------------------------------------------

def test_heavy_all_day():
    assert detect_segment("I listen to music all day at work and the same songs keep appearing") == SEGMENT_HEAVY

def test_heavy_cant_live_without():
    assert detect_segment("I can't live without Spotify, use it 8 hours a day") == SEGMENT_HEAVY

def test_heavy_constantly():
    assert detect_segment("I use Spotify constantly during my commute and gym sessions") == SEGMENT_HEAVY

def test_heavy_obsessed():
    assert detect_segment("I'm obsessed with music and Spotify is failing me") == SEGMENT_HEAVY

# ---------------------------------------------------------------------------
# Niche Music Listener
# ---------------------------------------------------------------------------

def test_niche_underground():
    assert detect_segment("Spotify never has good underground metal artists in my recommendations") == SEGMENT_NICHE

def test_niche_indie():
    assert detect_segment("As an indie music fan, the algorithm is totally biased toward pop") == SEGMENT_NICHE

def test_niche_genre_explicit():
    assert detect_segment("I listen to black metal music but Spotify never recommends anything good") == SEGMENT_NICHE

def test_niche_world_music():
    assert detect_segment("I love world music and there is almost no variety here") == SEGMENT_NICHE

def test_niche_foreign():
    assert detect_segment("I listen to non-english music and the search is terrible") == SEGMENT_NICHE

# ---------------------------------------------------------------------------
# Casual Listener (default fallback)
# ---------------------------------------------------------------------------

def test_casual_generic_complaint():
    assert detect_segment("The app keeps crashing on my phone") == SEGMENT_CASUAL

def test_casual_short_review():
    assert detect_segment("Good app") == SEGMENT_CASUAL

def test_casual_empty():
    assert detect_segment("") == SEGMENT_CASUAL

def test_casual_whitespace():
    assert detect_segment("   ") == SEGMENT_CASUAL

# ---------------------------------------------------------------------------
# Priority ordering — Premium should beat Casual keywords
# ---------------------------------------------------------------------------

def test_priority_premium_beats_casual():
    # Mixed: has both "background" (casual) and "premium"
    seg = detect_segment("I'm a premium user who uses Spotify as background music occasionally")
    assert seg == SEGMENT_PREMIUM

def test_priority_new_user_beats_casual():
    seg = detect_segment("I just started using Spotify and sometimes find good songs")
    assert seg == SEGMENT_NEW_USER

# ---------------------------------------------------------------------------
# All segments are valid values
# ---------------------------------------------------------------------------

def test_segment_always_valid():
    texts = [
        "Discover Weekly is broken again",
        "I pay for premium but get terrible recommendations",
        "Just downloaded this app today",
        "I listen to black metal music exclusively",
        "I use Spotify all day every day",
        "The app crashed",
        "",
        "Nice app overall, not much else to say",
    ]
    for t in texts:
        seg = detect_segment(t)
        assert seg in ALL_SEGMENTS, f"Invalid segment '{seg}' for: '{t}'"


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    tests = [
        test_new_user_just_started, test_new_user_downloaded,
        test_new_user_first_time, test_new_user_recently_switched,
        test_premium_explicit, test_premium_paying,
        test_premium_family_plan, test_premium_paid_subscriber,
        test_heavy_all_day, test_heavy_cant_live_without,
        test_heavy_constantly, test_heavy_obsessed,
        test_niche_underground, test_niche_indie,
        test_niche_genre_explicit, test_niche_world_music, test_niche_foreign,
        test_casual_generic_complaint, test_casual_short_review,
        test_casual_empty, test_casual_whitespace,
        test_priority_premium_beats_casual, test_priority_new_user_beats_casual,
        test_segment_always_valid,
    ]
    passed = failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  FAIL  {t.__name__}: {e}")
            failed += 1
    print(f"\n{passed}/{passed + failed} tests passed")
    if failed:
        sys.exit(1)
