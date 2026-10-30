import sys
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch
from audio import Recorder, transcribe


class AudioTests(unittest.TestCase):
    def test_missing_model_fails_without_network_or_decoder(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(RuntimeError, "Modello offline mancante"):
                transcribe("missing.wav", tmp)

    def test_recording_writes_valid_pcm_and_discards_temporary_file(self):
        # Controlled input stream tests recording/file lifecycle, not hardware.
        recorder = Recorder()
        class Stream:
            def __init__(self, **kwargs): pass
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, frames):
                recorder.stop()
                return b"\0\0" * frames, False
        class Device:
            RawInputStream = Stream
        with patch.dict(sys.modules, {"sounddevice": Device}):
            recorder.start()
            self.assertTrue(recorder.finished.wait(5))
        self.assertIsNone(recorder.error)
        path = recorder.path
        with wave.open(str(path), "rb") as wav:
            self.assertEqual((wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes()), (1, 2, 16000, 1600))
        recorder.discard()
        self.assertFalse(path.exists())

    def test_device_failure_reported_and_temp_removed(self):
        class Device:
            @staticmethod
            def RawInputStream(**kwargs):
                raise RuntimeError("Microfono non autorizzato")
        recorder = Recorder()
        with patch.dict(sys.modules, {"sounddevice": Device}):
            recorder.start()
            self.assertTrue(recorder.finished.wait(5))
        self.assertIn("non autorizzato", recorder.error)
        recorder.discard()
        self.assertFalse(recorder.path.exists())
