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

L’app e stata avviata e verificata realmente nel browser dell’ambiente Linux di sviluppo, con 47 test principali e 19 prove browser superate. Non e disponibile una macchina Windows in questo ambiente: la procedura di installazione Windows e predisposta, ma non e stata eseguita su Windows. Un eventuale errore specifico di quel sistema va verificato sulla macchina interessata.

YouTube diretto rimane soggetto alle restrizioni di rete. Il pulsante **Carica video locale**, presente nella finestra YouTube, consente di importare un file gia sul tuo computer. Nessun blocco viene aggirato.

Effects mostra le anteprime da trascinare soltanto su EFFECTS. Clicca il mattoncino nella timeline per regolare Intensità e Velocità da 0 a 10. Per Transitions, Adjustment e BG Remover seleziona prima un video o un’immagine. Video, audio e immagini entrano soltanto nelle rispettive tracce. Se avevi scaricato una versione precedente, scarica nuovamente la cartella aggiornata e riaprila con 2-AVVIA-TALEDIT.cmd.

Nella nuova versione, per i sottotitoli premi **Captions → Trascrivi audio**, correggi il testo e poi **GENERATE**: compariranno i mattoncini arancioni su TESTO. Puoi spostare le finestre dalla barra del titolo, regolare l’altezza delle piste con la maniglietta sopra il nome e salvare un fotogramma con **Screenshot**. In **Esporta** scegli prima Video, Audio o Immagine; quest’ultima richiede una clip nella pista IMMAGINI.
