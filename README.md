# Coem

Coem is an English-language interface for reading, listening to, and discovering classic short stories and poems through semantic embeddings.

The site is published with GitHub Pages. The Spanish edition is available at [estevefact.github.io](https://estevefact.github.io/).

## Explore

- Home: `index.html`
- Story reader: `stories-info.html`
- Poem reader: `poems-info.html`
- Embedding projector: `embeddings.html`
- Story-author map: `authorToAuthor3DSmall.html`
- Complete author map: `authorToAuthor3D.html`

## Reader features

The story and poem readers work on desktop and mobile and include:

- semantic recommendations with author, country, reading time, and similarity;
- direct links through `?story=<uuid>` and `?poem=<uuid>`;
- unified search across titles, authors, countries, genres, and years;
- combinable country, genre, and maximum-reading-time filters;
- a filtered “Surprise me” action;
- light and dark themes with adjustable text size;
- browser-local bookmarks and reading history;
- native sharing when available, with link-copy fallback;
- animated p5 author portraits;
- story narration when an audio file is available;
- accessible focus management and screen-reader announcements;
- related authors calculated from story or poem embedding centroids;
- a shared main menu across readers, author maps, and the projector.

Poems intentionally do not include an audio player. Bookmarks, history, and preferences stay in the browser’s `localStorage` and are never sent elsewhere.

When the story reader opens without a valid `?story=` parameter, it chooses a random story. Valid direct links always preserve the requested work.

## Fast startup

The first literary work and its author information load before secondary discovery indexes:

- Poems start from `static/poemStartupPool.json`, a compact and varied startup set.
- The full poem catalog, semantic neighbors, metadata, and author recommendations load after the first poem is visible.
- Stories start from `static/storyReaderCatalog.json` instead of the full author graph.
- Story text is loaded from the English corpus in `static/Cuentos_english/`,
  with narration resolved from `static/audios_en/`.
- Story neighbors, metadata, and related-author indexes also hydrate after the first story renders.
- p5 loads in the background, so portrait animation cannot block the text.
- Theme, typography, bookmarks, and reading remain available during discovery hydration.

This keeps the critical startup path small without removing search, filters, recommendations, or reader controls.

## Semantic data

Recommendations are precalculated with cosine similarity over exported embedding tensors:

- `static/storyEmbeddingNeighbors.json`
- `static/poemEmbeddingNeighbors.json`
- `static/authorEmbeddingNeighbors.json`
- `static/poemAuthorEmbeddingNeighbors.json`

Story-author and poem-author recommendations are kept separate. Author similarity is calculated by normalizing each work vector, grouping works by author, calculating each author centroid, and comparing centroids with cosine similarity.

If a work is absent from a tensor export, generation tools produce deterministic same-author fallbacks until embeddings are regenerated.

## Accessibility and responsive behavior

- Reader search and filters use labeled native controls.
- Map filter menus support click, arrow keys, Home, End, and Escape.
- Author suggestions are exposed as buttons in a listbox.
- Reader navigation moves focus to the newly loaded work.
- Mobile layouts avoid horizontal overflow and maintain touch targets of at least 44 pixels.

## Local development

Serve the repository root:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000/](http://localhost:8000/). Do not open the HTML files with `file://`; readers load JSON through `fetch`.

Install dependencies and run all Node tests:

```bash
npm install
npm test
```

Run the real Chromium interaction suite:

```bash
npm run test:browser
```

The test suites cover semantic neighbors, combined search and filters, “Surprise me,” bookmarks, history, reading time, startup catalogs, keyboard map controls, unique HTML IDs, local resources, responsive overflow, and touch targets.

## Regenerating indexes

The generators require Python and NumPy:

```bash
python3 tools/generate_nearest_stories.py
python3 tools/generate_nearest_poems.py
python3 tools/generate_author_embedding_neighbors.py
python3 tools/generate_poem_author_embedding_neighbors.py
python3 tools/generate_reader_startup_data.py
```

Heavy tensor inputs live in `tensors_generator/`. Generated browser-ready artifacts live in `static/`.

## Project structure

```text
stories-info.html              Story reader
poems-info.html                Poem reader
authorToAuthor3D.html          Complete author map
authorToAuthor3DSmall.html     Story-author map
embeddings.html                TensorFlow embedding projector
reader_ui.css                  Shared responsive reader design
reader_features.js             Preferences, filters, history, sharing
stories_core.js                Testable story catalog and neighbor logic
author_similarity.js           Similarity formatting and author labels
map_controls.js                Accessible map menus and comboboxes
stories_script.js              Story-reader integration
poems_script.js                Poem-reader integration
tools/                         Reproducible index generators
test/                          Unit and integrity tests
browser-tests/                 Full Chromium interaction tests
```

## Known limitations

- GitHub Pages storage and file-size limits prevent hosting every audio file and translation.
- Some biographies and author relationships still require manual review.
- The projector has practical color-category limits for very large datasets.

## Contributing

Pull requests are welcome, especially for metadata corrections, accessibility improvements, translation review, and additional tests. After changing catalogs or tensors, regenerate the affected indexes and run both test suites.

The relationship visualization was created with contributions from [@AgustinVallejo](https://github.com/AgustinVallejo).

[Donate with PayPal](https://www.paypal.com/donate?hosted_button_id=F43U7EFMW5N2A)
