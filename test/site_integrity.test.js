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

test("English pages advertise the theprojectcoem.github.io domain", () => {
  const offenders = [];
  for (const file of authoredHtml.concat(["embeddings.html"])) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    if (html.includes("https://projectcoem.github.io")) offenders.push(file);
    assert.doesNotMatch(html, /theprojectcoem\.co/);
  }
  assert.deepEqual(
    offenders,
    [],
    `English pages still mention projectcoem.github.io:\n${offenders.join("\n")}`
  );
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

test("every narration surface uses the packaged English fallback audio", () => {
  const fallback = "static/audios_en/They_are_made_out_of_meat_terry.mp3";
  assert.equal(fs.existsSync(path.join(root, fallback)), true);
  for (const file of [
    "stories_script.js",
    "authorToAuthor3D.html",
    "authorToAuthor3DSmall.html",
  ]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /audios_en\/They_are_made_out_of_meat_terry\.mp3/);
    assert.doesNotMatch(source, /tenquita\.mp3|audios_es/);
  }
  assert.equal(fs.existsSync(path.join(root, "static/tenquita.mp3")), false);
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
