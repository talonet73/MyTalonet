"""Download official SYSTRAN CTranslate2 weights through the Hugging Face client."""
import os
from faster_whisper import WhisperModel
from faster_whisper.utils import download_model
folder = os.environ.get('WHISPER_MODEL_DIR', '/workspace/.cache/taledit/whisper-small')
# Set WHISPER_MODEL_REVISION to pin a particular official model revision.
revision = os.environ.get('WHISPER_MODEL_REVISION', 'main')
path = download_model('small', output_dir=folder, revision=revision)
WhisperModel(path, device='cpu', compute_type='int8', cpu_threads=4, local_files_only=True)
print('Whisper small multilingual ready:', path)
