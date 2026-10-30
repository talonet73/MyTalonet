# TALEVENT — anteprima Windows

Sviluppo isolato nel branch `codex/talevent-windows`: TALEDIT e main non sono modificati.

## Implementazione
- Calendario, CRUD, SQLite locale, backup JSON e orari Europe/Rome.
- Acquisizione testo tramite incolla o Ctrl+Alt+T dopo aver copiato il testo. Revisione prima di creare un promemoria.
- Registrazione esplicita da microfono selezionabile (massimo 5 minuti), stop/annulla e importazione WAV/MP3/M4A/FLAC/OGG.
- Trascrizione CPU int8 con Whisper tiny multilingue incluso. Nessun download durante l'uso. Controllare il risultato; data e ora si impostano nella scheda evento.
- Tray: chiudere la finestra la nasconde e mantiene lo scheduler attivo. Esci termina gli avvisi. Avvio all'accesso opzionale nell'installer.
- Toast nativi asincroni con ritentativo in caso di errore API. Dopo sospensione gli avvisi superati vengono accorpati. Windows può sopprimerli con Non disturbare.
- Installer per utente `TALEVENT-Setup.exe`, disinstallazione che conserva i dati locali.

## Verifica
Il codice non certifica il funzionamento sul dispositivo. Il workflow produce report JSON e screenshot: `build` prova il pacchetto x64 su Windows Server 2025; `windows11` richiede Windows 11 ARM e prova il programma x64 installato tramite emulazione. La release viene pubblicata soltanto dopo il successo di entrambi.

La trascrizione viene verificata con parlato SAPI e modello locale. I runner non verificano microfono fisico, qualità su parlato italiano reale o visibilità effettiva dei toast. Il report distingue tali limiti dai controlli superati. Non è una certificazione Windows 11 x64 su hardware fisico. Firma digitale non configurata.

## Sviluppo
Windows, Python 3.12 x64: `python -m pip install -r talevent/requirements-build.txt`, `python talevent/prepare_model.py`, `python talevent/app.py`.
Test: `python -m unittest discover -s talevent -p "test_*.py" -v`.
Il workflow acquisisce il modello con revisione risolta e SHA256 nel file provenance.json, compila con PyInstaller e Inno Setup, installa, verifica e disinstalla.

## Dati
Dati in `%LOCALAPPDATA%\TALEVENT`, log `talevent.log`. Eventi e backup non cifrati. L'audio registrato usa un file temporaneo eliminato dopo trascrizione o annullamento; un arresto forzato può lasciarlo nella cartella temporanea. I file importati restano intatti. Nessun ascolto automatico o acquisizione in background. Gli avvisi richiedono TALEVENT in esecuzione e una sessione utente attiva; non risveglia il PC spento.
