"""Build the single offline Windows x64 installer, on Windows or Linux with NSIS.
All downloaded runtime archives, wheels and model files are checked against assets.lock.json.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
LOCK = json.loads((HERE / 'assets.lock.json').read_text())

def run(*args, **kwargs):
    subprocess.run([str(a) for a in args], cwd=ROOT, check=True, **kwargs)

def verify(file, expected):
    with open(file, 'rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    if actual != expected:
        raise RuntimeError(f'Checksum mismatch: {file.name}: {actual}')

def write_member(archive, name, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    with archive.open(name) as source, target.open('wb') as dest:
        shutil.copyfileobj(source, dest)

def unpack(archive, destination, prefix=''):
    with zipfile.ZipFile(archive) as zipped:
        for name in zipped.namelist():
            if name.endswith('/') or not name.startswith(prefix):
                continue
            relative = Path(name[len(prefix):])
            if relative.is_absolute() or '..' in relative.parts:
                raise RuntimeError('Unsafe archive path')
            write_member(zipped, name, destination / relative)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT / 'build' / 'cache')
    parser.add_argument('--out', type=Path, default=ROOT / 'build' / 'windows')
    parser.add_argument('--whisper-model', type=Path)
    parser.add_argument('--bg-model', type=Path)
    parser.add_argument('--makensis', default='makensis')
    args = parser.parse_args()
    cache, out = args.cache.resolve(), args.out.resolve()
    payload = out / 'payload'
    cache.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    # Restrict cleanup to our generated payload, never to a caller-selected model/cache.
    if payload.exists():
        shutil.rmtree(payload)
    (payload / 'app').mkdir(parents=True)
    for name, asset in LOCK['downloads'].items():
        file = cache / name
        if not file.exists():
            print('Download', name, flush=True)
            urllib.request.urlretrieve(asset['url'], file)
        verify(file, asset['sha256'])
    unpack(cache / 'node.zip', payload / 'runtime', 'node-v22.16.0-win-x64/')
    # npm and corepack are not required at runtime.
    shutil.rmtree(payload / 'runtime' / 'node_modules', ignore_errors=True)
    unpack(cache / 'python.nupkg', payload / 'runtime' / 'python', 'tools/')
    wheels = cache / 'wheels'
    wheels.mkdir(exist_ok=True)
    requirements = [ROOT / 'scripts/requirements-whisper.lock', ROOT / 'scripts/requirements-bg.lock', HERE / 'requirements-runtime.txt']
    if not all((wheels / name).exists() for name in LOCK['wheels']):
        command = [sys.executable, '-m', 'pip', 'download', '--dest', str(wheels), '--only-binary=:all:', '--platform', 'win_amd64', '--python-version', '312', '--implementation', 'cp', '--abi', 'cp312']
        for file in requirements:
            command += ['-r', str(file)]
        run(*command)
    python_root = payload / 'runtime' / 'python'
    site = python_root / 'Lib' / 'site-packages'
    for name, checksum in LOCK['wheels'].items():
        wheel = wheels / name
        verify(wheel, checksum)
        with zipfile.ZipFile(wheel) as zipped:
            for member in zipped.namelist():
                if member.endswith('/'):
                    continue
                parts = Path(member).parts
                if '..' in parts or Path(member).is_absolute():
                    raise RuntimeError('Unsafe wheel path')
                destination = site / member
                if parts[0].endswith('.data'):
                    kind = parts[1]
                    target = {'purelib': site, 'platlib': site, 'data': python_root, 'scripts': python_root / 'Scripts', 'headers': python_root / 'Include'}.get(kind)
                    if target is None:
                        raise RuntimeError(f'Unknown wheel data scheme: {kind}')
                    destination = target.joinpath(*parts[2:])
                write_member(zipped, member, destination)
    # Use one consistent C++ runtime version, including Python's startup DLLs.
    for name in ['vcruntime140.dll', 'vcruntime140_1.dll']:
        shutil.copy2(python_root / 'Scripts' / name, python_root / name)
    with zipfile.ZipFile(cache / 'ffmpeg.zip') as zipped:
        for executable in ['ffmpeg.exe', 'ffprobe.exe']:
            member = next(name for name in zipped.namelist() if name.endswith('/bin/' + executable))
            write_member(zipped, member, payload / 'tools' / executable)
        for member in zipped.namelist():
            if member.endswith(('/LICENSE', '/LICENSE.txt', '/README.txt')):
                write_member(zipped, member, payload / 'licenses' / 'ffmpeg' / Path(member).name)
    shutil.copy2(cache / 'yt-dlp.exe', payload / 'tools' / 'yt-dlp.exe')
    run('npm.cmd' if os.name == 'nt' else 'npm', 'run', 'build')
    run('node', HERE / 'build-server.mjs', payload / 'app')
    shutil.copytree(ROOT / 'dist', payload / 'app' / 'dist')
    (payload / 'app' / 'scripts').mkdir()
    for name in ['transcribe.py', 'remove-bg.py']:
        shutil.copy2(ROOT / 'scripts' / name, payload / 'app' / 'scripts' / name)
    shutil.copy2(HERE / 'launcher.cjs', payload / 'launcher.cjs')
    models = payload / 'models'
    models.mkdir()
    for source, name, script, key in [(args.whisper_model, 'whisper-small', 'download-whisper.py', 'WHISPER_MODEL_DIR'), (args.bg_model, 'bg', 'download-bg-model.py', 'BG_MODEL_DIR')]:
        destination = models / name
        if source:
            shutil.copytree(source, destination, ignore=shutil.ignore_patterns('.cache', '__pycache__'))
        elif os.name == 'nt':
            env = {**os.environ, key: str(destination), 'OMP_NUM_THREADS': '2', 'PYTHONNOUSERSITE': '1', 'PYTHONPATH': ''}
            run(python_root / 'python.exe', ROOT / 'scripts' / script, env=env)
        else:
            raise RuntimeError('Linux cross builds require --whisper-model and --bg-model')
    for relative, checksum in LOCK['models'].items():
        verify(models / relative, checksum)
    version = subprocess.check_output(['git', 'rev-parse', '--short=12', 'HEAD'], cwd=ROOT, text=True).strip()
    (payload / 'VERSION.txt').write_text(version + '\n')
    shutil.copy2(HERE / 'THIRD-PARTY.md', payload / 'licenses' / 'THIRD-PARTY.md')
    shutil.copy2(HERE / 'assets.lock.json', payload / 'licenses' / 'assets.lock.json')
    for name, action in [('TALEDIT.exe', ''), ('CHIUDI-TALEDIT.exe', '--stop')]:
        defines = [f'/DOUTPUT={payload / name}', f'/DACTION={action}'] if os.name == 'nt' else [f'-DOUTPUT={payload / name}', f'-DACTION={action}']
        run(args.makensis, *defines, HERE / 'launcher.nsi')
    # Inventory includes every runtime dependency, AI model and application resource.
    inventory = {p.relative_to(payload).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(payload.rglob('*')) if p.is_file()}
    (out / 'payload.sha256.json').write_text(json.dumps(inventory, indent=2) + '\n')
    installer = out / 'TALEDIT-Setup.exe'
    definitions = {'OUTPUT': installer, 'PAYLOAD': payload, 'VERSION': version}
    run(args.makensis, *[(('/D' if os.name == 'nt' else '-D') + key + '=' + str(value)) for key, value in definitions.items()], HERE / 'installer.nsi')
    checksum = hashlib.sha256(installer.read_bytes()).hexdigest()
    (out / 'TALEDIT-Setup.exe.sha256').write_text(checksum + '  TALEDIT-Setup.exe\n')
    print(f'Installer: {installer} ({installer.stat().st_size / 1024**2:.1f} MiB); SHA256 {checksum}', flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('::error::' + str(error).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A'), flush=True)
        raise
