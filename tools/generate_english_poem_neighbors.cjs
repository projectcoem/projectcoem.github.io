#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outputPoems = path.join(root, "static/poemEnglishEmbeddingNeighbors.json");
const outputAuthors = path.join(
  root,
  "static/poemEnglishAuthorEmbeddingNeighbors.json"
);

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function readJSON(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function parseMetadataRows(text) {
  const lines = text.trimEnd().split(/\r?\n/);
  const headers = lines.shift().split("\t");
  return lines.map(line => {
    const cells = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [
      header,
      cells[index] || "",
    ]));
  });
}

function normalizeVector(values) {
  const vector = Float32Array.from(values);
  let magnitude = 0;
  for (const value of vector) magnitude += value * value;
  magnitude = Math.sqrt(magnitude) || 1;
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] /= magnitude;
  }
  return vector;
}

function parseTensorRow(line) {
  return normalizeVector(line.split("\t").map(Number));
}

function extractTensorRows(text, wantedRows) {
  const vectors = new Map();
  let rowNumber = 0;
  let lineStart = 0;

  for (let index = 0; index <= text.length; index += 1) {
    if (index < text.length && text[index] !== "\n") continue;
    if (wantedRows.has(rowNumber)) {
      const line = text.slice(lineStart, index).replace(/\r$/, "");
      vectors.set(wantedRows.get(rowNumber), parseTensorRow(line));
    }
    lineStart = index + 1;
    rowNumber += 1;
  }

  return vectors;
}

function cosine(left, right) {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) {
    score += left[index] * right[index];
  }
  return score;
}

function roundScore(score) {
  return Math.round(score * 10000) / 10000;
}

function nearestForVector(sourceId, sourceVector, vectorsById, limit = 5) {
  return [...vectorsById.entries()]
    .filter(([candidateId]) => candidateId !== sourceId)
    .map(([candidateId, candidateVector]) => ({
      id: candidateId,
      similarity: roundScore(cosine(sourceVector, candidateVector)),
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit);
}

function buildPoemLookup(poems) {
  const byTitle = new Map();
  for (const poem of poems) {
    const title = normalize(poem.story_name);
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push(poem);
  }
  return byTitle;
}

function matchPoem(row, byTitle, usedPoemIds) {
  const candidates = (byTitle.get(normalize(row["Título"])) || [])
    .filter(poem => !usedPoemIds.has(poem.id));
  if (!candidates.length) return null;

  const metadataAuthor = normalize(row["Nombre Completo Autor"]);
  const authorMatches = candidates.filter(poem => {
    const pieces = normalize(poem.author_name).split(/\s+/).filter(Boolean);
    return pieces.every(piece => metadataAuthor.includes(piece));
  });
  return (authorMatches[0] || candidates[0] || null);
}

function averageVectors(vectors) {
  const centroid = new Float32Array(vectors[0].length);
  for (const vector of vectors) {
    for (let index = 0; index < vector.length; index += 1) {
      centroid[index] += vector[index];
    }
  }
  for (let index = 0; index < centroid.length; index += 1) {
    centroid[index] /= vectors.length;
  }
  return normalizeVector(centroid);
}

function main() {
  const allData = readJSON("static/poems.json");
  const englishData = readJSON("static/poems_english.json");
  const englishIds = new Set(englishData.poems.map(poem => poem.id));
  const byTitle = buildPoemLookup(allData.poems);
  const usedPoemIds = new Set();
  const vectorsByPoemId = new Map();

  for (let part = 1; part <= 4; part += 1) {
    const metadata = parseMetadataRows(fs.readFileSync(
      path.join(root, `tensors_generator/poems_metadata_${part}.tsv`),
      "utf8"
    ));
    const wantedRows = new Map();
    metadata.forEach((row, rowNumber) => {
      const poem = matchPoem(row, byTitle, usedPoemIds);
      if (!poem) return;
      usedPoemIds.add(poem.id);
      if (englishIds.has(poem.id)) wantedRows.set(rowNumber, poem.id);
    });
    const vectors = extractTensorRows(fs.readFileSync(
      path.join(root, `tensors_generator/poems_tensors_${part}.tsv`),
      "utf8"
    ), wantedRows);
    for (const [poemId, vector] of vectors) {
      vectorsByPoemId.set(poemId, vector);
    }
  }

  const poemNeighbors = {};
  const fallbackPoemIds = [...vectorsByPoemId.keys()].sort();
  for (const poem of englishData.poems) {
    const vector = vectorsByPoemId.get(poem.id);
    poemNeighbors[poem.id] = vector
      ? nearestForVector(poem.id, vector, vectorsByPoemId)
      : fallbackPoemIds
        .filter(candidateId => candidateId !== poem.id)
        .slice(0, 5)
        .map(candidateId => ({ id: candidateId, similarity: 0 }));
  }

  const authorVectors = new Map();
  const englishAuthors = new Map(englishData.authors.map(author => [
    author.author_uuid,
    author,
  ]));
  for (const poem of englishData.poems) {
    const author = englishAuthors.get(poem.author_uuid);
    const vector = vectorsByPoemId.get(poem.id);
    const authorName = normalize(author?.author_name);
    if (!author || !vector || authorName === "unknown") continue;
    if (!authorVectors.has(poem.author_uuid)) {
      authorVectors.set(poem.author_uuid, []);
    }
    authorVectors.get(poem.author_uuid).push(vector);
  }

  const centroids = new Map([...authorVectors.entries()].map(
    ([authorId, vectors]) => [authorId, averageVectors(vectors)]
  ));
  const authorNeighbors = {};
  for (const [authorId, centroid] of centroids) {
    authorNeighbors[authorId] = nearestForVector(authorId, centroid, centroids)
      .map(entry => ({
        ...entry,
        sourcePoems: authorVectors.get(authorId).length,
        targetPoems: authorVectors.get(entry.id).length,
      }));
  }

  fs.writeFileSync(
    outputPoems,
    `${JSON.stringify(poemNeighbors, null, 0)}\n`
  );
  fs.writeFileSync(
    outputAuthors,
    `${JSON.stringify(authorNeighbors, null, 0)}\n`
  );

  console.log(
    `Wrote ${Object.keys(poemNeighbors).length} English poem neighbor sets`
  );
  console.log(
    `Wrote ${Object.keys(authorNeighbors).length} English author neighbor sets`
  );
}

main();
