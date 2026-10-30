"""Windows integration. All callbacks enter Tk through the application's queue."""
import ctypes
import os
import subprocess
import threading
from pathlib import Path
from xml.sax.saxutils import escape

APP_ID = "MyTalonet.TALEVENT"


def notify(title, body):
    """Submit a native toast; an OS acceptance is not proof of visible delivery."""
    if os.name != "nt":
        raise RuntimeError("Le notifiche native richiedono Windows")
    xml = '<toast><visual><binding template="ToastGeneric"><text>' + escape(title) + '</text><text>' + escape(body) + '</text></binding></visual><audio src="ms-winsoundevent:Notification.Reminder"/></toast>'
    # XML travels through stdin, never through shell interpolation.
    script = """$ErrorActionPreference='Stop'
[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime] > $null
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml([Console]::In.ReadToEnd())
$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('MyTalonet.TALEVENT').Show($toast)
"""
    powershell = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
    result = subprocess.run([str(powershell), "-NoProfile", "-NonInteractive", "-Command", script], input=xml, encoding="utf-8", capture_output=True, timeout=20, creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise RuntimeError("Windows non ha accettato la notifica: " + result.stderr[-500:])


class Desktop:
    def __init__(self, post):
        self.post = post
        self.tray = None
        self.hotkey_thread_id = None
        self.hotkey_ready = threading.Event()
        self.stopping = False

    def start(self):
        if os.name != "nt":
            return
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
        import pystray
        from PIL import Image, ImageDraw
        image = Image.new("RGB", (64, 64), "#2EAD63")
        draw = ImageDraw.Draw(image)
        draw.rectangle((13, 16, 51, 52), outline="white", width=4)
        draw.line((13, 26, 51, 26), fill="white", width=4)
        self.tray = pystray.Icon("TALEVENT", image, "TALEVENT — Promemoria", pystray.Menu(
            pystray.MenuItem("Apri TALEVENT", lambda *_: self.post("show"), default=True),
            pystray.MenuItem("Acquisisci appunti (Ctrl+Alt+T)", lambda *_: self.post("clipboard")),
            pystray.MenuItem("Registra microfono", lambda *_: self.post("audio")),
            pystray.MenuItem("Esci", lambda *_: self.post("quit"))))
        self.tray.run_detached()
        threading.Thread(target=self._hotkey, daemon=True).start()

    def _hotkey(self):
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        self.hotkey_thread_id = ctypes.windll.kernel32.GetCurrentThreadId()
        msg = wintypes.MSG()
        # Ensure the message queue exists before advertising readiness.
        user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, 0)
        registered = user32.RegisterHotKey(None, 1, 0x4000 | 0x0002 | 0x0001, ord("T"))
        self.hotkey_ready.set()
        if not registered:
            self.post("status", "Ctrl+Alt+T non disponibile: usa Acquisisci testo.")
            return
        try:
            if self.stopping:
                return
            while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
                if msg.message == 0x0312:
                    self.post("clipboard")
        finally:
            user32.UnregisterHotKey(None, 1)

    def stop(self):
        self.stopping = True
        if self.tray:
            self.tray.stop()
        if self.hotkey_thread_id and self.hotkey_ready.is_set():
            ctypes.windll.user32.PostThreadMessageW(self.hotkey_thread_id, 0x0012, 0, 0)


class InstanceLock:
    def __init__(self):
        self.handle = None
        if os.name == "nt":
            from ctypes import wintypes
            kernel = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
            kernel.CreateMutexW.restype = wintypes.HANDLE
            self.handle = kernel.CreateMutexW(None, False, "Local\\MyTalonet.TALEVENT")
            if not self.handle:
                raise ctypes.WinError(ctypes.get_last_error())
            if ctypes.get_last_error() == 183:
                kernel.CloseHandle.argtypes = [wintypes.HANDLE]
                kernel.CloseHandle(self.handle)
                self.handle = None
                raise RuntimeError("TALEVENT è già in esecuzione. Aprilo dall'icona nell'area di notifica.")

    def close(self):
        if self.handle:
            from ctypes import wintypes
            ctypes.windll.kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
            ctypes.windll.kernel32.CloseHandle(self.handle)
            self.handle = None
