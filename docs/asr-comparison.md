# Scelta del riconoscimento vocale locale

Ricerca sui repository ufficiali del 21 ottobre 2026. Le stelle indicano diffusione della community, non misurano da sole qualità, accuratezza o soddisfazione. I benchmark citati sono degli autori; non sono stati riprodotti su questa macchina.

| Progetto / modello | Evidenza consultata | Impiego in TALEDIT |
| --- | --- | --- |
| [OpenAI Whisper](https://github.com/openai/whisper) | Circa 111.000 stelle; modello multilingue, italiano, pesi e codice MIT | Modello di riferimento; implementazione originale più pesante per CPU |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | Circa 26.000 stelle; benchmark CPU small INT8: 1.477 MB, 1m42s sul campione degli autori; integrazioni elencate con aTrain, WhisperLive, Whisper-Streaming | Scelto: esegue Whisper con CTranslate2, quantizzazione INT8 e timestamp senza API a pagamento |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Circa 54.500 stelle; MIT, implementazione C/C++, CPU e diversi acceleratori | Valida alternativa per distribuire binari nativi; richiede compilazione e gestione pesi GGML |
| [Vosk](https://github.com/alphacep/vosk-api) | Circa 15.200 stelle; riconoscimento offline, italiano, modelli specifici per lingua | Alternativa leggera per streaming e macchine piccole; non offre lo stesso flusso Whisper di trascrizione multilingue e traduzione inglese |
| [Parakeet V3 / NVIDIA NeMo](https://github.com/NVIDIA/NeMo) | Repository con circa 18.600 stelle; README cita Parakeet V3 per 25 lingue europee e dipendenza da PyTorch >=2.7 | Modello alternativo da valutare su dataset italiano; stack più pesante rispetto a CTranslate2 CPU |
| [Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR) | Circa 3.750 stelle; modelli 0.6B/1.7B, italiano; benchmark degli autori e modello separato per forced alignment | Alternativa recente interessante; integrazione e costo CPU maggiori da misurare prima di sostituire Whisper |

Fonti: README ufficiali e contatori `stargazerCount` delle pagine GitHub, letti durante questa sessione. I pesi Whisper small sono stati scaricati e la trascrizione di parlato inglese noto è stata verificata in locale e tramite API. Non è stato eseguito un benchmark comparativo di accuratezza sull’italiano tra i diversi modelli.

La scelta iniziale è Whisper small multilingue via faster-whisper INT8, senza dipendenza da GPU. Un’eventuale sostituzione va decisa confrontando trascrizioni dello stesso audio italiano e misurando errori, tempi e memoria. La pipeline usa l’audio montato, così cambiare modello non cambia la semantica dei tagli e delle tracce mute.
