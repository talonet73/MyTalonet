# Continuità dopo i tagli e video ricevuti da Claude/MCP — 30 ottobre 2026

## Fotogrammi neri dopo CUT / AI Cut

La riproduzione creava il decoder della clip successiva soltanto quando il cursore la raggiungeva. Durante il caricamento/seek il canvas poteva essere azzerato a nero. Inoltre la composizione FFmpeg non conservava l’ultimo fotogramma fino alla fine esatta della clip: giunzioni fuori dalla griglia dei 25 fps potevano lasciare un fotogramma nero. Su una sorgente rossa/blu, con cinque intervalli rimossi, il problema è stato riprodotto: **5 fotogrammi neri su 35**.

Correzioni:

- Orologio di riproduzione protetto da incrementi negativi al primo callback del browser, che potevano portare il cursore prima di zero e mostrare un istante vuoto.
- Riaggancio delle giunzioni con residui numerici inferiori al microsecondo. Gli spazi intenzionali rimangono intatti. Lo stesso riaggancio è usato per AI Cut e tagli manuali/MCP.
- Preparazione anticipata dei decoder delle prossime clip video/audio e seek all’offset della sorgente. I decoder inattivi vengono rimossi quando il gruppo di lavoro cresce, per non accumulare migliaia di elementi dopo un taglio lungo.
- Durante il passaggio al decoder successivo il player conserva il fotogramma già composto, finché il nuovo fotogramma non è pronto. Un vuoto reale fra clip continua a mostrare nero; un fotogramma nero presente nella sorgente non viene nascosto.
- FFmpeg conserva il fotogramma finale **solo entro l’intervallo della clip**. L’espressione di attivazione impedisce che rimanga congelato oltre il punto finale o sopra una pausa intenzionale.

La prova di esportazione ripetuta dopo la correzione produce **zero fotogrammi neri**. Rimane la regressione che controlla la fine dei livelli video e il rispetto della trasparenza.

## Nuovi video via MCP

Prima il servizio esponeva otto strumenti per leggere/modificare la timeline e aggiungere media già presenti nello stage. Non disponeva di un comando per ricevere un video generato altrove, né di un comando per esportare il montaggio tramite MCP.

Ora l’elenco comprende 13 strumenti. Quelli nuovi sono:

| Comando | Comportamento |
| --- | --- |
| `import_media` | Copia un file dal PC/server di TALEDIT, scarica un URL HTTPS pubblico, oppure riceve i byte Base64 di un file piccolo. Verifica il contenuto reale, poi aggiunge stage e timeline con audio collegato. |
| `begin_media_upload` | Inizia un trasferimento di file più grande, dichiarando nome e dimensione. |
| `upload_media_chunk` | Trasferisce i byte in blocchi fino a 1 MiB; controlla ordine e dimensione. |
| `finish_media_upload` | Verifica il file completo e lo importa nella timeline. Una ripetizione non crea doppioni. |
| `export_video` | Genera il montaggio reale con FFmpeg e, di default, importa il risultato nello stage e lo aggiunge alla timeline. `addToTimeline=false` produce soltanto il file esportato. |

In assenza di una posizione richiesta, l’inserimento avviene in fondo al montaggio. Le piste video/audio/immagine necessarie vengono create automaticamente. Il cursore raggiunge il nuovo media, la timeline lo rende visibile e il player prepara l’anteprima. L’importazione legge lo stato più recente al momento dell’inserimento, conservando le modifiche fatte durante il trasferimento. Gli stessi strumenti sono disponibili via Streamable HTTP e SSE.

### Come usarli con Claude

Dopo avere installato questa versione, **scollega e ricollega Claude** perché recuperi l’elenco aggiornato degli strumenti. Poi chiedi:

> Inserisci il video appena creato nella timeline di TALEDIT usando gli strumenti MCP di importazione.

Un video creato solo nella chat non viene trasferito dal semplice collegamento MCP. Claude deve inviare un file realmente accessibile o i suoi byte. Un percorso come `/mnt/...` nel sandbox della chat non è un percorso del PC dell’utente: per quel caso servono il trasferimento a blocchi oppure un link HTTPS scaricabile. Un link che richiede l’accesso alla chat può non essere scaricabile dal server; non viene dichiarato un successo se il file non è arrivato.

### Limiti e controlli

File fino a 500 MB, stessi formati dell’importazione normale; file piccoli Base64 fino a 2 MiB e blocchi fino a 1 MiB. Il contenuto viene verificato con ffprobe, non soltanto tramite l’estensione. File incompleti o danneggiati non vengono aggiunti alla timeline. Il comando resta soggetto a MCP ON/OFF e autenticazione configurata; il commit viene nuovamente controllato dopo il trasferimento.

Per gli URL si accettano HTTPS pubblici, senza credenziali nell’URL, con reindirizzamenti limitati. Gli indirizzi locali, privati, link-local e riservati sono esclusi e il DNS risolto viene vincolato alla connessione. La verifica HTTPS reale tentata in questo ambiente non ha raggiunto il download: DNS `EAI_AGAIN` per `raw.githubusercontent.com`. Sono verificati il controllo degli indirizzi e i percorsi reali di importazione locale/trasferimento; non viene dichiarato verificato un download HTTPS end-to-end in questo ambiente.

## Prove effettive

Esito finale: `npm run lint` **PASS**; `npm test` **108/108 PASS**, senza skip; suite Chromium di produzione **34/34 PASS**; controllo aggiuntivo di integrità del trasferimento e rifiuto URL locali via SDK HTTP/SSE **2/2 PASS**; `git diff --check` **PASS**. L’account personale Claude e il download HTTPS pubblico restano distinti dalle verifiche positive, come indicato sopra.

- Esportazione di una sequenza con molti tagli non allineati ai frame, analisi di tutti i fotogrammi, e regressione su fine livelli/trasparenza.
- Browser in riproduzione attraverso dieci tagli: campionamento reale del canvas e controllo che non si azzeri a nero durante il contenuto. Il controllo esclude il tratto successivo alla fine del montaggio, che è nero intenzionalmente, e verifica che le immagini continuino ad aggiornarsi.
- SDK MCP ufficiale, **HTTP e SSE**: importazione di un file video locale reale, audio collegato e piste create automaticamente; trasferimento in blocchi, rifiuto di file incompleti/offset errati, completamento senza doppioni, file Base64 reale, rifiuto di contenuto danneggiato e rispetto di OFF.
- `export_video` via MCP: MP4 reale e importazione automatica con audio collegato.
- Browser: invocazione MCP, nuovo asset nello stage e clip realmente visibili nella timeline, anche dopo un progetto già lungo 75 secondi.

Ambiente: Linux/Chromium. Non è disponibile una macchina Windows o l’account personale Claude dell’utente. Il video specifico già creato dall’utente non è stato fornito: le prove usano video reali di riferimento e il protocollo MCP effettivo, non una sessione simulata di Claude.
