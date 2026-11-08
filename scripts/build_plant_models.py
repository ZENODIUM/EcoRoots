"""Build web copies of the AI-generated plant models in "Plants New/" (species models + Generic/).

The originals are never modified. Each model is:
  1. simplified with glTF-Transform (meshoptimizer) to roughly half its triangles,
  2. given smooth vertex normals (the source files have none, which renders faceted),
  3. made non-metallic (the source material is metallicFactor 1, which renders black without an environment map),
  4. given a 1024 px JPEG texture instead of the 2048 px PNG,
  5. compressed with EXT_meshopt_compression (decoded in the browser by drei's useGLTF).

Writes data/derived/plants_new/<slug>.glb and manifest.json, which scripts/plant_assets.py publishes.
Usage: .venv/Scripts/python scripts/build_plant_models.py   (needs Node; fetches @gltf-transform/cli via npx)
"""
from __future__ import annotations

import io
import json
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from pygltflib import GLTF2, Accessor, BufferView

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "Plants New"
OUT = ROOT / "data" / "derived" / "plants_new"
CLI = ["npx.cmd" if sys.platform == "win32" else "npx", "-y", "@gltf-transform/cli@4.1.1"]
TEXTURE_PX = 1024

# source stem -> (slug, species it depicts, display height, footprint, archetype tags)
SPECIES = {
    "American Ginseng": ("ginseng", ["Panax quinquefolius"], 0.75, 0.7, ["herb", "understorey-herb"]),
    "Colchicum autumnale": ("colchicum", ["Colchicum autumnale"], 0.6, 0.5, ["herb", "bulb", "flowering-herb"]),
    "Echinacea": ("echinacea", ["Echinacea angustifolia", "Echinacea purpurea", "Echinacea pallida"], 1.0, 0.6, ["flowering-herb"]),
    "Frankincense": ("frankincense", ["Boswellia papyrifera"], 2.3, 2.0, ["dry-woody-tree"]),
    "Indian Gooseberry": ("amla", ["Phyllanthus emblica"], 2.6, 2.2, ["broadleaf-tree"]),
    "Jatamansi": ("jatamansi", ["Nardostachys jatamansi"], 0.6, 0.8, ["herb", "rosette", "alpine-herb"]),
    "Khaya": ("khaya", ["Khaya senegalensis"], 2.7, 2.3, ["broadleaf-tree"]),
    "Mountain Arnica": ("arnica", ["Arnica montana"], 0.75, 0.6, ["flowering-herb", "rosette"]),
    "Primula": ("primula", ["Primula veris"], 0.55, 0.55, ["flowering-herb", "rosette"]),
    "Prunus": ("prunus", ["Prunus africana"], 2.7, 2.3, ["broadleaf-tree"]),
    "Sabal": ("sabal", ["Sabal yapa"], 2.5, 2.3, ["palm"]),
}
GENERIC = {
    "Cactus": ("g-cactus", 1.0, 0.6, ["succulent", "cactus"]),
    "Conifer": ("g-conifer", 2.8, 1.7, ["conifer", "tree"]),
    "Flowering_Herb": ("g-flowering-herb", 0.85, 0.6, ["flowering-herb", "herb"]),
    "Low_Herb": ("g-low-herb", 0.5, 0.7, ["herb", "rosette"]),
    "Palm": ("g-palm", 2.5, 2.3, ["palm"]),
    "Shrub": ("g-shrub", 1.2, 1.2, ["shrub", "bush"]),
    "Tropical_broadleaf_tree": ("g-tropical-tree", 2.7, 2.3, ["broadleaf-tree", "tropical-tree"]),
    "Weedy_Herb": ("g-weedy-herb", 0.8, 0.6, ["herb", "annual"]),
    "temperate_broadleaf_tree": ("g-temperate-tree", 2.7, 2.3, ["broadleaf-tree", "temperate-tree"]),
}

COMPONENT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def _read(g: GLTF2, blob: bytes, ai: int) -> np.ndarray:
    a = g.accessors[ai]
    bv = g.bufferViews[a.bufferView]
    n = WIDTH[a.type]
    dt = np.dtype(COMPONENT[a.componentType]).newbyteorder("<")
    start = (bv.byteOffset or 0) + (a.byteOffset or 0)
    stride = bv.byteStride or dt.itemsize * n
    if stride == dt.itemsize * n:
        return np.frombuffer(blob, dt, a.count * n, start).reshape(a.count, n) if n > 1 else np.frombuffer(blob, dt, a.count, start)
    rows = [np.frombuffer(blob, dt, n, start + i * stride) for i in range(a.count)]
    return np.array(rows)


def _smooth_normals(pos: np.ndarray, idx: np.ndarray) -> np.ndarray:
    """Area-weighted normals, shared across UV seams by welding on position."""
    key = np.round(pos / 1e-5).astype(np.int64)
    _, weld = np.unique(key, axis=0, return_inverse=True)
    weld = weld.reshape(-1)
    tri = idx.reshape(-1, 3)
    fn = np.cross(pos[tri[:, 1]] - pos[tri[:, 0]], pos[tri[:, 2]] - pos[tri[:, 0]])
    acc = np.zeros((weld.max() + 1, 3))
    for c in range(3):
        np.add.at(acc, weld[tri[:, c]], fn)
    nrm = acc[weld]
    ln = np.linalg.norm(nrm, axis=1, keepdims=True)
    nrm = np.where(ln > 1e-12, nrm / np.maximum(ln, 1e-12), [0.0, 1.0, 0.0])
    return nrm.astype("<f4")


