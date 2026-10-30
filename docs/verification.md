# Verifiche TALEDIT — 21 ottobre 2026

## Faster-whisper: causa e correzione

Il decoder di **faster-whisper 1.2.1** chiama `av.open(..., metadata_errors="ignore")`. Con **PyAV 19.0.2** la chiamata fallisce con `TypeError: open() got an unexpected keyword argument 'metadata_errors'`, prima dell’inferenza. È stato riprodotto anche invocando direttamente `av.open` sul file audio di prova.

La combinazione verificata è:

| Componente | Versione |
| --- | --- |
| faster-whisper | 1.2.1 |
| PyAV | 16.1.0 |
| CTranslate2 | 4.8.3 |
| Modello | Whisper small multilingue, CPU INT8 |

PyAV 16.1.0 accetta il parametro: verificato sia nel [sorgente ufficiale](https://github.com/PyAV-Org/PyAV/blob/v16.1.0/av/container/core.pyx) sia aprendo realmente l’audio. `pip check` non rileva dipendenze incompatibili. La versione è fissata sia nei requisiti diretti sia nel lockfile. Il decoder non è stato sostituito da un mock o da un bypass.

Il download dei pesi da Hugging Face è riuscito. Lo script di setup imposta `HF_HOME` e `HF_XET_CACHE` sotto `/workspace/.cache/huggingface` per evitare la cache predefinita non scrivibile. La procedura `bash scripts/setup-whisper.sh` è stata rieseguita con successo usando le dipendenze bloccate e i pesi già scaricati.

## Parlato, silenzio e sincronizzazione

`npm run test:whisper` riconosce dal file reale `tests/fixtures/jfk.wav` la frase “ask not what your country can do for you”, con segmenti temporizzati. Un file di silenzio reale di tre secondi produce zero segmenti. Non vengono usate risposte simulate.

`tests/real-captions.test.ts` confronta:

1. La trascrizione diretta dei secondi **2–9** della sorgente.
2. La trascrizione tramite API dello stesso audio, posizionato al secondo **3** della timeline.

Una seconda clip presente a inizio timeline è su una traccia muta: non deve comparire nella trascrizione. Il test controlla completamento del job, testo riconosciuto, timestamp ordinati e entro i limiti del contenuto, più lo spostamento temporale rispetto alla sorgente tagliata.

La prima esecuzione ha rilevato un anticipo di 330 ms rispetto alla clip, dovuto al margine VAD predefinito. Il margine è stato impostato a **100 ms**, sia per la trascrizione sia per la traduzione. Nella prova corretta, lo spostamento osservato dei timestamp iniziale e finale è **2,97 s** rispetto ai **3 s** attesi: differenza di 30 ms in questa prova. Non è una garanzia di precisione di 30 ms su ogni parola o su qualsiasi registrazione. I timestamp sono segmenti stimati dal modello.

## YouTube: diagnosi senza aggirare il blocco

Prova eseguita sul video `https://youtu.be/6bdhpjT1JmA`, usando l’estrattore esistente e richieste HTTPS standard con la configurazione proxy dell’ambiente.

| Destinazione verificata | Risposta osservata |
| --- | --- |
| `youtu.be/6bdhpjT1JmA` | Tunnel proxy: 403 Forbidden |
| `www.youtube.com/watch?v=6bdhpjT1JmA` | Tunnel proxy: 403 Forbidden |
| `www.youtube.com/youtubei/v1/player` | Tunnel proxy: 403 Forbidden |
| `i.ytimg.com/vi/6bdhpjT1JmA/hqdefault.jpg` | Tunnel proxy: 403 Forbidden |
| `youtubei.googleapis.com/youtubei/v1/player` | HTTP 405 su GET: host raggiungibile, metodo non consentito |

La risposta 405 non valida l’autenticazione, il metodo POST o un download. I flussi `*.googlevideo.com` non sono stati provati: non è stato possibile ottenere i loro URL firmati, essendo bloccata la pagina del video. Non sono state usate destinazioni alternative, modifiche al proxy, cookie, disattivazione TLS o tecniche di aggiramento.

Anche il downloader reale si arresta sul tunnel 403. La risposta applicativa ora distingue `PROXY_FORBIDDEN`, `REMOTE_FORBIDDEN`, `AUTH_REQUIRED` e gli altri errori. Il download diretto resta indisponibile in questo ambiente e non viene dichiarato riuscito.

## Alternativa locale verificata

Nella finestra YouTube è disponibile **Carica video locale**, anche dopo un errore 403. Usa l’upload effettivo dell’app, verifica i media con ffprobe e aggiunge il file allo stage. Non scarica da siti alternativi.

Il test browser provoca un errore 403 controllato e successivamente carica un vero MP4 dal disco. Verifica la chiusura della finestra, l’aggiunta dello stage e che i byte scaricati dal server coincidano con il file originale. L’importazione, l’anteprima e l’export di file locali sono inoltre coperti dalla regressione esistente. La simulazione riguarda soltanto la risposta YouTube nel test UI; il rifiuto del proxy è stato verificato separatamente con richieste reali.

## Esito finale dei comandi eseguiti

- `npm run lint`: **PASS**, controllo TypeScript.
- `npm test`: **PASS, 86/86**, inclusa la trascrizione reale via API, export, mix, immagini, mute/solo e MCP HTTP/SSE.
- `npm run test:whisper`: **PASS**, riconoscimento di parlato noto e assenza di testo sul silenzio.
- `npm run test:e2e`: **PASS, 27/27** test browser, inclusi fallback locale dopo 403 e download dell’export reale.
- `git diff --check`: **PASS**, verifica formale delle modifiche.
- `pip check`: **PASS**, nessun requisito incompatibile.
- Build produzione eseguita dal runner browser: **PASS**.
- Downloader YouTube reale: **BLOCCATO**, risposta `PROXY_FORBIDDEN`, avanzamento 0%, nessun file importato; chiusa la diagnosi senza ulteriori tentativi di aggiramento.

Restano limiti esterni distinti dalla regressione locale: download YouTube rifiutato dal proxy e collegamento effettivo di un account ChatGPT, che richiede un endpoint HTTPS pubblico e configurazione dell’account. I test MCP verificano i trasporti e le modifiche reali alla timeline tramite SDK, non la connessione di un account ChatGPT.

Controllo aggiuntivo di Effects, Transitions, Captions, Adjustment e degli altri pulsanti: [matrice e risultati](toolbar-verification.md).

Aggiornamento del 29 ottobre 2026: [velocità, Screenshot e livelli](speed-layers-verification.md).

Aggiornamento del 30 ottobre 2026: [sezioni VIDEO/AUDIO e mixer](audio-mixer-verification.md).

Aggiornamento COLOR del 30 ottobre 2026: [controlli, monitor e scopes](color-verification.md).
