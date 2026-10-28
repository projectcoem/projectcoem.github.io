const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const tracker = path.join(
  __dirname,
  '..',
  'tools',
  'poem_translation_tracker.py',
);

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

test('next batch deduplicates whitespace without merging changed wording', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coem-poem-tracker-'));
  try {
    const fixtureTracker = path.join(root, 'tools', path.basename(tracker));
    fs.mkdirSync(path.dirname(fixtureTracker), { recursive: true });
    fs.copyFileSync(tracker, fixtureTracker);

    const poems = [
      ['corrupt-source', 'Corrupt source', 'corrupt\nbody'],
      ['corrupt-alias', 'Corrupt alias', 'corrupt   body'],
      ['mismatch-source', 'Mismatched source', 'valid\nsibling body'],
      ['mismatch-sibling', 'Valid sibling', 'valid  sibling body'],
      ['completed', 'Completed', 'already\nreviewed'],
      ['completed-alias', 'Completed alias', 'already   reviewed'],
      ['batch-a', 'Batch A', 'batch\nvariant'],
      ['batch-b', 'Batch B', 'batch   variant'],
      ['punctuation-a', 'Punctuation A', 'eligible phrase.'],
      ['punctuation-b', 'Punctuation B', 'eligible phrase!'],
      ['wording-a', 'Wording A', 'eligible color'],
      ['wording-b', 'Wording B', 'eligible colour'],
    ].map(([id, story_name, text]) => {
      writeJson(path.join(root, 'static', 'Poemas', `${id}.json`), {
        metadata: {},
        text,
      });
      return {
        id,
        story_name,
        author_name: 'Fixture Author',
        author_uuid: 'fixture-author',
      };
    });
    writeJson(path.join(root, 'static', 'poems.json'), {
      poems,
      authors: [],
    });
    writeJson(path.join(root, 'translations', 'poem_exclusions.json'), [
      {
        id: 'corrupt-source',
        status: 'source_corrupt',
        reason: 'Fixture corruption',
      },
      {
        id: 'mismatch-source',
        status: 'source_mismatch',
        reason: 'Fixture title mismatch',
      },
    ]);
    const completedSource = 'already\nreviewed';
    writeJson(
      path.join(root, 'static', 'Poemas_english', 'completed.json'),
      {
        text: 'already reviewed',
        translation: {
          source_sha256: crypto
            .createHash('sha256')
            .update(completedSource)
            .digest('hex'),
          source_language: 'es',
          target_language: 'en',
          status: 'reviewed',
          title: 'Completed',
        },
      },
    );

    const result = spawnSync(
      'python3',
      [fixtureTracker, 'next', '--limit', '10'],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const batch = JSON.parse(result.stdout);
    const ids = batch.map((entry) => entry.id);
    assert.equal(batch.some((entry) => entry.id === 'corrupt-alias'), false);
    assert.equal(batch.some((entry) => entry.id === 'completed-alias'), false);
    assert.equal(ids.includes('mismatch-sibling'), true);
    assert.equal(
      ids.filter((id) => id === 'batch-a' || id === 'batch-b').length,
      1,
    );
    assert.equal(ids.includes('punctuation-a'), true);
    assert.equal(ids.includes('punctuation-b'), true);
    assert.equal(ids.includes('wording-a'), true);
    assert.equal(ids.includes('wording-b'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
