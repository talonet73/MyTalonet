"""Local, free Whisper transcription. JSON stdin -> JSON stdout; diagnostics on stderr."""
import json
import os
import sys


def main():
    from faster_whisper import WhisperModel
    data = json.load(sys.stdin)
    model_path = os.environ.get('WHISPER_MODEL_DIR', '/workspace/.cache/taledit/whisper-small')
    if not os.path.isfile(os.path.join(model_path, 'model.bin')):
        raise RuntimeError('Modello Whisper non installato. Esegui scripts/setup-whisper.sh con accesso a Hugging Face.')
    model = WhisperModel(model_path, device='cpu', compute_type='int8', cpu_threads=4, local_files_only=True)
    language = data.get('language')
    segments, info = model.transcribe(data['file'], language=language, beam_size=5, vad_filter=True, vad_parameters={'speech_pad_ms': 100}, condition_on_previous_text=False)
    result = [dict(startTime=s.start, endTime=s.end, text=s.text.strip()) for s in segments if s.text.strip()]
    if data.get('bilingual') and info.language != 'en':
        translated, _ = model.transcribe(data['file'], language=language, task='translate', beam_size=5, vad_filter=True, vad_parameters={'speech_pad_ms': 100}, condition_on_previous_text=False)
        translated = list(translated)
        for sub in result:
            sub['translation'] = ' '.join(s.text.strip() for s in translated if s.start < sub['endTime'] and s.end > sub['startTime'])
    print(json.dumps({'language': info.language, 'subtitles': result}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
