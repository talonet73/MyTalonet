# Velocità, Screenshot e livelli — 29 ottobre 2026

## Implementazione

- Menu destro della clip → Velocità clip, scala intera −5…+5, percentuali visibili da 25% a 400%, ripristino 100% e annullamento della finestra senza cambiare il montaggio.
- I campioni video/audio vengono letti al tempo `offset + (tempo timeline − inizio clip) × velocità`. Cambiare velocità conserva l’intervallo sorgente e modifica la durata; la coppia audio/video collegata viene aggiornata insieme. Offset e tagli usano secondi della sorgente, con precisione al microsecondo per non arrotondare erroneamente i tagli rallentati.
- Il player imposta playbackRate e mantiene la tonalità; FFmpeg usa setpts e una catena atempo con fattori supportati. La velocità è inclusa nei progetti, nelle copie, nelle onde audio, nei fotogrammi singoli e nel mix trascritto da Whisper. BG Remover riceve l’intervallo sorgente completo della clip alla sua velocità.
- Screenshot produce un PNG reale. Il launcher Windows risolve Download da Windows Known Folder, con ripiego sul percorso utente standard. Il server salva lì il file se configurato e la UI mostra la conferma senza generare un secondo download. In caso di scrittura fallita usa un download browser con Blob PNG e attributo download. Nessuna modifica alle impostazioni/protezioni del browser.
- Duplicazione completa di piste e contenuto, con nuovi identificativi. Per video/audio collegato vengono duplicati anche le piste audio necessarie e i collegamenti. La duplicazione di una singola pista audio produce audio indipendente. Cronologia e salvataggio conservano il risultato.
- Rimossi i limiti di 100 piste e 2200 clip dell’editor e il limite di 200 clip multimediali del renderer. Restano limiti di durata, testo, payload, tempo e risorse: la funzionalità non promette memoria o capacità di elaborazione infinite.
- Barre timeline visibili, scorrimento anche dalla colonna dei nomi, intestazioni e corsie sincronizzate. Ctrl+rotella cambia entrambi gli assi dello zoom senza cambiare lo zoom della pagina e mantiene il punto sotto il mouse. I limiti dello zoom sono 5–480 pixel/secondo e 25–400% in altezza, con un’altezza minima leggibile della pista.

## Verifiche

Esito finale: `npm run lint` superato; `npm test` con 62 test superati; `npm run test:e2e` con 22 prove browser superate; `npm run test:whisper` con trascrizione reale del parlato e controllo del silenzio superati. Controllo sintattico del launcher con `node --check scripts/start-windows.cjs` superato.

- Undici esportazioni reali, una per livello: 25%, 40%, 50%, 65%, 80%, 100%, 125%, 150%, 200%, 300%, 400%. Controllati durata, fotogrammi rossi/blu ai tempi sorgente attesi, ampiezza audio e tonalità di circa 440 Hz.
- Cambio velocità collegato seguito da taglio: il taglio a 0,2 s al 400% produce offset 0,8 s sia per il video sia per l’audio. La prova browser al 25% verifica che un taglio di mezzo secondo produca offset sorgente 0,125 s.
- Duplicazione di tutti i tipi di pista, nuovi ID, reciprocità dei collegamenti, conservazione dei parametri e creazione di oltre 100 piste.
- API reale con progetto da 252 piste e 252 clip, sincronizzazione e rendering del contenuto attivo, superando i precedenti limiti.
- Browser con 160 piste caricate e la pista TESTO aggiunta automaticamente: scorrimento, allineamento, larghezza/altezza dei mattoncini dopo Ctrl+rotella e devicePixelRatio della pagina invariato.
- Screenshot salvato dall’API in una cartella temporanea Download: signature PNG e byte identici al file scaricabile. Provata anche una destinazione non scrivibile, con fallback funzionante. La prova UI del flag di salvataggio locale controlla quel solo flag; la scrittura filesystem viene verificata dal test API separato.
- Rimangono le regressioni di export, sottotitoli, Waveform, MCP, Whisper e rimozione sfondo.

Le verifiche sono su Linux/Chromium. Il ramo Windows che legge la cartella Known Folder è predisposto e controllato sintatticamente, ma non è eseguito su una macchina Windows in questo ambiente. Per l’avvio manuale/online il download segue le impostazioni del browser, inclusa l’eventuale domanda sulla destinazione.