def fix(src: Path, dst: Path) -> dict:
    g = GLTF2().load(str(src))
    blob = g.binary_blob()
    chunks = [blob[(bv.byteOffset or 0):(bv.byteOffset or 0) + bv.byteLength] for bv in g.bufferViews]
    added_normals = 0
    for mesh in g.meshes:
        for p in mesh.primitives:
            if p.attributes.NORMAL is not None or p.indices is None:
                continue
            pos = _read(g, blob, p.attributes.POSITION).astype(np.float64)
            idx = _read(g, blob, p.indices).astype(np.int64)
            nrm = _smooth_normals(pos, idx)
            chunks.append(nrm.tobytes())
            g.bufferViews.append(BufferView(buffer=0, byteOffset=0, byteLength=len(chunks[-1]), target=34962))
            g.accessors.append(Accessor(bufferView=len(g.bufferViews) - 1, componentType=5126, count=len(nrm), type="VEC3",
                                        min=nrm.min(0).tolist(), max=nrm.max(0).tolist()))
            p.attributes.NORMAL = len(g.accessors) - 1
            added_normals += 1
    tex = []
    for im in g.images:
        if im.bufferView is None:
            continue
        pic = Image.open(io.BytesIO(chunks[im.bufferView]))
        orig = pic.size
        pic = pic.convert("RGB")
        if max(pic.size) > TEXTURE_PX:
            pic.thumbnail((TEXTURE_PX, TEXTURE_PX), Image.LANCZOS)
        out = io.BytesIO()
        pic.save(out, "JPEG", quality=86, optimize=True)
        chunks[im.bufferView] = out.getvalue()
        im.mimeType = "image/jpeg"
        tex.append({"from": list(orig), "to": list(pic.size)})
    for m in g.materials:
        pbr = m.pbrMetallicRoughness
        if pbr is not None and pbr.metallicRoughnessTexture is None:
            pbr.metallicFactor = 0.0
            pbr.roughnessFactor = 0.85
    # repack the binary chunk with 4-byte alignment
    data, off = bytearray(), 0
    for bv, c in zip(g.bufferViews, chunks):
        pad = (-len(data)) % 4
        data += b"\0" * pad
        bv.byteOffset = len(data)
        bv.byteLength = len(c)
        data += c
    g.buffers[0].byteLength = len(data)
    g.set_binary_blob(bytes(data))
    g.save_binary(str(dst))
    return {"normals_added": added_normals, "textures": tex}


def triangles(path: Path) -> int:
    g = GLTF2().load(str(path))
    return sum((g.accessors[p.indices].count if p.indices is not None else g.accessors[p.attributes.POSITION].count) // 3
               for m in g.meshes for p in m.primitives)


def cli(*args: str) -> None:
    r = subprocess.run([*CLI, *args], cwd=ROOT / "frontend", capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout)[-400:])


def build(src: Path, slug: str) -> dict:
    with tempfile.TemporaryDirectory() as td:
        a, b = Path(td) / "a.glb", Path(td) / "b.glb"
        cli("simplify", str(src), str(a), "--ratio", "0.5", "--error", "0.004")
        info = fix(a, b)
        info["triangles_web"] = triangles(b)
        out = OUT / f"{slug}.glb"
        cli("meshopt", str(b), str(out), "--level", "medium")
    info["triangles_source"] = triangles(src)
    info["bytes_source"] = src.stat().st_size
    info["bytes_web"] = out.stat().st_size
    return info


def main() -> int:
    if not SRC.exists():
        print(f"missing {SRC}")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [(SRC / f"{k}.glb", v[0], {"kind": "species", "species": v[1], "display_height": v[2], "footprint": v[3], "archetypes": v[4]})
            for k, v in SPECIES.items()]
    jobs += [(SRC / "Generic" / f"{k}.glb", v[0], {"kind": "generic", "species": [], "display_height": v[1], "footprint": v[2], "archetypes": v[3]})
             for k, v in GENERIC.items()]
    manifest = []
    for src, slug, meta in jobs:
        if not src.exists():
            print(f"  skip {src.name}: not found")
            continue
        try:
            info = build(src, slug)
            manifest.append({"id": slug, "source_file": f"Plants New/{src.relative_to(SRC).as_posix()}",
                             "label": src.stem.replace("_", " "), **meta, **info})
            print(f"  {slug:<18} {info['triangles_source']:>6} -> {info['triangles_web']:>6} tris  "
                  f"{info['bytes_source'] / 1e6:.1f} -> {info['bytes_web'] / 1e6:.2f} MB")
        except Exception as e:  # noqa: BLE001 - one bad file never stops the rest
            print(f"  {slug}: FAILED {type(e).__name__}: {e}")
    (OUT / "manifest.json").write_text(json.dumps({"generated_by": "scripts/build_plant_models.py", "models": manifest}, indent=1),
                                       encoding="utf-8")
    print(f"{len(manifest)} models -> {OUT.relative_to(ROOT)}")
    return 0 if manifest else 1


if __name__ == "__main__":
    sys.exit(main())
