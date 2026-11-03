"""
Open-Lexicon 25K Master Database & Distribution Exporter
Unified orchestration tool to build SQLite (with FTS5), Anki TSV, JSONL, 
web shards, and zipped distribution packages from enriched JSON batches.
"""

import argparse
import string
import sys
import time
import zipfile
from pathlib import Path

# Ensure UTF-8 output on Windows
sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "src"
DATA_DIR = ROOT / "data"
EXPORTS_DIR = DATA_DIR / "exports"
STATIC_DIR = ROOT / "app" / "static"
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

# Add src to sys.path so we can import exporter modules
sys.path.insert(0, str(SRC_DIR))

try:
    from export_sqlite import export_all as run_export_sqlite
    from export_anki import export_anki as run_export_anki
    from export_jsonl import export_jsonl as run_export_jsonl
    from export_web_shards import export_shards
except ImportError as e:
    print(f"Error importing exporter modules: {e}")
    sys.exit(1)


def build_zip_releases():
    """Build compressed release archives for GitHub Releases."""
    required_web_files = [
        STATIC_DIR / name
        for name in ("index.html", "styles.css", "app.js", "worker.js", "db.js", "data.js", "sw.js")
    ]
    required_web_files.append(STATIC_DIR / "data" / "search_index.json")
    required_web_files.extend(
        STATIC_DIR / "data" / "shards" / f"{key}.json"
        for key in [*string.ascii_lowercase, "other"]
    )
    missing = [str(path.relative_to(ROOT)) for path in required_web_files if not path.is_file()]
    if missing:
        raise FileNotFoundError(
            "Static web release is incomplete. Restore missing assets or run --web "
            "to generate web data from the SQLite export. Missing: " + ", ".join(missing)
        )

    print("\n📦 Packaging distribution archives for GitHub Releases...")
    targets = [
        ("open_lexicon_25k.db", "open_lexicon_25k_sqlite.zip"),
        ("open_lexicon_25k_anki.tsv", "open_lexicon_25k_anki.zip"),
        ("open_lexicon_25k.jsonl", "open_lexicon_25k_jsonl.zip"),
    ]

    for src_name, zip_name in targets:
        src_path = EXPORTS_DIR / src_name
        zip_path = EXPORTS_DIR / zip_name
        if not src_path.exists():
            print(f"  ⚠️ Skipping {src_name}: file does not exist")
            continue

        print(f"  Compressing {src_name} -> {zip_name} ...")
        t0 = time.time()
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            zf.write(src_path, arcname=src_name)
        orig_mb = src_path.stat().st_size / (1024 * 1024)
        zip_mb = zip_path.stat().st_size / (1024 * 1024)
        t_cost = time.time() - t0
        print(f"  ✅ Created {zip_name}: {orig_mb:.1f} MB -> {zip_mb:.1f} MB (took {t_cost:.1f}s)")

    zip_path = EXPORTS_DIR / "open_lexicon_25k_web_static.zip"
    print(f"  Compressing app/static/ -> {zip_path.name} ...")
    t0 = time.time()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in sorted(STATIC_DIR.rglob("*")):
            if path.is_file():
                zf.write(path, arcname=path.relative_to(STATIC_DIR).as_posix())
    zip_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"  ✅ Created {zip_path.name}: {zip_mb:.1f} MB (took {time.time() - t0:.1f}s)")


def main():
    parser = argparse.ArgumentParser(description="Open-Lexicon 25K Master Exporter")
    parser.add_argument("--all", action="store_true", help="Export all formats (SQLite, Anki, JSONL, web shards) and create release zips")
    parser.add_argument("--sqlite", action="store_true", help="Export SQLite database only")
    parser.add_argument("--anki", action="store_true", help="Export Anki TSV only")
    parser.add_argument("--jsonl", action="store_true", help="Export JSONL only")
    parser.add_argument("--web", action="store_true", help="Export web search index and detail shards from the existing SQLite database")
    parser.add_argument("--zip", action="store_true", help="Build zip release packages for GitHub Releases")
    args = parser.parse_args()

    # Default to exporting everything if no specific target is given
    do_all = args.all or not any((args.sqlite, args.anki, args.jsonl, args.web, args.zip))
    t_start = time.time()

    print("=" * 60)
    print("🚀 Open-Lexicon 25K Master Exporter")
    print("=" * 60)

    if do_all or args.sqlite:
        print("\n[1/4] Building SQLite production database (with FTS5)...")
        run_export_sqlite()

    if do_all or args.anki:
        print("\n[2/4] Building Anki high-aesthetic card pack...")
        run_export_anki()

    if do_all or args.jsonl:
        print("\n[3/4] Building JSONL corpus for LLM / RAG...")
        run_export_jsonl()

    if do_all or args.web:
        print("\n[4/4] Building static web search index and detail shards...")
        export_shards()

    if do_all or args.zip:
        build_zip_releases()

    print("\n" + "=" * 60)
    print(f"✨ All exports completed successfully in {time.time() - t_start:.2f} seconds!")
    print(f"📂 Output directory: {EXPORTS_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
