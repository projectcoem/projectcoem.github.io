const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const authoredHtml = [
  "index.html",
  "stories-info.html",
  "poems-info.html",
  "authorToAuthor3D.html",
  "authorToAuthor3DSmall.html",
  "authorToAuthor3DSmall_english.html",
  "author_info_smaller.html",
  "author_info_smaller_stories.html",
  "custom-icons.html",
  "static/particleDraw.html",
];

test("authored HTML pages do not contain duplicate ids", () => {
  for (const file of authoredHtml) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    assert.deepEqual(duplicates, [], `${file} has duplicate ids: ${duplicates.join(", ")}`);
  }
});

test("local HTML resources exist", () => {
  const htmlFiles = fs.readdirSync(root)
    .filter(file => file.endsWith(".html") && file !== "embeddings.html")
    .concat(["static/particleDraw.html"]);
  const missing = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const reference = match[1].split(/[?#]/)[0];
      if (!reference
        || /^(?:https?:)?\/\//i.test(reference)
        || /^(?:#|data:|mailto:|javascript:)/i.test(reference)
        || reference.includes("{{")
        || reference.startsWith("[[")) continue;
      const resolved = reference.startsWith("/")
        ? path.join(root, reference)
        : path.resolve(path.dirname(path.join(root, file)), reference);
      if (!fs.existsSync(resolved)) missing.push(`${file}: ${reference}`);
    }
  }
  assert.deepEqual(missing, [], `missing resources:\n${missing.join("\n")}`);
});

test("authored navigation keeps GitHub Pages-safe relative links", () => {
  const offenders = [];
  for (const file of authoredHtml.concat(["embeddings.html"])) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of html.matchAll(/window\.location\.href\s*=\s*['"]\/[^'"]+/g)) {
      offenders.push(`${file}: ${match[0]}`);
    }
    for (const match of html.matchAll(/\blocation\.href\s*=\s*['"]\/[^'"]+/g)) {
      offenders.push(`${file}: ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `root-relative JS navigation:\n${offenders.join("\n")}`);
});

test("public pages link to the updated Spanish edition", () => {
  for (const file of [
    "index.html",
    "stories-info.html",
    "poems-info.html",
    "authorToAuthor3D.html",
    "authorToAuthor3DSmall.html",
    "embeddings.html",
  ]) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(
      html,
      /https:\/\/estevefact\.github\.io\//,
      `${file} must link to the Spanish edition`
    );
  }
});

test("embedding projector uses the English visualization config", () => {
  const html = fs.readFileSync(path.join(root, "embeddings.html"), "utf8");
  assert.match(
    html,
    /projector-config-json-path="oss_data\/oss_demo_projector_config_english\.json"/
  );
  assert.doesNotMatch(
    html,
    /projector-config-json-path="oss_data\/oss_demo_projector_config\.json"/
  );

  const config = JSON.parse(fs.readFileSync(
    path.join(root, "oss_data/oss_demo_projector_config_english.json"),
    "utf8"
  ));
  const configText = JSON.stringify(config);
  assert.match(configText, /Short story embeddings/);
  assert.doesNotMatch(configText, /Embeddings de|stories_metadata\.tsv/);
  assert.match(configText, /stories_metadata_english\.tsv/);
});

test("English pages advertise the live projectcoem.github.io domain", () => {
  const offenders = [];
  const legacyPagesUrl = ["https://theprojectcoem", "github", "io"].join(".");
  const canonicalPages = [
    "index.html",
    "stories-info.html",
    "authorToAuthor3D.html",
    "authorToAuthor3DSmall.html",
    "embeddings.html",
  ];
  for (const file of authoredHtml.concat(["embeddings.html"])) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    if (html.includes(legacyPagesUrl)) offenders.push(file);
    assert.doesNotMatch(html, /theprojectcoem\.co/);
  }
  for (const file of canonicalPages) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, /https:\/\/projectcoem\.github\.io\//);
  }
  assert.deepEqual(
    offenders,
    [],
    `English pages still mention the legacy Pages URL:\n${offenders.join("\n")}`
  );
});

test("reader pages expose same-item Spanish counterparts", () => {
  const storiesHtml = fs.readFileSync(path.join(root, "stories-info.html"), "utf8");
  const poemsHtml = fs.readFileSync(path.join(root, "poems-info.html"), "utf8");
  const storiesScript = fs.readFileSync(path.join(root, "stories_script.js"), "utf8");
  const poemsScript = fs.readFileSync(path.join(root, "poems_script.js"), "utf8");

  assert.match(storiesHtml, /data-spanish-counterpart/);
  assert.match(storiesHtml, /https:\/\/estevefact\.github\.io\/stories-info\.html/);
  assert.match(storiesScript, /SPANISH_STORY_URL/);
  assert.match(storiesScript, /\?story=\$\{encodeURIComponent\(storyId\)\}/);

  assert.match(poemsHtml, /data-spanish-counterpart/);
  assert.match(poemsHtml, /https:\/\/estevefact\.github\.io\/poems-info\.html/);
  assert.match(poemsScript, /SPANISH_POEM_URL/);
  assert.match(poemsScript, /\?poem=\$\{encodeURIComponent\(poemId\)\}/);
});

test("homepage tagline is English text instead of the old Spanish bitmap", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /Sketching the map of universal literature/);
  assert.doesNotMatch(html, /coem_description\.png/);
});

test("English build does not declare an abandoned custom domain", () => {
  assert.equal(fs.existsSync(path.join(root, "CNAME")), false);
});

test("English build excludes Spanish story and audio asset trees", () => {
  assert.equal(fs.existsSync(path.join(root, "static/Cuentos")), false);
  assert.equal(fs.existsSync(path.join(root, "static/audios_es")), false);
  assert.equal(fs.existsSync(path.join(root, "static/Cuentos_english")), true);
  assert.equal(fs.existsSync(path.join(root, "static/audios_en")), true);
});

test("story narration only plays exact English audio matches", () => {
  const graph = JSON.parse(fs.readFileSync(
    path.join(root, "static/storyReaderCatalog.json"),
    "utf8"
  ));
  const storyIds = graph.nodes.flatMap(author => Object.keys(author.stories || {}));
  const audioFiles = new Set(fs.readdirSync(path.join(root, "static/audios_en")));
  const exactAudioCount = storyIds.filter(id => audioFiles.has(`${id}.mp3`)).length;
  const missingAudioCount = storyIds.length - exactAudioCount;
  const fallbackName = ["They_are_made_out_of_meat", "terry.mp3"].join("_");
  const oldSpanishAudio = ["algo_grave", "va_a_ocurrir.mp3"].join("_");

  assert.ok(exactAudioCount > 0);
  assert.ok(missingAudioCount > 0);
  for (const file of [
    "static/authorLinksSmallerAllStories.json",
    "static/authorLinksSmaller_new.json",
    "static/authorLinksSmallerShortCleaned_new.json",
    "static/storyReaderCatalog.json",
  ]) {
    const data = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    const nodesWithLegacyAudio = (data.nodes || [])
      .filter(node => Object.hasOwn(node, "audio"))
      .map(node => node.id);
    assert.deepEqual(
      nodesWithLegacyAudio,
      [],
      `${file} still contains legacy audio fields`
    );
  }
  for (const file of [
    "stories_script.js",
    "authorToAuthor3D.html",
    "authorToAuthor3DSmall.html",
    "authorToAuthor3DSmall_english.html",
    "author_info_smaller.html",
    "author_info_smaller_stories.html",
  ]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /audios_en|audio-status|popup-audio/);
    assert.doesNotMatch(source, new RegExp(fallbackName));
    assert.doesNotMatch(source, new RegExp(oldSpanishAudio));
    assert.doesNotMatch(source, /tenquita\.mp3|audios_es/);
  }
  const readerScript = fs.readFileSync(path.join(root, "stories_script.js"), "utf8");
  assert.match(readerScript, /No English narration is available/);
  assert.match(readerScript, /audio\.hidden = true/);
});

test("English poem catalog contains only reviewed, source-tracked translations", () => {
  const catalog = JSON.parse(fs.readFileSync(
    path.join(root, "static/poems_english.json"),
    "utf8"
  ));
  const progress = JSON.parse(fs.readFileSync(
    path.join(root, "static/poemTranslationProgress.json"),
    "utf8"
  ));
  assert.equal(catalog.poems.length, progress.completedPoems);
  assert.ok(catalog.poems.length > 0);
  for (const poem of catalog.poems) {
    const translatedPath = path.join(
      root,
      "static/Poemas_english",
      `${poem.id}.json`
    );
    assert.ok(fs.existsSync(translatedPath));
    const translated = JSON.parse(fs.readFileSync(translatedPath, "utf8"));
    assert.equal(translated.translation.status, "reviewed");
    assert.equal(translated.translation.source_language, "es");
    assert.equal(translated.translation.target_language, "en");
    assert.ok(translated.translation.source_sha256);
    assert.ok(translated.translation.title);
    assert.ok(translated.text);
  }
});
