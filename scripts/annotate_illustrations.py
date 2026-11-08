"""Pre-bake AI-annotated illustrations for the curated species (hybrid: Gemini draws markers only; text comes from our data).

Each output must be looked at by a person before it is marked checked:
  .venv/Scripts/python scripts/annotate_illustrations.py generate [species ...]   # writes <slug>.png, <slug>-orig.jpg, index.json
  .venv/Scripts/python scripts/annotate_illustrations.py check <species> <visible markers, e.g. 1,2> [note]  # after looking
  .venv/Scripts/python scripts/annotate_illustrations.py reject <species> <reason>  # drops it from the app
The API serves only entries with checked=true from the curated tier; unchecked ones stay out of the app.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.ethnoharvest import illustrations as il, media, providers  # noqa: E402

INDEX = il.CURATED / "index.json"


def _load() -> dict:
    return json.loads(INDEX.read_text(encoding="utf-8")) if INDEX.exists() else {}


def _save(ix: dict) -> None:
    INDEX.write_text(json.dumps(ix, indent=1, ensure_ascii=False), encoding="utf-8")


def generate(names: list[str]) -> None:
    il.CURATED.mkdir(parents=True, exist_ok=True)
    ix = _load()
    names = names or [k for k, v in media.curated().get("species", {}).items() if v.get("plate")]
    for sp in names:
        src = il._source_image(sp)
        if not src:
            print(f"{sp}: no source image")
            continue
        f = il.facts(sp)
        t0 = time.time()
        try:
            out = providers.gemini_image(il.prompt(sp, f["parts"]), src["bytes"], src["mime"])
        except providers.ProviderError as e:
            print(f"{sp}: unavailable ({e})")
            continue
        slug = il._slug(sp)
        ext = ".png" if out["mime"] == "image/png" else ".jpg"
        for old in il.CURATED.glob(f"{slug}.*"):
            old.unlink()
        (il.CURATED / f"{slug}{ext}").write_bytes(out["image"])
        (il.CURATED / f"{slug}-orig.jpg").write_bytes(src["bytes"])
        ix[sp] = {"id": slug, "orig": f"{slug}-orig", "species": sp, "model": out["model"], "source": src["source"],
                  "generated": time.strftime("%Y-%m-%d", time.gmtime()), "markers": [p["n"] for p in f["parts"]],
                  "checked": False, "check_note": None}
        _save(ix)
        print(f"{sp}: ok {out['model']} {time.time() - t0:.0f}s -> {slug}{ext}")


def recolor(names: list[str]) -> None:
    """Repaint the existing markers yellow (better contrast on foliage) without moving them. The result goes back to
    unchecked until a person compares it with the previous version."""
    ix = _load()
    for sp in names or list(ix):
        e = ix.get(sp)
        if not e:
            print(f"{sp}: not in index")
            continue
        cur = next((p for p in il.CURATED.glob(f"{e['id']}.*") if p.suffix in (".png", ".jpg")), None)
        if cur is None:
            print(f"{sp}: no image")
            continue
        mime = "image/png" if cur.suffix == ".png" else "image/jpeg"
        try:
            out = providers.gemini_image(il.RECOLOR_PROMPT, cur.read_bytes(), mime)
        except providers.ProviderError as err:
            print(f"{sp}: unavailable ({err})")
            continue
        cur.unlink()
        ext = ".png" if out["mime"] == "image/png" else ".jpg"
        (il.CURATED / f"{e['id']}{ext}").write_bytes(out["image"])
        e.update(marker_colour="yellow", recoloured=time.strftime("%Y-%m-%d", time.gmtime()), recolour_model=out["model"],
                 checked=False, check_note=f"recoloured; previous check: {e.get('check_note') or 'ok'}")
        _save(ix)
        print(f"{sp}: recoloured -> {e['id']}{ext}")


def mark(sp: str, checked: bool, note: str, visible: list[int] | None = None) -> None:
    ix = _load()
    ix[sp]["checked"], ix[sp]["check_note"] = checked, note or None
    if visible is not None:
        ix[sp]["visible"] = visible  # markers actually drawn; the legend says "not visible in this picture" for the rest
    _save(ix)
    print(f"{sp}: checked={checked}")


if __name__ == "__main__":
    cmd, rest = sys.argv[1], sys.argv[2:]
    if cmd == "generate":
        generate(rest)
    elif cmd == "recolor":
        recolor(rest)
    elif cmd == "check":
        mark(rest[0], True, " ".join(rest[2:]), [int(x) for x in rest[1].split(",") if x])
    elif cmd == "reject":
        mark(rest[0], False, " ".join(rest[1:]))
