"""Run the actual Windows installer and exercise its private runtimes offline.
No preinstalled Node/Python/FFmpeg is used by the installed application.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]

def api(route, body=None, filename=None):
    headers = {}
    data = None
    if filename:
        data = Path(filename).read_bytes()
        headers = {'Content-Type': 'application/octet-stream', 'x-filename': Path(filename).name}
    elif body is not None:
        data = json.dumps(body).encode()
        headers = {'Content-Type': 'application/json'}
    with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:3000' + route, data=data, headers=headers), timeout=180) as response:
        return json.load(response)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('installer', type=Path)
    parser.add_argument('inventory', type=Path)
    args = parser.parse_args()
    assert os.name == 'nt', 'This verification must run on Windows'
    with tempfile.TemporaryDirectory(prefix='taledit installer ') as folder:
        install = Path(folder) / 'App con spazi'
        # NSIS requires /D last and unquoted, including directory names with spaces.
        subprocess.run(f'"{args.installer.resolve()}" /S /D={install}', check=True, timeout=600)
        inventory = json.loads(args.inventory.read_text())
        for name, expected in inventory.items():
            file = install / name
            assert file.is_file(), f'Missing installed file: {name}'
            with file.open('rb') as source:
                assert hashlib.file_digest(source, 'sha256').hexdigest() == expected, name
        subprocess.run([str(install / 'runtime/node.exe'), '--version'], check=True)
        env = {**os.environ, 'TALEDIT_NO_BROWSER': '1', 'WHISPER_MODEL_DIR': str(install / 'models/whisper-small'), 'BG_MODEL_DIR': str(install / 'models/bg'), 'PYTHONNOUSERSITE': '1', 'PYTHONPATH': '', 'OMP_NUM_THREADS': '2'}
        python = install / 'runtime/python/python.exe'
        subprocess.run([str(python), '-c', "import av,ctranslate2,onnxruntime,faster_whisper,rembg;print('Private Windows Python, PyAV, Whisper, rembg: PASS')"], env=env, check=True, timeout=120)
        speech = subprocess.run([str(python), str(install / 'app/scripts/transcribe.py')], input=json.dumps({'file':str(ROOT / 'tests/fixtures/jfk.wav'),'language':'en'}), text=True, capture_output=True, env=env, check=True, timeout=240)
        subtitles = json.loads(speech.stdout)['subtitles']
        assert 'ask not what your country can do for you' in ' '.join(s['text'].lower() for s in subtitles)
        words = [w for sub in subtitles for w in sub['words']]
        assert len(words) > 5 and all(0 <= w['startTime'] < w['endTime'] < 12 for w in words)
        assert all(words[i]['startTime'] <= words[i+1]['startTime'] for i in range(len(words)-1))
        output = Path(folder) / 'subject.png'
        removed = subprocess.run([str(python), str(install / 'app/scripts/remove-bg.py')], input=json.dumps({'type':'image','input':str(ROOT / 'tests/fixtures/bg-animal.jpg'),'output':str(output)}), text=True, capture_output=True, env=env, check=True, timeout=240)
        assert output.stat().st_size > 1000, removed.stdout
        subprocess.run([str(python), '-c', "from PIL import Image;import sys;im=Image.open(sys.argv[1]);lo,hi=im.getchannel('A').getextrema();assert lo<20 and hi>200;print('Real segmentation alpha: PASS')",str(output)],env=env,check=True)
        launcher = subprocess.Popen([str(install / 'TALEDIT.exe')], env=env)
        try:
            deadline = time.time() + 90
            while True:
                try:
                    health = api('/api/health')
                    assert health['ffmpeg'] and health['ffprobe']
                    break
                except Exception:
                    if time.time() > deadline:
                        log = Path(os.environ['LOCALAPPDATA']) / 'TALEDIT/data/avvio.log'
                        raise RuntimeError(log.read_text() if log.exists() else 'Startup failed without log')
                    time.sleep(.5)
            subprocess.run([str(install / 'TALEDIT.exe')],env=env,check=True,timeout=15)
            fixture = Path(folder) / 'source.mp4'
            subprocess.run([str(install/'tools/ffmpeg.exe'),'-v','error','-y','-f','lavfi','-i','color=c=red:s=160x90:r=25:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',str(fixture)],check=True)
            asset = api('/api/upload-media',filename=fixture)['asset']
            clip = {'id':'v','name':asset['name'],'type':'video','trackId':'v','mediaUrl':asset['fileUrl'],'startTime':0,'duration':1,'offset':0,'transparency':100,'volumeDb':0,'fadeIn':0,'fadeOut':0}
            result = api('/api/export',{'format':'mp4','resolution':'720p','durationSec':1,'weightPercentage':20,'clips':[clip],'tracks':[]})
            media = Path(os.environ['LOCALAPPDATA']) / 'TALEDIT/data/media_downloads'
            exported = media / result['fileName']
            info=json.loads(subprocess.check_output([str(install/'tools/ffprobe.exe'),'-v','error','-show_streams','-of','json',str(exported)],text=True))
            assert {s['codec_type'] for s in info['streams']} == {'video','audio'}
            pixel = subprocess.check_output([str(install/'tools/ffmpeg.exe'),'-v','error','-i',str(exported),'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-'])
            assert pixel[0]>180 and pixel[1]<30 and pixel[2]<30, list(pixel)
            snapshot=api('/api/screenshot',{'clips':[clip],'tracks':[],'frameTime':.3,'resolution':'720p','durationSec':1})
            assert snapshot['savedToDownloads'], snapshot
            # Exercise the installed production UI, not a development web server.
            subprocess.run(['node', str(ROOT/'packaging/windows/browser-smoke.mjs')],cwd=ROOT,check=True,timeout=90)
            marker=media/'installer-preserve-test.txt'
            marker.write_text('preserve user data')
        finally:
            subprocess.run([str(install/'CHIUDI-TALEDIT.exe')],env=env,check=True,timeout=20)
            launcher.wait(timeout=20)
        subprocess.run(f'"{install / "Disinstalla.exe"}" /S _?={install}',check=True,timeout=120)
        assert not (install/'app/server.mjs').exists(), 'Uninstaller left app files'
        assert marker.read_text() == 'preserve user data', 'Uninstall removed user data'
        print('PASS: actual NSIS install, SHA256 inventory, bundled native runtimes, speech timestamps, segmentation, launch, duplicate launch, import, visible MP4 export with audio, PNG Downloads, browser UI, shutdown, uninstall preserving data.')

if __name__ == '__main__':
    main()
