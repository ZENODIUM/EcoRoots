"""Copy the hand-picked image candidates into data/curated/media/ with full provenance.

The picks below were made by looking at every contact sheet written by scripts/curate_candidates.py (one person, by eye;
not expert-reviewed). Each entry records what the picture shows, so the app never has to guess from a search query.
Images are re-encoded as JPEG (max 1400 px) which also strips embedded metadata.

Usage: .venv/Scripts/python scripts/curate_apply.py <candidates_dir>
  <candidates_dir> holds cand/part-*.json and cand2/species-*.json from curate_candidates.py
"""
from __future__ import annotations

import hashlib
import io
import json
import sys
import time
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.ethnoharvest import media  # noqa: E402
from scripts.curate_candidates import licence  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "curated" / "media"

# part file -> [(index, kind, caption, species shown or None)]
# kind: part (the harvested part itself), technique (harvest in progress), tool, impact (what harvest leaves behind),
#       processing (drying, sorting, selling), use (what the product becomes)
PART_PICKS = {
    "bark": [(1, "technique", "Peeling bark from a birch", None),
             (10, "technique", "Bark stripped in strips from a cinnamon tree", None),
             (19, "technique", "Cork bark being harvested from a cork oak", "Quercus suber"),
             (6, "impact", "Cork oak trunk after bark harvest", "Quercus suber"),
             (11, "impact", "Bark stripped from a black poplar", None)],
    "root": [(1, "part", "American ginseng root", "Panax quinquefolius"),
             (2, "part", "American ginseng root, second view", "Panax quinquefolius"),
             (0, "part", "Dried ginseng root", None),
             (8, "part", "Ginseng plant above ground", None),
             (14, "technique", "Echinacea root harvest on the prairie", None),
             (20, "tool", "Digging stick carried by a harvester", None),
             (21, "tool", "Digging sticks", None),
             (28, "tool", "Hori-hori digging knife", None),
             (29, "technique", "Hori-hori used among plants", None)],
    "resin": [(0, "part", "Frankincense plant (a related Boswellia), garden specimen", "Boswellia sacra"),
              (5, "part", "Boswellia resin tears, close up", None),
              (6, "part", "Boswellia resin, close up", None),
              (7, "processing", "Collected Boswellia resin", None),
              (8, "processing", "Boswellia resin sorted in a bowl", None)],
    "leaf": [(21, "part", "Sabal yapa, the thatch palm", "Sabal yapa"),
             (23, "technique", "Farm worker with a machete", None),
             (27, "tool", "Machete", None),
             (0, "use", "Palm-leaf thatching", None),
             (18, "use", "Hut thatched with palm leaves, about 1920", None)],
    "flower": [(1, "part", "Arnica montana, botanical plate", "Arnica montana"),
               (2, "part", "Arnica in full flower in a meadow", "Arnica montana"),
               (3, "part", "Arnica flower head", "Arnica montana"),
               (25, "part", "Autumn crocus in flower, botanical illustration", "Colchicum autumnale"),
               (6, "technique", "Picking a flower head by hand (chamomile)", None)],
    "fruit": [(3, "part", "Fruits of Phyllanthus emblica", "Phyllanthus emblica"),
              (6, "part", "Indian gooseberry (amla) fruits, close up", "Phyllanthus emblica"),
              (1, "part", "Flowers of Phyllanthus emblica (before fruit)", "Phyllanthus emblica"),
              (20, "technique", "Fruit harvesting with ladders and baskets, 1961", None),
              (19, "technique", "Palm fruit bunch harvest", None),
              (7, "processing", "Amla fruits for sale at a street market", "Phyllanthus emblica")],
    "whole": [(4, "technique", "Gathering wild herbs", None),
              (9, "processing", "Herbs hung on a drying rack", None),
              (6, "processing", "Leaves drying on a rack", None),
              (8, "processing", "Drying rosemary", None),
              (11, "processing", "Sprigs drying on a rack", None)],
}

