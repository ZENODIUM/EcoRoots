"""Gather open-licence image candidates for manual (visual) curation. Writes contact sheets; picks are made by a person.

For each pre-baked species: iNaturalist taxon photos, GBIF occurrence photos (CC0 / CC BY) and Openverse results from
Wikimedia Commons (botanical plates and photos). For each harvested part and method: Openverse searches.
Nothing here is published: the chosen candidates are copied into data/curated/ by scripts/curate_apply.py.

Usage: .venv/Scripts/python scripts/curate_candidates.py <out_dir> [species|parts|all]
"""
from __future__ import annotations

import io
import json
import re
import sys
import time
from pathlib import Path

import httpx
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.ethnoharvest import media, methods  # noqa: E402

SPECIES = ["Nardostachys jatamansi", "Panax quinquefolius", "Echinacea angustifolia", "Prunus africana", "Khaya senegalensis",
           "Boswellia papyrifera", "Phyllanthus emblica", "Colchicum autumnale", "Garcinia lucida", "Primula veris",
           "Arnica montana", "Sabal yapa"]
ILLUSTRATION_QUERIES = {
    "Nardostachys jatamansi": ["Nardostachys", "spikenard", "Valerianaceae botanical"],
    "Panax quinquefolius": ["Panax quinquefolius", "ginseng botanical illustration", "Panax"],
    "Echinacea angustifolia": ["Echinacea angustifolia", "Echinacea botanical", "Rudbeckia purpurea"],
    "Prunus africana": ["Prunus africana", "Pygeum"],
    "Khaya senegalensis": ["Khaya senegalensis", "Khaya", "Swietenia senegalensis"],
    "Boswellia papyrifera": ["Boswellia papyrifera", "Boswellia", "frankincense tree"],
    "Phyllanthus emblica": ["Phyllanthus emblica", "Emblica officinalis", "emblic myrobalan"],
    "Colchicum autumnale": ["Colchicum autumnale", "Colchicum botanical", "meadow saffron"],
    "Garcinia lucida": ["Garcinia lucida", "Garcinia", "Garcinia kola"],
    "Primula veris": ["Primula veris", "Primula officinalis", "cowslip botanical"],
    "Arnica montana": ["Arnica montana", "Arnica botanical", "Arnica"],
    "Sabal yapa": ["Sabal yapa", "Sabal palm", "Sabal"],
}
PART_QUERIES = {
    "root": ["ginseng root", "ginseng digging", "spikenard rhizome", "Echinacea root", "digging stick", "root digging tool"],
    "bark": ["Prunus africana bark", "bark harvesting", "bark stripping", "cinnamon bark peeling", "cork harvesting", "debarking spud"],
    "resin": ["frankincense tapping", "frankincense harvest", "Boswellia resin", "frankincense tears", "resin tapping"],
    "leaf": ["palm thatch", "palm leaf harvest", "palm frond cutting", "thatching palm leaves", "machete"],
    "flower": ["Arnica montana flower", "picking chamomile", "Primula veris flowers", "flower harvest basket", "Colchicum autumnale flower"],
    "fruit": ["amla fruit", "Phyllanthus emblica fruit", "fruit picking pole", "Indian gooseberry harvest", "fruit harvesting"],
    "whole": ["wild herb gathering", "herb drying rack", "harvesting herbs sickle", "medicinal plants drying"],
}
OV = "https://api.openverse.org/v1/images/"


def openverse(q: str, n: int = 10, source: str | None = None) -> list[dict]:
    params = {"q": q, "license": "cc0,by,by-sa,pdm", "page_size": n, "mature": "false"}
    if source:
        params["source"] = source
    for attempt in range(3):
        r = httpx.get(OV, params=params, headers=media.UA, timeout=25)
        if r.status_code == 429:
            time.sleep(20 * (attempt + 1))
            continue
        r.raise_for_status()
        break
    out = []
    for x in r.json().get("results", []):
        out.append({"source": f"Openverse/{x.get('source')}", "image_url": x.get("thumbnail"), "full_url": x.get("url"),
                    "title": (x.get("title") or "")[:140], "photographer": x.get("creator"),
                    "licence_raw": f"{x.get('license')} {x.get('license_version') or ''}".strip(), "licence_url": x.get("license_url"),
                    "attribution_url": x.get("foreign_landing_url"), "attribution": x.get("attribution"), "query": q,
                    "width": x.get("width"), "height": x.get("height")})
    time.sleep(3.2)  # anonymous Openverse limit: 20 requests per minute
    return out


