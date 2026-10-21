# Verifiche timeline, finestre ed esportazione — 21 ottobre 2026

## Comportamento consegnato

- Dieci finestre/pannelli dell’app trascinabili dalla barra del titolo: Effects, Transitions, Captions, Adjustment, BG Remover, MCP, esportazione, YouTube, nuova pista e marker. Pulsanti, campi e chiusure mantengono il comportamento normale.
- Pista TESTO arancione di default; nuove piste TESTO aggiungibili. I progetti precedenti conservano i sottotitoli importandoli come clip; quelli nuovi distinguono le bozze dal testo già inserito con `captionWorkflow: timeline`.
- Trascrivi audio riconosce il parlato; GENERATE inserisce le correzioni nella timeline senza un’altra inferenza. Identificativi stabili evitano duplicati; una lista svuotata permette di cancellare i mattoncini generati. Testi spostati, tagliati, copiati e modificati conservano i relativi tempi; più piste di testo vengono disposte su righe separate. Opacità e dissolvenze testo sono applicate dal player e dal render.
- Il player mantiene il fotogramma intero dentro lo spazio disponibile con 16:9, 9:16, 1:1 e 4:3. Ridurre la timeline rende più sottili le clip; aumentare una singola pista dalla maniglietta mantiene intestazione e corsia della stessa altezza. Il progetto conserva l’altezza preferita di ogni pista.
- Onde audio reali: campioni mono a 4 kHz, picchi aggregati in massimo 1024 punti sull’intervallo della sorgente, con silenzio finale se necessario. La forma segue offset e durata; un audio assente non viene sostituito con una grafica inventata. I picchi sono adattati verticalmente per leggibilità, non costituiscono un misuratore del guadagno della clip.
- Esportazioni Video/Audio/Immagine separate. Immagine richiede una pista IMMAGINI popolata e una clip attiva al tempo scelto; compone immagini, testi ed effetti e salva un solo fotogramma. Screenshot cattura invece il video al cursore e la composizione visibile, PNG a 1080p nelle proporzioni del progetto.

## Controlli effettivi

- `npm run lint`: TypeScript.
- `npm test`: 47 test, inclusi i test precedenti di export, MCP, Whisper e BG Remover, più codec dei nuovi contenitori, colori delle immagini, Screenshot al tempo del cursore, ampiezze audio e testi temporizzati.
- `npm run test:e2e`: 19 scenari Chromium. Le prove aggiunte trascinano tutte le finestre, creano/correggono/spostano/salvano testi, cambiano le dimensioni del player e delle piste, verificano l’onda reale e scaricano lo Screenshot.
- `npm run test:whisper`: parlato noto con timestamp e silenzio reale.
- Il fotogramma Screenshot al secondo 1,2 della sorgente rossa/blu deve essere blu. Un’immagine esportata con zoom al secondo 0,8 viene confrontata col fotogramma del video esportato nello stesso punto dell’animazione.
- Il test testo verifica assenza di scritte prima del segmento, testo presente nel suo intervallo e assenza nella pausa fra due segmenti, analizzando i pixel realmente esportati.
- Il test onda confronta una porzione silenziosa e una sonora della stessa sorgente: picco sotto 0,001 nella prima e sopra 0,4 nella seconda.

| Categoria | Formati verificati e codec |
| --- | --- |
| Video | MP4/MOV/MKV/M4V H.264; AVI H.264 con PCM; WEBM VP9/Opus |
| Audio | MP3, WAV PCM, M4A/AAC AAC, FLAC, OGG Vorbis, OPUS, AIFF PCM big endian |
| Immagine | PNG, JPG MJPEG, WEBP, BMP, TIFF, GIF con un fotogramma |

I controlli vengono eseguiti su Linux/Chromium. Non attestano l’esecuzione dell’installazione Windows o tutte le combinazioni di schermo e hardware. I limiti di riconoscimento automatico Whisper/rembg restano quelli documentati nei resoconti precedenti. I formati sono verificati con FFmpeg/ffprobe e con i file scaricati; la sola estensione non è considerata prova di corretta codifica.
