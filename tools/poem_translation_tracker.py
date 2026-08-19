#!/usr/bin/env python3
"""Track resumable Spanish-to-English literary poem translations."""

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "static/Poemas"
TARGET_DIR = ROOT / "static/Poemas_english"
CATALOG_PATH = ROOT / "static/poems.json"
ENGLISH_CATALOG_PATH = ROOT / "static/poems_english.json"
PROGRESS_PATH = ROOT / "static/poemTranslationProgress.json"
STARTUP_PATH = ROOT / "static/poemEnglishStartupPool.json"
EXCLUSIONS_PATH = ROOT / "translations/poem_exclusions.json"


def compact_text(text):
    return "\n".join(line.rstrip() for line in text.strip().splitlines())


def source_hash(text):
    return hashlib.sha256(compact_text(text).encode("utf-8")).hexdigest()


def load_catalog():
    return json.loads(CATALOG_PATH.read_text())


def load_exclusions():
    if not EXCLUSIONS_PATH.exists():
        return {}
    return {
        entry["id"]: entry
        for entry in json.loads(EXCLUSIONS_PATH.read_text())
    }


def source_record(poem):
    path = SOURCE_DIR / f"{poem['id']}.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    text = compact_text(data.get("text", ""))
    if not text:
        return None
    return {
        "poem": poem,
        "source": data,
        "text": text,
        "hash": source_hash(text),
    }


def translated_records():
    records = {}
    if not TARGET_DIR.exists():
        return records
    for path in TARGET_DIR.glob("*.json"):
        data = json.loads(path.read_text())
        translation = data.get("translation", {})
        if (
            data.get("text")
            and translation.get("status") == "reviewed"
            and translation.get("source_sha256")
        ):
            records[path.stem] = data
    return records


def validate_translation(poem_id, translated, source):
    details = translated["translation"]
    errors = []
    if details.get("source_sha256") != source["hash"]:
        errors.append(f"{poem_id}: source hash is stale")
    if details.get("source_language") != "es":
        errors.append(f"{poem_id}: source_language must be es")
    if details.get("target_language") != "en":
        errors.append(f"{poem_id}: target_language must be en")
    if not details.get("title"):
        errors.append(f"{poem_id}: translated title is missing")
    return errors


def build_state():
    catalog = load_catalog()
    sources = {}
    hashes = defaultdict(list)
    for poem in catalog["poems"]:
        record = source_record(poem)
        if record:
            sources[poem["id"]] = record
            hashes[record["hash"]].append(poem["id"])
    translated = translated_records()
    errors = []
    completed = {}
    for poem_id, result in translated.items():
        source = sources.get(poem_id)
        if not source:
            errors.append(f"{poem_id}: source poem is missing")
            continue
        poem_errors = validate_translation(poem_id, result, source)
        errors.extend(poem_errors)
        if not poem_errors:
            completed[poem_id] = result
    return catalog, sources, hashes, completed, errors


