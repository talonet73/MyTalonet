# Ricerca GitHub e strumenti intelligenti — 30 ottobre 2026

Sono stati letti i README e i file di licenza dei seguenti repository pubblici, tramite i contenuti ufficiali GitHub. La scelta privilegia elaborazione locale, uso gratuito e compatibilità con l’installazione TALEDIT esistente.

| Progetto | Licenza verificata | Funzione e scelta |
| --- | --- | --- |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | [MIT](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE) | Riconoscimento vocale locale, timestamp per parola e Silero VAD integrato. Già presente in TALEDIT; esteso per sottotitoli dinamici e analisi delle esitazioni. |
| [Silero VAD](https://github.com/snakers4/silero-vad) | [MIT](https://github.com/snakers4/silero-vad/blob/master/LICENSE) | Rilevamento di attività vocale; già usato da faster-whisper. Non richiede un secondo servizio esterno. |
| [Auto-Editor](https://github.com/WyattBlue/auto-editor) | [Unlicense](https://github.com/WyattBlue/auto-editor/blob/master/LICENSE) | App/CLI per eliminare silenzi e produrre un primo montaggio. Il README distingue il codice libero dalle risorse proprietarie delle app distribuite. Valutato come alternativa; TALEDIT applica invece i tagli alla propria timeline con FFmpeg e Whisper, preservando livelli, effetti e collegamenti senza un secondo editor. |
| [WhisperX](https://github.com/m-bain/whisperX) | [BSD 2-Clause](https://github.com/m-bain/whisperX/blob/main/LICENSE) | Allineamento forzato delle parole con wav2vec2 e diarizzazione. Alternativa per un futuro allineamento più avanzato; richiede ulteriori modelli/dipendenze. Per questo intervento sono usati i tempi parola reali di faster-whisper. |
| [Paper.js](https://github.com/paperjs/paper.js) | [MIT](https://raw.githubusercontent.com/paperjs/paper.js/HEAD/LICENSE.txt) | Strumenti vettoriali e curve Bézier. Valutato per la penna; i controlli TALEDIT sono implementati direttamente con SVG/Canvas, senza introdurre l’intera libreria. |
| [SAM 2](https://github.com/facebookresearch/sam2) | [Apache 2.0](https://github.com/facebookresearch/sam2/blob/main/LICENSE) per codice e checkpoint SAM 2 | Segmentazione/tracking assistiti da modello. È distinto dalla maschera manuale richiesta e richiede un’installazione più impegnativa; non aggiunto. BG Remover esistente resta disponibile. |

Le funzionalità nuove non richiedono abbonamenti, API commerciali, account o invio dei video a server esterni. Si usano CPU, RAM e spazio del computer dell’utente. Il codice dei progetti valutati ma non aggiunti non è stato copiato nell’app.

## Montaggio intelligente: AI Cut

Il flusso è stato aggiornato dopo la prima implementazione: scegli la **pausa totale da conservare, da 0,5 a 2 s**, e premi **Scansiona e taglia automaticamente**. Non ci sono liste da spuntare né una conferma successiva. La scansione delle pause è indipendente da Whisper, mute e volume di ascolto, e procede per blocchi fino alla fine del progetto. Le opzioni facoltative per esitazioni e ciak usano Whisper e applicano direttamente anche quei tagli se abilitate prima dell’avvio. I riconoscimenti possono essere errati; **Indietro** ripristina l’operazione. [Correzione del flusso, dettagli e verifiche aggiornate](automatic-cut-verification.md).

## Sottotitoli con evidenziazione ottanio

In **Captions**, esegui una nuova trascrizione, correggi il testo e lascia attiva **Parola evidenziata ottanio**. **GENERATE** crea frasi brevi, fino a cinque parole, sulla pista TESTO. Il fondo ottanio segue la parola pronunciata utilizzando i tempi effettivi del riconoscimento e scompare nelle pause fra parole. La funzione viene renderizzata anche nell’esportazione, non soltanto nell’interfaccia.

Correzioni con lo stesso numero di parole conservano i tempi originali. Se si aggiungono/tolgono parole, quella frase usa lo stile classico: non vengono inventati nuovi allineamenti. Le traduzioni bilingui usano lo stile classico perché le parole tradotte non corrispondono ai tempi della lingua originale. Tagli, variazioni di velocità e montaggio intelligente rimappano i tempi delle parole nelle clip TESTO.

## Pen Mask e precisione a tutto schermo

**Pen Mask** apre la penna nel player e ferma la riproduzione. Se necessario seleziona la clip visiva al cursore. Clic per aggiungere nodi, trascinamento per creare le maniglie Bézier, chiusura sul primo nodo o con **Chiudi tracciato**. Dopo la chiusura si spostano nodi e maniglie; Alt+clic su un nodo elimina le sue maniglie. Sono disponibili inversione, sfumatura, confronto Originale, nuova maschera e rimozione.

Le coordinate vettoriali sono normalizzate sullo stage. La maschera è statica per la clip, con una sola forma a contorno chiuso; non è tracking automatico del soggetto né una lista di keyframe. Sfumatura 0–50 riferita a un’altezza di 1080 pixel, scalata con la risoluzione. La rasterizzazione Bézier si adatta alla risoluzione finale e il medesimo algoritmo alpha è usato in anteprima ed export, conservando la trasparenza preesistente. I tracciati aperti vengono salvati come bozze ma non mascherano il video finché non sono chiusi.

Il pulsante **Full** del player ingrandisce il video e mantiene penna e controlli. Anche le finestre di strumenti precedentemente aperte, per esempio Adjustment, restano montate, visibili e utilizzabili tramite un contenitore persistente che segue il fullscreen. All’uscita tornano nell’editor mantenendo i valori. Il player in modalità penna aumenta la risoluzione dell’anteprima rispetto alla vista normale; le coordinate della maschera restano indipendenti da questa risoluzione.

## Verifiche

Esito finale: `npm run lint` **PASS**; `npm test` **98/98 PASS**, senza skip; `npm run test:e2e` **31/31 PASS**, inclusa build di produzione; `npm run test:whisper` **PASS**, con parole e timestamp reali e silenzio senza sottotitoli inventati; `git diff --check` **PASS**. I filtri di esportazione vengono scritti in un file temporaneo per evitare che i sottotitoli dinamici superino il limite della riga di comando Windows; un test reale esporta 150 parole evidenziate con audio sorgente conservato.

Le prove comprendono analisi vocale reale con il modello installato, silenzi inseriti in tempi noti, taglio con video/audio collegati e velocità diverse, raster alpha e PNG reali, maschere esportate in video con audio conservato, evidenziazione ottanio verificata sui pixel a tempi diversi e trasparenza del testo. Nel browser si provano disegno e modifica Bézier, fullscreen con penna attiva, conservazione degli strumenti aperti, generazione animata, analisi/tagli reali, annullamento e salvataggio/riapertura.

Ambiente di verifica: Linux/Chromium. Non è disponibile una macchina Windows per una prova diretta. Non sono state aggiunte dipendenze Python/Node o nuovi modelli.
