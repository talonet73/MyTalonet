import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from core import Store, ROME


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "db.sqlite3")
        self.now = datetime(2030, 1, 10, 12, tzinfo=ROME)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_retry_and_coalesce_after_sleep(self):
        ident = self.store.add("Test", self.now + timedelta(minutes=20), current=self.now)
        first = self.store.pending_alerts(self.now)
        self.assertEqual([e["minutes_before"] for e in first], [30])
        self.assertEqual(self.store.pending_alerts(self.now), first)
        self.store.mark_delivered(ident, 30)
        self.assertEqual(self.store.pending_alerts(self.now), [])
        self.assertEqual([e["minutes_before"] for e in self.store.pending_alerts(self.now + timedelta(minutes=16))], [5])

    def test_delivery_survives_restart(self):
        ident = self.store.add("Test", self.now + timedelta(minutes=3), current=self.now)
        self.store.mark_delivered(ident, 5)
        self.store.close()
        self.store = Store(Path(self.tmp.name) / "db.sqlite3")
        self.assertEqual(self.store.pending_alerts(self.now), [])

    def test_dst_uses_elapsed_time(self):
        current = datetime(2030, 10, 27, 0, 0, tzinfo=timezone.utc)
        due = current + timedelta(minutes=90)
        self.store.add("Ora legale", due.astimezone(ROME), current=current)
        self.assertEqual(self.store.pending_alerts(current), [])
        self.assertEqual([e["minutes_before"] for e in self.store.pending_alerts(current + timedelta(minutes=30))], [60])
