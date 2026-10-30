# COLOR: correzione colore e scopes — 30 ottobre 2026

## Uso

La scheda **COLOR**, rossa e posizionata dopo VIDEO e AUDIO, apre due monitor sincronizzati e i controlli colore. Seleziona una clip video/immagine nella timeline o nel menu **Clip da correggere**. Il menu porta il cursore all’inizio della clip se necessario. La selezione identifica la clip che riceve le modifiche; i monitor mostrano il montaggio al cursore, comprese sovrapposizioni e testi.

**Originale** rimuove grade COLOR, Adjustment ed effetti visivi delle clip e della pista EFFECTS. Conserva geometria di montaggio, livelli, tagli, velocità, trasparenza, dissolvenze e testi. **Corretto** mostra tutte le regolazioni e gli effetti applicati. Il trasporto usa il tempo del progetto; il motore video/audio rimane lo stesso delle altre sezioni.

## Controlli

- **Ruote**: Lift, Gamma, Gain, Offset. Ogni ruota permette di trascinare il bilanciamento cromatico; sotto si trovano quattro manopole per master Y e canali R/G/B, per un totale di 16 controlli. Frecce della tastiera e doppio clic funzionano anche sulle ruote.
- **Primarie**: esposizione in stop, contrasto, pivot, temperatura, tinta, saturazione, vibrance, rotazione della tonalità, ombre, alte luci, neri, bianchi e nitidezza: 13 manopole aggiuntive.
- **Curve**: Master RGB e canali rosso/verde/blu, ciascuno con sette punti modificabili trascinando i nodi o scrivendo i valori. Interpolazione cubica che evita overshoot fra i punti. Ripristino della singola curva.
- **Bypass** conserva i parametri ma disattiva il grade COLOR della clip; **Reset** riporta quel grade allo stato neutro. Non rimuovono le regolazioni Adjustment o gli effetti precedenti. Le manopole funzionano con trascinamento verticale, frecce e valore numerico; il doppio clic ripristina il singolo controllo.

## Scopes

Quattro diagrammi contemporanei, calcolati dai pixel del monitor scelto con **Sorgente scopes**:

1. Waveform Y con posizione orizzontale e luminanza da 0 a 100.
2. Parade RGB con i tre canali affiancati.
3. Istogramma RGB con distribuzione 0–255 e scala verticale logaritmica.
4. Vectorscope Cb/Cr con riferimenti cromatici al 75%, griglia e linea di riferimento delle tonalità della pelle.

Minimo/massimo Y e percentuali di pixel prossimi al nero/bianco accompagnano i diagrammi. I dati derivano da un campionamento del fotogramma visualizzato, ridotto a 320 pixel di larghezza, e comprendono eventuali bande nere e testi presenti nel montaggio. Non sono diagrammi di esempio né dati casuali. Durante il playback l’aggiornamento è limitato a circa 10 volte al secondo per contenere l’uso della CPU.

## Motore e persistenza

Grade per clip in `TimelineClip.colorGrade`, mantenuto con copie, tagli, progetti TAL/JSON, stato MCP, Annulla/Ripristina. I progetti precedenti ricevono valori neutri. I parametri sono validati all’apertura e all’esportazione.

Le trasformazioni cromatiche generano una LUT 3D 33×33×33. Browser e FFmpeg usano la stessa tabella e interpolazione trilineare; il browser conserva l’alpha e l’export usa un file .cube temporaneo eliminato a fine lavoro. La nitidezza è spaziale e viene applicata separatamente, combinata entro il limite esistente con Adjustment. I valori neutri non introducono una trasformazione; il bypass non elimina gli altri effetti. Il grade si applica prima degli effetti globali della pista EFFECTS e prima della composizione dei testi.

Il flusso è **SDR, RGB Rec.709 a intervallo completo**, coerente con l’editor attuale. Temperatura/tinta e ruote usano valori relativi. Non implementa ACES, gestione scene-referred, metadata HDR, monitoraggio calibrato o l’intero sistema di nodi/qualificatori di DaVinci Resolve. Gli scopes descrivono il fotogramma di anteprima a 8 bit, non un segnale SDI a 10/12 bit.

## Verifiche effettive

Esito finale: TypeScript (`npm run lint`) **PASS**; suite `npm test` **86/86 PASS**, senza skip; suite browser completa **27/27 PASS**; dopo il miglioramento del layout scopes, ripetizione dei due scenari COLOR con trascinamento effettivo delle curve e verifica numerica del cambio sorgente scopes **2/2 PASS**. Build di produzione **PASS**; `npm run test:whisper` **PASS** su parlato e silenzio reali; `git diff --check` **PASS**.

- Identità neutra e bypass; alpha conservato; tutti i controlli LGGO verificati sui campioni reali, incluse modifiche limitate al canale selezionato. Limiti dei 29 controlli, curve e valori non validi.
- Primarie, bilanciamento del bianco, tonalità, saturazione e intervalli tonali; pivot insieme al contrasto; curve esatte ai nodi, senza overshoot.
- Scopes su nero, bianco, rosso e blu: conteggi, posizione della waveform, istogramma, limiti e distribuzione nel vectorscope.
- Raster multicolore elaborato dal codice browser e da FFmpeg reale: scarto massimo due livelli RGB su 255; scarto medio inferiore a uno.
- API reale: PNG corretto e bypass, MP4 desaturato con audio conservato, Screenshot al cursore con esposizione ridotta, rifiuto di parametri fuori intervallo. Trasparenza conservata su un’immagine corretta sovrapposta a un’altra immagine.
- Browser: monitor prima/dopo con differenza visibile; tutte le 29 manopole salvate; ruote trascinate, tastiera/doppio clic, quattro curve, scopes non vuoti, selezione della sorgente, salvataggio/riapertura, annullamento, selezione dalla timeline e riproduzione video sincronizzata.

Le prove browser sono eseguite su Linux/Chromium. Non è disponibile una macchina Windows nell’ambiente di sviluppo.
