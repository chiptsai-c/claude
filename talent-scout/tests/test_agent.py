from pathlib import Path
from types import SimpleNamespace as NS

import pytest

from scout import agent
from scout.config import load_config

CONFIG = load_config(Path(__file__).resolve().parent.parent / "config.toml")


class FakeStream:
    def __init__(self, message):
        self.message = message

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return self.message


class FakeClient:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []
        self.beta = NS(messages=NS(stream=self._stream))

    def _stream(self, **kwargs):
        self.calls.append(kwargs)
        return FakeStream(self.replies.pop(0))


def msg(stop_reason, text=""):
    return NS(stop_reason=stop_reason, content=[NS(type="text", text=text)])


def test_research_resumes_after_pause_turn():
    client = FakeClient([msg("pause_turn", "searching"), msg("end_turn", "Alice – github.com/alice")])
    assert agent.research(client, CONFIG, exclude=["github.com/bob"]) == "Alice – github.com/alice"
    assert len(client.calls) == 2
    first = client.calls[0]
    assert first["fallbacks"] == "default"
    assert [t["name"] for t in first["tools"]] == ["web_search", "web_fetch"]
    assert all(t["allowed_domains"] == CONFIG.allowed_domains for t in first["tools"])
    assert "github.com/bob" in first["messages"][0]["content"]


def test_research_raises_on_refusal():
    with pytest.raises(agent.ScoutError, match="declined"):
        agent.research(FakeClient([msg("refusal")]), CONFIG, exclude=[])


def test_api_error_becomes_scout_error():
    import anthropic
    import httpx2 as httpx

    class Failing(FakeClient):
        def _stream(self, **kwargs):
            request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
            raise anthropic.BadRequestError(
                "domain not accessible", response=httpx.Response(400, request=request), body=None
            )

    with pytest.raises(agent.ScoutError, match="research: API error 400"):
        agent.research(Failing([]), CONFIG, exclude=[])
