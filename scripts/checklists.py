"""Check every catalogue species against two global plant checklists and record native range.

  * WCVP: World Checklist of Vascular Plants (Royal Botanic Gardens, Kew), the data behind
    Plants of the World Online (POWO). Read from the bulk download extracted to ./wcvp/
    (wcvp_names.csv, wcvp_distribution.csv; https://sftp.kew.org/pub/data-repositories/WCVP/).
  * WFO: World Flora Online Plant List, name-matching REST + GraphQL APIs (no key). Raw answers
    cached per name under data/raw/wfo/.

Native range comes from WCVP distribution (TDWG WGSRPD level-3 "botanical countries"). Boundaries for
the globe are simplified from the TDWG level-3 GeoJSON (data/raw/wgsrpd/level3.geojson).

Writes data/clean/checklists.json and frontend/public/geo/wgsrpd_l3.json.
Run:  .venv/Scripts/python.exe scripts/checklists.py
"""
from __future__ import annotations

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
WCVP = ROOT / "wcvp"
CLEAN = ROOT / "data" / "clean"
WFO_CACHE = ROOT / "data" / "raw" / "wfo"
L3_SRC = ROOT / "data" / "raw" / "wgsrpd" / "level3.geojson"
L3_OUT = ROOT / "frontend" / "public" / "geo" / "wgsrpd_l3.json"
WFO_MATCH = "https://list.worldfloraonline.org/matching_rest.php"
WFO_GQL = "https://list.worldfloraonline.org/gql.php"


def binomial(s) -> str:
    p = str(s or "").split()
    return " ".join(p[:2]) if len(p) >= 2 else ""


# ---------- WCVP ----------
def wcvp(names: list[str]) -> dict[str, dict]:
    cols = ["plant_name_id", "ipni_id", "taxon_rank", "taxon_status", "family", "taxon_name", "taxon_authors",
            "accepted_plant_name_id", "powo_id", "lifeform_description", "climate_description", "geographic_area"]
    nm = pd.read_csv(WCVP / "wcvp_names.csv", sep="|", usecols=cols, dtype=str, keep_default_na=False)
    by_id = nm.set_index("plant_name_id")
    want = {n.lower() for n in names}
    hits = nm[nm.taxon_name.str.lower().isin(want) & (nm.taxon_rank == "Species")]
    rank = {"Accepted": 0, "Synonym": 1}
    hits = hits.assign(_r=hits.taxon_status.map(rank).fillna(2)).sort_values("_r")
    out: dict[str, dict] = {}
    for n, g in hits.groupby(hits.taxon_name.str.lower()):
        row = g.iloc[0]
        acc_id = row.accepted_plant_name_id or (row.plant_name_id if row.taxon_status == "Accepted" else "")
        acc = by_id.loc[acc_id] if acc_id in by_id.index else None
        out[n] = {
            "status": row.taxon_status.lower() or "unplaced",
            "n_rows_for_name": int(len(g)),
            "name": f"{row.taxon_name} {row.taxon_authors}".strip(),
            "accepted_name": f"{acc.taxon_name} {acc.taxon_authors}".strip() if acc is not None else None,
            "accepted_id": acc_id or None,
            "family": (acc.family if acc is not None else row.family) or None,
            "ipni_id": (acc.ipni_id if acc is not None else row.ipni_id) or None,
            "powo_url": f"https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:{acc.powo_id}" if acc is not None and acc.powo_id else None,
            "lifeform": (acc.lifeform_description if acc is not None else "") or None,
            "climate": (acc.climate_description if acc is not None else "") or None,
            "range_text": (acc.geographic_area if acc is not None else "") or None,
        }
    acc_ids = {v["accepted_id"] for v in out.values() if v["accepted_id"]}
    dist = pd.read_csv(WCVP / "wcvp_distribution.csv", sep="|", dtype=str, keep_default_na=False,
                       usecols=["plant_name_id", "area_code_l3", "area", "introduced", "extinct", "location_doubtful"])
    dist = dist[dist.plant_name_id.isin(acc_ids) & (dist.area_code_l3 != "")]
    for v in out.values():
        d = dist[dist.plant_name_id == v["accepted_id"]]
        keep = d[d.location_doubtful != "1"]
        v["native_l3"] = sorted(keep[(keep.introduced == "0") & (keep.extinct != "1")].area_code_l3.unique())
        v["introduced_l3"] = sorted(keep[keep.introduced == "1"].area_code_l3.unique())
        v["extinct_l3"] = sorted(keep[keep.extinct == "1"].area_code_l3.unique())
        v["doubtful_l3"] = sorted(d[d.location_doubtful == "1"].area_code_l3.unique())
    return out


# ---------- WFO ----------
def _ssl():
    # WFO's server omits an intermediate certificate; the OS store (truststore) completes the chain. Verification stays on.
    import ssl
    try:
        import truststore
        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except ImportError:
        return True


SSL = _ssl()


def _get(method, url, **kw):
    for a in range(4):
        try:
            r = httpx.request(method, url, timeout=30, verify=SSL, **kw)
            if r.status_code in (429, 502, 503):
                time.sleep(2 ** a); continue
            r.raise_for_status()
            return r.json()
        except httpx.HTTPError:
            time.sleep(1 + a)
    return None


