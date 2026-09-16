"""
The one place that builds the OpenAI client.

The embedder, the folder summarizer and the answerer all talk to the same
service, so they all get their client from here. That keeps the settings in one
spot: the key, and an optional OPENAI_BASE_URL for an OpenAI-compatible
service such as OpenRouter or a local model server.
"""

from openai import OpenAI

from . import config

# OpenAI's own endpoint. Passed explicitly because, given base_url=None, the SDK
# falls back to the OPENAI_BASE_URL environment variable - and an empty
# `OPENAI_BASE_URL=` line in .env then becomes an empty URL that fails every call.
OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1"


def make_client(api_key: str | None = None) -> OpenAI:
    """Return a client for config's endpoint (OpenAI unless OPENAI_BASE_URL is set)."""
    return OpenAI(
        api_key=api_key or config.OPENAI_API_KEY,
        base_url=config.OPENAI_BASE_URL or OPENAI_DEFAULT_BASE_URL,
    )


def usage_tokens(response) -> tuple[int, int]:
    """
    (input tokens, output tokens) of one API response, or (0, 0) if it has none.

    Embedding responses only report input ("prompt") tokens; chat responses
    report both. Some OpenAI-compatible services leave `usage` out entirely,
    which is why every field is read defensively.
    """
    usage = getattr(response, "usage", None)
    if usage is None:
        return 0, 0
    return int(getattr(usage, "prompt_tokens", 0) or 0), int(
        getattr(usage, "completion_tokens", 0) or 0
    )
