# TALEDIT

Editor video locale con React, Express, FFmpeg e strumenti MCP per Claude e ChatGPT.

## Installer unico per Windows

[Scarica **TALEDIT-Setup.exe**](https://github.com/talonet73/MyTalonet/releases/download/taledit-windows-336592184fc9/TALEDIT-Setup.exe) per Windows 10/11 a 64 bit.
Include Python, Node.js, strumenti video e modelli gratuiti per sottotitoli e rimozione
sfondo: il primo avvio usa i componenti già inclusi nel pacchetto.

Salva il progetto e chiudi TALEDIT e la vecchia finestra nera. Apri il file scaricato,
poi premi **Avanti → Installa → Fine**. Le volte successive apri **TALEDIT** dal desktop.
Per fermare anche il programma in background: **Start → TALEDIT → Chiudi TALEDIT**.

Installer costruito e provato su Windows: installazione, runtime privati, trascrizione
reale, rimozione sfondo, avvii ripetuti, importazione, esportazione, screenshot,
interfaccia browser e disinstallazione con conservazione dei dati. Superati anche
111 test dell'app e 34 prove browser in produzione su Linux.
[Istruzioni e recupero dei progetti precedenti](docs/windows-installer.md) ·
[Report delle verifiche e limiti](docs/windows-installer-verification.md).

## Avvio dai sorgenti

In alternativa all’installer, su Windows puoi usare la cartella dei sorgenti con i file `1-PREPARA-TALEDIT.cmd` e `2-AVVIA-TALEDIT.cmd`: [istruzioni](APRI-SU-WINDOWS.md). Il test Windows dell’installer usa componenti privati già inclusi; non esegue la preparazione globale tramite questi due script.

Requisiti: Node.js >=22.12, Python 3.12, FFmpeg e ffprobe nel PATH.

```bash
npm ci
npm run dev
```

Il server ascolta sulla porta 3000 (`PORT` e `HOST` configurabili). Il frontend e le API usano lo stesso server. `npm run preview` serve solo gli asset Vite: **non** è un server dell’editor completo.

Per produzione:

```bash
npm run build
NODE_ENV=production npm start
```

Importa i media con **Importa** nella barra superiore o **Import** nello stage. I file sono verificati con ffprobe e salvati con nomi univoci in `media_downloads/` (oppure `MEDIA_DIR`). Doppio clic sul media per aggiungerlo alla timeline al cursore. I video con audio creano una coppia video/audio collegata. Taglio, spostamento, copia e duplicazione mantengono la coppia sincronizzata. Ogni tipo entra soltanto nella propria traccia: IMMAGINI, VIDEO, AUDIO, EFFECTS e TESTO. La pista arancione TESTO è presente di default; puoi aggiungerne altre da Nuova Pista. Aprendo vecchi progetti, i contenuti fuori posto vengono spostati nella traccia corretta, creandola se manca.

I progetti `.tal` conservano timeline, proporzioni e riferimenti ai file sul server; non incorporano i media. Conserva la cartella media insieme ai progetti. Usa **Salva** prima di chiudere: la timeline condivisa MCP è in memoria e non sopravvive al riavvio del server. Le vecchie URL `blob:` scadute richiedono la reimportazione del file originale.

## Strumenti di montaggio

I cinque pulsanti aprono pannelli reali, richiudibili con la X o cliccando nuovamente il pulsante. Transitions, Adjustment e BG Remover operano sulla clip selezionata; Effects si può aprire anche senza selezione.

- **Effects**: nove anteprime della scena campione, calcolate con lo stesso motore del player: Camera a mano, Zoom in, Zoom out, Luce morbida, Vintage, Cinema, Bianco e nero, Sfocatura e Glitch. Trascina l’anteprima soltanto sulla traccia EFFECTS; il clic la inserisce al cursore. Ogni mattoncino ha maniglie di durata, taglio, copia/incolla e cronologia. Cliccalo per aprire i controlli **Intensità** e **Velocità**, entrambi da 0 a 10, predefiniti a 5. Intensità 0 disattiva l’effetto; Velocità 0 ferma il movimento o la pulsazione. Per gli effetti di colore/sfocatura la velocità regola il ritmo di una lieve pulsazione. Gli effetti agiscono sull’immagine composta solo nel proprio intervallo; più mattoncini sovrapposti si combinano.
- **Transitions**: dissolvenza in entrata/uscita, con durata scelta, oppure dissolvenza incrociata. Per quest’ultima accosta due clip sulla stessa traccia e seleziona la seconda: le clip vengono sovrapposte e quelle successive della stessa traccia, con l’audio collegato, vengono anticipate. L’audio viene sfumato e il video entrante si sovrappone a quello uscente senza un passaggio intermedio al nero.
- **Captions**: premi **Trascrivi audio**, correggi i testi e poi **GENERATE**. Quest’ultimo inserisce o aggiorna mattoncini arancioni nella pista TESTO ai tempi del parlato, senza ripetere la trascrizione e perdere le correzioni. I testi della timeline si possono spostare, tagliare, copiare e modificare da DETAILS. La traduzione disponibile è verso l’inglese. Eliminando tutte le righe puoi premere GENERATE per rimuovere i precedenti testi generati; le copie manuali rimangono indipendenti.
- **Adjustment**: luminosità, contrasto, saturazione, esposizione, temperatura, tinta e nitidezza della clip selezionata. **Ripristina regolazioni** riporta i valori iniziali.
- **BG Remover**: rimuove lo sfondo della clip video o immagine selezionata, conserva un soggetto principale e genera un nuovo file nello stage. La clip viene sostituita se il contenuto selezionato non è cambiato nel frattempo; **Annulla** ripristina la precedente.

Effetti, regolazioni e dissolvenze sono conservati nei progetti `.tal` e applicati sia all’anteprima sia all’esportazione. Le regolazioni operano sulla singola clip selezionata; i nuovi effetti sono mattoncini sulla propria traccia. Gli effetti incorporati nelle clip dei progetti precedenti rimangono supportati. L’anteprima usa una risoluzione ridotta, l’export quella scelta.

I comandi non disponibili (ad esempio Cestino senza selezione o Incolla prima di Copia) sono disabilitati. I menu File/Edit e i comandi principali usano le stesse operazioni effettive. Annulla/Ripristina conserva clip e tracce: eliminare una traccia e poi annullare non lascia clip senza traccia. Il taglio da sinistra aggiorna anche il punto della sorgente e l’audio collegato.

## Export

La finestra separa **Video**, **Audio** e **Immagine**:

| Tipo | Formati disponibili |
| --- | --- |
| Video | MP4, MOV, AVI, MKV, WEBM, M4V |
| Audio | MP3, WAV, M4A, AAC, FLAC, OGG, OPUS, AIFF |
| Immagine | PNG, JPG, WEBP, BMP, TIFF, GIF (fotogramma singolo) |

Video H.264/AAC, tranne WebM VP9/Opus e AVI H.264/PCM. WAV/AVI usano PCM 16-bit stereo 48 kHz; AIFF PCM big endian. FLAC è senza perdita. M4A e AAC usano AAC; OGG usa Vorbis; OPUS usa Opus.

**Immagine** è abilitata quando la pista IMMAGINI contiene almeno una clip. Il tempo scelto deve mostrare un’immagine attiva: vengono composte le immagini, gli effetti e i testi a quel tempo; le tracce video/audio sono escluse. I formati immagine salvano un solo fotogramma. Il tasto **Screenshot**, con macchina fotografica, salva in PNG il fotogramma video al cursore con il resto del montaggio visibile, a 1080p e nelle proporzioni del progetto. Con l’avvio guidato Windows viene scritto automaticamente nella cartella Download dell’utente, anche quando reindirizzata; compare una conferma. Nell’avvio manuale o online usa il download del browser, che rispetta la cartella e le eventuali richieste di conferma configurate nel browser. È disabilitato se al cursore non c’è un video attivo.

Il server compone i media reali rispettando offset, tempi, opacità, volume, mute/solo, immagini, effetti e sottotitoli. L’audio dei video separati in due clip viene mixato una sola volta. Clip video prive di audio non fanno fallire l’export. I media mancanti causano un errore visibile: nessun falso successo e nessun fallback con estensione ingannevole. Proporzioni 16:9, 9:16, 1:1 e 4:3; risoluzioni 720p, 1080p, 4K. Limiti dichiarati: 600 secondi, 2000 testi, due export simultanei, caricamenti da 500 MB.

La dimensione indicata è una stima basata sul bitrate, non una promessa di dimensione esatta. L’anteprima degli effetti è indicativa; FFmpeg è il render definitivo. La percentuale UI indica le fasi di lavoro, non un conteggio dei frame FFmpeg.

## Importazione YouTube

Il pulsante rosso con l’icona YouTube apre la finestra per incollare un link video. `yt-dlp` seleziona i migliori flussi disponibili (`bv*+ba/b`) e FFmpeg li unisce **senza ricompressione**. Si conserva la qualità disponibile su YouTube; il file originale caricato dall’autore non è accessibile tramite questa funzione. Non viene forzato un codec inferiore per il browser: alcuni contenitori/codec possono richiedere un player compatibile, pur restando esportabili con FFmpeg.

Il backend usa il `yt-dlp` incluso nel repository tramite Python, oppure l’eseguibile indicato da `YT_DLP_PATH`. Node è abilitato come runtime JavaScript per l’estrattore. Il download completato è aggiunto automaticamente allo stage; nessuna clip viene aggiunta alla timeline prima della scelta dell’utente. Gli errori di rete e le verifiche anti-bot sono mostrati esplicitamente. La stessa finestra offre **Carica video locale**: carica il file dal dispositivo, lo verifica e lo aggiunge allo stage senza usare YouTube o servizi alternativi. I rifiuti 403 del tunnel proxy sono distinti dai rifiuti HTTP del server remoto. Playlist, destinazioni arbitrarie e URL con credenziali sono rifiutati.

Domini di rete: `youtube.com`, `*.youtube.com`, `youtu.be`, `*.googlevideo.com`, `*.ytimg.com`, `youtubei.googleapis.com`. Anche con la rete autorizzata, YouTube può richiedere autenticazione o rifiutare il download. Non si aggirano restrizioni di accesso o DRM.

## Sottotitoli locali gratuiti

Motore scelto: [SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper), modello Whisper **small multilingue**, CPU INT8, quattro thread. Software e modello sono gratuiti, con licenza MIT; non serve una chiave API. Il calcolo usa le risorse della macchina.

```bash
bash scripts/setup-whisper.sh
npm run test:whisper
```

Lo script crea `/workspace/.venv-whisper`, installa le versioni bloccate in `scripts/requirements-whisper.lock` (faster-whisper 1.2.1, **PyAV 16.1.0**, CTranslate2 4.8.3) e scarica i pesi dal repository ufficiale `Systran/faster-whisper-small` su Hugging Face in `/workspace/.cache/taledit/whisper-small`. Per installazioni fuori dal cloud imposta `WHISPER_VENV`, `WHISPER_PYTHON` e `WHISPER_MODEL_DIR` su percorsi locali scrivibili. Il modello occupa circa 500 MB. La cache Hugging Face/Xet è impostata sotto `/workspace/.cache/huggingface`, scrivibile in questo ambiente. PyAV 19.0.2 è incompatibile con l’argomento `metadata_errors` usato dal decoder di faster-whisper 1.2.1: non aggiornare questo pacchetto senza ripetere i test reali. Dopo l’installazione l’inferenza è offline; nessun download implicito avviene durante la trascrizione.

`GET /api/captions/status` indica se il modello è disponibile. **Trascrivi audio** trascrive il mix effettivo della timeline, inclusi offset e mute/solo. La lingua selezionata è quella parlata. L’opzione di traduzione produce l’inglese, destinazione supportata da Whisper; non promette traduzioni verso altre lingue. I segmenti sono modificabili ed esportabili. Il filtro VAD, con margine vocale di 100 ms, riduce gli anticipi dovuti al silenzio iniziale e ha superato il test senza sottotitoli inventati sul silenzio. I timestamp dei segmenti sono stime del modello, non allineamento parola per parola. L’accuratezza va verificata sui propri contenuti.

Il primo download richiede `huggingface.co`, `*.huggingface.co`, `*.hf.co`, `*.xethub.hf.co`, oltre ai domini PyPI. Un modello mancante genera un errore esplicito, senza sottotitoli predefiniti.

Confronto e fonti: [docs/asr-comparison.md](docs/asr-comparison.md).

## Claude e ChatGPT tramite MCP

- Streamable HTTP: `/api/mcp` (ChatGPT e client moderni).
- SSE legacy: `/api/mcp/sse` + `/api/mcp/messages` (Claude Desktop).
- Otto strumenti effettivi: lettura timeline, taglio collegato, opacità, volume, dissolvenza, cursore, eliminazione e inserimento media dallo stage.

I tool operano sulla timeline condivisa, sincronizzata con l’editor via SSE e revisioni. Errori e tool sconosciuti producono risposte `isError`. Il toggle MCP nell’editor abilita/disabilita davvero le chiamate. **ON non certifica una connessione esterna**.

Claude Desktop può usare `npx -y mcp-remote <indirizzo-server>/api/mcp/sse`; la configurazione è copiabile dalla finestra MCP. In ChatGPT configura un’app MCP in modalità sviluppatore, se disponibile per il tuo account, con l’URL HTTPS pubblico del server seguito da `/api/mcp`. Il cloud ChatGPT non raggiunge localhost. La configurazione dell’account ChatGPT e la pubblicazione di un endpoint raggiungibile sono passaggi esterni all’app.

Per uso pubblico proteggi **l’intera app** con un gateway di autenticazione. `MCP_AUTH_TOKEN` abilita anche l’autenticazione Bearer sugli endpoint MCP; usa un client che la supporti o un gateway OAuth compatibile con ChatGPT. Non inserire token nei file di progetto o nel frontend. L’installazione locale non richiede token. La console prompt interna è un interprete locale di comandi, non una chiamata alle API di Claude/ChatGPT.

## Verifica

```bash
npm run lint
npm run build
npm test
npm run test:e2e
npm run test:whisper
```

`npm test` include una trascrizione reale e la segmentazione dello sfondo via API: richiede entrambi i modelli installati (`scripts/setup-whisper.sh` e `scripts/setup-bg.sh`) e fallisce se mancanti. Verifica taglio della sorgente a 2 secondi, inserimento a 3 secondi, tracce mute e timestamp ordinati. I test API generano media di riferimento e analizzano gli output con FFmpeg/ffprobe: fotogrammi colorati, frequenza e livello audio, durate, offset, sovrapposizioni, mute/solo, silenzio, effetti, contenitori e errori. I due trasporti MCP sono provati con l’SDK ufficiale. I test browser usano Chromium di sistema (`CHROMIUM_PATH` configurabile), importano file reali e verificano l’export scaricato. La prova UI YouTube usa risposte controllate ed è distinta da un download reale. `test:whisper` usa parlato noto e silenzio: fallisce se il modello manca, senza skip o trascrizioni simulate.

`tests/fixtures/jfk.wav` proviene dal repository ufficiale whisper.cpp; fonte e hash sono in `tests/fixtures/README.md`.

Risultati delle verifiche e diagnosi dei domini: [docs/verification.md](docs/verification.md).

Controllo della barra e matrice dei pulsanti verificati: [docs/toolbar-verification.md](docs/toolbar-verification.md).

## Rimozione sfondo gratuita

[rembg](https://github.com/danielgatis/rembg), licenza MIT, con modello U2NetP e CPU. Non è un servizio GitHub ospitato: è software gratuito eseguito localmente. Il download ufficiale del modello pesa circa 4,6 MB e mantiene il controllo di checksum del progetto. I file dell’utente non vengono inviati a servizi di segmentazione. Non sono usati modelli predefiniti con licenze commerciali diverse.

Su Linux, prepara una volta con `bash scripts/setup-bg.sh`; su Windows `2-AVVIA-TALEDIT.cmd` prepara automaticamente un ambiente Python separato da Whisper. Un errore nella preparazione BG non impedisce l’avvio del resto dell’editor: il pannello indica che il modello non è pronto. Configurazioni locali: `BG_PYTHON` e `BG_MODEL_DIR`. Dipendenze bloccate in `scripts/requirements-bg.lock`; non modificano PyAV/Whisper.

Il modello stima la maschera e conserva la componente rilevante vicina al centro; sui video usa anche la posizione precedente. Non identifica semanticamente una persona specifica e non garantisce bordi perfetti su capelli, trasparenze, soggetti piccoli o movimenti difficili. Le immagini diventano PNG RGBA; i video WebM VP9 con alpha a 25 fps, audio Opus e dimensioni originali (eventuale padding di un pixel per dimensioni pari). L’export MP4 compone la trasparenza sul resto del montaggio. Si elabora solo l’intervallo selezionato: l’audio collegato mantiene la sorgente originale e il suo offset anche nei tagli successivi. Puoi annullare il lavoro dal pannello; chiuderlo lascia proseguire l’elaborazione.

Limiti: un lavoro BG per volta, massimo 10 minuti per clip, 33 megapixel per fotogramma e 30 minuti di elaborazione. È un’elaborazione offline su CPU, non un effetto in tempo reale. Il primo download richiede PyPI, `github.com` e `release-assets.githubusercontent.com`.

## Finestre e dimensioni della timeline

Tutte le finestre dell’app si spostano trascinando la barra del titolo, senza interferire con i pulsanti e i campi. Il player adatta il fotogramma completo alla larghezza e all’altezza disponibili, comprese le proporzioni verticali e lo schermo intero. Il divisore orizzontale cambia lo spazio della timeline e l’altezza dei mattoncini. **Ctrl + rotella** ingrandisce/riduce insieme larghezza e altezza dei mattoncini, mantenendo il punto sotto il mouse. La maniglietta sopra il nome di ogni pista ne cambia singolarmente l’altezza; nome, corsia e clip restano allineati. Le altezze sono salvate nel progetto.

Le clip AUDIO mostrano onde calcolate dai campioni del file, rispettando offset e durata. Il volume è indicato dal controllo dedicato; l’onda viene adattata all’altezza per renderla leggibile. Se la sorgente non contiene audio o non è disponibile, viene mostrato un esito esplicito senza onde inventate.

Verifiche aggiuntive di testo, finestre, ridimensionamento, formati e Screenshot: [docs/timeline-export-verification.md](docs/timeline-export-verification.md).

## Velocità dei mattoncini e duplicazione delle piste

Tasto destro sul mattoncino → **Velocità clip…**. Scegli il livello da −5 a +5 e premi **Applica velocità**. Il valore 0 è la velocità originale. I numeri negativi rallentano; non sono riproduzione al contrario.

| Livello | −5 | −4 | −3 | −2 | −1 | 0 | +1 | +2 | +3 | +4 | +5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Velocità | 25% | 40% | 50% | 65% | 80% | 100% | 125% | 150% | 200% | 300% | 400% |

La durata della clip cambia conservando l’intervallo della sorgente; l’audio collegato segue la modifica e mantiene la tonalità. Anche tagli, offset, onde, Screenshot, sottotitoli Whisper ed esportazioni leggono la velocità salvata. Per immagini e testi cambia il tempo di permanenza; per effetti anche il tempo dell’animazione. Il controllo **Velocità** 0–10 degli effetti rimane distinto dal ritmo di riproduzione della clip. Altre piste e clip successive conservano le proprie posizioni: non viene applicato uno spostamento automatico dell’intero montaggio.

Il pulsante con due fogli accanto al nome della pista la duplica con tutti i mattoncini. Duplicando una pista video vengono creati anche i duplicati dell’audio collegato su nuove piste audio; duplicare solo una pista audio produce copie indipendenti. Immagini, effetti e testi conservano le proprie impostazioni. Annulla/Ripristina copre l’intera operazione.

Sono stati rimossi i precedenti limiti numerici di piste e clip multimediali dell’editor. Le barre della timeline permettono scorrimento verticale e orizzontale; la rotella funziona anche sopra i nomi delle piste. La capacità effettiva dipende da RAM, CPU e dimensione del progetto: non equivale a risorse infinite. Restano i limiti di 10 minuti di esportazione, 2000 testi, due rendering simultanei e richieste JSON da 5 MB. Le piste vuote e gli effetti fuori dall’intervallo esportato non generano ingressi FFmpeg inutili.

Verifiche di questo intervento: [docs/speed-layers-verification.md](docs/speed-layers-verification.md).

## Mixer audio

Le schede in basso **VIDEO** (blu) e **AUDIO** (verde) cambiano sezione mantenendo lo stesso progetto. AUDIO mostra soltanto piste e file audio; puoi importare un file, aggiungere una pista o duplicare quelle esistenti. L’audio separato dai video è già disponibile nelle relative piste.

Ogni pista ha manopole per **volume, panorama, ampiezza stereo, compressione con soglia/rapporto/attacco/rilascio, ritardo, eco, riverbero, riduzione rumore, filtri passa alto/basso ed equalizzazione bassi/medi/alti**. La striscia **MASTER** regola il mix completo. I meter mostrano livelli reali durante l’ascolto. Solo, Mute, bypass FX e ripristino permettono di confrontare le modifiche.

Trascina una manopola su/giù, usa le frecce o modifica il numero sottostante. Il doppio clic torna al valore neutro. Le regolazioni vengono salvate nel progetto, conservate con Annulla/Ripristina e applicate all’esportazione video e audio. Il Mute Master viene esportato; il Mute del player VIDEO agisce solo sull’ascolto. La riduzione rumore attenua il fondo nelle pause tramite un espansore; non è una separazione AI della voce.

Architettura, intervalli dei controlli e verifiche: [docs/audio-mixer-verification.md](docs/audio-mixer-verification.md).

## COLOR e scopes

La scheda **COLOR**, rossa dopo VIDEO e AUDIO, offre due monitor **Originale / Corretto**. Seleziona una clip video o immagine dalla timeline o dal menu in alto. In **Ruote** trovi Lift/Gamma/Gain/Offset con master e canali RGB; in **Primarie** esposizione, contrasto/pivot, temperatura/tinta, saturazione/vibrance, tonalità, ombre/alte luci, neri/bianchi e nitidezza. **Curve** permette di modificare Master RGB e i tre canali, trascinando sette nodi o scrivendo i valori. Bypass e Reset agiscono sul grade della clip, lasciando gli altri effetti del progetto.

Waveform Y, parade RGB, istogramma e vectorscope misurano il fotogramma scelto fra Originale e Corretto. Le regolazioni COLOR vengono conservate nel progetto e applicate a video, immagini e Screenshot esportati. Il flusso è SDR Rec.709 a intervallo completo; dettagli e risultati in [docs/color-verification.md](docs/color-verification.md).

## Montaggio intelligente, sottotitoli dinamici e maschere

**AI Cut** esegue scansione e tagli con un solo pulsante: scegli la **pausa da conservare, 0,2–1 s**, e premi **Scansiona e taglia automaticamente**. Il valore iniziale è **0,3 s**; **0,2 s** dà un ritmo più serrato. Una pausa di 3 s con margine 0,3 s viene accorciata di 2,7 s. Non ci sono conferme successive. Il taglio delle pause funziona senza Whisper e analizza tutte le piste audio indipendentemente da Mute e volume di ascolto, anche oltre i dieci minuti del normale export. I tagli agiscono su tutte le piste mantenendo sincronismo e collegamenti; **Indietro** ripristina l’operazione. I file originali restano invariati. Puoi abilitare prima dell’avvio anche esitazioni e ciak/ripetizioni riconosciuti: usano Whisper, richiedono più tempo e possono essere interpretati male. Dettagli e verifiche: [docs/automatic-cut-verification.md](docs/automatic-cut-verification.md).

In **Captions**, una nuova trascrizione include i tempi delle singole parole. **Parola evidenziata ottanio** genera frasi fino a cinque parole e sposta il fondo colorato sulla parola pronunciata, anche nell’esportazione. Una correzione che cambia il numero delle parole usa lo stile classico, evitando tempi inventati.

**Pen Mask** permette di disegnare tracciati Bézier, spostare nodi e maniglie, invertire e sfumare la maschera. Premi **Full** nel player per lavorare a tutto schermo mantenendo la penna. Anche le finestre degli strumenti già aperti, come Adjustment, rimangono disponibili a tutto schermo. Le maschere vengono salvate nel progetto ed esportate con la trasparenza corretta.

Ricerca GitHub, licenze, scelte, limiti e verifiche: [docs/github-ai-research.md](docs/github-ai-research.md). Non servono nuove dipendenze o ulteriori modelli rispetto all’installazione precedente.

## Video generati da Claude e continuità dei tagli

Dopo l’aggiornamento ricollega Claude e chiedigli **«Inserisci il video appena creato nella timeline di TALEDIT usando MCP»**. Il nuovo strumento `import_media` riceve file dal PC di TALEDIT, URL HTTPS scaricabili o byte del file; per file grandi sono disponibili i comandi di trasferimento a blocchi. L’importazione inserisce automaticamente video e audio collegato, crea le piste necessarie e porta il cursore sul nuovo media. `export_video` genera il montaggio reale e può inserirne automaticamente il risultato nella timeline. Il solo collegamento MCP non trasferisce un allegato rimasto nella chat o un percorso del sandbox remoto.

Le giunzioni dei tagli vengono riagganciate e i decoder successivi preparati in anticipo. Player ed export evitano i fotogrammi neri introdotti dal cambio clip, conservando gli spazi intenzionali del montaggio. Dettagli e verifiche: [docs/cut-continuity-mcp-verification.md](docs/cut-continuity-mcp-verification.md).