def wfo(name: str) -> dict:
    WFO_CACHE.mkdir(parents=True, exist_ok=True)
    f = WFO_CACHE / (re.sub(r"\W+", "_", name) + ".json")
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    m = _get("GET", WFO_MATCH, params={"input_string": name})
    if m is None:
        return {"status": "unavailable"}  # not cached, retried next run
    res: dict = {"query": name}
    if m.get("match"):
        wid = m["match"]["wfo_id"]
        q = '{ taxonNameById(nameId:"%s"){ role currentPreferredUsage{ hasName{ id fullNameStringPlain } } } }' % wid
        g = _get("POST", WFO_GQL, json={"query": q}) or {}
        t = (g.get("data") or {}).get("taxonNameById") or {}
        acc = ((t.get("currentPreferredUsage") or {}).get("hasName")) or {}
        res |= {"status": "matched", "wfo_id": wid, "name": m["match"]["full_name_plain"], "role": t.get("role"),
                "accepted_id": acc.get("id"), "accepted_name": acc.get("fullNameStringPlain"),
                "url": f"https://www.worldfloraonline.org/taxon/{wid}"}
    else:
        res |= {"status": "ambiguous" if m.get("candidates") else "no match", "n_candidates": len(m.get("candidates") or [])}
    res["classification"] = (m.get("params") or {}).get("classificationVersion")
    try:
        f.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass  # cache only; the answer is still used
    return res


# ---------- regions for the globe ----------
def regions() -> None:
    from shapely.geometry import mapping, shape
    gj = json.loads(L3_SRC.read_text(encoding="utf-8"))
    feats = []
    for f in gj["features"]:
        p = f["properties"]
        g = shape(f["geometry"]).simplify(0.05, preserve_topology=True)
        gm = json.loads(json.dumps(mapping(g)), parse_float=lambda x: round(float(x), 3))
        feats.append({"type": "Feature", "properties": {"code": p.get("LEVEL3_COD"), "name": p.get("LEVEL3_NAM")}, "geometry": gm})
    L3_OUT.parent.mkdir(parents=True, exist_ok=True)
    L3_OUT.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")), encoding="utf-8")
    print("regions", len(feats), f"{L3_OUT.stat().st_size / 1e6:.1f} MB")


def main() -> None:
    cw = pd.read_csv(CLEAN / "medicinal_crosswalk.csv")
    species = sorted({binomial(s) for s in cw.SpeciesAccepted if binomial(s)})
    alt = {s: binomial(g) for s, g in zip(cw.SpeciesAccepted.map(binomial), cw.gbif_accepted.map(binomial)) if g and g != s}
    w = wcvp(species + list(alt.values()))
    with ThreadPoolExecutor(8) as ex:
        f = dict(zip(species, ex.map(wfo, species)))
        # homonyms: WFO will not pick without an author, so retry with the full WCVP name (name + authors)
        retry = {s: w[s.lower()]["name"] for s in species if f[s].get("status") == "ambiguous" and s.lower() in w}
        for s, r in zip(retry, ex.map(wfo, retry.values())):
            if r.get("status") == "matched":
                f[s] = r | {"query": s, "resolved_with_author": retry[s]}
    rows = {}
    for s in species:
        wv = w.get(s.lower()) or (w.get(alt[s].lower()) if s in alt else None)
        if wv and s.lower() not in w:
            wv = wv | {"matched_via": "GBIF accepted name"}
        a1 = binomial((wv or {}).get("accepted_name"))
        a2 = binomial((f[s] or {}).get("accepted_name"))
        rows[s] = {"wcvp": wv or {"status": "no match"}, "wfo": f[s],
                   "agree": (a1 == a2) if a1 and a2 else None,
                   "name_changed": bool((a1 and a1 != s) or (a2 and a2 != s))}
    meta = {
        "built": time.strftime("%Y-%m-%d"),
        "sources": {
            "wcvp": {"name": "World Checklist of Vascular Plants (WCVP), the data behind Plants of the World Online",
                     "by": "Royal Botanic Gardens, Kew", "file": "wcvp.zip (bulk download)", "version": "16 (README_WCVP.xlsx)",
                     "licence": "CC BY 3.0",
                     "url": "https://sftp.kew.org/pub/data-repositories/WCVP/",
                     "cite": "Govaerts R, Nic Lughadha E, Black N, Turner R, Paton A (2021) The World Checklist of Vascular Plants, "
                             "a continuously updated resource for exploring global plant diversity. Scientific Data 8:215"},
            "wfo": {"name": "World Flora Online Plant List", "url": "https://list.worldfloraonline.org/",
                    "classification": next((v.get("classification") for v in f.values() if v.get("classification")), None)},
            "regions": {"name": "TDWG World Geographical Scheme for Recording Plant Distributions, level 3",
                        "cite": "Brummitt RK (2001) World Geographical Scheme for Recording Plant Distributions, ed. 2. TDWG",
                        "url": "https://github.com/tdwg/wgsrpd"},
        },
        "counts": {
            "species": len(rows),
            "wcvp_matched": sum(r["wcvp"]["status"] != "no match" for r in rows.values()),
            "wfo_matched": sum(r["wfo"].get("status") == "matched" for r in rows.values()),
            "both_agree": sum(r["agree"] is True for r in rows.values()),
            "disagree": sum(r["agree"] is False for r in rows.values()),
            "name_changed": sum(r["name_changed"] for r in rows.values()),
            "with_native_range": sum(bool(r["wcvp"].get("native_l3")) for r in rows.values()),
        },
    }
    (CLEAN / "checklists.json").write_text(json.dumps({"meta": meta, "species": rows}, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(meta["counts"]))
    regions()


if __name__ == "__main__":
    main()
