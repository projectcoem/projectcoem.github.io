(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AuthorSimilarity = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function percent(value) {
    return `${Math.round(Number(value) * 100)}%`;
  }

  function metricLabel(entry) {
    if (!entry || !Number.isFinite(Number(entry.similarity))) {
      return "Similarity unavailable";
    }
    return `${percent(entry.similarity)} similarity`;
  }

  function recommendationLabel(entry, author) {
    const known = (value, fallback) =>
      value && String(value).toLocaleLowerCase() !== "unknown" ? value : fallback;
    const country = known(author?.country, "Unknown country");
    const genre = known(author?.genre, "Unknown genre");
    const birthYear = known(author?.birth_year || author?.birthYear, "Unknown year");
    return `${author?.id || author?.author_name || "Unknown author"} · ${metricLabel(entry)} · ${country} · ${genre} · ${birthYear}`;
  }

  function neighborsFor(authorId, index, authorsById, limit = 5) {
    return ((index && index[authorId]) || [])
      .filter(entry => entry.id !== authorId && authorsById.has(entry.id))
      .slice(0, limit)
      .map(entry => ({ ...entry, author: authorsById.get(entry.id) }));
  }

  function storyMetricLabel(entry) {
    return Number.isFinite(Number(entry?.similarity))
      ? `${percent(entry.similarity)} similarity`
      : "Similarity unavailable";
  }

  return { metricLabel, recommendationLabel, neighborsFor, storyMetricLabel };
});
