import sys
import types

import numpy as np

import asr
from audio import RATE
from settings import clean_plan


def fake_mlx(monkeypatch, tmp_path, result):
    """mlx_whisper as a module of our own: what it was called with, and the answer given."""
    calls = []
    module = types.ModuleType("mlx_whisper")
    module.transcribe = lambda audio, **kw: calls.append(kw) or result
    monkeypatch.setitem(sys.modules, "mlx_whisper", module)
    monkeypatch.setattr(asr, "mlx_ready", lambda: True)
    monkeypatch.setattr(asr, "fetch", lambda name: str(tmp_path))
    return calls


RESULT = {
    "text": " Hello there. Krya works.",
    "language": "en",
    "segments": [
        {"start": 0.0, "end": 1.5, "text": " Hello there.", "avg_logprob": -0.2, "no_speech_prob": 0.01,
         "words": [{"word": " Hello", "start": 0.0, "end": 0.6, "probability": 0.9}, {"word": " there.", "start": 0.6, "end": 1.5, "probability": 0.9}, {"word": " ", "start": 1.5, "end": 1.5, "probability": 0.1}]},
        {"start": 1.5, "end": 3.0, "text": " Krya works.", "avg_logprob": -0.3, "no_speech_prob": 0.02,
         "words": [{"word": " Krya", "start": 1.5, "end": 2.0, "probability": 0.8}, {"word": " works.", "start": 2.0, "end": 3.0, "probability": 0.9}]},
    ],
}


def test_metal_transcribes_as_faster_whisper_does(monkeypatch, tmp_path):
    calls = fake_mlx(monkeypatch, tmp_path, RESULT)
    t = asr.Transcriber()
    t.load("large-v3-turbo", "cpu", "mlx")
    assert (t.device, t.compute, t.loaded) == ("metal", "mlx", True)
    seen = []
    segments, language = t.transcribe(np.zeros(RATE * 3, np.float32), None, "Krya, Kryakl", seen.append)
    assert language == "en"
    assert segments == [
        {"start": 0.0, "end": 1.5, "text": "Hello there.", "words": [{"start": 0.0, "end": 0.6, "word": " Hello"}, {"start": 0.6, "end": 1.5, "word": " there."}]},
        {"start": 1.5, "end": 3.0, "text": "Krya works.", "words": [{"start": 1.5, "end": 2.0, "word": " Krya"}, {"start": 2.0, "end": 3.0, "word": " works."}]},
    ]
    assert seen == [0.5, 1.0]
    kw = calls[0]
    assert kw["word_timestamps"] and kw["language"] is None and kw["path_or_hf_repo"] == str(tmp_path)
    assert kw["initial_prompt"] == "Krya, Kryakl"


def test_the_prompt_keeps_its_last_400_characters(monkeypatch, tmp_path):
    calls = fake_mlx(monkeypatch, tmp_path, RESULT)
    t = asr.Transcriber()
    t.load("large-v3-turbo", "metal")
    t.transcribe(np.zeros(RATE, np.float32), "ru", "слово " * 200)
    prompt = calls[0]["initial_prompt"]
    assert len(prompt) == 400 and prompt.endswith("слово")


def test_metal_dictates_in_the_persons_own_language_when_it_cannot_tell(monkeypatch, tmp_path):
    calls = fake_mlx(monkeypatch, tmp_path, {"text": "привет", "language": "ru", "segments": [{"text": " Привет.", "avg_logprob": -0.1, "no_speech_prob": 0.01}]})
    monkeypatch.setattr(asr.MlxWhisper, "detect", lambda self, speech: None)
    t = asr.Transcriber()
    t.load("large-v3-turbo", "metal")
    text, language, _ = t._model.dictate(np.zeros(RATE, np.float32), None, ("ru", "en"), "", "", True)
    assert (text, language) == ("Привет.", "ru") and calls[0]["language"] == "ru"


def test_metal_dictation_picks_among_the_expected(monkeypatch, tmp_path):
    fake_mlx(monkeypatch, tmp_path, {"text": "", "segments": []})
    # English 3 times as likely as Russian, the person's own: under OWN_LEAN, so Russian.
    monkeypatch.setattr(asr.MlxWhisper, "detect", lambda self, speech: {"en": 0.6, "ru": 0.2, "de": 0.2})
    t = asr.Transcriber()
    t.load("large-v3-turbo", "metal")
    assert t._model.dictate(np.zeros(RATE, np.float32), None, ("ru", "en"), "", "", True)[1] == "ru"


def test_without_mlx_metal_falls_back_to_the_processor(monkeypatch):
    monkeypatch.setattr(asr, "mlx_ready", lambda: False)
    loaded = []
    monkeypatch.setattr(asr, "_fetch_whisper", lambda name: loaded.append(name) or "/nowhere")
    fw = types.ModuleType("faster_whisper")
    fw.WhisperModel = lambda path, **kw: kw
    monkeypatch.setitem(sys.modules, "faster_whisper", fw)
    t = asr.Transcriber()
    t.load("large-v3-turbo", "metal")
    assert (t.device, t.compute, loaded) == ("cpu", "int8", ["large-v3-turbo"])


def test_the_plan_keeps_mlx_for_turbo_only():
    plan = clean_plan({"cpu": {"transcripts": {"model": "large-v3-turbo", "compute": "mlx"}, "dictation": {"model": "small", "compute": "mlx"}}})
    assert plan == {"cpu": {"transcripts": {"model": "large-v3-turbo", "compute": "mlx"}, "dictation": {"model": "small"}}}
