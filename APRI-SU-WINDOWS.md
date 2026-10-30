# Aprire TALEDIT su Windows

Questa procedura e per Windows 10/11 a 64 bit. Serve Internet per la prima preparazione e per il primo avvio. I programmi necessari e il riconoscimento vocale sono gratuiti; vengono usati spazio e risorse del tuo computer.

1. Su GitHub apri il ramo con le correzioni. Premi il pulsante verde **Code**, poi **Download ZIP**.
2. Quando il download finisce, apri **Download** in Windows. Fai clic destro sul file scaricato e scegli **Estrai tutto**. Apri la cartella estratta.
3. Fai doppio clic su **1-PREPARA-TALEDIT.cmd**. Se Windows chiede il permesso di installare, scegli **Si**. Attendi la scritta **Preparazione terminata**. Se viene richiesto un riavvio, riavvia Windows.
4. Chiudi quella finestra. Fai doppio clic su **2-AVVIA-TALEDIT.cmd**. La prima volta attendi il download degli strumenti dell’app e del modello vocale. Le volte successive l’avvio sara piu rapido.
5. Il browser si apre automaticamente su TALEDIT. Lascia aperta la finestra di avvio mentre lavori. Per terminare, chiudi la finestra di avvio.
6. Nell’app premi **Importa** e scegli un video dal tuo computer. Fai doppio clic sul video nello stage per inserirlo nel montaggio. Usa **Salva** per conservare il progetto; **Esporta** crea il video finale.

Se Windows nasconde la parte `.cmd` del nome, vedrai soltanto `1-PREPARA-TALEDIT` e `2-AVVIA-TALEDIT`: sono gli stessi file. Eseguili solo dalla cartella estratta, non dentro lo ZIP.

Se compare un blocco di sicurezza di Windows, controlla provenienza e messaggio prima di continuare; non disattivare le protezioni. Se manca il programma di installazione di Windows, il primo file spiega come aggiornarlo dal Microsoft Store. Conserva il testo di eventuali errori.

## Che cosa viene preparato

Il primo file usa il programma di installazione di Windows per Node.js LTS, Python 3.12, FFmpeg e i componenti Microsoft necessari. Rimangono attive le verifiche normali delle fonti e dei pacchetti. Il secondo installa le versioni dell’app conservate nel progetto, usa PyAV 16.1.0 e salva il modello vocale nella cartella personale di Windows. Prepara anche BG Remover con un ambiente separato e un modello gratuito da circa 4,6 MB. Non serve un abbonamento a servizi di riconoscimento vocale.

L’app e stata avviata e verificata realmente nel browser dell’ambiente Linux di sviluppo, con 101 test principali e 32 prove browser superate. Non e disponibile una macchina Windows in questo ambiente: la procedura di installazione Windows e predisposta, ma non e stata eseguita su Windows. Un eventuale errore specifico di quel sistema va verificato sulla macchina interessata.

YouTube diretto rimane soggetto alle restrizioni di rete. Il pulsante **Carica video locale**, presente nella finestra YouTube, consente di importare un file gia sul tuo computer. Nessun blocco viene aggirato.

Effects mostra le anteprime da trascinare soltanto su EFFECTS. Clicca il mattoncino nella timeline per regolare Intensità e Velocità da 0 a 10. Per Transitions, Adjustment e BG Remover seleziona prima un video o un’immagine. Video, audio e immagini entrano soltanto nelle rispettive tracce. Se avevi scaricato una versione precedente, scarica nuovamente la cartella aggiornata e riaprila con 2-AVVIA-TALEDIT.cmd.

Nella nuova versione, per i sottotitoli premi **Captions → Trascrivi audio**, correggi il testo e poi **GENERATE**: compariranno i mattoncini arancioni su TESTO. Puoi spostare le finestre dalla barra del titolo, regolare l’altezza delle piste con la maniglietta sopra il nome e salvare un fotogramma con **Screenshot**. In **Esporta** scegli prima Video, Audio o Immagine; quest’ultima richiede una clip nella pista IMMAGINI.


Velocità: clic destro su una clip, **Velocità clip…**, scegli da −5 (25%) a +5 (400%), poi **Applica velocità**. Lo zero corrisponde al 100%. Per duplicare un livello usa il pulsante con due fogli accanto al suo nome. Con molte piste scorri nella timeline; tieni premuto **Ctrl** e muovi la rotella per ingrandire/ridurre mattoncini e piste insieme.

Con **2-AVVIA-TALEDIT.cmd**, Screenshot salva automaticamente un PNG nella cartella Download di Windows e mostra una conferma nell’app. Se la cartella non è scrivibile viene usato il download del browser. Per l’avvio manuale si può configurare `SCREENSHOT_DIR`; se non è configurato, la destinazione dipende dalle impostazioni di download del browser.

## Aprire il mixer audio

Premi **AUDIO**, in verde in basso. Trovi le sole piste audio e una colonna di manopole per ogni pista; **MASTER** regola tutto il suono insieme. Premi il triangolo per ascoltare, trascina le manopole verso l’alto o il basso e fai doppio clic per riportarle al valore iniziale. Puoi anche scrivere il valore sotto la manopola. **FX** confronta l’audio con e senza le regolazioni, **S** ascolta una pista da sola e il simbolo dell’altoparlante la silenzia. Scorri per raggiungere gli altri controlli o le altre piste. Premi **VIDEO**, in blu, per tornare al montaggio. **Salva** conserva anche il mixer; **Esporta** applica le regolazioni al file finale.

## Correggere i colori

Premi **COLOR**, in rosso in basso, poi scegli il video o l’immagine nel menu **Clip da correggere**. In alto confronti **Originale** e **Corretto**. Sotto, **Ruote** regola i colori delle ombre, dei mezzitoni e delle luci; **Primarie** contiene luminosità, contrasto e gli altri controlli; **Curve** permette correzioni più precise. Puoi trascinare le manopole oppure scrivere il numero sotto; un doppio clic ripristina il singolo valore. A destra i quattro diagrammi aiutano a controllare luce e colore. **Bypass** permette il confronto senza perdere le impostazioni, **Reset** azzera la correzione della clip. Salva il progetto per conservarla; Esporta la applica al risultato finale.

## I nuovi strumenti intelligenti

- **AI Cut**: scegli quanto deve durare la pausa conservata, fra mezzo secondo e due secondi. Premi **Scansiona e taglia automaticamente**: l’app legge tutto l’audio e applica i tagli senza chiedere conferme. **Indietro** annulla. Le caselle facoltative per esitazioni e ciak usano il riconoscimento vocale e possono sbagliare; puoi attivarle prima di avviare.
- **Captions**: fai una nuova trascrizione e lascia spuntato **Parola evidenziata ottanio** prima di premere **GENERATE**. Appariranno frasi brevi con la parola pronunciata evidenziata.
- **Pen Mask**: scegli il video o l’immagine, premi il pulsante, clicca per disegnare e trascina per creare le curve. Chiudi il tracciato sul primo punto o con **Chiudi tracciato**. Trascina nodi/maniglie per rifinirlo; **Inverti** e **Sfumatura** regolano il ritaglio. **Full** ingrandisce il video mantenendo lo strumento e i suoi comandi.
