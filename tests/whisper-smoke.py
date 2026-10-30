"""Required real-model check: fails (does not skip) when model setup is incomplete."""
import json
import os
import subprocess
import tempfile
import sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
command = [os.environ.get('WHISPER_PYTHON', '/workspace/.venv-whisper/bin/python'), str(root / 'scripts/transcribe.py')]
def transcribe(file):
    result = subprocess.run(command, input=json.dumps({'file': str(file), 'language': 'en'}), capture_output=True, text=True, timeout=180)
    if result.returncode:
        print(result.stderr.strip(), file=sys.stderr)
        sys.exit(result.returncode)
    return json.loads(result.stdout)['subtitles']
segments = transcribe(root / 'tests/fixtures/jfk.wav')
text = ' '.join(s['text'].lower() for s in segments)
assert 'ask not what your country can do for you' in text, text
assert all(0 <= s['startTime'] < s['endTime'] for s in segments)
words = [w for s in segments for w in s.get('words', [])]
assert len(words) > 5, 'Missing real word timestamps'
assert all(0 <= w['startTime'] < w['endTime'] for w in words)
assert all(words[i]['startTime'] <= words[i+1]['startTime'] for i in range(len(words)-1))
with tempfile.TemporaryDirectory() as folder:
    silence = Path(folder) / 'silence.wav'
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t','3',str(silence)],check=True)
    assert transcribe(silence) == [], 'Silence must not produce invented subtitles'
print('PASS: known speech recognized with timestamps; silence produces zero subtitles.')
