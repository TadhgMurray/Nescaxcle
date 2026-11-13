#!/usr/bin/env python3
"""Build data/runners.json for Nescaxcle from racecast.co.

Usage:
    RACECAST_AGENT=<your header value> python3 scripts/scrape_racecast.py

Fetches the 11 NESCAC team pages, takes the current-season roster (men and
women), then visits each athlete page to pull:
  - home state (state of their most recent high school on racecast)
  - college PRs: XC (8K men / 6K women), 5K, Mile, 800
  - racecast speed rating (current XC season rating)

Pages are cached in .cache/racecast/ and requests are spaced out politely.
Only public school and athlete pages are fetched (robots.txt disallows /api and /search).
"""
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://racecast.co"
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "racecast"
OUT = ROOT / "src" / "data" / "runners.json"
DELAY = 1.0

SCHOOLS = [
    ("Amherst", "MA"), ("Bates", "ME"), ("Bowdoin", "ME"), ("Colby", "ME"),
    ("Connecticut College", "CT"), ("Hamilton", "NY"), ("Middlebury", "VT"),
    ("Trinity", "CT"), ("Tufts", "MA"), ("Wesleyan", "CT"), ("Williams", "MA"),
]
DISPLAY = {"Connecticut College": "Conn College"}

AGENT = os.environ.get("RACECAST_AGENT")
_last = 0.0


def fetch(path):
    key = re.sub(r"[^A-Za-z0-9]+", "_", path).strip("_") + ".html"
    f = CACHE / key
    if f.exists():
        return f.read_text()
    if not AGENT:
        sys.exit("Set RACECAST_AGENT to the X-Racecast-Agent header value.")
    global _last
    wait = DELAY - (time.time() - _last)
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(BASE + path, headers={
        "X-Racecast-Agent": AGENT,
        "User-Agent": "nescaxcle-data-builder",
    })
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read().decode("utf-8", "replace")
            break
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            print(f"  retry {path}: {e}", file=sys.stderr)
            time.sleep(2 ** attempt * 2)
    _last = time.time()
    CACHE.mkdir(parents=True, exist_ok=True)
    f.write_text(body)
    return body


def text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).replace("\xa0", " ").strip()


def parse_time(t):
    t = t.strip()
    if not re.fullmatch(r"\d+(:\d{1,2})*(\.\d+)?", t):
        return None
    secs = 0.0
    for part in t.split(":"):
        secs = secs * 60 + float(part)
    return secs


def parse_roster(page):
    sec = re.search(r'<section class="rc-panel" id="roster".*?</section>', page, re.S)
    if not sec:
        return []
    out = []
    parts = re.split(r'<h3 class="roster-level">', sec.group(0))[1:]
    for part in parts:
        label = text(part.split("<", 1)[0]).lower()
        gender = "M" if label.startswith("men") else "W" if label.startswith("women") else None
        if not gender:
            continue
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", part, re.S):
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
            m = re.search(r'href="(/athlete/[a-z0-9]+)">([^<]+)</a>', row)
            if not m or len(cells) < 4:
                continue
            if html.unescape(m.group(2)).strip().lower() == "deleted athlete":
                continue
            grade = text(cells[2])
            rating = text(cells[3])
            out.append({
                "path": m.group(1),
                "name": html.unescape(m.group(2)).strip(),
                "gender": gender,
                "grade": grade,
                "rating": float(rating) if re.fullmatch(r"[\d.]+", rating) else None,
            })
    return out


SEASON_RE = re.compile(r'<details class="season" id="(\d{4})-(XC|TF)".*?</details>', re.S)


def parse_athlete(page, gender):
    xc_dist = "8000m" if gender == "M" else "6000m"
    prs = {"xc": None, "5k": None, "mile": None, "800": None}
    home_state, home_year = None, -1
    for m in SEASON_RE.finditer(page):
        year, sport, block = int(m.group(1)), m.group(2), m.group(0)
        meta = re.search(r'<p class="season-meta">.*?href="/school/[^"?]*\?([^"]*)"', block, re.S)
        if not meta:
            continue
        q = urllib.parse.parse_qs(html.unescape(meta.group(1)))
        level = q.get("level", [""])[0]
        state = q.get("state", [""])[0]
        if level == "hs":
            if state and year > home_year:
                home_state, home_year = state, year
            continue
        if level != "college":
            continue
        for res, ev in re.findall(
                r'class="res-cell">([^<]*)<span class="res-ev">([^<]*)', block):
            secs = parse_time(text(res))
            ev = text(ev).split("·")[0].strip()
            if secs is None:
                continue
            key = None
            if sport == "XC" and ev == xc_dist:
                key = "xc"
            elif sport == "TF":
                key = {"5000m": "5k", "Mile": "mile", "800m": "800"}.get(ev)
            if key and (prs[key] is None or secs < prs[key]):
                prs[key] = secs
    return home_state, prs


def main():
    runners = []
    for school, st in SCHOOLS:
        path = f"/school/{urllib.parse.quote(school)}?state={st}&level=college"
        roster = parse_roster(fetch(path))
        print(f"{school}: {len(roster)} on roster")
        for r in roster:
            home, prs = parse_athlete(fetch(r["path"]), r["gender"])
            yr = r["grade"].split("-")[0] if r["grade"] else None
            runners.append({
                "id": r["path"].rsplit("/", 1)[1],
                "name": r["name"],
                "gender": r["gender"],
                "college": DISPLAY.get(school, school),
                "state": home,
                "year": yr if yr in ("FR", "SO", "JR", "SR") else None,
                "rating": r["rating"],
                **prs,
            })
    runners.sort(key=lambda x: (x["gender"], x["college"], x["name"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "season": 2026,
        "source": "racecast.co",
        "updated": time.strftime("%Y-%m-%d"),
        "runners": runners,
    }, indent=1))
    print(f"Wrote {len(runners)} runners to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
