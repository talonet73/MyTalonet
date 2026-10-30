"""TALEVENT: prima versione desktop, solo libreria standard Python."""
import calendar
import os
import sys
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from datetime import datetime
from pathlib import Path

from core import Store, now_local, parse_local_date, ROME
from text_capture import clean_selection, looks_sensitive, draft_title

DATA_DIR = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "TALEVENT"
calendar.setfirstweekday(calendar.MONDAY)

class App:
    def __init__(self):
        self.store = Store(DATA_DIR / "talevent.sqlite3")
        self.root = tk.Tk()
        self.root.title("TALEVENT — Promemoria")
        self.root.geometry("860x650")
        self.root.minsize(650, 500)
        self.root.configure(bg="#2EAD63")
        self.month = now_local().replace(day=1)
        self.selected_id = None
        self.build()
        self.refresh()
        self.root.after(1000, self.tick)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

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
        self.month_label.config(text=f"{calendar.month_name[self.month.month]} {self.month.year}")
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
        local = event["due"] if event else now_local()
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

    def capture_text(self):
        """L'utente incolla esplicitamente il testo da acquisire."""
        dlg = tk.Toplevel(self.root)
        dlg.title("Revisione testo")
        dlg.geometry("600x380")
        dlg.transient(self.root)
        dlg.grab_set()
        ttk.Label(dlg, text="Incolla il testo che vuoi acquisire.").pack(padx=12, pady=8)
        editor = tk.Text(dlg, wrap="word", height=11)
        editor.pack(fill="both", expand=True, padx=12)
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

    def tick(self):
        try:
            for event in self.store.claim_alerts():
                minutes = event["minutes_before"]
                self.root.bell()
                messagebox.showinfo("Promemoria TALEVENT",
                    f"{event['title']}\n{event['description']}\n"
                    f"Appuntamento: {event['due'].strftime('%d/%m/%Y %H:%M')}\n"
                    f"Mancano {minutes} minuti")
            self.store.purge_expired()
            self.refresh()
        finally:
            self.root.after(30000, self.tick)

    def on_close(self):
        if messagebox.askyesno("Chiudi TALEVENT", "Uscire completamente? Non riceverai notifiche fino al prossimo avvio."):
            self.store.close()
            self.root.destroy()

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    App().run()
