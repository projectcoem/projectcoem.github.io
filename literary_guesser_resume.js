(function (root, factory) {
    const api = factory(typeof module === "object" && module.exports
        ? require("./literary_guesser_core.js")
        : root.LiteraryGuesserCore);
    if (typeof module === "object" && module.exports) module.exports = api;
    root.LiteraryGuesserResume = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
    "use strict";

    const KINDS = new Set(["both", "story", "poem"]);
    const LEVELS = new Set(["easy", "medium", "hard"]);

    function canonicalCompanion(quoteId, score) {
        const pool = Core.scoreCompanionPool(score);
        return pool.find(item => item.quoteId === quoteId) || pool[0];
    }

    function validateOptions(options, story, catalog) {
        if (!options || typeof options !== "object") return null;
        const allowed = {
            author: new Set(catalog.stories.map(item => String(item.author.id))),
            nationality: new Set(catalog.stories.flatMap(item => item.author.countries || []).map(String)),
            sex: new Set(["male", "female"]),
            birthDecade: new Set(catalog.stories.map(item => String(item.author.birthDecade)))
        };
        const result = {};
        for (const field of Object.keys(allowed)) {
            const values = options[field];
            const normalized = Array.isArray(values) ? values.map(value => String(value)) : [];
            if (normalized.length < 2 || normalized.length > 12 ||
                new Set(normalized).size !== normalized.length ||
                normalized.some(value => !allowed[field].has(value))) return null;
            result[field] = normalized;
        }
        if (!result.author.includes(String(story.author.id)) ||
            !result.nationality.some(value => story.author.countries.map(String).includes(value)) ||
            !result.sex.includes(String(story.author.sex)) ||
            !result.birthDecade.includes(String(story.author.birthDecade))) return null;
        return result;
    }

    function validate(raw, catalog) {
        if (!Core || !catalog || !raw || raw.version !== 1 ||
            !Array.isArray(raw.currentGameIds) || raw.currentGameIds.length !== 4 ||
            new Set(raw.currentGameIds).size !== 4) return null;
        const byId = new Map(catalog.stories.map(story => [story.id, story]));
        const stories = raw.currentGameIds.map(id => byId.get(id));
        if (stories.some(story => !story)) return null;

        const inputFilters = raw.filters || {};
        if (!KINDS.has(inputFilters.kind) || !LEVELS.has(inputFilters.level)) return null;
        const filters = {
            kind: inputFilters.kind,
            level: inputFilters.level,
            nationality: String(inputFilters.nationality || "all"),
            genre: String(inputFilters.genre || "all"),
            classicsOnly: Boolean(inputFilters.classicsOnly)
        };
        const countries = new Set(catalog.stories.flatMap(story => story.author.countries || []).map(String));
        const genres = new Set(catalog.stories.flatMap(story => story.author.genres || []).map(String));
        if (filters.nationality !== "all" && !countries.has(filters.nationality)) return null;
        if (filters.genre !== "all" && !genres.has(filters.genre)) return null;
        const eligible = new Set(Core.filterStories(catalog.stories, {
            ...filters, level: "hard", wordCap: Number.MAX_SAFE_INTEGER
        }).map(story => story.id));
        if (stories.some(story => !eligible.has(story.id))) return null;

        const roundIndex = Number(raw.roundIndex);
        if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex > 3) return null;
        const optionSets = [], answersByRound = [], submittedByRound = [];
        for (let index = 0; index < 4; index += 1) {
            const options = raw.optionSets?.[index]
                ? validateOptions(raw.optionSets[index], stories[index], catalog)
                : null;
            if (index <= roundIndex && !options) return null;
            optionSets[index] = options;
            const inputAnswers = raw.answersByRound?.[index] || {};
            const answers = {
                author: String(inputAnswers.author || ""),
                nationality: String(inputAnswers.nationality || ""),
                sex: String(inputAnswers.sex || ""),
                birthDecade: String(inputAnswers.birthDecade ?? "")
            };
            if (options && Object.entries(answers).some(([field, answer]) =>
                answer && !options[field].includes(answer))) return null;
            answersByRound[index] = answers;
            const submitted = Boolean(raw.submittedByRound?.[index]);
            if (submitted && Object.values(answers).some(answer => !answer)) return null;
            if (index < roundIndex && !submitted) return null;
            if (index > roundIndex && submitted) return null;
            submittedByRound[index] = submitted;
        }
        const finalShown = Boolean(raw.finalShown);
        if (finalShown && (roundIndex !== 3 || !submittedByRound.every(Boolean))) return null;

        const roundScores = [], roundCompanions = [];
        submittedByRound.forEach((submitted, index) => {
            if (!submitted) return;
            const answer = answersByRound[index];
            const author = stories[index].author;
            const score = Core.scoreRound({
                author: answer.author,
                nationality: answer.nationality,
                sex: answer.sex,
                birthDecade: Number(answer.birthDecade)
            }, {
                id: author.id,
                countries: author.countries,
                sex: author.sex,
                birthDecade: author.birthDecade
            });
            roundScores[index] = score;
            roundCompanions[index] = canonicalCompanion(raw.quoteIds?.[index], score.points);
        });
        const result = Core.scoreGame(roundScores.filter(Boolean));
        const finalCompanion = finalShown
            ? canonicalCompanion(raw.finalQuoteId, result.average)
            : null;
        return {
            stories, roundIndex, filters, optionSets, answersByRound, submittedByRound,
            roundScores, roundCompanions, finalShown, finalCompanion
        };
    }

    return { validate, validateOptions, canonicalCompanion };
}));
