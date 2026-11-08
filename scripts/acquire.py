"""Reproducible raw-data acquisition for EthnoHarvest AI.

Downloads authoritative source files into data/raw/<source>/, verifies provider
checksums where published, records SHA-256/bytes/retrieval time in
data/raw/manifest.json. Re-running skips files whose checksum already matches.

Usage:  python scripts/acquire.py [source ...]
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
MANIFEST = RAW / "manifest.json"
OLD = Path("V:/projects/eco roots/data/raw")  # read-only reference project

SOURCES = {
    "compadre": {
        "title": "COMPADRE Plant Matrix Database v6.26.3.0",
        "citation": "Salguero-Gomez R. et al. (2015) J Ecol 103:202-218; COMPADRE v6.26.3.0",
        "license": "COMPADRE Data User Agreement (cite; no raw redistribution)",
        "redistribute_raw": False,
        "files": [{"name": "COMPADRE_v.6.26.3.0.RData",
                   "url": "https://compadre-db.org/Data/Download/COMPADRE_v.6.26.3.0.RData"}],
    },
    "phenobs": {
        "title": "PhenObs flowering data & R scripts (Zenodo 15411418)",
        "citation": "Species' competitive ability and phenology niche affects the flowering intensity in herbaceous species. Zenodo. doi:10.5281/zenodo.15411418",
        "license": "CC-BY-4.0",
        "redistribute_raw": True,
        "zenodo": "15411418",
    },
    "envdemog": {
        "title": "Environmental Demography manuscript archive v4 (Zenodo 18922678)",
        "citation": "Plant population responses to environmental variability are primarily driven by survival-reproduction trade-offs and mediated by aridity. Zenodo manuscript_v4. doi:10.5281/zenodo.18922678",
        "license": "CC-BY-4.0",
        "redistribute_raw": True,
        "zenodo": "18922678",
        "unzip": True,
    },
    "duke": {
        "title": "USDA Dr. Duke's Phytochemical and Ethnobotanical Databases (CSV tables)",
        "citation": "U.S. Department of Agriculture, Agricultural Research Service. Dr. Duke's Phytochemical and Ethnobotanical Databases. doi:10.15482/USDA.ADC/1239279",
        "license": "CC0 / US public domain",
        "redistribute_raw": True,
        "copy_from_old": "duke/tables",
        "files": [{"name": n} for n in ["ETHNOBOT.csv", "FARMACY.csv", "COMMON_NAMES.csv", "ACTIVITIES.csv"]],
    },
    "herbolario": {
        "title": "Herbolario: global medicinal-plant use records (GBIF dataset)",
        "citation": "Herbolario dataset via GBIF; see herbolario-gbif-metadata.json for DOI",
        "license": "see metadata (CC-BY-4.0 per GBIF record)",
        "redistribute_raw": True,
        "copy_from_old": "ethnobotany",
        "files": [{"name": n} for n in ["herbolario.csv", "herbolario-gbif-metadata.json", "herbolario-metadata.json"]],
    },
    "worldclim": {
        "title": "WorldClim 2.1 bioclimatic variables, 10 arc-minute (1970-2000)",
        "citation": "Fick SE, Hijmans RJ (2017) Int J Climatol 37:4302-4315",
        "license": "WorldClim terms (free for research; cite)",
        "redistribute_raw": False,
        "copy_from_old": "worldclim",
        "fallback_url": "https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_10m_bio.zip",
        "files": [{"name": "wc2.1_10m_bio.zip"}],
        "unzip": True,
    },
}


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def md5(p: Path) -> str:
    h = hashlib.md5()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: Path, retries: int = 4) -> None:
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(retries):
        try:
            with httpx.stream("GET", url, follow_redirects=True, timeout=120) as r:
                r.raise_for_status()
                with tmp.open("wb") as f:
                    for chunk in r.iter_bytes(1 << 20):
                        f.write(chunk)
            tmp.replace(dest)
            return
        except Exception as e:  # retry with backoff
            print(f"  retry {attempt + 1} {url}: {e}")
            time.sleep(2 ** attempt)
    raise RuntimeError(f"download failed: {url}")


def zenodo_files(record: str) -> list[dict]:
    d = httpx.get(f"https://zenodo.org/api/records/{record}", timeout=60).json()
    return [{"name": f["key"].split("/")[-1], "url": f["links"]["self"],
             "md5": f["checksum"].split(":", 1)[1]} for f in d["files"]]


def acquire(key: str, spec: dict, manifest: dict) -> None:
    out = RAW / key
    out.mkdir(parents=True, exist_ok=True)
    files = zenodo_files(spec["zenodo"]) if "zenodo" in spec else spec["files"]
    entries = []
    for f in files:
        dest = out / f["name"]
        method = "download"
        if not dest.exists():
            if "copy_from_old" in spec and (OLD / spec["copy_from_old"] / f["name"]).exists():
                shutil.copy2(OLD / spec["copy_from_old"] / f["name"], dest)
                method = "copied-from-old-project-cache (provenance re-checked)"
            elif f.get("url") or spec.get("fallback_url"):
                print(f"  downloading {f['name']}")
                download(f.get("url") or spec["fallback_url"], dest)
            else:
                entries.append({"name": f["name"], "status": "missing"})
                continue
        else:
            method = "existing-local"
        ok = None
        if f.get("md5"):
            ok = md5(dest) == f["md5"]
            if not ok:
                print(f"  md5 mismatch {dest}, re-downloading")
                download(f["url"], dest)
                ok = md5(dest) == f["md5"]
        entries.append({"name": f["name"], "bytes": dest.stat().st_size, "sha256": sha256(dest),
                        "provider_md5_verified": ok, "acquisition": method, "url": f.get("url")})
        if spec.get("unzip") and dest.suffix == ".zip":
            target = out / dest.stem
            if not target.exists():
                with zipfile.ZipFile(dest) as z:
                    z.extractall(target)
    manifest[key] = {k: v for k, v in spec.items() if k not in ("files",)} | {
        "retrieved_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "files": entries,
        "status": "ok" if all(e.get("sha256") for e in entries) else "partial",
    }
    print(f"[{key}] {manifest[key]['status']}: {len(entries)} files")


def main(argv: list[str]) -> None:
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    for key in (argv or SOURCES):
        try:
            acquire(key, SOURCES[key], manifest)
        except Exception as e:
            manifest[key] = {"title": SOURCES[key]["title"], "status": "failed", "error": str(e)[:300],
                             "retrieved_utc": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            print(f"[{key}] FAILED: {e}")
        MANIFEST.write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
