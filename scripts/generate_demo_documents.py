"""Generate SYNTHETIC HarvestOps demo documents with a ground-truth file.

Every page carries a watermark: SYNTHETIC DEMO — NOT VALID FOR HARVEST, TRADE, LABORATORY OR REGULATORY USE.
Organisations, people, permit numbers and lab values are fictional. No real seals or signatures are drawn.

Outputs
  tests/fixtures/harvestops/pdfs/<packet>/<file>.pdf
  tests/fixtures/harvestops/ground_truth.json
  docs/demo/SCENARIOS.md

    python scripts/generate_demo_documents.py
"""
import io
import json
import random
import shutil
from pathlib import Path

from reportlab.lib.colors import Color
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "fixtures" / "harvestops"
PDFS = OUT / "pdfs"
WATERMARK = "SYNTHETIC DEMO — NOT VALID FOR HARVEST, TRADE, LABORATORY OR REGULATORY USE"
SEED = 20261107
W, H = A4

TITLES = {
    "collection_plan": "Collection Plan",
    "authorisation": "Collection Authorisation",
    "id_sheet": "Species Identification Sheet",
    "weigh_in": "Weigh-in Slip",
    "drying_log": "Drying Log",
    "batch_statement": "Batch and Custody Statement",
    "coa": "Certificate of Analysis (analogue)",
    "invoice": "Packing List and Invoice",
    "monitoring": "Monitoring Sheet",
}
TITLES_FR = {"authorisation": "Autorisation de collecte", "weigh_in": "Bordereau de pesée"}
LABELS_FR = {"document_id": "N° du document", "issuer": "Délivré par", "species": "Espèce", "organ": "Partie récoltée",
             "authorised_quantity": "Quantité autorisée", "valid_from": "Valable du", "valid_until": "Valable jusqu'au",
             "area": "Zone de collecte", "jurisdiction": "Pays", "quantity": "Quantité", "collection_date": "Date de collecte",
             "collector": "Collecteur", "lot_code": "Numéro de lot"}
LABELS = {"document_id": "Document no", "issuer": "Issued by", "species": "Species", "organ": "Plant part", "area": "Collection area",
          "authorised_quantity": "Authorised quantity", "valid_from": "Valid from", "valid_until": "Valid until", "jurisdiction": "Country",
          "planned_quantity": "Planned quantity", "collection_date": "Collection date", "collector": "Collector", "quantity": "Net weight",
          "lot_code": "Lot code", "input_lot": "Input lot", "output_lot": "Output lot", "fresh_input": "Fresh input",
          "dry_output": "Dry output", "moisture_loss": "Water loss", "rejected": "Rejected material", "waste": "Waste",
          "destination_country": "Destination country", "voucher_id": "Voucher no", "identified_by": "Identified by",
          "monitoring_date": "Monitoring date", "plants_counted": "Plants counted", "consignee": "Consignee"}


def watermark(c: canvas.Canvas):
    c.saveState()
    c.setFillColor(Color(0.75, 0.2, 0.2, alpha=0.18))
    c.setFont("Helvetica-Bold", 26)
    c.translate(W / 2, H / 2)
    c.rotate(35)
    for dy in (-180, 0, 180):
        c.drawCentredString(0, dy, "SYNTHETIC DEMO — NOT VALID")
    c.restoreState()
    c.setFont("Helvetica", 7)
    c.setFillColor(Color(0.5, 0.1, 0.1))
    c.drawCentredString(W / 2, 22, WATERMARK)
    c.drawCentredString(W / 2, H - 20, WATERMARK)
    c.setFillColor(Color(0, 0, 0))


def header(c, kind, org, fr=False):
    c.setFont("Helvetica-Bold", 15)
    c.drawString(50, H - 70, (TITLES_FR.get(kind) if fr else None) or TITLES[kind])
    c.setFont("Helvetica", 9)
    c.drawString(50, H - 86, f"{org} (fictional organisation)")
    c.line(50, H - 94, W - 50, H - 94)


