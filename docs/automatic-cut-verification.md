# AI Cut automatico e pulsanti grafici — 30 ottobre 2026

## Correzione del flusso

La precedente finestra si fermava alla lista degli intervalli proposti e richiedeva un secondo comando per applicarli. Inoltre la scansione delle pause dipendeva dalla disponibilità di Whisper e dal volume/mute del mix, e usava il limite di durata dell’esportazione.

Ora **AI Cut → Scansiona e taglia automaticamente** esegue scansione completa e applicazione dei tagli con un solo avvio. Non ci sono una lista da spuntare o una conferma successiva. Il margine regolabile **0,2–1 secondo** indica la **durata totale di pausa conservata**: una pausa di 3 secondi con margine 1 viene accorciata di 2 secondi. Il valore iniziale è **0,3 secondi**. Il margine viene distribuito ai due lati del taglio. Il rilevatore considera anche pause di 0,1 secondi, per poter individuare quelle di poco superiori al nuovo minimo. Le pause già entro il valore scelto rimangono intatte.

I tagli si applicano a tutte le piste per mantenere il sincronismo; gli offset sorgente e i collegamenti audio/video vengono conservati. I file originali rimangono invariati e **Indietro** annulla l’operazione. Una conferma finale indica quanti secondi sono stati eliminati. Se il progetto cambia durante la scansione, i risultati non vengono applicati a dati ormai differenti: l’interfaccia invita a riavviare la scansione.

## Scansione completa dell’audio

- Vengono lette tutte le piste audio, anche quelle in Mute/Solo, con i livelli del file sorgente. Volume del player, volume delle clip, fade e mixer non alterano il rilevamento.
- Il taglio delle pause usa FFmpeg e funziona senza Whisper. Si misura il picco di ogni blocco e si normalizza soltanto l’audio temporaneo di analisi, prima del rilevamento sotto −40 dB: il montaggio conserva i livelli originali.
- La timeline viene letta in blocchi da massimo dieci minuti, fino a 24 ore complessive, con file temporanei eliminati dopo ogni blocco. Si superano quindi i dieci minuti del normale export senza produrre un enorme WAV unico. Anche i blocchi finali inferiori a 0,04 secondi sono gestiti.
- I silenzi che attraversano il confine fra due blocchi vengono riuniti prima di calcolare i tagli, evitando margini aggiunti artificialmente al minuto dieci.
- Musica continua e rumore udibile possono impedire che un intervallo venga classificato come pausa. Non è una classificazione visiva della scena.

**Elimina anche ehm/uhm** e **Elimina anche ciak e ripetizioni** sono opzioni preliminari, disattivate di default. Se abilitate, usano Whisper e applicano direttamente anche quei tagli, senza altre conferme. La lingua si sceglie prima dell’avvio. Il riconoscimento può sbagliare; Indietro resta disponibile. Se il riconoscimento vocale non è pronto, il taglio delle pause prosegue e l’esito avvisa che esitazioni/ciak potrebbero essere rimasti.

## Pulsanti grafici

Effects, Transitions, Captions, Adjustment, BG Remover, AI Cut e Pen Mask hanno ciascuno un’icona distinta sopra la propria etichetta, nello stesso stile degli altri comandi. I pulsanti mantengono nomi accessibili e suggerimenti. Aggiunte icone anche ai controlli ChatGPT e connessione MCP. La barra mantiene lo scorrimento orizzontale sugli schermi stretti.

## Verifiche

Esito: `npm run lint` **PASS**; suite `npm test` **102/102 PASS**, senza skip e con riconoscimento vocale reale; suite browser di produzione **32/32 PASS**. Dopo la gestione del blocco finale da 0,02 s, i due test API automatici sono stati ripetuti: **2/2 PASS**. `git diff --check` **PASS**.

- Calcolo dei margini 0,2, 0,3, 0,5 e 1 secondo; pause brevi conservate; anche audio interamente silenzioso produce una riduzione automatica senza dipendere da parole riconosciute.
- API reale senza Python/Whisper disponibile: scansione completa delle piste nonostante Mute, volume clip −60 dB e Master muto; mantenimento del margine richiesto; fallback se viene richiesta un’opzione vocale senza modello.
- API con clip audio a 601 secondi e timeline oltre dieci minuti; prova aggiuntiva di blocco finale da 0,02 secondi. Nessun troncamento al limite del normale export.
- Browser con analisi reale: un solo clic avvia e applica i tagli, senza pulsante di conferma; coppie video/audio sincronizzate; Indietro ripristina il montaggio originale.
- Browser: icona presente per ogni comando della barra e sette icone distinte per gli strumenti.

Ambiente di verifica Linux/Chromium; non è disponibile un PC Windows per una prova diretta. Nessuna nuova dipendenza o modello richiesto per questa correzione.

Aggiornamento del margine: intervallo 0,2–1 s e valore iniziale 0,3 s. Suite funzionale completa ripetuta: **102/102 PASS**. Verifica browser mirata al nuovo intervallo, valore iniziale, taglio automatico e annullamento: **1/1 PASS**. Su un file audio reale, una pausa di 0,28 s viene ridotta a 0,2 s e viene conservata scegliendo 0,3 s. Il minimo del rilevatore è stato ridotto da 0,25 a 0,1 s.
