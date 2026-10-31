# Verifica installer unico Windows — 31 ottobre 2026

Pacchetto: `TALEDIT-Setup.exe`, installazione per utente Windows 10/11 x64.
Sorgente: [`336592184fc9`](https://github.com/talonet73/MyTalonet/tree/336592184fc93b1680e60c6e77e31143b856bfdf). Esecuzione Windows: [GitHub Actions Windows](https://github.com/talonet73/MyTalonet/actions/runs/41207002977).
Stato: **PASS** — installer costruito, installato e verificato su Windows;
release pubblicata e download completo controllato.

[Scarica TALEDIT-Setup.exe](https://github.com/talonet73/MyTalonet/releases/download/taledit-windows-336592184fc9/TALEDIT-Setup.exe).

## Contenuto e comportamento

Un solo download comprende frontend compilato, server autonomo, Node.js 22.16.0,
Python 3.12.10 privato, FFmpeg/ffprobe 7.1.1, yt-dlp 2026.08.19 (stessa versione del
progetto), 46 wheel Windows, Whisper small e U2NetP. Hash di archivi, wheel e modelli
sono bloccati in `packaging/windows/assets.lock.json`. Conservati licenze dei runtime,
metadati/licenze Python e testi completi delle licenze dei modelli.

L'installer crea il collegamento desktop e i comandi Start per aprire/chiudere TALEDIT.
Non modifica il PATH generale e non richiede Python, Node o FFmpeg globali.
L'interfaccia usa il browser installato, con server solo su `127.0.0.1:3000`.
Programma e modelli restano separati dai dati personali. La disinstallazione conserva
`%LOCALAPPDATA%\TALEDIT\data` e i progetti salvati altrove.

## Correzioni emerse nelle prove reali

La prima prova Windows ha terminato con `WinError 32` durante la pulizia temporanea:
il messaggio nascondeva il precedente errore di un secondo avvio rimasto aperto.
Il test ora preserva l'eccezione originale e il log, evita finestre interattive nella
sola modalità di verifica e pubblica le singole verifiche come notice di GitHub.

La prova successiva ha mostrato esplicitamente il timeout di 15 secondi del secondo
`TALEDIT.exe`, mentre installazione, runtime privati, UTF-8, trascrizione reale,
U2NetP, primo avvio e chiusura avevano già superato i controlli.

Il protocollo tra le istanze ora scambia messaggi terminati da newline, senza
attendere una chiusura parziale della connessione: la risposta completa chiude
esplicitamente il client. Il controllo della prima istanza viene attivato prima
dell'esposizione dello stato pronto HTTP, evitando la finestra fra i due avvii.
La chiusura richiesta dall'utente è distinta da un arresto inatteso del server.
Su Windows sono quindi passati primo avvio, tre riaperture e chiusura completa.
Questa prova ora precede la compressione, per rilevare rapidamente future regressioni.

Durante l'indagine è stato riprodotto separatamente un avvio silenziosamente perso
attraverso un alias del file: prima il bundle usciva con codice zero senza ascoltare;
dopo il confronto dei percorsi reali rimane in esecuzione e risponde correttamente
alla verifica FFmpeg. Questo rinforza l'avvio anche con percorsi alternativi.
Non è stato assunto come causa dimostrata del timeout Windows del secondo avvio.

Corrette anche l'isolamento di Python, l'encoding UTF-8 per testo italiano e percorsi
Windows, le DLL C++ private coerenti e la versione del downloader, allineata al progetto.

## Risultati

- `npm run lint`: PASS.
- `npm test`: 111/111 PASS, zero test ignorati.
- Browser in produzione: 34/34 PASS sulla versione destinata al pacchetto.
- Test mirati launcher/percorso: 3/3 PASS dopo l'aggiornamento del protocollo.
- Bundle autonomo senza `node_modules`: health, HTML, upload reale, MP4 con pixel
  rossi e audio, PNG dal cursore: PASS su Linux.
- Bundle autonomo con SDK MCP ufficiale: handshake, tutti i 13 strumenti,
  importazione video e audio collegato: PASS su Linux.
- Avvio reale del supervisore con tre riaperture e chiusura: PASS su Linux.
- Windows: primo avvio, tre riaperture tramite EXE e arresto: PASS prima della compressione.
- Installer completo, browser e conservazione dati: PASS su Windows: installazione reale in un percorso con spazi, inventario completo,
  runtime privati, versione yt-dlp, testo italiano UTF-8, trascrizione JFK con tempi
  parola per parola, segmentazione U2NetP con alpha, primo e secondo avvio, upload,
  MP4 con video rosso e audio, screenshot PNG in Download, pannelli Effects/AUDIO/
  COLOR/VIDEO in Chromium, arresto e disinstallazione con marker dati preservato.
- Download pubblicato e confronto SHA256: PASS: risposta HTTP 200, file completo di 664634981 byte
  (633.8 MiB), intestazioni MZ/PE valide e SHA256 uguale al checksum pubblicato.

## Limiti delle verifiche

Il controllo Windows usa Windows Server 2022 del servizio GitHub Actions.
Installa davvero l'EXE in una cartella con spazi e apre l'interfaccia con Chromium;
non equivale a una prova manuale su ciascun PC Windows 10/11 o su tutti i browser.
La prova automatica evita l'apertura interattiva del browser predefinito e i messaggi
di errore bloccanti; i relativi comandi restano attivi nell'uso normale.

Non sono state trasferite nuove credenziali MCP né provati allegati dell'account
personale Claude dell'utente. Il download reale YouTube rimane soggetto alle
condizioni/restrizioni del servizio; nell'installer viene verificato l'eseguibile
incluso e la sua versione, senza tentare aggiramenti o ripetere task YouTube dismessi.
L'installer è privo di firma digitale.


SHA256 del file pubblicato e scaricato integralmente:

```text
d79834038af5b8c98bac015b4e72936ce1b7450f173c50da92ae2304b2b0ce1f  TALEDIT-Setup.exe
```
