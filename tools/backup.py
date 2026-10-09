#!/usr/bin/env python3
"""
Snapshot every bit of live data to a timestamped JSON file.

Run it any time you want a safety copy, especially before changing anything:

    python tools/backup.py

Files land in backups/. It only ever reads, so running it is always safe.
"""

import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_DIR = os.path.join(ROOT, "backups")
COLLECTIONS = ["houses", "entries", "standings"]


def read_config():
    """Pull the Firebase keys out of src/config.js so there is one source."""
    path = os.path.join(ROOT, "src", "config.js")
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    api_key = re.search(r'apiKey:\s*"([^"]+)"', text)
    project = re.search(r'projectId:\s*"([^"]+)"', text)
    if not api_key or not project:
        sys.exit("Could not find apiKey/projectId in src/config.js")
    if api_key.group(1).startswith("PASTE_"):
        sys.exit("src/config.js still has placeholder keys, nothing to back up.")
    return api_key.group(1), project.group(1)


def post(url, payload):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def get(url, token):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def plain(value):
    """Firestore REST wraps every field in its type. Unwrap it."""
    if value is None:
        return None
    for key in ("stringValue", "booleanValue", "timestampValue", "doubleValue"):
        if key in value:
            return value[key]
    if "integerValue" in value:
        return int(value["integerValue"])
    if "nullValue" in value:
        return None
    if "arrayValue" in value:
        return [plain(v) for v in value["arrayValue"].get("values", [])]
    if "mapValue" in value:
        return {k: plain(v) for k, v in value["mapValue"].get("fields", {}).items()}
    return value


def dump(project, collection, token):
    rows, page = [], None
    while True:
        url = (f"https://firestore.googleapis.com/v1/projects/{project}"
               f"/databases/(default)/documents/{collection}?pageSize=300")
        if page:
            url += "&pageToken=" + page
        body = get(url, token)
        for doc in body.get("documents", []):
            row = {"_id": doc["name"].rsplit("/", 1)[-1]}
            row.update({k: plain(v) for k, v in doc.get("fields", {}).items()})
            rows.append(row)
        page = body.get("nextPageToken")
        if not page:
            return rows


def main():
    api_key, project = read_config()

    # The app has no logins, so an anonymous token is all that is needed.
    token = post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={api_key}",
        {"returnSecureToken": True})["idToken"]

    snapshot = {
        "takenAt": datetime.now(timezone.utc).isoformat(),
        "project": project,
    }
    for coll in COLLECTIONS:
        snapshot[coll] = dump(project, coll, token)

    os.makedirs(OUT_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    path = os.path.join(OUT_DIR, f"snapshot-{stamp}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh, indent=1, ensure_ascii=False)

    print(f"Saved {path}")
    for coll in COLLECTIONS:
        print(f"  {coll}: {len(snapshot[coll])}")

    totals = {}
    for e in snapshot.get("entries", []):
        totals.setdefault(e.get("month"), {}).setdefault(e.get("category"), 0)
        totals[e["month"]][e["category"]] += e.get("amount", 0)
    for month in sorted(totals, reverse=True):
        line = ", ".join(f"{k} {v}" for k, v in sorted(totals[month].items()))
        print(f"  {month}: {line}")


if __name__ == "__main__":
    main()
