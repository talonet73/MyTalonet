# Installer unico TALEDIT per Windows

La distribuzione `TALEDIT-Setup.exe` installa per il solo utente Windows 10/11 x64,
crea il collegamento sul desktop e apre l'interfaccia nel browser installato.
Non richiede installazioni separate di Node.js, Python, FFmpeg o librerie/modelli AI.
Non scarica pacchetti al primo avvio. Il programma non è firmato digitalmente.

Il pacchetto comprende Node.js 22.16.0, Python 3.12.10 privato, FFmpeg/ffprobe 7.1.1,
yt-dlp, le dipendenze Windows di Whisper/rembg (incluse le DLL C++ private),
Whisper small e U2NetP. I componenti hanno hash SHA256 bloccati in
`packaging/windows/assets.lock.json`; i pacchetti Python conservano metadati/licenze.

## Utilizzo

1. Chiudere la vecchia finestra nera di TALEDIT.
2. Scaricare `TALEDIT-Setup.exe` dalla release Windows verificata su GitHub.
3. Aprirlo, scegliere **Avanti**, poi **Installa**, quindi **Fine**.
4. Le volte successive aprire **TALEDIT** dal desktop.
5. Per fermare anche il programma in background: menu Start → TALEDIT → **Chiudi TALEDIT**.

L'app resta locale: il browser apre `http://127.0.0.1:3000`.
Internet serve per le funzioni che comunicano con servizi esterni, come YouTube/MCP remoto.
Le limitazioni dei servizi esterni non sono eliminate dall'installer.

## Progetti e aggiornamenti

I programmi sono in `%LOCALAPPDATA%\Programs\TALEDIT`; file importati/esportati e log
sono in `%LOCALAPPDATA%\TALEDIT\data` e sopravvivono alla disinstallazione.
Gli screenshot usano la cartella Download di Windows, anche se reindirizzata.
Il salvataggio del progetto resta quello dell'app. La finestra del browser va chiusa
prima di aggiornare per evitare una vecchia interfaccia rimasta aperta.

Per recuperare media della precedente versione ZIP: copiare **il contenuto** di
`media_downloads` della vecchia cartella in
`%LOCALAPPDATA%\TALEDIT\data\media_downloads`, senza cancellare gli originali,
quindi usare **Apri** per aprire il progetto salvato.
L'installer non cerca o sposta automaticamente le precedenti cartelle ZIP.

## Build e verifica

`python packaging/windows/build.py` crea payload, inventario, installer e checksum in
`build/windows`. Su Windows richiede Node/npm, Python 3.12 per il compilatore e NSIS;
questi requisiti riguardano solo chi costruisce il pacchetto.
Su Linux è possibile la compilazione incrociata usando NSIS e
`--whisper-model /percorso/modello --bg-model /percorso/modello`.
Il bundle server non include il server di sviluppo Vite; l'importazione è differita.

Il workflow `.github/workflows/taledit-windows.yml` esegue il compilatore su Windows,
installa davvero l'EXE in un percorso con spazi, controlla l'inventario di tutti i file,
importa i moduli nativi Windows, trascrive JFK con timestamp parola per parola,
esegue U2NetP, avvia l'EXE, prova doppio avvio, importazione ed esportazione MP4 con
pixel rossi e traccia audio, screenshot nei Download, pagine VIDEO/AUDIO/COLOR,
chiusura e disinstallazione senza cancellare i dati.
La release viene pubblicata **solo dopo il superamento** di questi controlli.
La compilazione Linux da sola non dimostra l'esecuzione su Windows.
