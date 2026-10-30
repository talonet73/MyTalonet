"""Real Windows API/GUI/frozen-package checks; never claims physical mic coverage."""
import argparse
import json
import os
import platform
import sys
import tempfile
import traceback
import time
import ctypes
from datetime import timedelta
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--report", required=True)
    parser.add_argument("--audio", required=True)
    args = parser.parse_args()
    report = {"platform": platform.platform(), "windows_version": list(sys.getwindowsversion()),
              "physical_microphone": "NOT TESTED: hosted runner has no physical input",
              "toast_visibility": "NOT TESTED: API acceptance only", "checks": {}}
    app = None
    try:
        from PIL import ImageGrab
        from desktop import InstanceLock, notify
        from audio import transcribe, microphones
        with tempfile.TemporaryDirectory(prefix="talevent-smoke-") as tmp:
            os.environ["TALEVENT_DATA_DIR"] = tmp
            # Import after choosing the disposable database location.
            import app as app_module
            from core import now_local
            lock = InstanceLock()
            try:
                try:
                    duplicate = InstanceLock()
                except RuntimeError:
                    report["checks"]["single_instance"] = True
                else:
                    duplicate.close()
                    raise AssertionError("Seconda istanza consentita")
                app = app_module.App()
                app.root.update()
                report["checks"]["tk_window"] = app.root.winfo_viewable() == 1
                app.root.clipboard_clear()
                app.root.clipboard_append("Appuntamento di prova")
                app.root.update()
                app.capture_text(app.root.clipboard_get())
                app.root.update()
                assert app.capture_dialog.winfo_exists()
                app.capture_dialog.destroy()
                report["checks"]["clipboard_review"] = True
                app.desktop.hotkey_ready.wait(timeout=5)
                # Exercise actual Windows hotkey dispatch, then Tk queue handling.
                user32 = ctypes.windll.user32
                for key in (0x11, 0x12, ord("T")):
                    user32.keybd_event(key, 0, 0, 0)
                for key in (ord("T"), 0x12, 0x11):
                    user32.keybd_event(key, 0, 2, 0)
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    app.root.update()
                    if app.capture_dialog.winfo_exists():
                        break
                    time.sleep(0.02)
                assert app.capture_dialog.winfo_exists(), "Ctrl+Alt+T non ha aperto la revisione"
                app.capture_dialog.destroy()
                report["checks"]["global_hotkey"] = True
                ident = app.store.add("Prova Windows", now_local() + timedelta(minutes=2))
                app.refresh()
                assert app.events.size() == 1
                event = app.store.pending_alerts()[0]
                assert event["id"] == ident
                notify("TALEVENT verifica", "Notifica nativa: <test> & Unicode è")
                app.store.mark_delivered(ident, event["minutes_before"])
                assert app.store.pending_alerts() == []
                report["checks"]["native_toast_submission"] = True
                app.desktop.hotkey_ready.wait(timeout=5)
                assert app.desktop.tray and app.desktop.tray.visible
                report["checks"]["tray_icon"] = True
                app.on_close()
                app.root.update()
                assert app.root.state() == "withdrawn"
                app.show_window()
                app.root.update()
                assert app.root.winfo_viewable()
                report["checks"]["hide_restore"] = True
                try:
                    report["microphone_devices"] = microphones()
                except Exception as exc:
                    report["microphone_enumeration_error"] = str(exc)
                image_path = str(Path(args.report).with_suffix(".png"))
                ImageGrab.grab().save(image_path)
                report["screenshot"] = image_path
                # Local model and generated speech, no downloads during inference.
                os.environ["HF_HUB_OFFLINE"] = "1"
                os.environ["TRANSFORMERS_OFFLINE"] = "1"
                text = transcribe(args.audio)
                report["transcription"] = text
                assert "appointment" in text.lower(), text
                report["checks"]["offline_transcription"] = True
                app.store.delete(ident)
                assert app.store.list() == []
                report["checks"]["event_lifecycle"] = True
            finally:
                if app:
                    app.shutdown()
                lock.close()
        assert all(report["checks"].values())
        report["success"] = True
    except Exception:
        report["success"] = False
        report["error"] = traceback.format_exc()
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0 if report["success"] else 1
