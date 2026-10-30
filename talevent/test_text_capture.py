import unittest
from text_capture import clean_selection, looks_sensitive, draft_title

class CaptureTests(unittest.TestCase):
    def test_empty(self):
        with self.assertRaises(ValueError): clean_selection(" \n")
    def test_clean(self):
        self.assertEqual(clean_selection("  Ricordati di chiamare  \n"), "Ricordati di chiamare")
    def test_long(self):
        with self.assertRaises(ValueError): clean_selection("a"*20001)
    def test_sensitive(self):
        self.assertTrue(looks_sensitive("password: esempio"))
        self.assertFalse(looks_sensitive("domani dentista"))
    def test_title(self):
        self.assertEqual(draft_title("\nAppuntamento\nAltro"), "Appuntamento")

if __name__ == "__main__":
    unittest.main()
