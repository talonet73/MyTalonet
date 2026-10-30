"""Build-time only: download and inventory the multilingual offline model."""
import hashlib
import json
from pathlib import Path
from huggingface_hub import HfApi, snapshot_download

if __name__ == "__main__":
    target = Path(__file__).resolve().parent / "models" / "tiny"
    repo = "Systran/faster-whisper-tiny"
    revision = HfApi().model_info(repo).sha
    snapshot_download(repo_id=repo, revision=revision, local_dir=target,
                      allow_patterns=["model.bin", "config.json", "tokenizer.json", "vocabulary.*", "preprocessor_config.json"])
    files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in target.iterdir() if p.is_file()}
    if "model.bin" not in files or "tokenizer.json" not in files:
        raise RuntimeError("Modello incompleto")
    (target / "provenance.json").write_text(json.dumps({"repository": repo, "revision": revision, "sha256": files}, indent=2), encoding="utf-8")
