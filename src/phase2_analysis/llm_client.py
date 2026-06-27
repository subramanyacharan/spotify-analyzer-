import os

from openai import OpenAI

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"


def get_groq_client() -> OpenAI:
    """Initialize the Groq client (OpenAI-compatible API)."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY missing in environment variables.")
    return OpenAI(api_key=api_key, base_url=GROQ_BASE_URL)


def get_model_name() -> str:
    return os.environ.get("GROQ_MODEL", DEFAULT_GROQ_MODEL)
