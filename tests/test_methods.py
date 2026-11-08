"""Harvest Methods catalogue and Openverse photo handling (network mocked)."""
import re

import pytest

from backend.ethnoharvest import media, methods as M


class FakeResp:
    def __init__(self, results):
        self._r = results

    def raise_for_status(self):
        pass

    def json(self):
        return {"results": self._r}


def _hit(i, lic):
    return {"id": f"00000000-0000-0000-0000-00000000000{i}", "title": f"t{i}", "creator": "c", "license": lic, "license_version": "4.0",
            "license_url": "u", "foreign_landing_url": "l", "provider": "flickr", "thumbnail": f"https://example.org/{i}.jpg"}


def test_catalogue_is_descriptive_and_cited():
    cat = M.catalogue()
    assert len(cat["organs"]) == 7
    text = str(cat["organs"]).lower()
    for banned in ("safe rate", "quota of", "you may harvest", "sustainable rate", "% per year"):
        assert banned not in text
    for o in cat["organs"]:
        assert o["refs"] and all(r["title"] for r in o["refs"]) and o["methods"]


@pytest.mark.parametrize("raw,oid", [("rhizome", "root"), ("bark + foliage", "bark"), ("resin (stem tapping)", "resin"), ("seed", "fruit"),
                                     ("whole plant", "whole"), ("leaf", "leaf"), ("nonsense", None)])
def test_organ_aliases(raw, oid):
    assert M.organ_id(raw) == oid


def test_openverse_keeps_only_open_licences(monkeypatch):
    monkeypatch.setattr(M.httpx, "get", lambda *a, **k: FakeResp([_hit(1, "by"), _hit(2, "by-nc"), _hit(3, "cc0"), _hit(4, "by-nd"), _hit(5, "by-sa")]))
    got = M.openverse("bark")
    assert [p["licence"].split()[0:2] for p in got] == [["CC", "BY"], ["CC0", "1.0"], ["CC", "BY-SA"]]


def test_photos_cached_and_served_from_our_origin(tmp_path, monkeypatch):
    monkeypatch.setattr(M, "CACHE", tmp_path)
    calls = []
    monkeypatch.setattr(M.httpx, "get", lambda *a, **k: calls.append(1) or FakeResp([_hit(1, "by"), _hit(2, "cc0")]))
    monkeypatch.setattr(media, "_download", lambda url: (b"\xff\xd8jpeg", "image/jpeg"))
    a = M.photos("bark stripping")
    b = M.photos("bark stripping")
    assert a == b and len(calls) == 1 and len(a["photos"]) == 2
    assert all(p["src"].startswith("/api/methods/photo/") and "thumb" not in p for p in a["photos"])
    assert M.photo_file(a["photos"][0]["id"])[1] == "image/jpeg"
    assert M.photo_file("../../app") is None
    assert a["note"] == M.PHOTO_NOTE


def test_photo_search_failure_is_reported_not_hidden(tmp_path, monkeypatch):
    monkeypatch.setattr(M, "CACHE", tmp_path)

    def boom(*a, **k):
        raise M.httpx.ConnectError("down")
    monkeypatch.setattr(M.httpx, "get", boom)
    r = M.photos("bark")
    assert r["photos"] == [] and re.search("unavailable", r["status"])
