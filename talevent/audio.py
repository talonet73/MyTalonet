"""Explicit recording and strictly local Whisper inference, with no downloads."""
import os
import sys
import tempfile
import threading
import wave
from pathlib import Path

RATE = 16000
MAX_SECONDS = 300


def model_path():
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / "models" / "tiny"


def transcribe(path, model=None):
    folder = Path(model) if model else model_path()
    if not (folder / "model.bin").is_file():
        raise RuntimeError("Modello offline mancante. Reinstalla il pacchetto completo TALEVENT.")
    from faster_whisper import WhisperModel
    engine = WhisperModel(str(folder), device="cpu", compute_type="int8", local_files_only=True, cpu_threads=max(1, min(4, os.cpu_count() or 1)))
    segments, _ = engine.transcribe(str(path), beam_size=3, vad_filter=False)
    text = " ".join(s.text.strip() for s in segments).strip()
    if not text:
        raise ValueError("Nessun parlato riconosciuto. Controlla il microfono e riprova.")
    return text


def microphones():
    import sounddevice as sd
    return [(i, item["name"]) for i, item in enumerate(sd.query_devices()) if item["max_input_channels"] > 0]


class Recorder:
    def __init__(self, device=None):
        self.device = device
        self.done = threading.Event()
        self.finished = threading.Event()
        self.error = None
        self.path = None
        self.thread = None

    def start(self):
        if self.thread:
            raise RuntimeError("Registrazione già avviata")
        self.thread = threading.Thread(target=self._record, daemon=True)
        self.thread.start()

    def _record(self):
        try:
            import sounddevice as sd
            handle, name = tempfile.mkstemp(prefix="talevent-", suffix=".wav")
            os.close(handle)
            self.path = Path(name)
            with wave.open(name, "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(RATE)
                with sd.RawInputStream(device=self.device, samplerate=RATE, channels=1, dtype="int16") as stream:
                    for _ in range(MAX_SECONDS * 10):
                        if self.done.is_set():
                            break
                        data, overflow = stream.read(RATE // 10)
                        if overflow:
                            raise RuntimeError("Audio perso durante la registrazione: riprova.")
                        wav.writeframesraw(bytes(data))
        except Exception as exc:
            self.error = str(exc)
        finally:
            self.finished.set()

    def stop(self):
        self.done.set()

    def discard(self):
        self.stop()
        if self.thread:
            self.thread.join(timeout=5)
        if self.finished.is_set() and self.path:
            self.path.unlink(missing_ok=True)
