"""Acquisizione testo esplicita: nessun monitoraggio appunti o keylogger."""
from __future__ import annotations
import re

MAX_TEXT = 20000

def clean_selection(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("Il testo deve essere una stringa")
    value = value.replace("\x00", "").strip()
    if not value:
        raise ValueError("Nessun testo selezionato")
    if len(value) > MAX_TEXT:
        raise ValueError("Selezione troppo lunga")
    return value

def looks_sensitive(text: str) -> bool:
    """Filtro prudenziale: avvisa, non registra automaticamente."""
    return bool(re.search(r"(?i)\b(password|passwd|password:|otp|codice di verifica|2fa|token)\s*[:=]", text))

def draft_title(text: str, limit: int = 65) -> str:
    line = next((line.strip() for line in text.splitlines() if line.strip()), "Promemoria")
    return line[:limit].rstrip()
