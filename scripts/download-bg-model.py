"""Official rembg U2NetP model; keep upstream checksum and TLS verification."""
import hashlib
import os
from pathlib import Path
os.environ['U2NET_HOME'] = os.environ.get('BG_MODEL_DIR', '/workspace/.cache/taledit/rembg')
os.environ.setdefault('OMP_NUM_THREADS', '2')
from rembg import new_session

new_session('u2netp', providers=['CPUExecutionProvider'])
model = Path(os.environ['U2NET_HOME']) / 'models' / 'u2netp' / 'u2netp.onnx'
if hashlib.md5(model.read_bytes()).hexdigest() != '8e83ca70e441ab06c318d82300c84806':
    raise RuntimeError('Il modello BG Remover non corrisponde al checksum ufficiale.')
print('BG Remover pronto: rembg / U2NetP, CPU, modello verificato.')
