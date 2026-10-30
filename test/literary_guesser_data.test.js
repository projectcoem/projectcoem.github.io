const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const catalog = read('static/literaryGuesserCatalog.json');
const storyMetadata = read('static/storyReaderMetadata.json');
const poemMetadata = read('static/poemReaderMetadata.json');
const poemSource = read('static/poems_english.json');
const rawPoemSource = read('static/poems.json');
const localIds = (folder) => new Set(fs.readdirSync(path.join(ROOT, folder))
  .filter((file) => file.endsWith('.json')).map((file) => path.basename(file, '.json')));
const normalize = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();

function assertMetadataShape(item, kind) {
  assert.ok(Number.isFinite(item.readingTime) && item.readingTime >= 0);
  assert.ok(Number.isInteger(item.wordCount) && item.wordCount >= 0);
  assert.ok(Number.isInteger(item.familiarity) && item.familiarity >= 0 && item.familiarity <= 10);
  assert.ok(Number.isInteger(item.readingComplexity) && item.readingComplexity >= 0 && item.readingComplexity <= 10);
  assert.ok(item.isClassic === 0 || item.isClassic === 1);
  assert.equal(typeof item.classificationStatus, 'string');
  assert.equal(typeof item.unreviewed, 'boolean');
  assert.equal(typeof item.quizEligible, 'boolean');
  if (kind) assert.equal(item.kind, kind);
}

test('English Literary Oracle joins only local translated works to unified authors', () => {
  assert.equal(catalog.version, 1);
  assert.equal(catalog.authors.length, 358);
  assert.equal(catalog.stories.filter((item) => item.kind === 'story').length, 2758);
  assert.equal(catalog.stories.filter((item) => item.kind === 'poem').length, 1612);
  const storyFiles = localIds('static/Cuentos_english');
  const poemFiles = localIds('static/Poemas_english');
  const authorIds = new Set(catalog.authors.map((author) => author.id));
  assert.equal(authorIds.size, catalog.authors.length);
  const ids = new Set();
  for (const item of catalog.stories) {
    assert.equal(ids.has(item.id), false); ids.add(item.id);
    assert.equal(authorIds.has(item.authorId), true);
    assert.equal((item.kind === 'story' ? storyFiles : poemFiles).has(item.id), true);
    const metadata = item.kind === 'poem' ? poemMetadata[item.id] : storyMetadata[item.id];
    assert.ok(metadata, `${item.id} is missing reader metadata`);
    for (const field of ['wordCount', 'familiarity', 'readingComplexity', 'isClassic', 'quizEligible']) {
      assert.equal(item[field], metadata[field], `${item.id}: ${field} differs between catalogs`);
    }
  }
});

test('reader metadata classifies every English file and preserves raw poem ids as excluded', () => {
  const stories = localIds('static/Cuentos_english');
  const poems = localIds('static/Poemas_english');
  const rawPoems = new Set(rawPoemSource.poems.map((poem) => poem.id));
  assert.deepEqual(new Set(Object.keys(storyMetadata)), stories);
  assert.deepEqual(new Set(Object.keys(poemMetadata)), rawPoems);
  for (const id of stories) assertMetadataShape(storyMetadata[id]);
  for (const id of poems) {
    assertMetadataShape(poemMetadata[id], 'poem');
    assert.equal(poemMetadata[id].unreviewed, false);
  }
  for (const id of rawPoems) {
    assert.ok(poemMetadata[id]);
    if (!poems.has(id)) {
      assert.equal(poemMetadata[id].classificationStatus, 'unmapped');
      assert.equal(poemMetadata[id].quizEligible, false);
      assert.equal(poemMetadata[id].unreviewed, true);
    }
  }
});

test('every playable poem has reviewed English translation provenance', () => {
  const sourceIds = new Set(poemSource.poems.map((poem) => poem.id));
  assert.equal(sourceIds.size, 1612);
  for (const poem of catalog.stories.filter((item) => item.kind === 'poem')) {
    assert.equal(sourceIds.has(poem.id), true);
    const body = read(`static/Poemas_english/${poem.id}.json`);
    assert.equal(body.translation?.source_language, 'es');
    assert.equal(body.translation?.target_language, 'en');
    assert.equal(body.translation?.status, 'reviewed');
    assert.ok(body.text.trim().length > 0);
  }
});