def fields_block(c, fields: dict, y: float, fr=False, labels=None) -> float:
    for k, v in fields.items():
        if v is None:
            continue
        label = (labels or {}).get(k) or (LABELS_FR.get(k) if fr else None) or LABELS[k]
        c.setFont("Helvetica-Bold", 10)
        c.drawString(50, y, f"{label}:")
        c.setFont("Helvetica", 10)
        c.drawString(210, y, str(v))
        y -= 18
    return y


def coa_table(c, rows, y):
    c.setFont("Helvetica-Bold", 10)
    c.drawString(50, y, "Test")
    c.drawString(250, y, "Result")
    c.drawString(370, y, "Limit")
    y -= 16
    c.setFont("Helvetica", 10)
    for analyte, result, limit in rows:
        c.drawString(50, y, analyte)
        c.drawString(250, y, result)
        c.drawString(370, y, limit)
        y -= 16
    return y


def render(kind, org, fields, *, fr=False, coa=None, extra_page=None, swap_pages=False, labels=None) -> bytes:
    """Draw a document; optionally a second page (and optionally swap page order)."""
    pages = []

    def p1(c):
        header(c, kind, org, fr)
        y = fields_block(c, fields, H - 120, fr, labels)
        if coa:
            coa_table(c, coa, y - 10)
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(50, 60, "No seal or signature is reproduced. This is a fictional record generated for software testing.")

    def p2(c):
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, H - 70, "Continuation sheet")
        fields_block(c, extra_page, H - 100, fr)

    pages.append(p1)
    if extra_page:
        pages.append(p2)
    if swap_pages:
        pages.reverse()
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"SYNTHETIC {TITLES[kind]}")
    c.setAuthor("EthnoHarvest synthetic generator")
    for i, draw in enumerate(pages):
        watermark(c)
        draw(c)
        c.setFont("Helvetica", 8)
        c.drawRightString(W - 50, 40, f"page {i + 1} of {len(pages)}")
        c.showPage()
    c.save()
    return buf.getvalue()


