const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../literary_guesser_core.js");
const Resume = require("../literary_guesser_resume.js");

const root = path.resolve(__dirname, "..");
const catalog = Core.normalizeCatalog(JSON.parse(
  fs.readFileSync(path.join(root, "static/literaryGuesserCatalog.json"), "utf8")
));
const stories = Core.selectGameStories(catalog.stories, {
  kind: "both", level: "hard", nationality: "all", genre: "all", classicsOnly: false
}, () => 0.37).stories;
const options = stories.slice(0, 2).map(story => Core.buildGuessOptions(
  catalog.stories, story.author, "hard", () => 0.41
));
const correct = story => ({
  author: story.author.id,
  nationality: story.author.countries[0],
  sex: story.author.sex,
  birthDecade: String(story.author.birthDecade)
});
const saved = {
  version: 1,
  currentGameIds: stories.map(story => story.id),
  roundIndex: 1,
  filters: { kind: "both", level: "hard", nationality: "all", genre: "all", classicsOnly: false },
  optionSets: options,
  answersByRound: [correct(stories[0]), { author: options[1].author[0] }],
  submittedByRound: [true, false, false, false],
  quoteIds: ["not-a-real-quote"],
  finalShown: false
};

test("Oracle resume validates choices and recomputes scores from the current catalog", () => {
  const restored = Resume.validate(saved, catalog);
  assert.ok(restored);
  assert.equal(restored.roundIndex, 1);
  assert.equal(restored.roundScores[0].points, 10);
  assert.equal(restored.roundCompanions[0].quoteId, Core.scoreCompanionPool(10)[0].quoteId);
  assert.deepEqual(restored.optionSets[1].author, options[1].author.map(String));
  assert.equal(restored.answersByRound[1].author, String(options[1].author[0]));
});

test("Oracle resume rejects malformed progress instead of partially trusting it", () => {
  const invalid = [
    { ...saved, roundIndex: 1.5 },
    { ...saved, filters: { ...saved.filters, level: "expert" } },
    { ...saved, submittedByRound: [false, false, false, false] },
    { ...saved, answersByRound: [correct(stories[0]), { author: "missing-author" }] },
    { ...saved, finalShown: true },
    { ...saved, currentGameIds: ["missing", ...saved.currentGameIds.slice(1)] }
  ];
  invalid.forEach(value => assert.equal(Resume.validate(value, catalog), null));
});
