# Verifica strumenti e pulsanti TALEDIT

Aggiornamento del 21 ottobre 2026. Le quattro schede della barra ora aprono strumenti operativi; il controllo non si limita al loro colore o alla presenza di un pulsante.

## Correzioni

- Effects: otto effetti applicabili alla clip selezionata, combinabili e rimovibili. Camera a mano usa un piccolo ingrandimento per evitare bordi neri; Zoom in/out cambiano progressivamente durante la clip.
- Transitions: dissolvenza da/verso nero sulla singola clip e dissolvenza incrociata fra due clip adiacenti sulla stessa traccia. Solo il video entrante sfuma durante l’incrocio, evitando un abbassamento al nero; le tracce audio collegate usano fade in/out.
- Captions: apertura del pannello, trascrizione reale, modifica ed eliminazione. Nessun testo predefinito viene usato come trascrizione.
- Adjustment: luminosità, contrasto, saturazione, esposizione, temperatura, tinta e nitidezza; pulsante di ripristino. Preset e regolazioni hanno effetti misurati sui fotogrammi esportati.
- Immagini: doppio clic nella traccia IMMAGINI, trascinamento su tracce video o immagini e compatibilità con le vecchie tracce audio. La transizione funziona anche sulle immagini.
- Cestino della barra: corretto il passaggio involontario dell’evento del clic al posto dell’identificativo della clip.
- Marker: corretta la sovrapposizione con la maniglia del cursore, che impediva il clic sul marker nel punto corrente.
- Taglio dal bordo sinistro: ora aggiorna l’offset della sorgente, la durata e il relativo audio collegato. L’estensione di una clip importata viene limitata alla sorgente disponibile.
- Cronologia: conserva sia le clip sia le tracce; annullare la rimozione di una traccia la ripristina con il contenuto.
- Esportazione: riaprire la finestra non ripropone un vecchio file come risultato del progetto corrente. WAV mostra il peso fisso PCM e disabilita un cursore che non ne cambia la codifica.
- Schermo intero nel menu View e opzioni del player ora eseguono azioni reali. Gli errori di capacità del browser sono espliciti.
- Comandi locali: i preset operano sulle tracce effettive del progetto e sui tempi richiesti; gli effetti fuori dal contenuto non creano una coda di nero. Taglio ed eliminazione rispettano lo stato unito/separato dell’audio.
- Sottotitoli FFmpeg: file di testo/font relativi alla cartella temporanea di rendering, per non inserire lettere di unità e separatori Windows nei filtri.

## Matrice dei controlli provati nel browser

| Gruppo | Verifiche |
| --- | --- |
| Barra e menu File | Apri, Salva, Importa, Esporta; selezione reale di file; download e riapertura del progetto |
| Barra e menu Edit | Copia, Incolla, Cut, Cestino, Indietro, Avanti; risultato misurato nella timeline |
| Effects | Tutti gli otto pulsanti, attivazione/rimozione, combinazioni, salvataggio/riapertura |
| Transitions | Durata, entrata, uscita, rimozione, incrocio; colori miscelati nell’anteprima |
| Adjustment | Tutti i sette cursori, ripristino, colore dell’anteprima e persistenza nel progetto |
| Captions | Scelta lingua, opzione inglese, sostituzione sottotitoli, GENERATE reale, testo modificato, eliminazione e chiusura |
| Stage | Import superiore e Import dello stage; ricerca, tutti i filtri, doppio clic, trascinamento immagini e cancellazione |
| Tracce | Tutti i tipi di nuova pista, aggiunta/annulla/chiusura, solo, muto, eliminazione e annullamento |
| Timeline | Ingrandisci/rimpicciolisci, bordo di taglio, offset/audio collegato; separazione, riunione e cancellazione dal menu destro |
| Marker | Entrambi i comandi di aggiunta, modifica nome/note, tutti i colori, salvataggio, chiusura, eliminazione |
| Player/View | Play, pausa, ritorno all’inizio, mute/unmute, tutte le proporzioni, pulsante Full, icona schermo intero, menu View e menu player |
| Claude/ChatGPT | Apertura console/guida, ON/OFF effettivo, invio comando locale, configurazione copiata, elenco strumenti e guida ChatGPT |
| Export | Tutti i formati e risoluzioni selezionabili, cursore peso, JSON progetto, rendering, nuova esportazione, download, riapertura e chiusura; codec del file scaricato verificato |
| YouTube | Finestra, risposta completata/errore controllata e caricamento locale reale; nessun nuovo tentativo di aggiramento della rete |
| Microfono | Esito esplicito quando il browser non espone il riconoscimento vocale; nessun comando simulato eseguito in sua vece |

## Contenuto realmente verificato

I test di esportazione generano colori e forme noti. Ogni effetto deve cambiare i fotogrammi; camera a mano e zoom devono produrre immagini diverse nel tempo senza aggiungere angoli neri. Il fotogramma a metà dissolvenza deve contenere entrambi i colori con luminosità conservata. Le regolazioni devono cambiare i canali attesi; le dissolvenze devono attenuare realmente l’opacità.

La regressione conserva le prove precedenti di container MP4/MOV/AVI/MP3/WAV, tono e livello audio, mute/solo, sottotitoli, file mancanti, importazione, protocollo MCP e riconoscimento vocale locale con timestamp.

## Esiti e limiti

- `npm run lint`: **PASS**, verifica TypeScript.
- `npm test`: **PASS, 24/24**, test reali/di integrazione sui contenuti e sulle operazioni.
- `npm run test:whisper`: **PASS**, parlato noto e silenzio reali.
- `npm run test:e2e`: **PASS, 12/12** scenari Chromium, con numerose azioni e verifiche per ciascuno; il numero di scenari non è il numero di pulsanti.
- Build di produzione eseguita dal runner browser e `git diff --check`: **PASS**.
- Dopo la correzione finale che conserva l’audio separato durante la dissolvenza, ripetuti con esito positivo i 24 test, la prova Whisper e lo scenario browser Transitions.

Le prove sono eseguite su Linux con Chromium: non attestano l’esecuzione su Windows, la cattura di un microfono fisico o la connessione di un account esterno ChatGPT/Claude. Per il microfono è verificato il messaggio di capacità mancante; avvio, arresto e riconoscimento con un microfono fisico restano da provare nel browser dell’utente. Le anteprime sono ridotte e non costituiscono un confronto pixel per pixel con FFmpeg alla risoluzione finale. Questi limiti sono distinti dai pulsanti locali e dagli export verificati.
