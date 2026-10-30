# Sezioni VIDEO / AUDIO e mixer — 30 ottobre 2026

## Uso

In basso **VIDEO** (blu) mantiene il montaggio esistente. **AUDIO** (verde) mostra soltanto le piste audio e i relativi file nello stage, mantenendo le clip video e i collegamenti nel progetto. Il player resta montato: passare da una sezione all’altra non interrompe l’ascolto. Nella sezione AUDIO si possono aggiungere, duplicare, tagliare e spostare le piste/clip come nella timeline video.

Ogni pista audio ha una striscia nel mixer; a destra rimane il Master. Le strisce scorrono orizzontalmente e i controlli verticalmente. Le manopole funzionano trascinando su/giù, con le frecce della tastiera o tramite il numero sottostante; doppio clic ripristina il valore neutro.

Controlli per pista e Master:

- Volume −60…+12 dB, panorama −100…+100 e ampiezza stereo 0…200%.
- Compressione 0…100%, soglia −60…0 dB, rapporto 1…20:1, attacco 1…100 ms, rilascio 20…1000 ms.
- Ritardo 0…1000 ms, eco e riverbero 0…100%.
- Riduzione rumore 0…100% con espansione verso il basso: attenua il fondo debole nelle pause. Non è un modello AI e non separa il rumore sovrapposto a una voce.
- Passa alto 20…1000 Hz, passa basso 1000…20000 Hz, bassi/medi/alti −18…+18 dB.
- Solo/Mute delle piste; Mute Master, bypass FX e ripristino. Il Mute del player VIDEO rimane un controllo di ascolto; il Mute della striscia Master viene invece salvato ed esportato.
- Indicatore di picco reale in dB per ogni pista e Master, azzerato in pausa. Il Master segnala i picchi prima della protezione finale.

## Elaborazione

Ascolto: MediaElementSource → guadagno/fade della clip → bus della pista (filtri, equalizzazione, riduzione rumore, compressione, panorama/ampiezza, eco/riverbero, ritardo, volume) → stessa catena sul Master → protezione dei picchi → uscita. I valori delle manopole sono condivisi con i filtri FFmpeg dell’esportazione. Il compressore live usa AudioWorklet con rilevatore comune ai canali, senza recupero automatico del volume. La riduzione rumore usa un inviluppo, evitando distorsioni da taglio istantaneo dei singoli campioni. I file mono vengono portati a stereo per le regolazioni spaziali.

L’eco usa due ripetizioni (240/480 ms); il riverbero un insieme di otto riflessioni brevi. Non ci sono circuiti di feedback illimitati. La protezione finale e i filtri dei due motori hanno implementazioni diverse: non viene promessa identità campione per campione fra browser e FFmpeg. Le code vengono tagliate alla durata esportata del montaggio, senza allungare automaticamente il video.

L’esportazione somma prima le clip della stessa pista, poi applica i controlli al bus: la compressione risponde quindi al contenuto totale della pista. Il Master si applica alla somma dei bus. Volume/fade/velocità delle singole clip continuano a funzionare. Le forme d’onda rappresentano il file sorgente, non un nuovo file renderizzato a ogni regolazione.

Le impostazioni di pista sono in `Track.audio`, quelle Master in `audioMaster`. Sono conservate nei progetti TAL/JSON, nello stato MCP e nella cronologia Annulla/Ripristina. Duplicare una pista copia le impostazioni, ma le successive modifiche sono indipendenti. I vecchi progetti senza mixer ricevono impostazioni neutre. Non sono necessarie nuove dipendenze o modelli.

## Verifiche effettive

Esito finale: `npm run lint` **PASS**; `npm test` **77/77 PASS**, senza skip; `npm run test:e2e` **25/25 PASS**; build di produzione del runner browser **PASS**; `npm run test:whisper` **PASS** su parlato e silenzio; `node --check public/audio-gate.js` e `git diff --check` **PASS**.

- Test DSP FFmpeg su campioni PCM: volume, mute, bypass, isolamento dei canali col panorama, annullamento del segnale laterale in mono, ampiezza stereo, attenuazione dei picchi con compressore, passa alto/basso, boost delle tre bande EQ, rumore debole attenuato e segnale più forte conservato, ritardo/eco/riverbero ai tempi previsti, combinazione di tutte le regolazioni senza campioni non finiti.
- API di esportazione reale: due clip nello stesso bus, guadagni di pista e Master combinati, mute Master, bypass, compressore e rifiuto di parametri fuori intervallo.
- Browser: entrambe le sezioni e piste visibili corrette; tutte le 17 regolazioni salvate nello stato; drag/frecce/doppio clic delle manopole; Solo/Mute/Bypass/Ripristina; aggiunta e duplicazione; cronologia Master; salvataggio e riapertura; ritorno al video con clip conservate.
- Ascolto browser con file reale: segnale presente nei meter, riduzione misurata del volume, bypass e mute. Prova separata con il vero motore Web Audio e AudioWorklet: ampiezza stereo, compressore, volume, filtro e riduzione rumore su campioni noti. Nessuna sostituzione delle risposte DSP con simulazioni.

Le verifiche browser sono su Chromium/Linux; Windows non è disponibile nell’ambiente di sviluppo.
