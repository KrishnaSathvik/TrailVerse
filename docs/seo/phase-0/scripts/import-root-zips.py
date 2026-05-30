#!/usr/bin/env python3
"""Import GSC Coverage*.zip files from repo root into phase-0 exports/imports."""

from __future__ import annotations

import re
import shutil
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
PHASE0 = Path(__file__).resolve().parents[1]
EXPORTS = PHASE0 / "exports"
IMPORTS = PHASE0 / "imports"

ISSUE_TO_IMPORT = {
    "not found (404)": "not-found-404",
    "page with redirect": "page-with-redirect",
    "crawled - currently not indexed": "crawled-not-indexed",
    "discovered - currently not indexed": "discovered-not-indexed",
    "excluded by 'noindex' tag": "excluded-noindex",
    "excluded by ‘noindex’ tag": "excluded-noindex",
    "alternate page with proper canonical tag": "alternate-canonical",
}

ISSUE_TO_EXPORT = {
    "blocked by robots.txt": "drilldown-blocked-by-robots",
    "indexed, though blocked by robots.txt": "drilldown-indexed-blocked-by-robots",
}


def normalize_issue(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def read_issue_from_zip(zpath: Path) -> str | None:
    with zipfile.ZipFile(zpath) as zf:
        meta_names = [n for n in zf.namelist() if n.endswith("Metadata.csv")]
        if not meta_names:
            return None
        raw = zf.read(meta_names[0]).decode("utf-8-sig")
        for line in raw.splitlines():
            if line.lower().startswith("issue,"):
                return line.split(",", 1)[1].strip().strip('"')
    return None


def extract_zip(zpath: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    # Clear previous csv exports in dest (keep .gitkeep in imports parent only)
    for f in dest.glob("*"):
        if f.is_file():
            f.unlink()
    with zipfile.ZipFile(zpath) as zf:
        zf.extractall(dest)
    print(f"  -> {dest.relative_to(REPO_ROOT)}")


def main() -> None:
    zips = sorted(REPO_ROOT.glob("https___www.nationalparksexplorerusa.com_-Coverage*.zip"))
    if not zips:
        print(f"No GSC zips in {REPO_ROOT}")
        return

    print(f"Found {len(zips)} zip(s) in project root:\n")
    for zpath in zips:
        print(zpath.name)
        issue = read_issue_from_zip(zpath)
        if not issue:
            # Main coverage summary (no per-issue Table.csv)
            dest = EXPORTS / "coverage-main"
            extract_zip(zpath, dest)
            print("  type: main coverage summary")
            continue

        key = normalize_issue(issue)
        if key in ISSUE_TO_EXPORT:
            dest = EXPORTS / ISSUE_TO_EXPORT[key]
            extract_zip(zpath, dest)
            print(f"  issue: {issue}")
            continue

        import_folder = ISSUE_TO_IMPORT.get(key)
        if import_folder:
            dest = IMPORTS / import_folder
            extract_zip(zpath, dest)
            print(f"  issue: {issue}")
            continue

        print(f"  WARN: unmapped issue '{issue}' — add mapping in import-root-zips.py")

    print("\nRun: python3 docs/seo/phase-0/scripts/merge-gsc-exports.py")


if __name__ == "__main__":
    main()