def licence(raw: str | None) -> str | None:
    """Openly reusable licence label, or None (NC/ND/all-rights-reserved are dropped before anyone looks)."""
    r = (raw or "").strip().lower()
    if r and not r.startswith(("cc", "http", "pd")):
        r = "cc-" + r  # Openverse spells CC licences as "by-sa 4.0"
    if r.startswith("pdm"):
        r = "public domain"
    return media.normalise_licence(r)[0]


def dedupe(cands: list[dict]) -> list[dict]:
    seen, out = set(), []
    for c in cands:
        c["licence"] = licence(c.get("licence_raw"))
        if c.get("image_url") and c["image_url"] not in seen and c["licence"]:
            seen.add(c["image_url"])
            out.append(c)
    return out


def fetch(url: str) -> Image.Image | None:
    try:
        r = httpx.get(url, headers=media.UA, timeout=25, follow_redirects=True)
        r.raise_for_status()
        if len(r.content) > 6_000_000:
            return None
        return Image.open(io.BytesIO(r.content)).convert("RGB")
    except Exception:  # noqa: BLE001
        return None


def sheet(cands: list[dict], out: Path, title: str, tile: int = 230) -> None:
    cols = 6
    rows = max(1, (len(cands) + cols - 1) // cols)
    canvas = Image.new("RGB", (cols * tile, rows * (tile + 34) + 30), "white")
    d = ImageDraw.Draw(canvas)
    d.text((6, 6), title, fill="black")
    for i, c in enumerate(cands):
        x, y = (i % cols) * tile, 30 + (i // cols) * (tile + 34)
        im = c.get("_img")
        if im is not None:
            im = im.copy()
            im.thumbnail((tile - 8, tile - 8))
            canvas.paste(im, (x + 4, y + 4))
        d.rectangle([x, y, x + 28, y + 18], fill="black")
        d.text((x + 4, y + 3), str(i), fill="yellow")
        lab = f"{c['source'].split('/')[-1][:10]} {c.get('licence') or ''}"[:34]
        d.text((x + 4, y + tile + 2), lab, fill="black")
        d.text((x + 4, y + tile + 16), (c.get("title") or c.get("photographer") or "")[:34], fill="gray")
    canvas.save(out, quality=82)


def gather_species(out: Path) -> None:
    for sp in SPECIES:
        slug = re.sub(r"\W+", "-", sp.lower())
        cands = []
        for name, fn in (("inat", media._inat), ("gbif", media._gbif)):
            try:
                cands += fn(sp)
            except Exception as e:  # noqa: BLE001
                print(f"  {sp} {name}: {type(e).__name__}")
        for q in ILLUSTRATION_QUERIES.get(sp, [sp]):
            try:
                cands += openverse(q + " Biodiversity Heritage Library", 6, source="flickr")
                cands += openverse(q, 6, source="flickr")
            except Exception as e:  # noqa: BLE001
                print(f"  {sp} openverse '{q}': {type(e).__name__}")
        uniq = dedupe(cands)[:36]
        for c in uniq:
            c["_img"] = fetch(media._smaller(c["image_url"]) if c["source"] in ("iNaturalist", "GBIF") else c["image_url"])
        sheet(uniq, out / f"species-{slug}.jpg", sp)
        (out / f"species-{slug}.json").write_text(json.dumps([{k: v for k, v in c.items() if k != "_img"} for c in uniq], indent=1),
                                                  encoding="utf-8")
        print(f"{sp}: {len(uniq)} candidates")


def gather_parts(out: Path) -> None:
    for part, qs in PART_QUERIES.items():
        cands = []
        for q in qs:
            try:
                cands += openverse(q, 6)
            except Exception as e:  # noqa: BLE001
                print(f"  {part} '{q}': {type(e).__name__}")
        uniq = dedupe(cands)
        for c in uniq:
            c["_img"] = fetch(c["image_url"])
        sheet(uniq, out / f"part-{part}.jpg", f"{part}: " + " | ".join(qs))
        (out / f"part-{part}.json").write_text(json.dumps([{k: v for k, v in c.items() if k != "_img"} for c in uniq], indent=1),
                                               encoding="utf-8")
        print(f"{part}: {len(uniq)} candidates")


if __name__ == "__main__":
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    what = sys.argv[2] if len(sys.argv) > 2 else "all"
    if what in ("species", "all"):
        gather_species(out)
    if what in ("parts", "all"):
        gather_parts(out)
    _ = methods  # imported for parity with the app's licence handling
