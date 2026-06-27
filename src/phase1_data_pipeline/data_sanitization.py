import json
import logging
import os
import re
import sys
from typing import Any, Dict, List, Optional, Pattern

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if project_root not in sys.path:
    sys.path.append(project_root)

import pandas as pd

from src.phase1_data_pipeline.data_cleaning import DEFAULT_OUTPUT_PATH as DEFAULT_CLEANED_PATH

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_SANITIZED_PATH = os.path.join(project_root, "data", "processed", "sanitized_reviews.jsonl")
REDACTION_TOKEN = "[REDACTED]"

_EMAIL_PATTERN = re.compile(
    r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b",
    re.IGNORECASE,
)
_OBFUSCATED_EMAIL_PATTERN = re.compile(
    r"\b[\w.+-]+\s*[\[\(]?\s*(?:at|@)\s*[\]\)]?\s*[\w.-]+\s*[\[\(]?\s*(?:dot|\.)\s*[\]\)]?\s*[\w.]+\b",
    re.IGNORECASE,
)
_URL_PATTERN = re.compile(
    r"(?:https?://|www\.)\S+",
    re.IGNORECASE,
)
_PHONE_PATTERN = re.compile(
    r"(?<!\d)(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){1,2}\d{4}(?!\d)",
)
_OBFUSCATED_PHONE_PATTERN = re.compile(
    r"\b(?:\d{3}[-\s]){2}\d{4}\b|\b\d[-\s](?:one|two|three|four|five|six|seven|eight|nine|zero)(?:[-\s](?:one|two|three|four|five|six|seven|eight|nine|zero)){8,}\b",
    re.IGNORECASE,
)

_PII_PATTERNS: List[Pattern[str]] = [
    _EMAIL_PATTERN,
    _OBFUSCATED_EMAIL_PATTERN,
    _URL_PATTERN,
    _PHONE_PATTERN,
    _OBFUSCATED_PHONE_PATTERN,
]

_nlp = None
_nlp_unavailable = False


def _get_spacy_nlp():
    """Load spaCy NER model if available."""
    global _nlp, _nlp_unavailable

    if _nlp_unavailable:
        return None

    if _nlp is not None:
        return _nlp

    try:
        import spacy

        _nlp = spacy.load("en_core_web_sm")
        logger.info("spaCy NER model loaded for name masking.")
        return _nlp
    except (OSError, ModuleNotFoundError):
        _nlp_unavailable = True
        logger.warning("spaCy unavailable. Skipping NER-based name masking.")
        return None


def _redact_pattern_matches(text: str, pattern: Pattern[str]) -> str:
    return pattern.sub(REDACTION_TOKEN, text)


def _mask_person_names(text: str) -> str:
    nlp = _get_spacy_nlp()
    if not nlp or not text:
        return text

    doc = nlp(text)
    if not doc.ents:
        return text

    spans = sorted(
        [(ent.start_char, ent.end_char) for ent in doc.ents if ent.label_ == "PERSON"],
        reverse=True,
    )
    for start, end in spans:
        text = text[:start] + REDACTION_TOKEN + text[end:]

    return re.sub(r"(?:\[REDACTED\]\s*){2,}", f"{REDACTION_TOKEN} ", text).strip()


def sanitize_text(text: str, use_ner: bool = True) -> str:
    """Strip emails, phone numbers, URLs, and optionally person names from text."""
    if not text:
        return ""

    sanitized = text
    for pattern in _PII_PATTERNS:
        sanitized = _redact_pattern_matches(sanitized, pattern)

    if use_ner:
        sanitized = _mask_person_names(sanitized)

    sanitized = re.sub(r"\s+", " ", sanitized).strip()
    return sanitized


def sanitize_metadata(metadata: Any) -> Dict[str, Any]:
    """Redact PII fields from review metadata."""
    if not isinstance(metadata, dict):
        return {}

    sanitized = dict(metadata)
    for key in ("userName", "username", "email", "phone", "title"):
        if key in sanitized and sanitized[key]:
            sanitized[key] = REDACTION_TOKEN

    if "replyContent" in sanitized and isinstance(sanitized["replyContent"], str):
        sanitized["replyContent"] = sanitize_text(sanitized["replyContent"], use_ner=False)

    return sanitized


def sanitize_review_record(review: Dict[str, Any], use_ner: bool = True) -> Dict[str, Any]:
    """Sanitize review text and metadata while preserving the unified schema."""
    sanitized = dict(review)
    sanitized["sanitized_text"] = sanitize_text(review.get("review_text", ""), use_ner=use_ner)
    sanitized["metadata"] = sanitize_metadata(review.get("metadata"))
    return sanitized


def sanitize_reviews(reviews: List[Dict[str, Any]], use_ner: bool = True) -> List[Dict[str, Any]]:
    """Sanitize a list of cleaned reviews."""
    return [sanitize_review_record(review, use_ner=use_ner) for review in reviews]


def audit_pii_leakage(text: str) -> List[str]:
    """Return names of PII patterns still present in text."""
    leaks = []
    pattern_names = [
        "email",
        "obfuscated_email",
        "url",
        "phone",
        "obfuscated_phone",
    ]
    for name, pattern in zip(pattern_names, _PII_PATTERNS):
        if pattern.search(text):
            leaks.append(name)
    return leaks


def load_reviews_from_jsonl(path: str) -> List[Dict[str, Any]]:
    """Load review records from a JSON Lines file."""
    reviews: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if line:
                reviews.append(json.loads(line))
    return reviews


def save_sanitized_reviews(
    reviews: List[Dict[str, Any]], output_path: str = DEFAULT_SANITIZED_PATH
) -> str:
    """Persist sanitized reviews to JSON Lines and CSV."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as file:
        for review in reviews:
            file.write(json.dumps(review, ensure_ascii=False) + "\n")

    csv_path = os.path.splitext(output_path)[0] + ".csv"
    pd.DataFrame(reviews).to_csv(csv_path, index=False)

    logger.info("Saved %s sanitized reviews to %s and %s", len(reviews), output_path, csv_path)
    return output_path


def run_sanitization(
    reviews: Optional[List[Dict[str, Any]]] = None,
    input_path: str = DEFAULT_CLEANED_PATH,
    output_path: str = DEFAULT_SANITIZED_PATH,
    save_local: bool = True,
    use_ner: bool = True,
) -> List[Dict[str, Any]]:
    """Main orchestration function for Phase 1.4: PII Sanitization."""
    logger.info("Starting Phase 1.4: PII Sanitization")

    if reviews is None:
        if not os.path.exists(input_path):
            raise FileNotFoundError(
                f"Cleaned reviews not found at {input_path}. Run Phase 1.3 first."
            )
        reviews = load_reviews_from_jsonl(input_path)

    if not reviews:
        logger.warning("No reviews to sanitize.")
        return []

    sanitized_reviews = sanitize_reviews(reviews, use_ner=use_ner)

    leak_count = 0
    for review in sanitized_reviews:
        leaks = audit_pii_leakage(review.get("sanitized_text", ""))
        if leaks:
            leak_count += 1
            logger.debug("PII leak in review %s: %s", review.get("review_id"), leaks)

    logger.info(
        "Sanitization complete. Input: %s, Output: %s, Reviews with residual PII: %s",
        len(reviews),
        len(sanitized_reviews),
        leak_count,
    )

    if save_local:
        save_sanitized_reviews(sanitized_reviews, output_path)

    return sanitized_reviews


if __name__ == "__main__":
    run_sanitization()
