"""Inventory the user-supplied plant GLB models and publish normalised copies for the 3D studio.

Reads PLANT_GLB_DIRECTORY (default ./Plants) plus derived conversions in data/derived/plants/.
Never modifies originals. Writes:
  frontend/public/plants/<slug>.glb           copies served to the browser
  frontend/src/data/plant-assets.generated.json   inventory (bounds, counts, licence, errors, archetype)

Usage: .venv/Scripts/python scripts/plant_assets.py
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path

import numpy as np
from pygltflib import GLTF2

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(os.environ.get("PLANT_GLB_DIRECTORY", ROOT / "Plants"))
DERIVED = ROOT / "data" / "derived" / "plants"
NEW_MODELS = ROOT / "data" / "derived" / "plants_new"  # web copies of "Plants New/", built by scripts/build_plant_models.py
NEW_LICENCE = {"attribution": "AI-generated 3D model supplied by the project author. An illustration, not a botanical reconstruction.",
               "licence": "Project asset (AI-generated)", "licence_url": None, "author": "EthnoHarvest project", "source_url": None}
OUT_DIR = ROOT / "frontend" / "public" / "plants"
OUT_JSON = ROOT / "frontend" / "src" / "data" / "plant-assets.generated.json"

# filename keyword -> (slug base, archetype tags). Archetypes are visual stand-ins, not species identities.
ARCHETYPE_RULES = [
    ("aloe", "aloe", ["succulent", "rosette"]),
    ("big leaf", "big-leaf-plant", ["broadleaf-herb", "broadleaf-tree"]),
    ("bush with flowers", "flowering-bush", ["bush", "shrub", "flowering-herb"]),
    ("dead tree", "dry-tree", ["dry-woody-tree", "broadleaf-tree"]),
    ("flower group", "flower-group", ["flowering-herb"]),
    ("flower single", "flower-single", ["flowering-herb"]),
    ("flowers", "flowers", ["flowering-herb", "herb"]),
    ("palm", "palm", ["palm"]),
    ("fern", "fern", ["fern", "herb"]),
    ("small plant", "small-plant", ["herb", "rosette", "tuft"]),
    ("plant by", "plant", ["herb", "tuft"]),
    ("vines", "vines", ["vine"]),
]
NORM_DIV = {5120: 127, 5121: 255, 5122: 32767, 5123: 65535}
POT_HINT = re.compile(r"\b(pot|vase|planter|stand|base|ground)\b", re.I)


def _licences() -> dict[str, dict]:
    """Parse Plants/license.txt lines like 'Name by Author [CC-BY] (url) via Poly Pizza (https://poly.pizza/m/ID)'."""
    f = SRC / "license.txt"
    out: dict[str, dict] = {}
    vf = ROOT / "data" / "licences" / "poly_pizza_verified.json"
    verified = json.loads(vf.read_text(encoding="utf-8")) if vf.exists() else {}
    if not f.exists():
        return out
    for line in f.read_text(encoding="utf-8").splitlines():
        m = re.search(r"poly\.pizza/m/([\w-]+)", line)
        if not m:
            continue
        lic = re.search(r"\[(CC[^\]]*)\]", line)
        author = re.search(r" by (.+?)(?: \[| \(|$)", line)
        v = verified.get(m.group(1), {})
        out[m.group(1)] = {
            "attribution": line.strip(),
            # licence as stated on the model's own page (data/licences/poly_pizza_verified.json); never inferred from the author
            "licence": v.get("licence") or (lic.group(1) if lic else "licence not stated; verify on source page"),
            "licence_url": v.get("licence_url") or ("https://creativecommons.org/licenses/by/3.0/" if lic else None),
            "licence_verified": v.get("verified_utc"),
            "author": v.get("author") or (author.group(1).strip() if author else None),
            "source_url": f"https://poly.pizza/m/{m.group(1)}",
        }
    return out


def _node_matrix(n) -> np.ndarray:
    if n.matrix:
        return np.array(n.matrix, dtype=float).reshape(4, 4).T
    t = np.eye(4)
    if n.translation:
        t[:3, 3] = n.translation
    r = np.eye(4)
    if n.rotation:
        x, y, z, w = n.rotation
        r[:3, :3] = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    s = np.eye(4)
    if n.scale:
        s[0, 0], s[1, 1], s[2, 2] = n.scale
    return t @ r @ s


def inspect(path: Path) -> dict:
    g = GLTF2().load(str(path))
    tris = 0
    lo, hi = np.full(3, np.inf), np.full(3, -np.inf)
    names = []

    def visit(ni, parent):
        nonlocal tris, lo, hi
        n = g.nodes[ni]
        m = parent @ _node_matrix(n)
        if n.name:
            names.append(n.name)
        if n.mesh is not None:
            mesh = g.meshes[n.mesh]
            if mesh.name:
                names.append(mesh.name)
            for p in mesh.primitives:
                acc = g.accessors[p.attributes.POSITION]
                if acc.min and acc.max:
                    # quantized (KHR_mesh_quantization) positions are normalised integers
                    q = NORM_DIV.get(acc.componentType, 1) if acc.normalized else 1
                    amin, amax = [v / q for v in acc.min], [v / q for v in acc.max]
                    corners = np.array([[x, y, z, 1] for x in (amin[0], amax[0])
                                        for y in (amin[1], amax[1]) for z in (amin[2], amax[2])])
                    w = (m @ corners.T).T[:, :3]
                    lo, hi = np.minimum(lo, w.min(0)), np.maximum(hi, w.max(0))
                if p.indices is not None:
                    tris += g.accessors[p.indices].count // 3
                else:
                    tris += acc.count // 3
        for c in n.children or []:
            visit(c, m)

    scene = g.scenes[g.scene or 0]
    for ni in scene.nodes:
        visit(ni, np.eye(4))
    size = (hi - lo) if np.isfinite(lo).all() else np.zeros(3)
    return {
        "meshes": len(g.meshes), "materials": len(g.materials), "animations": len(g.animations or []),
        "triangles": int(tris), "bounds_min": [round(float(v), 4) for v in lo] if np.isfinite(lo).all() else None,
        "bounds_max": [round(float(v), 4) for v in hi] if np.isfinite(hi).all() else None,
        "size": [round(float(v), 4) for v in size], "height": round(float(size[1]), 4),
        "origin_at_base": bool(np.isfinite(lo).all() and abs(lo[1]) < 0.05 * max(size[1], 1e-6)),
        "pot_like_parts": sorted({n for n in names if POT_HINT.search(n)}),
    }


def main() -> int:
    lic = _licences()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    sources = sorted(SRC.glob("**/*.glb")) + sorted(SRC.glob("**/*.gltf")) + sorted(DERIVED.glob("*.glb"))
    used, assets = set(), []
    for f in sources:
        name = f.stem
        low = name.lower()
        base, tags = next(((b, t) for k, b, t in ARCHETYPE_RULES if k in low), ("plant-generic", ["unknown"]))
        slug, i = base, 2
        while slug in used:
            slug, i = f"{base}-{i}", i + 1
        used.add(slug)
        pid = re.search(r" - ([\w-]+)$", name)
        derived = f.parent == DERIVED
        rec = {"id": slug, "file": f"plants/{slug}.glb", "label": re.sub(r" - [\w-]+$", "", name),
               "source_file": f.name, "derived_from": "Flower Group zip (FBX converted with FBX2glTF 0.9.7)" if derived else None,
               "bytes": f.stat().st_size, "sha256": hashlib.sha256(f.read_bytes()).hexdigest()[:16],
               "archetypes": tags, "licence": lic.get(pid.group(1)) if pid else (lic.get("hfPzQAedOe") if derived else None)}
        try:
            rec.update(inspect(f), status="ok")
            shutil.copyfile(f, OUT_DIR / f"{slug}.glb")
        except Exception as e:  # a bad file is isolated, never fatal
            rec.update(status="error", error=f"{type(e).__name__}: {e}"[:200])
        assets.append(rec)
    manifest = NEW_MODELS / "manifest.json"
    for m in json.loads(manifest.read_text(encoding="utf-8"))["models"] if manifest.exists() else []:
        f = NEW_MODELS / f"{m['id']}.glb"
        rec = {"id": m["id"], "file": f"plants/{m['id']}.glb", "label": m["label"], "source_file": m["source_file"],
               "derived_from": "simplified, normals added, 1024 px texture, meshopt (scripts/build_plant_models.py)",
               "bytes": f.stat().st_size, "sha256": hashlib.sha256(f.read_bytes()).hexdigest()[:16], "archetypes": m["archetypes"],
               "licence": NEW_LICENCE, "kind": m["kind"], "species": m["species"],
               "display_height": m["display_height"], "footprint": m["footprint"]}
        try:
            rec.update(inspect(f), status="ok")
            shutil.copyfile(f, OUT_DIR / f"{m['id']}.glb")
        except Exception as e:  # noqa: BLE001
            rec.update(status="error", error=f"{type(e).__name__}: {e}"[:200])
        assets.append(rec)
    zips = [z.name for z in SRC.glob("*.zip")]
    OUT_JSON.write_text(json.dumps({"generated_by": "scripts/plant_assets.py", "source_dir": SRC.name,
                                    "archives_seen": zips, "assets": assets}, indent=1), encoding="utf-8")
    ok = sum(a["status"] == "ok" for a in assets)
    print(f"{ok}/{len(assets)} models ok -> {OUT_JSON.relative_to(ROOT)}")
    for a in assets:
        print(f"  {a['id']:<18} {a['status']:<5} h={a.get('height')} tris={a.get('triangles')} {a['archetypes']}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