def rasterise_noisy(pdf: bytes, seed: int) -> bytes:
    """Turn a PDF into an image-only scan with noise and slight rotation (no extractable text)."""
    import pypdfium2 as pdfium
    from PIL import Image, ImageFilter

    rnd = random.Random(seed)
    doc = pdfium.PdfDocument(pdf)
    img = doc[0].render(scale=1.4).to_pil().convert("L")
    img = img.rotate(rnd.uniform(-1.6, 1.6), fillcolor=255, expand=False).filter(ImageFilter.GaussianBlur(0.6))
    px = img.load()
    for _ in range(img.width * img.height // 40):
        x, y = rnd.randrange(img.width), rnd.randrange(img.height)
        px[x, y] = rnd.choice((0, 90, 200))
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    tmp = io.BytesIO()
    img.save(tmp, format="PNG")
    tmp.seek(0)
    from reportlab.lib.utils import ImageReader
    c.drawImage(ImageReader(tmp), 0, 0, W, H)
    # the watermark stays visible as image pixels AND as a text footer so the file is never mistaken for a real scan
    c.setFont("Helvetica", 7)
    c.setFillColor(Color(0.5, 0.1, 0.1))
    c.drawCentredString(W / 2, 12, WATERMARK)
    c.showPage()
    c.save()
    return buf.getvalue()


# ------------------------------------------------------------------ scenario definitions
JAT = {"species": "Nardostachys jatamansi", "organ": "rhizome", "jurisdiction": "Nepal", "cites_listed": True}
PRU = {"species": "Prunus africana", "organ": "bark", "jurisdiction": "Cameroon", "cites_listed": True}
BOS = {"species": "Boswellia papyrifera", "organ": "resin", "jurisdiction": "Ethiopia", "cites_listed": False}
KHA = {"species": "Khaya senegalensis", "organ": "bark", "jurisdiction": "Benin", "cites_listed": False}
ORG = {"Nepal": "Himalayan Herb Cooperative Alpha", "Cameroon": "Montane Bark Cooperative Beta", "Ethiopia": "Lowland Resin Group Gamma",
       "Benin": "Savanna Farmers Group Delta"}
AUTHORITY = "District Forest Office (synthetic issuer)"


def auth(p, n, valid_from="2026-07-01", valid_until="2026-12-31", qty="100 kg fresh", area="Block A", organ=None, species=None):
    return {"document_id": f"SYN-AUTH-{n}", "issuer": AUTHORITY, "species": species or p["species"], "organ": organ or p["organ"],
            "authorised_quantity": qty, "valid_from": valid_from, "valid_until": valid_until, "area": area, "jurisdiction": p["jurisdiction"]}


def plan(p, n, area="Block A", date="2026-09-10", qty="80 kg fresh"):
    return {"document_id": f"SYN-PLAN-{n}", "issuer": ORG[p["jurisdiction"]], "species": p["species"], "organ": p["organ"], "area": area,
            "planned_quantity": qty, "collection_date": date, "jurisdiction": p["jurisdiction"]}


def weigh(p, n, lot, qty="80 kg fresh", date="2026-09-12", species=None, organ=None, collector="Collector A (fictional)"):
    return {"document_id": f"SYN-WEIGH-{n}", "species": species or p["species"], "organ": organ or p["organ"], "collection_date": date,
            "collector": collector, "quantity": qty, "lot_code": lot}


def drying(p, n, inp, out, fresh="80 kg", dry="21 kg", water="52 kg", rej="2 kg", waste="1 kg"):
    return {"document_id": f"SYN-DRY-{n}", "issuer": ORG[p["jurisdiction"]], "species": p["species"], "organ": p["organ"],
            "input_lot": inp, "output_lot": out, "fresh_input": fresh, "dry_output": dry, "moisture_loss": water,
            "rejected": rej, "waste": waste}


def batch(p, n, lot, qty="21 kg dry"):
    return {"document_id": f"SYN-BATCH-{n}", "issuer": ORG[p["jurisdiction"]], "species": p["species"], "organ": p["organ"], "lot_code": lot, "quantity": qty}


def coa_doc(p, n, lot):
    return {"document_id": f"SYN-COA-{n}", "issuer": "Laboratory Epsilon (fictional)", "species": p["species"], "organ": p["organ"], "lot_code": lot}


def invoice(p, n, lot, dest, qty="20 kg dry"):
    return {"document_id": f"SYN-INV-{n}", "issuer": ORG[p["jurisdiction"]], "species": p["species"], "organ": p["organ"], "lot_code": lot,
            "quantity": qty, "destination_country": dest, "consignee": "Buyer Zeta GmbH (fictional)"}


def idsheet(p, n, species=None):
    return {"document_id": f"SYN-ID-{n}", "species": species or p["species"], "organ": p["organ"], "voucher_id": f"SYN-V-{n}",
            "identified_by": "Botanist Eta (fictional)"}


def monitoring(p, n, area="Block A", date="2026-06-15", count="412"):
    return {"document_id": f"SYN-MON-{n}", "species": p["species"], "area": area, "monitoring_date": date, "plants_counted": count}


def clean(d):
    return {k: v for k, v in d.items() if v is not None}


def packets():
    """Each packet: passport context, documents [(file, kind, fields, options)], expected rule ids."""
    P = []
    # P01 consistent
    P.append(("P01-consistent", JAT, [
        ("plan.pdf", "collection_plan", plan(JAT, 101), {}),
        ("authorisation.pdf", "authorisation", auth(JAT, 101), {}),
        ("id-sheet.pdf", "id_sheet", idsheet(JAT, 101), {}),
        ("weigh-in.pdf", "weigh_in", weigh(JAT, 101, "JAT-F1"), {}),
        ("drying-log.pdf", "drying_log", drying(JAT, 101, "JAT-F1", "JAT-D1", water="56 kg"), {}),
        ("batch.pdf", "batch_statement", batch(JAT, 101, "JAT-D1"), {}),
    ], [], "Everything agrees: species, part, area, dates inside the authorisation window, quantities within the authorised amount, and the drying mass balance closes."))
    # P02 expired authorisation
    P.append(("P02-expired-authorisation", JAT, [
        ("authorisation.pdf", "authorisation", auth(JAT, 102, valid_from="2025-07-01", valid_until="2026-06-30"), {}),
        ("weigh-in.pdf", "weigh_in", weigh(JAT, 102, "JAT-F2", date="12/09/2026"), {}),
    ], ["date_outside_authorisation"], "Collection on 12 Sep 2026 (written day-first) happened after the authorisation expired on 30 Jun 2026."))
    # P03 synonym (accepted) + wrong species
    P.append(("P03-synonym-and-wrong-species", JAT, [
        ("authorisation.pdf", "authorisation", auth(JAT, 103, species="Nardostachys grandiflora"), {}),
        ("weigh-in.pdf", "weigh_in", weigh(JAT, 103, "JAT-F3", species="Valeriana jatamansi"), {}),
    ], ["species_synonym", "species_mismatch"], "The authorisation uses the synonym Nardostachys grandiflora (fine, flagged for information); the weigh-in names a different plant, Valeriana jatamansi."))
    # P04 wrong organ
    P.append(("P04-wrong-organ", PRU, [
        ("authorisation.pdf", "authorisation", auth(PRU, 104, organ="leaves", qty="300 kg fresh"), {}),
        ("weigh-in.pdf", "weigh_in", weigh(PRU, 104, "PRU-F4", qty="120 kg fresh"), {}),
    ], ["organ_mismatch"], "Leaves are authorised but bark was collected."))
    # P05 over-limit quantity, mixed units, two slips
    P.append(("P05-over-authorised-quantity", JAT, [
        ("authorisation.pdf", "authorisation", auth(JAT, 105, qty="50 kg fresh"), {}),
        ("weigh-in-1.pdf", "weigh_in", weigh(JAT, 1051, "JAT-F5", qty="38 kg fresh"), {}),
        ("weigh-in-2.pdf", "weigh_in", weigh(JAT, 1052, "JAT-F5", qty="24000 g fresh", date="13 Sep 2026", collector="Collector B (fictional)"), {}),
    ], ["quantity_exceeds_authorised"], "Two slips (one in grams) add up to 62 kg against 50 kg authorised."))
    # P06 area mismatch
    P.append(("P06-area-mismatch", BOS, [
        ("plan.pdf", "collection_plan", plan(BOS, 106, area="Block C", qty="20 kg fresh"), {}),
        ("authorisation.pdf", "authorisation", auth(BOS, 106, area="Block A", qty="40 kg fresh"), {}),
    ], ["area_mismatch"], "The plan targets Block C; the authorisation covers Block A."))
    # P07 batch-ID mismatch
    P.append(("P07-batch-id-mismatch", JAT, [
        ("weigh-in.pdf", "weigh_in", weigh(JAT, 107, "JAT-F7"), {}),
        ("drying-log.pdf", "drying_log", drying(JAT, 107, "JAT-F7", "JAT-D7", water="56 kg"), {}),
        ("batch.pdf", "batch_statement", batch(JAT, 107, "JAT-D9"), {}),
    ], ["lot_not_traceable"], "The batch statement refers to lot JAT-D9, which no collection or drying record produced."))
    # P08 duplicate record
    dup = weigh(PRU, 108, "PRU-F8", qty="60 kg fresh")
    P.append(("P08-duplicate-record", PRU, [
        ("authorisation.pdf", "authorisation", auth(PRU, 108, qty="300 kg fresh"), {}),
        ("weigh-in.pdf", "weigh_in", dup, {}),
        ("weigh-in-copy.pdf", "weigh_in", dup, {}),
    ], ["duplicate_document"], "The same weigh-in slip was submitted twice; counting both would double the stock."))
    # P09 fresh→dry gap
    P.append(("P09-drying-mass-gap", JAT, [
        ("weigh-in.pdf", "weigh_in", weigh(JAT, 109, "JAT-F9"), {}),
        ("drying-log.pdf", "drying_log", drying(JAT, 109, "JAT-F9", "JAT-D9b", water="40 kg", rej="0 kg", waste="0 kg"), {}),
    ], ["mass_balance_gap"], "80 kg fresh in, 21 kg dry out, only 40 kg water loss recorded: 19 kg unaccounted."))
    # P10 COA out of range + missing result (two-page COA with pages swapped)
    P.append(("P10-coa-out-of-range", PRU, [
        ("batch.pdf", "batch_statement", batch(PRU, 110, "PRU-D10", qty="66 kg dry"), {}),
        ("coa.pdf", "coa", coa_doc(PRU, 110, "PRU-D10"),
         {"coa": [("Loss on drying", "14.2 %", "<= 12 %"), ("Total ash", "not tested", "<= 8 %"), ("Foreign matter", "1.1 %", "<= 2 %")],
          "extra_page": {"document_id": "SYN-COA-110", "lot_code": "PRU-D10"}, "swap_pages": True}),
    ], ["coa_out_of_range", "coa_missing_result"], "Loss on drying 14.2% exceeds the documented 12% limit; total ash was not tested. Pages are in reverse order."))
    # P11 CITES cross-border, French-language authorisation
    P.append(("P11-cites-cross-border", PRU, [
        ("autorisation.pdf", "authorisation", auth(PRU, 111, qty="300 kg fresh", organ="écorce"), {"fr": True}),
        ("batch.pdf", "batch_statement", batch(PRU, 111, "PRU-D11", qty="66 kg dry"), {}),
        ("invoice.pdf", "invoice", invoice(PRU, 111, "PRU-D11", "France"), {}),
        ("weigh-in.pdf", "weigh_in", weigh(PRU, 111, "PRU-F11", qty="150 kg fresh"), {}),
        ("drying-log.pdf", "drying_log", drying(PRU, 111, "PRU-F11", "PRU-D11", fresh="150 kg", dry="66 kg", water="80 kg", rej="3 kg", waste="1 kg"), {}),
    ], ["cites_cross_border"], "A CITES Appendix II species is invoiced to France; trade documents need checking by the Management Authority. The authorisation is in French."))
    # P12 corrupted and image-only scan
    P.append(("P12-corrupt-and-scanned", KHA, [
        ("corrupt.pdf", "corrupt", auth(KHA, 112), {"corrupt": True}),
        ("scanned-weigh-in.pdf", "weigh_in", weigh(KHA, 112, "KHA-F12", qty="30 kg fresh"), {"scan": True}),
        ("monitoring.pdf", "monitoring", monitoring(KHA, 112), {}),
    ], ["document_unreadable", "needs_ocr"], "One file is damaged and must be rejected; one is an image-only scan, where the system must abstain rather than guess."))
    # P13 HELD-OUT: label wording and a date format the extractor was never written for (added before any extractor change).
    P.append(("P13-heldout-unseen-labels", JAT, [
        ("authorisation.pdf", "authorisation", auth(JAT, 113, qty="40 kg fresh", valid_until="2026/12/31"),
         {"labels": {"authorised_quantity": "Max. harvest allowed", "valid_until": "Expiry", "species": "Taxon"}}),
        ("weigh-in.pdf", "weigh_in", weigh(JAT, 113, "JAT-F13", qty="55 kg fresh", date="Sep 14, 2026"),
         {"labels": {"quantity": "Weight (net)", "collection_date": "Date collected", "lot_code": "Batch ID"}}),
    ], ["quantity_exceeds_authorised"], "HELD-OUT: same facts as P05 (55 kg collected, 40 kg authorised) but with unseen labels. Measures what the "
       "rules extractor misses on a new layout; missed fields should lead to abstention, not a false 'consistent'."))
    return P


def main():
    rnd = random.Random(SEED)
    if PDFS.exists():
        shutil.rmtree(PDFS)
    PDFS.mkdir(parents=True)
    truth = {"generator": "scripts/generate_demo_documents.py", "seed": SEED, "watermark": WATERMARK, "packets": []}
    n_docs = 0
    for pid, ctx, docs, expected, story in packets():
        d = PDFS / pid
        d.mkdir()
        rec = {"id": pid, "passport": {k: ctx[k] for k in ("species", "organ", "jurisdiction")}, "cites_listed": ctx["cites_listed"],
               "expected_rules": expected, "story": story, "documents": []}
        for fname, kind, fields, opt in docs:
            fields = clean(fields)
            if kind == "corrupt":
                raw = render("authorisation", ORG[ctx["jurisdiction"]], fields)
                raw = raw[: len(raw) // 3] + bytes(rnd.randrange(256) for _ in range(400))
                (d / fname).write_bytes(raw)
                rec["documents"].append({"file": fname, "kind": None, "expect": "rejected", "fields": {}})
                n_docs += 1
                continue
            pdf = render(kind, ORG[ctx["jurisdiction"]], fields, fr=opt.get("fr", False), coa=opt.get("coa"),
                         extra_page=opt.get("extra_page"), swap_pages=opt.get("swap_pages", False), labels=opt.get("labels"))
            expect = "extracted"
            if opt.get("scan"):
                pdf = rasterise_noisy(pdf, rnd.randrange(10 ** 6))
                expect = "needs-ocr"
            (d / fname).write_bytes(pdf)
            gt_fields = dict(fields)
            if opt.get("coa"):
                for analyte, result, limit in opt["coa"]:
                    key = analyte.lower()
                    gt_fields[f"qc:{key}"] = result
                    gt_fields[f"limit:{key}"] = limit
            rec["documents"].append({"file": fname, "kind": kind, "expect": expect, "language": "fr" if opt.get("fr") else "en",
                                     "variant": [v for v in ("swap_pages", "scan", "fr", "labels") if opt.get(v)],
                                     "fields": {} if expect == "needs-ocr" else gt_fields})
            n_docs += 1
        truth["packets"].append(rec)
    (OUT / "ground_truth.json").write_text(json.dumps(truth, indent=2, ensure_ascii=False), encoding="utf-8")

    md = ["# Synthetic HarvestOps scenarios", "",
          f"Generated by `scripts/generate_demo_documents.py` (seed {SEED}). **{n_docs} PDFs in {len(truth['packets'])} packets.**", "",
          f"Every page is watermarked: _{WATERMARK}_. All organisations, people, permit numbers and laboratory values are fictional.",
          "No real seal, signature or official template is reproduced.", "",
          "| Packet | Passport | Documents | Expected findings | What it tests |", "|---|---|---|---|---|"]
    for p in truth["packets"]:
        docs = ", ".join(f"`{x['file']}`" + (f" ({'/'.join(x['variant'])})" if x.get("variant") else "") for x in p["documents"])
        md.append(f"| {p['id']} | *{p['passport']['species']}* · {p['passport']['organ']} · {p['passport']['jurisdiction']} | {docs} | "
                  f"{', '.join(p['expected_rules']) or 'none (all consistent)'} | {p['story']} |")
    md += ["", "Adversarial variants: swapped page order (P10), mixed units g/kg and three date formats (P02, P05), a duplicate submission (P08),",
           "a French-language authorisation (P11), an image-only noisy scan (P12) and a truncated, corrupted file (P12).", ""]
    (ROOT / "docs" / "demo").mkdir(parents=True, exist_ok=True)
    (ROOT / "docs" / "demo" / "SCENARIOS.md").write_text("\n".join(md), encoding="utf-8")
    print(f"{n_docs} PDFs in {len(truth['packets'])} packets -> {PDFS}")


if __name__ == "__main__":
    main()