# species -> photo index, annotation-source index (both in cand2/species-<slug>.json); ("part", file, idx) points elsewhere
SPECIES_PICKS = {
    "Nardostachys jatamansi": {"photo": 1, "plate": 1},
    "Panax quinquefolius": {"photo": 0, "plate": 17},
    "Echinacea angustifolia": {"photo": 5, "plate": 5},
    "Prunus africana": {"photo": 4, "plate": 1},
    "Khaya senegalensis": {"photo": 0, "plate": 15},
    "Boswellia papyrifera": {"photo": 1, "plate": 1},
    "Phyllanthus emblica": {"photo": 13, "plate": 13},
    "Colchicum autumnale": {"photo": 0, "plate": ("part", "flower", 25)},
    "Primula veris": {"photo": 0, "plate": 18},
    "Arnica montana": {"photo": 0, "plate": 12},
    "Sabal yapa": {"photo": 4, "plate": 11},
    "Garcinia lucida": {"photo": None, "plate": None},  # no species-specific open image found; other Garcinia were rejected
}
REVIEW = "picked by eye from open-licence search results; not expert-reviewed"


def _load(cdir: Path, rel: str) -> list[dict]:
    return json.loads((cdir / rel).read_text(encoding="utf-8"))


def _fetch(c: dict) -> bytes:
    """Prefer the larger rendition; fall back to the thumbnail. Re-encode to JPEG, which drops metadata."""
    urls = [c.get("full_url"), c.get("image_url")] if c.get("full_url") else [media._smaller(c["image_url"])]
    last = None
    for u in [u for u in urls if u]:
        try:
            data, _ = media._download(u)
            im = Image.open(io.BytesIO(data)).convert("RGB")
            im.thumbnail((1400, 1400))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=86, optimize=True)
            return buf.getvalue()
        except Exception as e:  # noqa: BLE001 - try the next rendition
            last = e
    raise RuntimeError(f"download failed ({type(last).__name__})")


def _record(c: dict, **extra) -> dict:
    url = c.get("full_url") or c["image_url"]
    rid = "cu-" + hashlib.sha256(url.encode()).hexdigest()[:16]
    lic = c.get("licence") or licence(c.get("licence_raw"))
    return {"id": rid, "title": c.get("title") or None, "creator": c.get("photographer") or "unknown", "licence": lic,
            "licence_url": c.get("licence_url") or media.normalise_licence(lic)[1], "landing": c.get("attribution_url"),
            "source": c["source"].replace("Openverse/", "Openverse · "), "found_with": c.get("query"), "review": REVIEW, **extra}


def _save(c: dict, rec: dict, files: Path) -> bool:
    p = files / f"{rec['id']}.jpg"
    if p.exists():
        return True
    try:
        p.write_bytes(_fetch(c))
        time.sleep(0.4)
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  skipped {rec['id']} ({rec['title'] or rec['creator']}): {e}")
        return False


def main(cdir: Path) -> None:
    files = OUT / "files"
    files.mkdir(parents=True, exist_ok=True)
    parts = []
    for organ, picks in PART_PICKS.items():
        cands = _load(cdir, f"cand/part-{organ}.json")
        for idx, kind, caption, shown in picks:
            c = cands[idx]
            rec = _record(c, organ=organ, kind=kind, caption=caption, species=shown)
            if _save(c, rec, files):
                parts.append(rec)
    species = {}
    for sp, pick in SPECIES_PICKS.items():
        slug = sp.lower().replace(" ", "-")
        entry = {}
        for role in ("photo", "plate"):
            ref = pick[role]
            if ref is None:
                entry[role] = None
                continue
            if isinstance(ref, tuple):
                c = _load(cdir, f"cand/part-{ref[1]}.json")[ref[2]]
            else:
                c = _load(cdir, f"cand2/species-{slug}.json")[ref]
            rec = _record(c, species=sp, role=role)
            entry[role] = rec if _save(c, rec, files) else None
        species[sp] = entry
    index = {"generated": time.strftime("%Y-%m-%d", time.gmtime()), "review": REVIEW,
             "note": "Openly licensed images (CC0, CC BY, CC BY-SA, public domain) chosen by eye. Credit is given beside every image.",
             "parts": parts, "species": species}
    (OUT / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(parts)} part images, {sum(1 for e in species.values() for v in e.values() if v)} species images -> {OUT}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
