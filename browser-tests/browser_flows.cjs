const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(root, requested);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end();
    return;
  }
  const contentType = mime[path.extname(file)] || "application/octet-stream";
  response.setHeader("Content-Type", contentType.startsWith("text/") ? `${contentType}; charset=utf-8` : contentType);
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {})
  });
  const page = await browser.newPage();
  try {
    const homeButtons = [
      ["Explore Stories", "/stories-info.html"],
      ["Explore Written Poems", "/poems-info.html"],
      ["Explore Author Relationships", "/authorToAuthor3DSmall.html"],
      ["Story and Poem Embeddings", "/embeddings.html"],
      ["Explore All Authors", "/authorToAuthor3D.html"],
    ];
    for (const [label, route] of homeButtons) {
      await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: label }).click();
      await page.waitForURL(`**${route}`);
      assert.equal(new URL(page.url()).pathname, route);
    }

    await page.goto(`${base}/embeddings.html`, { waitUntil: "domcontentloaded" });
    assert.equal(
      await page.locator("vz-projector-app").getAttribute("projector-config-json-path"),
      "oss_data/oss_demo_projector_config_english.json"
    );
    assert.ok(await page.getByText("Spanish version").count());

    const storyGraph = JSON.parse(fs.readFileSync(
      path.join(root, "static/authorLinksSmallerAllStories.json"),
      "utf8"
    ));
    const storyIds = storyGraph.nodes.flatMap(author => Object.keys(author.stories || {}));
    const storyWithAudio = storyIds
      .find(id => fs.existsSync(path.join(root, "static/audios_en", `${id}.mp3`)));
    const storyWithoutAudio = storyGraph.nodes
      .flatMap(author => Object.keys(author.stories || {}))
      .find(id => !fs.existsSync(path.join(root, "static/audios_en", `${id}.mp3`)));
    assert.ok(storyWithAudio, "expected at least one story with dedicated English audio");
    assert.ok(storyWithoutAudio, "expected at least one story without dedicated English audio");

    await page.goto(`${base}/stories-info.html?story=${storyWithAudio}`);
    await page.waitForFunction(id => {
      const audio = document.querySelector("#popup-audio");
      return audio
        && !audio.hidden
        && audio.src.endsWith(`/static/audios_en/${id}.mp3`)
        && document.querySelector("#audio-status")?.textContent
          .includes("English narration available");
    }, storyWithAudio);

    await page.goto(`${base}/stories-info.html?story=${storyWithoutAudio}`);
    await page.waitForFunction(() => {
      const audio = document.querySelector("#popup-audio");
      return audio
        && audio.hidden
        && !audio.getAttribute("src")
        && document.querySelector("#audio-status")?.textContent
          .includes("No English narration is available");
    });
    assert.equal(
      await page.getByRole("link", { name: "Read this in Spanish" }).getAttribute("href"),
      `https://estevefact.github.io/stories-info.html?story=${storyWithoutAudio}`
    );

    await page.getByRole("searchbox", { name: "Search everything" }).fill("Borges");
    await page.getByRole("combobox", { name: "Country" }).selectOption({ label: "Argentina" });
    await page.getByRole("button", { name: "Clear filters" }).click();
    assert.equal(await page.getByRole("searchbox", { name: "Search everything" }).inputValue(), "");
    assert.equal(await page.getByRole("combobox", { name: "Country" }).inputValue(), "");

    const originalStory = await page.locator("h1").innerText();
    await page.getByRole("button", { name: "Surprise me" }).click();
    await page.waitForFunction(title => document.querySelector("h1")?.textContent !== title, originalStory);
    assert.notEqual(await page.locator("h1").innerText(), originalStory);

    await page.getByRole("combobox", { name: "Country" }).selectOption({ label: "Colombia" });
    await page.getByRole("combobox", { name: "Genre" }).selectOption({ label: "Unknown" });
    await page.getByRole("combobox", { name: "Maximum length" }).selectOption("5");
    const prefilteredStory = await page.locator("h1").innerText();
    await page.getByRole("button", { name: "Surprise me" }).click();
    await page.waitForFunction(title => document.querySelector("h1")?.textContent !== title, prefilteredStory);
    const selectedFacts = await page.locator(".author-facts").innerText();
    assert.match(selectedFacts, /Colombia/);
    assert.match(selectedFacts, /Unknown/);

    await page.goto(`${base}/poems-info.html`);
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("#country-filter option"))
        .some(option => option.textContent === "Chile")
    );
    await page.waitForFunction(() =>
      document.querySelectorAll("#suggested-author-poems .recommendation-card").length >= 5
    );
    await page.waitForFunction(() =>
      document.querySelectorAll("#related-poem-authors button[data-source='embedding']").length > 0
    );
    const startupPoemId = new URL(page.url()).searchParams.get("poem");
    assert.ok(startupPoemId, "startup poem should update the URL");
    assert.equal(
      await page.getByRole("link", { name: "Read this in Spanish" }).getAttribute("href"),
      `https://estevefact.github.io/poems-info.html?poem=${startupPoemId}`
    );
    const poemCountries = await page.getByRole("combobox", { name: "Country" })
      .locator("option").allTextContents();
    const poemGenres = await page.getByRole("combobox", { name: "Genre" })
      .locator("option").allTextContents();
    assert.ok(poemCountries.includes("Chile"));
    assert.ok(!poemCountries.includes("España"));
    assert.ok(poemGenres.includes("Romanticism"));
    assert.ok(!poemGenres.includes("Romanticismo"));
    await page.getByRole("searchbox", { name: "Search everything" }).fill("Gabriela");
    const poemResult = page.locator("#autocomplete-container button").first();
    await poemResult.waitFor();
    await poemResult.click();
    await page.waitForFunction(() =>
      document.querySelector("#poemTitle")?.textContent === document.querySelector("#author-search")?.value
    );
    assert.equal(await page.locator("#poemTitle").innerText(), await page.getByRole("searchbox").inputValue());
    await page.waitForFunction(() =>
      document.querySelectorAll("#suggested-author-poems .recommendation-card").length >= 5
    );
    const selectedPoemId = new URL(page.url()).searchParams.get("poem");
    assert.ok(selectedPoemId, "selected poem should update the URL");
    assert.equal(
      await page.getByRole("link", { name: "Read this in Spanish" }).getAttribute("href"),
      `https://estevefact.github.io/poems-info.html?poem=${selectedPoemId}`
    );

    await page.goto(`${base}/test/fixtures/map_controls.html`);
    const filter = page.getByRole("button", { name: "Filter by Name" });
    await filter.click();
    assert.equal(await filter.getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Escape");
    assert.equal(await filter.getAttribute("aria-expanded"), "false");
    await filter.press("ArrowDown");
    assert.equal(await page.getByRole("menuitemradio", { name: "Name" }).evaluate(el => document.activeElement === el), true);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    const authorSearch = page.getByRole("combobox");
    await authorSearch.fill("Colombia");
    await authorSearch.press("ArrowDown");
    await page.keyboard.press("Enter");
    assert.equal(
      await page.locator("#selected-author").evaluate(element => element.value),
      "Gabriel García Márquez"
    );
    assert.equal(
      await page.locator("#semantic-recommendations").evaluate(element => element.value),
      "Jorge Luis Borges · 79% similarity · Argentina · Ficción · 1899"
    );
    assert.equal(await page.locator("#autocomplete-container > button").count(), 0);

    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of [
      "/",
      "/stories-info.html",
      "/poems-info.html",
      "/authorToAuthor3DSmall.html",
      "/authorToAuthor3D.html",
      "/embeddings.html"
    ]) {
      await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      assert.equal(
        await page.evaluate(() =>
          document.documentElement.scrollWidth <= document.documentElement.clientWidth
        ),
        true,
        `${route} has horizontal overflow at 390px`
      );
    }

    await page.goto(`${base}/authorToAuthor3DSmall.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    for (const selector of ["#toggle-popup-btn", "#filter-button", "#author-search", "#follow-author-btn"]) {
      assert.ok(
        await page.locator(selector).evaluate(element => element.getBoundingClientRect().height >= 44),
        `${selector} is too small for touch`
      );
    }
    await page.getByRole("button", { name: "Hide Author Info" }).click();
    assert.equal(await page.locator("#popup").evaluate(element => getComputedStyle(element).display), "none");
    assert.equal(await page.locator("#container").evaluate(element =>
      Math.round(element.getBoundingClientRect().width)
    ), 390);
  } finally {
    await browser.close();
    server.close();
  }
  console.log("Browser flows passed");
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
