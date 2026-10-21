"""Real local segmentation, retaining the prominent central foreground component."""
import hashlib
import json
import os
import subprocess
import sys
import signal
from pathlib import Path

os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ['U2NET_HOME'] = os.environ.get('BG_MODEL_DIR', '/workspace/.cache/taledit/rembg')

def main():
    from PIL import Image
    import numpy as np
    from scipy import ndimage
    from rembg import new_session, remove
    data = json.load(sys.stdin)
    model = Path(os.environ['U2NET_HOME']) / 'models' / 'u2netp' / 'u2netp.onnx'
    if not model.is_file() or hashlib.md5(model.read_bytes()).hexdigest() != '8e83ca70e441ab06c318d82300c84806':
        raise RuntimeError('Modello BG Remover mancante o non valido. Esegui la preparazione.')
    session = new_session('u2netp', providers=['CPUExecutionProvider'])
    previous = None
    foreground_frames = 0

    def process(image):
        nonlocal previous, foreground_frames
        rgba = image.convert('RGBA')
        mask = np.asarray(remove(rgba.convert('RGB'), session=session, only_mask=True)).copy()
        labels, count = ndimage.label(mask > 100)
        if count:
            sizes = np.bincount(labels.ravel()); sizes[0] = 0
            candidates = np.flatnonzero(sizes > max(8, mask.size * .001))
            if len(candidates):
                centers = ndimage.center_of_mass(mask, labels, candidates)
                anchor = previous if previous else (image.height/2, image.width/2)
                scores = [sizes[c] / (1 + 8*((y-anchor[0])**2/image.height**2 + (x-anchor[1])**2/image.width**2)) for c,(y,x) in zip(candidates,centers)]
                chosen = int(np.argmax(scores)); previous = centers[chosen]
                keep = ndimage.binary_dilation(labels == candidates[chosen], iterations=max(2, int(min(image.size)/100)))
                mask[~keep] = 0
                foreground_frames += 1
            else:
                mask[:] = 0
        else:
            mask[:] = 0
        original_alpha = np.asarray(rgba.getchannel('A'), dtype=np.uint16)
        rgba.putalpha(Image.fromarray((mask.astype(np.uint16)*original_alpha//255).astype('uint8')))
        return rgba

    if data['type'] == 'image':
        with Image.open(data['input']) as image:
            if image.width*image.height > 33_177_600:
                raise RuntimeError('Immagine troppo grande: massimo 33 megapixel.')
            process(image).save(data['output'], 'PNG')
        if not foreground_frames:
            raise RuntimeError('Nessun soggetto riconoscibile. Prova una scena più chiara.')
        print(json.dumps({'progress': 100}), flush=True)
        return

    width, height = data['width'], data['height']
    size = width*height*4
    decoder = subprocess.Popen(['ffmpeg','-v','error','-ss',str(data['offset']),'-i',data['input'],'-t',str(data['duration']),'-vf',f'fps=25,pad={width}:{height}:0:0','-an','-f','rawvideo','-pix_fmt','rgba','pipe:1'], stdout=subprocess.PIPE)
    encoder = subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgba','-s',f'{width}x{height}','-r','25','-i','pipe:0','-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf','18','-auto-alt-ref','0','-threads','2',data['output']], stdin=subprocess.PIPE)
    frames = 0
    try:
        while True:
            block = decoder.stdout.read(size)
            if not block:
                break
            while len(block) < size:
                extra = decoder.stdout.read(size-len(block))
                if not extra:
                    raise RuntimeError('Fotogramma video incompleto.')
                block += extra
            image = Image.frombytes('RGBA',(width,height),block)
            encoder.stdin.write(process(image).tobytes())
            frames += 1
            if frames % 5 == 0:
                print(json.dumps({'progress': min(95, round(frames/(data['duration']*25)*95))}), flush=True)
        encoder.stdin.close()
        if decoder.wait() or encoder.wait() or not frames:
            raise RuntimeError('Elaborazione video non riuscita.')
        if not foreground_frames:
            raise RuntimeError('Nessun soggetto riconoscibile. Prova una scena più chiara.')
    finally:
        for child in (decoder,encoder):
            if child.poll() is None:
                child.kill()
            child.wait()
    print(json.dumps({'progress': 100}), flush=True)

if __name__ == '__main__':
    def stop(_signum, _frame):
        raise RuntimeError('Elaborazione annullata.')
    signal.signal(signal.SIGTERM, stop)
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
