"""TALEVENT: prima versione desktop, solo libreria standard Python."""
import calendar
import queue
import threading
import logging
import os
import sys
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from datetime import datetime, timedelta
from pathlib import Path

from core import Store, now_local, parse_local_date, ROME
from desktop import Desktop, InstanceLock, notify
from audio import Recorder, microphones, transcribe
from text_capture import clean_selection, looks_sensitive, draft_title

DATA_DIR = Path(os.environ.get("TALEVENT_DATA_DIR", str(Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "TALEVENT")))
calendar.setfirstweekday(calendar.MONDAY)

class App:
    def __init__(self):
        self.messages = queue.Queue()
        self.closing = False
        self.busy = False
        self.alerts_inflight = set()
        self.recorder = None
        self.capture_dialog = None
        self.desktop = Desktop(lambda kind, value=None: self.messages.put((kind, value)))
        self.store = Store(DATA_DIR / "talevent.sqlite3")
        self.root = tk.Tk()
        self.root.title("TALEVENT — Promemoria")
        self.root.geometry("1000x700")
        self.root.minsize(650, 500)
        self.root.configure(bg="#2EAD63")
        self.month = now_local().replace(day=1)
        self.selected_id = None
        self.build()
        self.refresh()
        self.root.after(1000, self.tick)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        try:
            self.desktop.start()
        except Exception as exc:
            messagebox.showwarning("Area di notifica non disponibile", str(exc), parent=self.root)
        self.root.after(100, self.poll_messages)

    def build(self):
        self.body = ttk.Frame(self.root, padding=16)
        self.body.pack(fill="both", expand=True, padx=4, pady=4)
        ttk.Label(self.body, text="TALEVENT", font=("Segoe UI", 23, "bold")).pack(anchor="w")
        self.state = ttk.Label(self.body, text="● IN ATTESA", foreground="#2EAD63")
        self.state.pack(anchor="w")
        toolbar = ttk.Frame(self.body)
        toolbar.pack(fill="x", pady=8)
        ttk.Button(toolbar, text="Nuovo promemoria", command=self.new_event).pack(side="left", padx=3)
        ttk.Button(toolbar, text="Acquisisci testo", command=self.capture_text).pack(side="left", padx=3)
        ttk.Button(toolbar, text="Modifica", command=self.edit_event).pack(side="left", padx=3)
        ttk.Button(toolbar, text="Elimina", command=self.delete_event).pack(side="left", padx=3)
        ttk.Button(toolbar, text="Esporta backup", command=self.export_backup).pack(side="right", padx=3)
        ttk.Button(toolbar, text="Ripristina backup", command=self.import_backup).pack(side="right", padx=3)
        audio_bar = ttk.Frame(self.body)
        audio_bar.pack(fill="x")
        ttk.Button(audio_bar, text="Registra microfono", command=self.audio_dialog).pack(side="left", padx=3)
        ttk.Button(audio_bar, text="Trascrivi file audio", command=self.import_audio).pack(side="left", padx=3)
        ttk.Button(audio_bar, text="Prova notifica Windows", command=self.test_notification).pack(side="left", padx=3)
        ttk.Button(audio_bar, text="Esci", command=self.quit_app).pack(side="right", padx=3)
        ttk.Label(self.body, text="Copia un testo e premi Ctrl+Alt+T per acquisirlo. Chiudi la finestra per lasciare attivi gli avvisi.").pack(anchor="w", pady=5)
        nav = ttk.Frame(self.body)
        nav.pack(fill="x", pady=10)
        ttk.Button(nav, text="◀", command=lambda: self.shift(-1)).pack(side="left")
        self.month_label = ttk.Label(nav, font=("Segoe UI", 15, "bold"))
        self.month_label.pack(side="left", padx=20)
        ttk.Button(nav, text="▶", command=lambda: self.shift(1)).pack(side="left")
        self.next_event = ttk.Label(nav, text="")
        self.next_event.pack(side="right")
        self.grid_frame = ttk.Frame(self.body)
        self.grid_frame.pack(fill="both", expand=True)
        ttk.Label(self.body, text="Promemoria futuri — seleziona per modificare").pack(anchor="w", pady=(10,2))
        self.events = tk.Listbox(self.body, height=6, font=("Segoe UI", 10))
        self.events.pack(fill="x")
        self.events.bind("<Double-Button-1>", lambda e: self.edit_event())

    def shift(self, n):
        y, m = self.month.year, self.month.month + n
        if m == 0: y, m = y-1, 12
        if m == 13: y, m = y+1, 1
        self.month = self.month.replace(year=y, month=m)
        self.refresh()

    def refresh(self):
        events = self.store.list()
        self.visible_events = events
        self.month_label.config(text=f"{("", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre")[self.month.month]} {self.month.year}")
        self.next_event.config(text=("Prossimo: " + events[0]["due"].strftime("%d/%m %H:%M") + " " + events[0]["title"][:25]) if events else "Nessun evento")
        self.events.delete(0, "end")
        for e in events:
            self.events.insert("end", e["due"].strftime("%d/%m/%Y %H:%M") + " — " + e["title"])
        for child in self.grid_frame.winfo_children(): child.destroy()
        for col, day in enumerate(("Lun","Mar","Mer","Gio","Ven","Sab","Dom")):
            ttk.Label(self.grid_frame, text=day, anchor="center").grid(row=0, column=col, sticky="ew")
            self.grid_frame.columnconfigure(col, weight=1)
        for week_idx, week in enumerate(calendar.monthcalendar(self.month.year, self.month.month), start=1):
            self.grid_frame.rowconfigure(week_idx, weight=1)
            for col, day in enumerate(week):
                if not day: continue
                matching = [e for e in events if (e["due"].year,e["due"].month,e["due"].day)==(self.month.year,self.month.month,day)]
                titles = "\n".join(e["due"].strftime("%H:%M ") + e["title"][:13] for e in matching[:3])
                ttk.Button(self.grid_frame, text=f"{day}\n{titles}", command=lambda d=day: self.new_event(d)).grid(
                    row=week_idx, column=col, padx=2, pady=2, sticky="nsew")

    def event_dialog(self, event=None, day=None, prefill_title='', prefill_description=''):
        dlg = tk.Toplevel(self.root)
        dlg.title("Modifica promemoria" if event else "Nuovo promemoria")
        dlg.geometry("490x310")
        dlg.transient(self.root)
        dlg.grab_set()
        frame = ttk.Frame(dlg, padding=16)
        frame.pack(fill="both", expand=True)
        local = event["due"] if event else now_local() + timedelta(hours=1)
        if day is not None:
            local = local.replace(year=self.month.year, month=self.month.month, day=day)
        ttk.Label(frame, text="Titolo").pack(anchor="w")
        title = ttk.Entry(frame)
        title.pack(fill="x")
        title.insert(0, event["title"] if event else prefill_title)
        ttk.Label(frame, text="Descrizione").pack(anchor="w", pady=(8,0))
        desc = ttk.Entry(frame)
        desc.pack(fill="x")
        desc.insert(0, event["description"] if event else prefill_description)
        ttk.Label(frame, text="Data e ora (AAAA-MM-GG HH:MM)").pack(anchor="w", pady=(8,0))
        due = ttk.Entry(frame)
        due.pack(fill="x")
        due.insert(0, local.strftime("%Y-%m-%d %H:%M"))
        def save():
            try:
                parsed = parse_local_date(due.get().strip())
                if event:
                    self.store.update(event["id"], title.get(), parsed, desc.get())
                else:
                    self.store.add(title.get(), parsed, desc.get())
                dlg.destroy()
                self.refresh()
            except Exception as exc:
                messagebox.showerror("Controlla i dati", str(exc), parent=dlg)
        ttk.Button(frame, text="Salva promemoria", command=save).pack(anchor="e", pady=16)

    def capture_text(self, initial=""):
        """L'utente incolla esplicitamente il testo da acquisire."""
        self.show_window()
        if self.capture_dialog and self.capture_dialog.winfo_exists():
            self.capture_dialog.lift()
            return
        dlg = tk.Toplevel(self.root)
        self.capture_dialog = dlg
        dlg.title("Revisione testo")
        dlg.geometry("600x380")
        dlg.transient(self.root)
        dlg.grab_set()
        ttk.Label(dlg, text="Incolla il testo che vuoi acquisire.").pack(padx=12, pady=8)
        editor = tk.Text(dlg, wrap="word", height=11)
        editor.pack(fill="both", expand=True, padx=12)
        editor.insert("1.0", initial)
        def paste():
            try:
                editor.delete("1.0", "end")
                editor.insert("1.0", self.root.clipboard_get())
            except tk.TclError:
                messagebox.showerror("Appunti", "Gli appunti non contengono testo.", parent=dlg)
        ttk.Button(dlg, text="Incolla dagli appunti", command=paste).pack(pady=4)
        def approve():
            try:
                content = clean_selection(editor.get("1.0", "end-1c"))
                if looks_sensitive(content):
                    messagebox.showwarning("Dati sensibili", "Rimuovi possibili credenziali.", parent=dlg)
                    return
                dlg.destroy()
                self.event_dialog(prefill_title=draft_title(content), prefill_description=content)
            except ValueError as exc:
                messagebox.showerror("Controlla testo", str(exc), parent=dlg)
        ttk.Button(dlg, text="Approva testo", command=approve).pack(pady=10)

    def new_event(self, day=None):
        self.event_dialog(day=day)

    def selected(self):
        selection = self.events.curselection()
        if not selection:
            messagebox.showinfo("TALEVENT", "Seleziona prima un promemoria")
            return None
        return self.visible_events[selection[0]]

    def edit_event(self):
        event = self.selected()
        if event: self.event_dialog(event)

    def delete_event(self):
        event = self.selected()
        if event and messagebox.askyesno("Conferma", "Eliminare definitivamente il promemoria?"):
            self.store.delete(event["id"])
            self.refresh()

    def export_backup(self):
        path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("Backup JSON", "*.json")])
        if path:
            self.store.export_backup(path)
            messagebox.showinfo("Backup", "Backup salvato. Il file non è cifrato.")

    def import_backup(self):
        path = filedialog.askopenfilename(filetypes=[("Backup JSON", "*.json")])
        if path and messagebox.askyesno("Conferma", "Importare promemoria futuri dal backup?"):
            try:
                n, ignored = self.store.import_backup(path)
                self.refresh()
                messagebox.showinfo("Ripristino", f"Importati: {n}\nIgnorati: {ignored}")
            except Exception as exc:
                messagebox.showerror("Backup non valido", str(exc))

    def show_window(self):
        self.root.deiconify()
        self.root.lift()

    def poll_messages(self):
        if self.closing:
            return
        for _ in range(30):
            try:
                kind, value = self.messages.get_nowait()
            except queue.Empty:
                break
            try:
                if kind == "show": self.show_window()
                elif kind == "clipboard":
                    try:
                        self.capture_text(clean_selection(self.root.clipboard_get()))
                    except (tk.TclError, ValueError) as exc:
                        self.show_window()
                        messagebox.showerror("Appunti", str(exc), parent=self.root)
                elif kind == "audio": self.audio_dialog()
                elif kind == "quit": self.quit_app()
                elif kind == "status": self.state.config(text=value)
                elif kind == "transcribed":
                    self.busy = False
                    self.state.config(text="Trascrizione terminata — controlla il testo")
                    self.capture_text(value)
                elif kind == "audio_error":
                    self.busy = False
                    self.show_window()
                    self.state.config(text="Errore audio")
                    messagebox.showerror("Audio", value, parent=self.root)
                elif kind == "alert_ok":
                    self.store.mark_delivered(*value)
                    self.alerts_inflight.discard(value)
                elif kind == "alert_error":
                    key, error = value
                    self.alerts_inflight.discard(key)
                    logging.error("Notifica fallita: %s", error)
                    self.state.config(text="Notifica Windows fallita; nuovo tentativo tra 30 secondi")
            except Exception:
                logging.exception("Errore gestione messaggio %s", kind)
        if not self.closing:
            self.root.after(100, self.poll_messages)

    def send_notification(self, title, body, key=None):
        def work():
            try:
                notify(title, body)
                self.messages.put(("alert_ok", key) if key else ("status", "Windows ha accettato la notifica di prova"))
            except Exception as exc:
                self.messages.put(("alert_error", (key, str(exc))) if key else ("status", str(exc)))
        threading.Thread(target=work, daemon=True).start()

    def test_notification(self):
        self.send_notification("TALEVENT", "Notifica di prova. Controlla anche il centro notifiche di Windows.")

    def tick(self):
        if self.closing:
            return
        try:
            for event in self.store.pending_alerts():
                key = (event["id"], event["minutes_before"])
                if key in self.alerts_inflight:
                    continue
                self.alerts_inflight.add(key)
                minutes = max(0, round((event["due"] - now_local()).total_seconds() / 60))
                self.send_notification(event["title"],
                    f"{event['description'][:800]}\nAppuntamento: {event['due'].strftime('%d/%m/%Y %H:%M')}\nMancano circa {minutes} minuti", key)
            self.store.purge_expired()
            self.refresh()
        except Exception:
            logging.exception("Errore scheduler")
            self.state.config(text="Errore scheduler: consulta talevent.log")
        finally:
            if not self.closing:
                self.root.after(30000, self.tick)

    def start_transcription(self, path, remove=False):
        if self.busy:
            return
        self.busy = True
        self.state.config(text="Trascrizione offline in corso…")
        def work():
            try:
                self.messages.put(("transcribed", transcribe(path)))
            except Exception as exc:
                self.messages.put(("audio_error", str(exc)))
            finally:
                if remove:
                    Path(path).unlink(missing_ok=True)
        threading.Thread(target=work, daemon=True).start()

    def import_audio(self):
        if self.busy or self.recorder:
            messagebox.showinfo("Audio", "Termina prima l'operazione audio in corso.", parent=self.root)
            return
        path = filedialog.askopenfilename(parent=self.root, filetypes=[("Audio", "*.wav *.mp3 *.m4a *.flac *.ogg"), ("Tutti i file", "*.*")])
        if path:
            self.start_transcription(path)

    def audio_dialog(self):
        if self.busy or self.recorder:
            self.show_window()
            messagebox.showinfo("Audio", "Termina prima l'operazione audio in corso.", parent=self.root)
            return
        self.show_window()
        try:
            devices = microphones()
            if not devices:
                raise RuntimeError("Nessun microfono disponibile. Controlla Impostazioni > Privacy e sicurezza > Microfono.")
        except Exception as exc:
            messagebox.showerror("Microfono", str(exc), parent=self.root)
            return
        dlg = tk.Toplevel(self.root)
        dlg.title("Registra audio — massimo 5 minuti")
        dlg.transient(self.root)
        dlg.grab_set()
        frame = ttk.Frame(dlg, padding=16)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="Microfono (la registrazione inizia solo con Avvia)").pack()
        choice = ttk.Combobox(frame, values=[name for _, name in devices], state="readonly", width=65)
        choice.current(0)
        choice.pack(pady=8)
        status = ttk.Label(frame, text="Pronto. Il file temporaneo viene eliminato dopo la trascrizione.")
        status.pack()
        recording = [None]
        cancelled = [False]
        def cancel():
            cancelled[0] = True
            if recording[0]:
                recording[0].discard()
                self.recorder = None
            dlg.destroy()
        def watch():
            rec = recording[0]
            if cancelled[0]:
                return
            if not rec.finished.is_set():
                dlg.after(100, watch)
                return
            self.recorder = None
            dlg.destroy()
            if rec.error:
                rec.discard()
                messagebox.showerror("Microfono", rec.error, parent=self.root)
            else:
                self.start_transcription(rec.path, remove=True)
        def start():
            rec = Recorder(devices[choice.current()][0])
            self.recorder = recording[0] = rec
            choice.config(state="disabled")
            start_button.config(state="disabled")
            stop_button.config(state="normal")
            status.config(text="● REGISTRAZIONE — premi Ferma e trascrivi per terminare")
            rec.start()
            watch()
        start_button = ttk.Button(frame, text="Avvia", command=start)
        start_button.pack(side="left", pady=15)
        stop_button = ttk.Button(frame, text="Ferma e trascrivi", state="disabled", command=lambda: recording[0].stop())
        stop_button.pack(side="left", padx=8)
        ttk.Button(frame, text="Annulla", command=cancel).pack(side="right")
        dlg.protocol("WM_DELETE_WINDOW", cancel)

    def on_close(self):
        if self.desktop.tray:
            self.root.withdraw()
        else:
            self.quit_app()

    def quit_app(self):
        if self.busy:
            messagebox.showinfo("TALEVENT", "Attendi il termine della trascrizione prima di uscire.", parent=self.root)
            return
        if not messagebox.askyesno("Chiudi TALEVENT", "Uscire completamente? Non riceverai notifiche fino al prossimo avvio.", parent=self.root):
            return
        self.shutdown()

    def shutdown(self):
        self.closing = True
        if self.recorder:
            self.recorder.discard()
        self.desktop.stop()
        self.store.close()
        self.root.destroy()

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    if "--self-test" in sys.argv:
        from selftest import main
        raise SystemExit(main())
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(filename=DATA_DIR / "talevent.log", level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s", encoding="utf-8")
    lock = None
    try:
        lock = InstanceLock()
        App().run()
    except Exception as exc:
        logging.exception("Avvio fallito")
        error_root = tk.Tk()
        error_root.withdraw()
        messagebox.showerror("TALEVENT", str(exc), parent=error_root)
        error_root.destroy()
    finally:
        if lock:
            lock.close()

