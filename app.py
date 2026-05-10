"""MeliMath - Flask app multi-profils.

Persistance dans /home/melimath/profiles.json (schema v2). Migration
automatique depuis l'ancien profile.json (schema v1) vers un profil
nomme "Melissa" en niveau CE2.

Authentification : PIN 4 chiffres hashe SHA-256 par profil.

Endpoints :
  GET  /api/profiles                    -> liste publique (nom, niveau, has_pin)
  POST /api/profiles                    -> creation {name, pin, level}
  GET  /api/profile/<name>?pin=XXXX     -> lecture authentifiee
  PUT  /api/profile/<name>              -> mise a jour {pin, state?, level?, new_pin?}
  GET  /api/health
"""
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from flask import Flask, abort, jsonify, render_template, request

app = Flask(__name__)

DATA_DIR = Path(os.environ.get("MELIMATH_DATA_DIR", "/home/melimath"))
LEGACY_PROFILE_FILE = DATA_DIR / "profile.json"
PROFILES_FILE = DATA_DIR / "profiles.json"
_write_lock = Lock()

VALID_LEVELS = {"CE1", "CE2", "CM1", "CM2"}
SCHEMA_VERSION = 2


def _ensure_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


def _check_pin(pin_provided: str, pin_hash: str | None) -> bool:
    """Compare le PIN fourni au hash stocke. None / vide cote stocke = pas de PIN requis."""
    if not pin_hash:
        return True
    if not isinstance(pin_provided, str):
        return False
    return _hash_pin(pin_provided) == pin_hash


def _load_profiles_file() -> dict:
    if PROFILES_FILE.exists():
        try:
            data = json.loads(PROFILES_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "profiles" in data:
                return data
        except (OSError, json.JSONDecodeError):
            pass
    return {"schema_version": SCHEMA_VERSION, "profiles": {}}


def _save_profiles_file(data: dict) -> None:
    _ensure_dir()
    tmp = PROFILES_FILE.with_suffix(".json.tmp")
    with _write_lock:
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(PROFILES_FILE)


def _migrate_legacy_if_needed() -> None:
    """Si profile.json existe et profiles.json absent, creer Melissa CE2 avec le state legacy."""
    if PROFILES_FILE.exists():
        return
    if not LEGACY_PROFILE_FILE.exists():
        # Premier demarrage absolu : pas de migration, on initialise vide.
        _save_profiles_file({"schema_version": SCHEMA_VERSION, "profiles": {}})
        return
    try:
        legacy_state = json.loads(LEGACY_PROFILE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        legacy_state = {}
    now = _now_iso()
    new = {
        "schema_version": SCHEMA_VERSION,
        "profiles": {
            "Melissa": {
                "pin_hash": None,  # pas de PIN initial : a definir au premier login
                "level": "CE2",
                "state": legacy_state if isinstance(legacy_state, dict) else {},
                "created_at": now,
                "updated_at": now,
            }
        },
    }
    _save_profiles_file(new)


def _public_summary(name: str, prof: dict) -> dict:
    return {
        "name": name,
        "level": prof.get("level", "CE2"),
        "has_pin": bool(prof.get("pin_hash")),
    }


# ---- Routes -----------------------------------------------------------------


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/profiles", methods=["GET"])
def list_profiles():
    data = _load_profiles_file()
    profiles = [_public_summary(n, p) for n, p in data["profiles"].items()]
    profiles.sort(key=lambda x: x["name"].lower())
    return jsonify({"profiles": profiles})


@app.route("/api/profiles", methods=["POST"])
def create_profile():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    pin = body.get("pin")
    level = body.get("level") or "CE2"

    if not name or len(name) > 30:
        return jsonify({"error": "name_invalid"}), 400
    if level not in VALID_LEVELS:
        return jsonify({"error": "level_invalid", "allowed": sorted(VALID_LEVELS)}), 400
    if not (isinstance(pin, str) and pin.isdigit() and len(pin) == 4):
        return jsonify({"error": "pin_invalid", "expected": "4 digits string"}), 400

    data = _load_profiles_file()
    if name in data["profiles"]:
        return jsonify({"error": "name_taken"}), 409

    now = _now_iso()
    data["profiles"][name] = {
        "pin_hash": _hash_pin(pin),
        "level": level,
        "state": {},
        "created_at": now,
        "updated_at": now,
    }
    _save_profiles_file(data)
    return jsonify({"ok": True, "profile": _public_summary(name, data["profiles"][name])}), 201


@app.route("/api/profile/<name>", methods=["GET"])
def get_profile(name):
    data = _load_profiles_file()
    if name not in data["profiles"]:
        return jsonify({"error": "not_found"}), 404
    prof = data["profiles"][name]
    pin = request.args.get("pin", "")
    if not _check_pin(pin, prof.get("pin_hash")):
        return jsonify({"error": "bad_pin"}), 401
    return jsonify({
        "name": name,
        "level": prof.get("level", "CE2"),
        "state": prof.get("state", {}),
        "updated_at": prof.get("updated_at"),
    })


@app.route("/api/profile/<name>", methods=["PUT"])
def update_profile(name):
    body = request.get_json(silent=True) or {}
    pin = body.get("pin", "")
    data = _load_profiles_file()
    if name not in data["profiles"]:
        return jsonify({"error": "not_found"}), 404
    prof = data["profiles"][name]
    if not _check_pin(pin, prof.get("pin_hash")):
        return jsonify({"error": "bad_pin"}), 401

    if "state" in body and isinstance(body["state"], dict):
        prof["state"] = body["state"]
    if "level" in body:
        new_level = body["level"]
        if new_level not in VALID_LEVELS:
            return jsonify({"error": "level_invalid", "allowed": sorted(VALID_LEVELS)}), 400
        prof["level"] = new_level
    if "new_pin" in body:
        np = body["new_pin"]
        if not (isinstance(np, str) and np.isdigit() and len(np) == 4):
            return jsonify({"error": "new_pin_invalid"}), 400
        prof["pin_hash"] = _hash_pin(np)

    prof["updated_at"] = _now_iso()
    _save_profiles_file(data)
    return jsonify({"ok": True, "profile": _public_summary(name, prof)})


@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "profilesPath": str(PROFILES_FILE),
        "schemaVersion": SCHEMA_VERSION,
    })


# Au demarrage : tenter la migration si pas encore fait
_migrate_legacy_if_needed()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
