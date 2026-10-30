# English poem translation progress

`static/poemTranslationProgress.json` is the canonical machine-readable state.
This ledger records reviewed batches so the editorial sequence remains easy to
resume.

The reviewed baseline through batch `0189` is 1,334 poems. Batch `0190` is a
reserved draft in the original checkout and remains unchanged.

| Batch | Status | Authors | Reviewed | Running total |
| --- | --- | --- | ---: | ---: |
| `0191-pizarnik-tapia-storni.json` | Reviewed | Alfonsina Storni (4), Alejandra Pizarnik (3), Alejandro Tapia y Rivera (8) | 15 | 1,349 |
| `0192-tapia-storni.json` | Reviewed | Alejandro Tapia y Rivera (1), Alfonsina Storni (14) | 15 | 1,364 |
| `0193-tapia-storni-reyes-espino.json` | Reviewed | Alejandro Tapia y Rivera (1), Alfonsina Storni (1), Alfonso Reyes (8), Alfredo Espino (9), Amado Nervo (1) | 20 | 1,384 |
| `0194-amado-nervo.json` | Reviewed | Amado Nervo (20) | 20 | 1,404 |
| `0195-ginsberg-lamartine-nervo-breton.json` | Reviewed | Allen Ginsberg (3), Alphonse de Lamartine (1), Amado Nervo (11), André Breton (3), Andrés Sánchez Robayna (1), Andrés Trapiello (1) | 20 | 1,424 |
| `0196-breton-bello-blanco.json` | Reviewed | André Breton (7), Andrés Bello (2), Andrés Eloy Blanco (10) | 19 | 1,443 |
| `0197-poliziano-akhmatova-cabrera.json` | Reviewed | Angelo Poliziano (1), Anna Ajmátova (7), Antonio Cabrera (1) | 9 | 1,452 |
| `0198-carvajal-colinas-machado.json` | Reviewed | Antonio Carvajal (1), Antonio Colinas (1), Antonio Machado (6) | 8 | 1,460 |
| `0199-machado-rimbaud.json` | Reviewed | Antonio Machado (4), Arthur Rimbaud (11) | 15 | 1,475 |
| `0200-rimbaud-march-brecht.json` | Reviewed | Arthur Rimbaud (4), Ausiàs March (6), Bertolt Brecht (3) | 13 | 1,488 |
| `0201-brecht-varela.json` | Reviewed | Bertolt Brecht (3), Blanca Varela (6) | 9 | 1,497 |
| `0202-reviewed-batch.json` | Reviewed | Blanca Varela (1), Blas de Otero (2), Carl Sandburg (1), Carlos Barral (6), Carlos Castro Saavedra (1), Carlos Pellicer (3) | 14 | 1,511 |
| `0203-pellicer-conde.json` | Reviewed | Carlos Pellicer (14), Carmen Conde (1) | 15 | 1,526 |
| `0204-conde.json` | Reviewed | Carmen Conde (15) | 15 | 1,541 |

The four Ada Negri records skipped before batch 0191 have corrupt Spanish
source bodies. Six additional records through batch 0196 have title/body
mismatches and are also excluded. Their IDs and reasons are recorded in
`poem_exclusions.json`; eight further confirmed neighboring-poem mismatches
from batches 0197–0198, twelve records from batches 0199–0200, six records
from batch 0201, six records from batch 0202, and one record each from batches
0203–0204 bring the exclusion total to 147.
The batch selector also skips duplicate IDs with the same corrupt body hash.
Selection collapses whitespace so formatting-only variants are not translated
again. Progress counts and translation provenance continue to use the exact
source SHA-256; punctuation and wording changes remain distinct texts.

The reviewed sequence is complete through batch 0204. Batch 0205 is next; there
is no pending editorial work in the reviewed batches.

## Continue the translation sequence

```bash
python3 tools/poem_translation_tracker.py status
python3 tools/poem_translation_tracker.py next --limit 40 > /tmp/coem-poems-next.json
python3 tools/poem_translation_tracker.py import-batch \
  translations/poem_batches/NNNN-reviewed-batch.json
node tools/generate_english_poem_neighbors.cjs
python3 tools/generate_literary_guesser_data.py
node --test
```

Every reviewed manifest keeps the stable poem ID, source SHA-256, translated
title and text, and an editorial note. Import only after checking the source
hash, line and stanza coverage, English wording, and any documented repair to
the stored source.
