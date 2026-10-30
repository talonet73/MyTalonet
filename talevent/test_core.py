import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from core import Store, parse_local_date

TZ = ZoneInfo("Europe/Rome")
NOW = datetime(2026, 11, 2, 12, 0, tzinfo=TZ)

class CoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name)/"test.sqlite3")
    def tearDown(self):
        self.store.close()
        self.temp.cleanup()
    def test_three_notifications_and_expiry(self):
        due = NOW + timedelta(hours=2)
        ident = self.store.add("Dentista", due, current=NOW)
        self.assertEqual(self.store.claim_alerts(NOW), [])
        for n in (60,30,5):
            alerts = self.store.claim_alerts(due - timedelta(minutes=n))
            self.assertEqual([(a["id"],a["minutes_before"]) for a in alerts], [(ident,n)])
            self.assertEqual(self.store.claim_alerts(due - timedelta(minutes=n)), [])
        self.assertEqual(self.store.claim_alerts(due), [])
        self.assertEqual(self.store.list(due), [])
    def test_late_creation_only_future_alerts(self):
        due = NOW + timedelta(minutes=20)
        self.store.add("Test",due,current=NOW)
        self.assertEqual([x["minutes_before"] for x in self.store.claim_alerts(NOW)], [60,30])
        self.assertEqual([x["minutes_before"] for x in self.store.claim_alerts(due-timedelta(minutes=5))], [5])
    def test_edit_reset_notifications(self):
        ident = self.store.add("A",NOW+timedelta(hours=2),current=NOW)
        self.store.update(ident,"B",NOW+timedelta(hours=3),current=NOW)
        self.assertEqual(self.store.list(NOW)[0]["title"],"B")
    def test_backup_duplicate(self):
        due = NOW+timedelta(hours=2)
        self.store.add("C",due,current=NOW)
        path = Path(self.temp.name)/"backup.json"
        self.store.export_backup(path,NOW)
        self.assertEqual(self.store.import_backup(path,NOW),(0,1))
    def test_invalid_or_ambiguous_dst(self):
        with self.assertRaises(ValueError): parse_local_date("2026-03-29 02:30")
        with self.assertRaises(ValueError): parse_local_date("2026-10-25 02:30")
    def test_no_past(self):
        with self.assertRaises(ValueError): self.store.add("Passato",NOW,current=NOW)

if __name__ == "__main__":
    unittest.main()
