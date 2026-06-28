from unittest.mock import patch

from src.phase2_analysis.llm_client import DEFAULT_GROQ_MODEL, get_groq_client, get_model_name


@patch.dict("os.environ", {"GROQ_API_KEY": "test-key", "GROQ_MODEL": "llama-3.3-70b-versatile"})
@patch("src.phase2_analysis.llm_client.OpenAI")
def test_get_groq_client_uses_groq_endpoint(mock_openai):
    get_groq_client()

    mock_openai.assert_called_once_with(
        api_key="test-key",
        base_url="https://api.groq.com/openai/v1",
    )


def test_get_model_name_defaults_to_llama():
    with patch.dict("os.environ", {}, clear=True):
        assert get_model_name() == DEFAULT_GROQ_MODEL


def test_get_model_name_ignores_blank_env():
    with patch.dict("os.environ", {"GROQ_MODEL": "   "}):
        assert get_model_name() == DEFAULT_GROQ_MODEL
