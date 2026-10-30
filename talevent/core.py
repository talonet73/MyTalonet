"""TALEVENT: motore locale dei promemoria, senza servizi esterni."""
from __future__ import annotations
import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROME = ZoneInfo("Europe/Rome")
OFFSETS = (60, 30, 5)

def now_local() -> datetime:
    return datetime.now(ROME)

def parse_local_date(value: str) -> datetime:
    """Riceve YYYY-MM-DD HH:MM e rifiuta ore inesistenti/ambigue."""
    naive = datetime.strptime(value, "%Y-%m-%d %H:%M")
    matches = []
    for fold in (0, 1):
        d = naive.replace(tzinfo=ROME, fold=fold)
        if d.astimezone(timezone.utc).astimezone(ROME).replace(tzinfo=None) == naive:
            matches.append(d)
    if not matches:
        raise ValueError("Orario inesistente per il cambio dell'ora legale")
    if len(matches) == 2 and matches[0].utcoffset() != matches[1].utcoffset():
        raise ValueError("Orario ambiguo per il cambio dell'ora legale: scegli un altro orario")
    return matches[0]

class Store:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(self.path), timeout=10)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS reminders(
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          due_utc TEXT NOT NULL,
          created_utc TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_due ON reminders(due_utc);
        CREATE TABLE IF NOT EXISTS notifications(
          reminder_id TEXT NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
          minutes_before INTEGER NOT NULL,
          delivered INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(reminder_id, minutes_before)
        );
        """)
        self.db.commit()
        self.purge_expired()

    def close(self):
        self.db.close()

    @staticmethod
    def _utc(d: datetime) -> str:
        if d.tzinfo is None:
            raise ValueError("Data priva di fuso orario")
        return d.astimezone(timezone.utc).isoformat(timespec="seconds")

    def add(self, title: str, due: datetime, description: str = "", current: datetime | None = None, event_id: str | None = None) -> str:
        title = title.strip()
        if not title:
            raise ValueError("Inserisci un titolo")
        current = current or now_local()
        if due <= current:
            raise ValueError("La data deve essere futura")
        event_id = event_id or str(uuid.uuid4())
        with self.db:
            self.db.execute("INSERT INTO reminders VALUES(?,?,?,?,?)",
                            (event_id, title, description, self._utc(due), self._utc(current)))
            self.db.executemany("INSERT INTO notifications VALUES(?,?,0)",
                                [(event_id, m) for m in OFFSETS])
        return event_id

    def list(self, current: datetime | None = None) -> list[dict]:
        current = current or now_local()
        rows = self.db.execute("SELECT * FROM reminders WHERE due_utc > ? ORDER BY due_utc",
                               (self._utc(current),)).fetchall()
        return [self._decode(x) for x in rows]

    def _decode(self, x: sqlite3.Row) -> dict:
        d = dict(x)
        d["due"] = datetime.fromisoformat(d.pop("due_utc")).astimezone(ROME)
        return d

    def update(self, event_id: str, title: str, due: datetime, description: str = "", current: datetime | None = None):
        current = current or now_local()
        if not title.strip() or due <= current:
            raise ValueError("Titolo e data futura sono obbligatori")
        with self.db:
            cur = self.db.execute("UPDATE reminders SET title=?,description=?,due_utc=? WHERE id=?",
                                  (title.strip(), description, self._utc(due), event_id))
            if cur.rowcount == 0:
                raise ValueError("Promemoria non trovato")
            self.db.execute("DELETE FROM notifications WHERE reminder_id=?", (event_id,))
            self.db.executemany("INSERT INTO notifications VALUES(?,?,0)", [(event_id, m) for m in OFFSETS])

    def delete(self, event_id: str):
        with self.db:
            self.db.execute("DELETE FROM reminders WHERE id=?", (event_id,))

    def purge_expired(self, current: datetime | None = None) -> int:
        current = current or now_local()
        with self.db:
            cur = self.db.execute("DELETE FROM reminders WHERE due_utc <= ?", (self._utc(current),))
        return cur.rowcount

    def claim_alerts(self, current: datetime | None = None) -> list[dict]:
        """Consegna atomica: niente avvisi duplicati né avvisi già scaduti."""
        current = current or now_local()
        now = self._utc(current)
        claimed = []
        with self.db:
            rows = self.db.execute("""
                SELECT r.*, n.minutes_before FROM reminders r
                JOIN notifications n ON n.reminder_id=r.id
                WHERE n.delivered=0 AND r.due_utc>? ORDER BY r.due_utc, n.minutes_before DESC
            """, (now,)).fetchall()
            for r in rows:
                due = datetime.fromisoformat(r["due_utc"])
                offset = r["minutes_before"]
                if due - timedelta(minutes=offset) <= current.astimezone(timezone.utc):
                    self.db.execute("UPDATE notifications SET delivered=1 WHERE reminder_id=? AND minutes_before=?",
                                    (r["id"], offset))
                    event = self._decode(r)
                    event["minutes_before"] = offset
                    claimed.append(event)
            self.db.execute("DELETE FROM reminders WHERE due_utc <= ?", (now,))
        return claimed

    def pending_alerts(self, current: datetime | None = None) -> list[dict]:
        """Latest elapsed threshold per event; retry until Windows accepts it.

        After sleep, avoid three simultaneous notifications for the same event.
        Compare instants in UTC, including across a daylight-saving change.
        """
        current = current or now_local()
        rows = self.db.execute("""
            SELECT r.*, n.minutes_before FROM reminders r
            JOIN notifications n ON n.reminder_id=r.id
            WHERE n.delivered=0 AND r.due_utc>?
            ORDER BY r.due_utc, n.minutes_before ASC
        """, (self._utc(current),)).fetchall()
        seen = set()
        result = []
        for row in rows:
            due = datetime.fromisoformat(row["due_utc"])
            if row["id"] not in seen and due - timedelta(minutes=row["minutes_before"]) <= current.astimezone(timezone.utc):
                seen.add(row["id"])
                result.append(self._decode(row))
        return result

    def mark_delivered(self, event_id: str, minutes_before: int, expected_due: str | None = None):
        with self.db:
            if expected_due is None:
                self.db.execute("UPDATE notifications SET delivered=1 WHERE reminder_id=? AND minutes_before>=?", (event_id, minutes_before))
            else:
                self.db.execute("""UPDATE notifications SET delivered=1 WHERE reminder_id=? AND minutes_before>=?
                    AND reminder_id IN (SELECT id FROM reminders WHERE due_utc=?)""",
                    (event_id, minutes_before, self._utc(datetime.fromisoformat(expected_due))))

    def export_backup(self, destination: str | Path, current: datetime | None = None):
        events = self.list(current)
        payload = {"format": "talevent-backup-v1", "events": [
            {"id": e["id"], "title": e["title"], "description": e["description"],
             "due": e["due"].isoformat()} for e in events]}
        Path(destination).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def import_backup(self, source: str | Path, current: datetime | None = None) -> tuple[int, int]:
        current = current or now_local()
        data = json.loads(Path(source).read_text(encoding="utf-8"))
        if not isinstance(data, dict) or data.get("format") != "talevent-backup-v1" or not isinstance(data.get("events"), list):
            raise ValueError("Formato backup non valido")
        valid = []
        for item in data["events"]:
            if not isinstance(item, dict) or not all(k in item for k in ("id","title","description","due")):
                raise ValueError("Backup danneggiato")
            due = datetime.fromisoformat(item["due"])
            if due.tzinfo is None:
                raise ValueError("Data del backup priva di fuso")
            if due > current and str(item["title"]).strip():
                valid.append((str(item["id"]), str(item["title"]), str(item["description"]), self._utc(due), self._utc(current)))
        count = 0
        with self.db:
            for event in valid:
                cur = self.db.execute("INSERT OR IGNORE INTO reminders VALUES(?,?,?,?,?)", event)
                if cur.rowcount:
                    count += 1
                    self.db.executemany("INSERT INTO notifications VALUES(?,?,0)", [(event[0], m) for m in OFFSETS])
        return count, len(data["events"]) - count

