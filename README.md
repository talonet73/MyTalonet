# TALEDIT

Editor video locale con React, Express, FFmpeg e strumenti MCP per Claude e ChatGPT.

## Avvio

Su Windows: [istruzioni con doppio clic](APRI-SU-WINDOWS.md), con i file `1-PREPARA-TALEDIT.cmd` e `2-AVVIA-TALEDIT.cmd`. La procedura Windows e predisposta ma non e stata eseguita su una macchina Windows; le prove browser descritte sotto sono state eseguite nell’ambiente Linux.

Requisiti: Node.js >=22.12, Python 3, FFmpeg e ffprobe nel PATH.

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

Importa i media con **Importa** nella barra superiore o **Import** nello stage. I file sono verificati con ffprobe e salvati con nomi univoci in `media_downloads/` (oppure `MEDIA_DIR`). Doppio clic sul media per aggiungerlo alla timeline al cursore. I video con audio creano una coppia video/audio collegata. Taglio, spostamento, copia e duplicazione mantengono la coppia sincronizzata. Le immagini sono accettate anche sulle tracce audio, come nell’interfaccia originale.

I progetti `.tal` conservano timeline, proporzioni e riferimenti ai file sul server; non incorporano i media. Conserva la cartella media insieme ai progetti. Usa **Salva** prima di chiudere: la timeline condivisa MCP è in memoria e non sopravvive al riavvio del server. Le vecchie URL `blob:` scadute richiedono la reimportazione del file originale.

## Export

MP4/MOV: H.264 + AAC. AVI: H.264 + PCM 16-bit, per evitare alterazioni dell’audio MP3 nel contenitore AVI. MP3 e WAV contengono audio realmente codificato nel formato richiesto. WAV/AVI usano PCM stereo 48 kHz.

Il server compone i media reali rispettando offset, tempi, opacità, volume, mute/solo, immagini, effetti e sottotitoli. L’audio dei video separati in due clip viene mixato una sola volta. Clip video prive di audio non fanno fallire l’export. I media mancanti causano un errore visibile: nessun falso successo e nessun fallback con estensione ingannevole. Proporzioni 16:9, 9:16, 1:1 e 4:3; risoluzioni 720p, 1080p, 4K. Limiti dichiarati: 600 secondi, 200 clip, due export simultanei, caricamenti da 500 MB.

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

`GET /api/captions/status` indica se il modello è disponibile. **GENERATE** trascrive il mix effettivo della timeline, inclusi offset e mute/solo. La lingua selezionata è quella parlata. L’opzione di traduzione produce l’inglese, destinazione supportata da Whisper; non promette traduzioni verso altre lingue. I segmenti sono modificabili ed esportabili. Il filtro VAD, con margine vocale di 100 ms, riduce gli anticipi dovuti al silenzio iniziale e ha superato il test senza sottotitoli inventati sul silenzio. I timestamp dei segmenti sono stime del modello, non allineamento parola per parola. L’accuratezza va verificata sui propri contenuti.

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

`npm test` include una trascrizione reale via API: richiede il modello installato e fallisce se mancante. Verifica taglio della sorgente a 2 secondi, inserimento a 3 secondi, tracce mute e timestamp ordinati. I test API generano media di riferimento e analizzano gli output con FFmpeg/ffprobe: fotogrammi colorati, frequenza e livello audio, durate, offset, sovrapposizioni, mute/solo, silenzio, effetti, contenitori e errori. I due trasporti MCP sono provati con l’SDK ufficiale. I test browser usano Chromium di sistema (`CHROMIUM_PATH` configurabile), importano file reali e verificano l’export scaricato. La prova UI YouTube usa risposte controllate ed è distinta da un download reale. `test:whisper` usa parlato noto e silenzio: fallisce se il modello manca, senza skip o trascrizioni simulate.

`tests/fixtures/jfk.wav` proviene dal repository ufficiale whisper.cpp; fonte e hash sono in `tests/fixtures/README.md`.

Risultati delle verifiche e diagnosi dei domini: [docs/verification.md](docs/verification.md).
