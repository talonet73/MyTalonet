TALEDIT offline Windows distribution

The installer bundles unmodified third-party runtimes and model data. Python wheel
metadata/licenses and runtime licenses are retained in the installed directories.
Exact binary versions, URLs and hashes are recorded in assets.lock.json.

- Node.js 22.16.0, MIT and bundled notices: runtime/LICENSE.
  Source: https://github.com/nodejs/node/tree/v22.16.0
- CPython 3.12.10, PSF: runtime/python/LICENSE.txt.
  Source: https://github.com/python/cpython/tree/v3.12.10
- Microsoft runtime DLLs, redistributed privately through msvc-runtime; license:
  runtime/python/Lib/site-packages/msvc_runtime-14.51.36231.dist-info/licenses/LICENSE.
- FFmpeg 7.1.1 Gyan essentials build, GPLv3, separate subprocess, unmodified.
  License/build configuration/source reference: licenses/ffmpeg.
  Upstream binaries: https://github.com/GyanD/codexffmpeg/releases/tag/7.1.1
  FFmpeg source revision: https://github.com/FFmpeg/FFmpeg/tree/db69d06eee
  Builder source and dependency recipes: https://github.com/m-ab-s/media-autobuild_suite
- yt-dlp 2025.03.31 Windows standalone distribution, upstream licenses and notices:
  https://github.com/yt-dlp/yt-dlp/blob/2025.03.31/THIRD_PARTY_LICENSES.txt
  Source: https://github.com/yt-dlp/yt-dlp/tree/2025.03.31
- faster-whisper (MIT), CTranslate2 (MIT), PyAV (BSD), ONNX Runtime (MIT),
  rembg (MIT), NumPy (BSD), SciPy (BSD), and other Python package notices are
  included with each installed .dist-info directory.
- Whisper small CTranslate2 weights (MIT): https://huggingface.co/Systran/faster-whisper-small
- U2NetP weights: https://github.com/xuebinqin/U-2-Net (Apache-2.0).

The browser remains the user's installed browser. No cloud API keys, private
configuration, imported media, user projects or authentication tokens are bundled.
