"""Unit tests for Phase 2.3 sentiment analysis — no network/Supabase required."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.phase2_analysis.sentiment_analysis import analyze_sentiment, _vader_score, _textblob_score

# ---- helpers ---------------------------------------------------------------

def assert_label(text, expected_label, msg=""):
    label, score = analyze_sentiment(text)
    assert label == expected_label, (
        f"Expected '{expected_label}' but got '{label}' for: '{text}'. {msg}"
    )
    return label, score

def assert_score_in(text, low, high, msg=""):
    label, score = analyze_sentiment(text)
    assert low <= score <= high, (
        f"Expected score in [{low},{high}] but got {score} for: '{text}'. {msg}"
    )
    return label, score

# ---- positive reviews -------------------------------------------------------

def test_clearly_positive():
    label, score = assert_label(
        "Spotify is absolutely amazing! I love the recommendations.", "positive"
    )
    assert score >= 4

def test_mild_positive():
    label, score = assert_label(
        "Pretty good app, works well most of the time.", "positive"
    )
    assert score >= 4

# ---- negative reviews -------------------------------------------------------

def test_clearly_negative():
    label, score = assert_label(
        "This app is terrible. Broken recommendations, keeps crashing.", "negative"
    )
    assert score <= 2

def test_mild_negative():
    label, score = assert_label(
        "I don't really like the discover weekly anymore. Too repetitive.", "negative"
    )
    assert score <= 3

def test_severity_boost_pulls_down():
    # Review with severity keywords should score 1
    label, score = assert_label(
        "Worst app ever! Horrible discover weekly. Same songs, boring. Uninstalled.", "negative"
    )
    assert score == 1, f"Expected score=1 for severe negative, got {score}"

# ---- neutral reviews --------------------------------------------------------

def test_neutral_factual():
    label, score = assert_label(
        "I use Spotify every day for music.", "neutral"
    )
    assert 2 <= score <= 4

def test_empty_text():
    label, score = analyze_sentiment("")
    assert label == "neutral"
    assert score == 3

def test_whitespace_only():
    label, score = analyze_sentiment("   ")
    assert label == "neutral"
    assert score == 3

# ---- score range guard ------------------------------------------------------

def test_score_always_1_to_5():
    texts = [
        "AMAZING FANTASTIC BEST APP EVER",
        "absolute garbage trash worst app",
        "it is an app",
        "",
        "ok I guess",
        "I hate this so much I want to cry",
        "Love love love love love love love",
    ]
    for t in texts:
        _, score = analyze_sentiment(t)
        assert 1 <= score <= 5, f"Score {score} out of range for: '{t}'"

# ---- run --------------------------------------------------------------------

if __name__ == "__main__":
    tests = [
        test_clearly_positive,
        test_mild_positive,
        test_clearly_negative,
        test_mild_negative,
        test_severity_boost_pulls_down,
        test_neutral_factual,
        test_empty_text,
        test_whitespace_only,
        test_score_always_1_to_5,
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
    print(f"\n{passed}/{passed+failed} tests passed")
    if failed:
        sys.exit(1)
