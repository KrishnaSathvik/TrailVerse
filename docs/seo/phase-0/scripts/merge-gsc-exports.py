#!/usr/bin/env python3
"""Merge GSC drilldown Table.csv files into url-action-tracker.csv."""

from __future__ import annotations

import csv
from pathlib import Path

PHASE0 = Path(__file__).resolve().parents[1]
TRACKER = PHASE0 / "url-action-tracker.csv"
EXPORTS = PHASE0 / "exports"
IMPORTS = PHASE0 / "imports"

# imports folder -> (gsc_issue, default_action)
IMPORT_MAP = {
    "not-found-404": ("Not found (404)", "phase2_redirect"),
    "page-with-redirect": ("Page with redirect", "phase2_ignore_redirect"),
    "crawled-not-indexed": ("Crawled - currently not indexed", "phase4_content_tier_a"),
    "discovered-not-indexed": ("Discovered - currently not indexed", "phase4_content_tier_a"),
    "excluded-noindex": ("Excluded by noindex tag", "phase3_noindex"),
    "alternate-canonical": ("Alternate page with proper canonical tag", "phase4_ignore"),
}

EXPORT_MAP = {
    "drilldown-blocked-by-robots": ("Blocked by robots.txt", "phase1_headers_removal"),
    "drilldown-indexed-blocked-by-robots": (
        "Indexed, though blocked by robots.txt",
        "phase1_headers_removal",
    ),
}


def read_table_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return []
        url_key = None
        for name in reader.fieldnames:
            if name and name.strip().lower() == "url":
                url_key = name
                break
        if not url_key:
            raise ValueError(f"No URL column in {path}; columns={reader.fieldnames}")
        rows = []
        for row in reader:
            url = (row.get(url_key) or "").strip()
            if not url:
                continue
            crawled = ""
            for k, v in row.items():
                if k and "crawl" in k.lower():
                    crawled = (v or "").strip()
                    break
            rows.append({"url": url, "last_crawled": crawled})
        return rows


def find_table_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    direct = root / "Table.csv"
    if direct.is_file():
        return [direct]
    return sorted(root.rglob("Table.csv"))


def load_tracker() -> dict[str, dict[str, str]]:
    if not TRACKER.is_file():
        return {}
    out: dict[str, dict[str, str]] = {}
    with TRACKER.open(newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            url = (row.get("url") or "").strip()
            if url:
                out[url] = row
    return out


def upsert(
    tracker: dict[str, dict[str, str]],
    url: str,
    issue: str,
    action: str,
    last_crawled: str = "",
    status: str = "known",
    notes: str = "",
) -> None:
    existing = tracker.get(url)
    if existing:
        # Keep more specific action if already set
        if existing.get("action") and existing["action"] != action:
            existing["gsc_issue"] = f"{existing.get('gsc_issue', '')}; {issue}".strip("; ")
        else:
            existing["gsc_issue"] = issue
            existing["action"] = action
        if last_crawled:
            existing["last_crawled"] = last_crawled
        return
    tracker[url] = {
        "url": url,
        "gsc_issue": issue,
        "last_crawled": last_crawled,
        "action": action,
        "status": status,
        "notes": notes,
    }


def ingest_folder(
    tracker: dict[str, dict[str, str]],
    folder: Path,
    issue: str,
    action: str,
) -> int:
    files = find_table_files(folder)
    if not files:
        return 0
    count = 0
    for table in files:
        for row in read_table_csv(table):
            upsert(tracker, row["url"], issue, action, row.get("last_crawled", ""))
            count += 1
    return count


def main() -> None:
    tracker = load_tracker()
    added = 0

    for name, (issue, action) in EXPORT_MAP.items():
        n = ingest_folder(tracker, EXPORTS / name, issue, action)
        if n:
            print(f"exports/{name}: {n} URLs")
            added += n

    for name, (issue, action) in IMPORT_MAP.items():
        folder = IMPORTS / name
        files = find_table_files(folder)
        if not files:
            print(f"imports/{name}: MISSING (drop Table.csv here)")
            continue
        n = ingest_folder(tracker, folder, issue, action)
        print(f"imports/{name}: {n} URLs")
        added += n

    fields = ["url", "gsc_issue", "last_crawled", "action", "status", "notes"]
    with TRACKER.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for url in sorted(tracker):
            row = tracker[url]
            for field in fields:
                row.setdefault(field, "")
            w.writerow(row)

    by_issue: dict[str, int] = {}
    by_action: dict[str, int] = {}
    for row in tracker.values():
        by_issue[row.get("gsc_issue", "unknown")] = by_issue.get(row.get("gsc_issue", "unknown"), 0) + 1
        by_action[row.get("action", "unknown")] = by_action.get(row.get("action", "unknown"), 0) + 1

    print(f"\nWrote {len(tracker)} unique URLs -> {TRACKER.relative_to(PHASE0.parents[1])}")
    print("\nBy action:")
    for k, v in sorted(by_action.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
