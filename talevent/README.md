# TALEVENT — sviluppo Windows 11

Applicazione personale per promemoria, completamente locale. Questo branch contiene la **prima implementazione parziale**, non il prodotto completo.

## Funzionalità implementate nel codice
- SQLite locale e transazioni
- Calendario mensile, creazione, modifica ed eliminazione
- Tre scadenze (60, 30, 5 minuti) tramite motore di scheduling in processo
- Eliminazione degli eventi scaduti, inclusa pulizia all'avvio
- Backup manuale JSON e ripristino senza duplicati
- Gestione orario italiano e cambio ora legale (rifiuta orari ambigui)
- GUI italiana basata su tkinter
- Test unitari del motore e GitHub Actions di compilazione Windows

## Mancanze importanti
- La GUI mostra finestre tkinter, **non ancora toast nativi Windows**.
- Nessuna icona nella tray, scorciatoia globale, acquisizione testo o audio, microfono o Whisper.
- Nessuna installazione completa offline con modello AI.
- La finestra deve restare aperta per gli avvisi; se esci non ricevi notifiche.
- Le notifiche in questo branch sono ancora un'implementazione preliminare.
- La firma dell'eseguibile non è configurata.
- I test in GitHub Actions non sostituiscono una prova reale dell'interfaccia sul PC.

## Avvio sviluppo
Su Windows con Python 3.12 installato: `py -3.12 talevent/app.py`.
Test: `py -3.12 -m unittest discover -s talevent -p "test_*.py"`.

## Build di prova
Il workflow `.github/workflows/talevent-windows.yml` genera un **ZIP con TALEVENT.exe di prova** mediante PyInstaller. Non è ancora `TALEVENT-Setup.exe` e non va presentato come prodotto finito.

## Privacy
Tutti gli eventi restano sul computer. I backup JSON non sono cifrati.
Il codice TALEVENT vive solo nella cartella `/talevent/`. Il workflow separato non modifica quello del video editor.
