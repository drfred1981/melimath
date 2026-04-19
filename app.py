"""MeliMath - Flask app.

En plus de servir la page principale, expose une API de profil qui persiste
les preferences, les exercices realises, les resultats et les recompenses
dans un fichier JSON cote serveur. Le chemin peut etre configure via la
variable d'environnement MELIMATH_DATA_DIR (par defaut /home/melimath).
"""
import json
import os
from pathlib import Path
from threading import Lock

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

DATA_DIR = Path(os.environ.get("MELIMATH_DATA_DIR", "/home/melimath"))
PROFILE_FILE = DATA_DIR / "profile.json"
_write_lock = Lock()


def _ensure_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_profile() -> dict:
    if not PROFILE_FILE.exists():
        return {}
    try:
        return json.loads(PROFILE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _save_profile(data: dict) -> None:
    _ensure_dir()
    tmp = PROFILE_FILE.with_suffix(".json.tmp")
    with _write_lock:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(PROFILE_FILE)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/profile", methods=["GET"])
def get_profile():
    return jsonify({"path": str(PROFILE_FILE), "data": _load_profile()})


@app.route("/api/profile", methods=["POST"])
def put_profile():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "JSON object expected"}), 400
    _save_profile(payload)
    return jsonify({"path": str(PROFILE_FILE), "ok": True})


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "profilePath": str(PROFILE_FILE)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