test('catalog display metadata is English while raw tag provenance is retained', () => {
  const spanish = /^(España|Francia|Rusia|Inglaterra|Estados Unidos|Escocia|Hungria|Noruega|Nueva Zelanda|Suecia|Oriente|Romanticismo|Modernismo|Dramaturgia|Histórico|Periodismo|Simbolismo|Surrealismo|Comedia|Fantasía|historias cortas|Chejov)$/i;
  for (const author of catalog.authors) {
    assert.equal(author.id, author.name);
    assert.ok(['male', 'female', 'unknown'].includes(author.sex));
    for (const value of [...author.countries, ...author.genres]) assert.doesNotMatch(value, spanish);
    for (const tag of author.weirdTags) {
      assert.doesNotMatch(tag.label, /suicidas|exiliad|médic|asteroide|autobiógraf/i);
      assert.equal(typeof tag.rawCategory, 'string');
      assert.match(tag.source, /^https:\/\//);
    }
  }
  const suicideTag = catalog.authors.flatMap((author) => author.weirdTags)
    .find((tag) => /suicid/i.test(tag.rawCategory));
  assert.equal(suicideTag.label, 'Writers who died by suicide');
  const cortazar = catalog.authors.find((author) => author.name === 'Julio Cortázar');
  assert.deepEqual(cortazar.countries, ['Argentina', 'France']);
  const anonymous = catalog.authors.find((author) => author.name === 'Anonymous');
  assert.ok(anonymous);
  assert.deepEqual(anonymous.countries, []);
  assert.ok(catalog.stories.filter((item) => item.authorId === anonymous.id)
    .every((item) => item.quizEligible === false));
});

test('curated story ratings and disputed attributions retain their boundaries', () => {
  const expected = new Map([
    ['6e9e02d2-cbed-4113-8d61-329cc63143a4', ['The dinosaur', 10, 0]],
    ['c4c576bf-194b-4186-a958-957681ff1cd4', ['Love is 77', 9, 1]],
    ['48d207d1-3a9f-4972-b28a-c27684afed92', ['A little fable', 9, 1]],
    ['6f1fd77c-cbcb-4af8-b8ce-7386a4d3518b', ['From Rigour in Science', 9, 2]],
  ]);
  for (const [id, [title, familiarity, complexity]] of expected) {
    const item = catalog.stories.find((story) => story.id === id);
    assert.equal(item.title, title);
    assert.equal(item.familiarity, familiarity);
    assert.equal(item.readingComplexity, complexity);
    assert.equal(item.quizEligible, true);
  }
  for (const id of ['43c5dcfd-ac67-4dac-be2e-b97c8a314534', '799a672c-3226-4f98-a193-d6cfa4cb94e7']) {
    const story = catalog.stories.find((item) => item.id === id);
    assert.equal(story.quizEligible, false);
    assert.equal(storyMetadata[id].attributionStatus, 'disputed');
    assert.match(storyMetadata[id].attributionSource, /^https:\/\/quoteinvestigator\.com\//);
  }
});

test('Machado resolves to the cited complete Spain 1875 authority record', () => {
  const machado = catalog.authors.find((author) => author.name === 'Antonio Machado');
  assert.deepEqual(machado.countries, ['Spain']);
  assert.equal(machado.birthYear, 1875);
  assert.equal(machado.sex, 'male');
  assert.equal(machado.biographyConflict, false);
  assert.equal(machado.biographySource, 'https://www.bne.es/es/autores/machado-antonio');
});

test('generator output is byte-for-byte reproducible', () => {
  const files = ['static/literaryGuesserCatalog.json', 'static/storyReaderMetadata.json',
    'static/poemReaderMetadata.json'];
  const before = files.map((file) => fs.readFileSync(path.join(ROOT, file)));
  const { execFileSync } = require('node:child_process');
  execFileSync('python3', ['tools/generate_literary_guesser_data.py'], { cwd: ROOT });
  const after = files.map((file) => fs.readFileSync(path.join(ROOT, file)));
  before.forEach((value, index) => assert.deepEqual(after[index], value));
});