def sync():
    catalog, sources, hashes, completed, errors = build_state()
    if errors:
        raise SystemExit("\n".join(errors))
    completed_ids = set(completed)
    poems = []
    for poem in catalog["poems"]:
        if poem["id"] not in completed_ids:
            continue
        translated = dict(poem)
        translated["story_name"] = completed[poem["id"]]["translation"]["title"]
        poems.append(translated)
    author_ids = {poem["author_uuid"] for poem in poems}
    authors = [
        author for author in catalog["authors"]
        if author["author_uuid"] in author_ids
    ]
    ENGLISH_CATALOG_PATH.write_text(
        json.dumps(
            {"poems": poems, "authors": authors},
            ensure_ascii=False,
            separators=(",", ":"),
        ) + "\n"
    )
    startup_poems = poems[:384]
    startup_author_ids = {
        poem["author_uuid"] for poem in startup_poems
    }
    startup_authors = [
        author for author in authors
        if author["author_uuid"] in startup_author_ids
    ]
    STARTUP_PATH.write_text(
        json.dumps(
            {"poems": startup_poems, "authors": startup_authors},
            ensure_ascii=False,
            separators=(",", ":"),
        ) + "\n"
    )
    unique_completed = {
        sources[poem_id]["hash"] for poem_id in completed_ids
    }
    progress = {
        "schemaVersion": 1,
        "sourcePoems": len(sources),
        "completedPoems": len(completed_ids),
        "remainingPoems": len(sources) - len(completed_ids),
        "uniqueSourceTexts": len(hashes),
        "completedUniqueSourceTexts": len(unique_completed),
        "remainingUniqueSourceTexts": len(hashes) - len(unique_completed),
        "excludedPoems": len(load_exclusions()),
        "catalog": str(ENGLISH_CATALOG_PATH.relative_to(ROOT)),
        "startupCatalog": str(STARTUP_PATH.relative_to(ROOT)),
        "translationDirectory": str(TARGET_DIR.relative_to(ROOT)),
    }
    PROGRESS_PATH.write_text(
        json.dumps(progress, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps(progress, indent=2))


def next_batch(limit, author, max_chars):
    catalog, sources, hashes, completed, errors = build_state()
    if errors:
        raise SystemExit("\n".join(errors))
    completed_hashes = {
        sources[poem_id]["hash"] for poem_id in completed
    }
    exclusions = load_exclusions()
    candidates = []
    for poem in catalog["poems"]:
        record = sources.get(poem["id"])
        if not record or poem["id"] in completed or poem["id"] in exclusions:
            continue
        if record["hash"] in completed_hashes:
            continue
        if author and poem.get("author_name") != author:
            continue
        if len(record["text"]) > max_chars:
            continue
        candidates.append(record)
    candidates.sort(key=lambda record: (
        record["poem"].get("author_name", ""),
        len(record["text"]),
        record["poem"].get("story_name", ""),
    ))
    batch = []
    seen_hashes = set()
    for record in candidates:
        if record["hash"] in seen_hashes:
            continue
        seen_hashes.add(record["hash"])
        poem = record["poem"]
        batch.append({
            "id": poem["id"],
            "title": poem.get("story_name"),
            "author": poem.get("author_name"),
            "source_sha256": record["hash"],
            "duplicatePoemIds": hashes[record["hash"]],
            "text": record["text"],
        })
        if len(batch) == limit:
            break
    print(json.dumps(batch, ensure_ascii=False, separators=(",", ":")))


def import_batch(batch_path):
    _, sources, _, _, _ = build_state()
    batch = json.loads(Path(batch_path).read_text())
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    imported = 0
    for entry in batch:
        poem_id = entry["id"]
        source = sources.get(poem_id)
        if not source:
            raise SystemExit(f"{poem_id}: source poem is missing")
        if entry.get("source_sha256") != source["hash"]:
            raise SystemExit(f"{poem_id}: batch source hash is stale")
        translated_text = compact_text(entry.get("text", ""))
        if not translated_text:
            raise SystemExit(f"{poem_id}: translation is empty")
        output = {
            "metadata": source["source"].get("metadata", {}),
            "text": translated_text,
            "translation": {
                "source_sha256": source["hash"],
                "source_language": "es",
                "target_language": "en",
                "status": "reviewed",
                "translator": "Codex literary translation",
                "title": entry["title"],
                "editorial_note": entry.get("editorial_note", ""),
            },
        }
        (TARGET_DIR / f"{poem_id}.json").write_text(
            json.dumps(output, ensure_ascii=False, indent=2) + "\n"
        )
        imported += 1
    print(f"Imported {imported} reviewed translations")
    sync()


def import_aliases(alias_path):
    _, sources, _, completed, errors = build_state()
    if errors:
        raise SystemExit("\n".join(errors))
    aliases = json.loads(Path(alias_path).read_text())
    imported = 0
    for alias in aliases:
        target_id = alias["id"]
        reviewed_id = alias["translation_id"]
        source = sources.get(target_id)
        reviewed = completed.get(reviewed_id)
        reviewed_source = sources.get(reviewed_id)
        if not source or not reviewed or not reviewed_source:
            raise SystemExit(f"{target_id}: alias or reviewed source is missing")
        if source["hash"] != reviewed_source["hash"]:
            raise SystemExit(f"{target_id}: alias body differs from reviewed translation")
        output = json.loads(json.dumps(reviewed))
        output["metadata"] = source["source"].get("metadata", {})
        output["translation"]["title"] = alias["title"]
        output["translation"]["reused_from"] = reviewed_id
        output["translation"]["editorial_note"] = (
            alias.get("editorial_note")
            or "Reuses a reviewed translation of the identical source body."
        )
        (TARGET_DIR / f"{target_id}.json").write_text(
            json.dumps(output, ensure_ascii=False, indent=2) + "\n"
        )
        imported += 1
    print(f"Imported {imported} duplicate-body aliases")
    sync()


def main():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("status")
    subparsers.add_parser("sync")
    import_parser = subparsers.add_parser("import-batch")
    import_parser.add_argument("path")
    alias_parser = subparsers.add_parser("import-aliases")
    alias_parser.add_argument("path")
    next_parser = subparsers.add_parser("next")
    next_parser.add_argument("--limit", type=int, default=8)
    next_parser.add_argument("--author")
    next_parser.add_argument("--max-chars", type=int, default=1600)
    args = parser.parse_args()
    if args.command in {"status", "sync"}:
        sync()
    elif args.command == "import-batch":
        import_batch(args.path)
    elif args.command == "import-aliases":
        import_aliases(args.path)
    else:
        next_batch(args.limit, args.author, args.max_chars)


if __name__ == "__main__":
    main()
