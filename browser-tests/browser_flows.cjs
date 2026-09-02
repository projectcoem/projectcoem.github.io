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

async function assertAutocompleteScrolls(page, label) {
  await page.waitForFunction(() => document.querySelector("#autocomplete-container")?.children.length > 0);
  const metrics = await page.locator("#autocomplete-container").evaluate(element => {
    const styles = getComputedStyle(element);
    return {
      clientHeight: element.clientHeight,
      overflowY: styles.overflowY,
      scrollHeight: element.scrollHeight
    };
  });
  assert.equal(metrics.overflowY, "auto", `${label} autocomplete should allow vertical scrolling`);
  assert.ok(metrics.scrollHeight > metrics.clientHeight, `${label} autocomplete should have scrollable overflow`);
}

async function assertReadableCompactList(page, selector, label) {
  const button = page.locator(`${selector} button`).first();
  await button.waitFor();
  const typography = await button.evaluate(element => {
    const styles = getComputedStyle(element);
    return {
      family: styles.fontFamily,
      size: Number.parseFloat(styles.fontSize),
      lineHeight: Number.parseFloat(styles.lineHeight),
      weight: Number.parseInt(styles.fontWeight, 10)
    };
  });
  assert.match(typography.family, /Cormorant Garamond/, `${label} should use the readable serif`);
  assert.ok(typography.size >= 18, `${label} text should be at least 18px`);
  assert.ok(typography.lineHeight >= 25, `${label} should have a generous line height`);
  assert.ok(typography.weight >= 600, `${label} should have a legible weight`);
}

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
    await page.goto(`${base}/`);
    const canonicalMarks = page.locator('img[src="Coem.png"]');
    assert.equal(await canonicalMarks.count(), 3);
    for (let index = 0; index < 3; index += 1) {
      const mark = canonicalMarks.nth(index);
      assert.equal(await mark.evaluate(image => image.naturalWidth), 572);
      assert.ok(await mark.evaluate(image => image.getBoundingClientRect().width > 0));
    }
    await page.evaluate(() => sessionStorage.setItem("coem:hero-portrait-offset", "15"));
    await page.reload();
    const firstPortraitNames = await page.locator("[data-hero-portrait] figcaption").allTextContents();
    assert.deepEqual(firstPortraitNames, ["Carl Sagan", "Emily Dickinson", "Franz Kafka"]);
    const carlPortrait = page.locator("[data-hero-portrait] img").first();
    assert.match(await carlPortrait.getAttribute("src"), /static\/imgs\/Sagan\.png$/);
    assert.equal(await carlPortrait.evaluate(image => image.naturalWidth), 1024);
    await page.reload();
    const secondPortraitNames = await page.locator("[data-hero-portrait] figcaption").allTextContents();
    assert.notDeepEqual(secondPortraitNames, firstPortraitNames);
    assert.equal(new Set(secondPortraitNames).size, 3);

    assert.equal(await page.getByRole("tab").count(), 6);
    await page.getByRole("tab", { name: /02 Poems/ }).click();
    assert.equal(await page.locator("#route-title").innerText(), "Poems");
    assert.match(await page.locator("#route-image").getAttribute("src"), /Pizarnik\.png$/);
    await page.getByRole("tab", { name: /02 Poems/ }).press("ArrowRight");
    assert.equal(await page.locator("#route-title").innerText(), "Relationships");
    assert.equal(await page.getByRole("tab", { name: /03 Relationships/ }).getAttribute("aria-selected"), "true");

    const calligraphyTitle = page.locator("#colophon-title");
    await calligraphyTitle.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector("#colophon-title")?.classList.contains("is-writing"));
    assert.equal(
      (await calligraphyTitle.innerText()).replace(/\s+/g, " ").trim(),
      "Sketching the map of universal literature."
    );
    assert.equal(await calligraphyTitle.locator(".calligraphy-word").count(), 6);
    const calligraphyAnimation = await calligraphyTitle.locator(".calligraphy-word").first().evaluate(element => ({
      fontFamily: getComputedStyle(element.parentElement).fontFamily,
      ink: getComputedStyle(element.querySelector(".calligraphy-ink")).animationName,
      nib: getComputedStyle(element, "::after").animationName
    }));
    assert.match(calligraphyAnimation.fontFamily, /Allura/);
    assert.equal(calligraphyAnimation.ink, "calligraphy-write");
    assert.equal(calligraphyAnimation.nib, "calligraphy-nib");

    await page.goto(`${base}/embeddings.html`, { waitUntil: "domcontentloaded" });
    assert.equal(
      await page.locator("vz-projector-app").getAttribute("projector-config-json-path"),
      "oss_data/oss_demo_projector_config_english.json"
    );
    assert.ok(await page.getByText("Spanish", { exact: true }).count());

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
    assert.deepEqual(
      await page.getByRole("combobox", { name: "Maximum length" }).locator("option").evaluateAll(options =>
        options.map(option => option.value)
      ),
      ["", "2", "4", "6", "8", "10", "15", "20"]
    );
    await page.getByRole("button", { name: "Change theme" }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    const darkTheme = await page.evaluate(() => ({
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
      discoveryBackground: getComputedStyle(document.querySelector(".reader-discovery")).backgroundColor,
      discoveryColor: getComputedStyle(document.querySelector(".reader-discovery")).color,
      buttonColor: getComputedStyle(document.querySelector(".reader-button")).color,
      storyBackground: getComputedStyle(document.querySelector("#cuentoText")).backgroundColor,
      surprise: (() => {
        const button = document.querySelector("#surprise-button");
        const styles = getComputedStyle(button);
        return {
          background: styles.backgroundColor,
          color: styles.color,
          visible: button.getBoundingClientRect().width > 0 && styles.visibility === "visible" && styles.opacity === "1"
        };
      })()
    }));
    assert.deepEqual(darkTheme, {
      bodyBackground: "rgb(24, 23, 19)",
      bodyColor: "rgb(241, 238, 229)",
      discoveryBackground: "rgb(24, 23, 19)",
      discoveryColor: "rgb(241, 238, 229)",
      buttonColor: "rgb(241, 238, 229)",
      storyBackground: "rgb(24, 23, 19)",
      surprise: {
        background: "rgb(24, 23, 19)",
        color: "rgb(241, 238, 229)",
        visible: true
      }
    });
    await page.getByRole("button", { name: "Change theme" }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
    await assertReadableCompactList(page, "#stories-list", "Story list");
    await assertReadableCompactList(page, "#top-authors-list", "Related story authors");
    await page.waitForFunction(() => {
      const audio = document.querySelector("#popup-audio");
      return document.querySelectorAll(".audio-phrase").length > 2
        && audio
        && Number.isFinite(audio.duration)
        && audio.duration > 0;
    });
    const karaokeSeek = await page.evaluate(async () => {
      const audio = document.querySelector("#popup-audio");
      Object.defineProperty(audio, "currentTime", { configurable: true, value: 0, writable: true });
      const seekTo = async fraction => {
        audio.currentTime = audio.duration * fraction;
        audio.dispatchEvent(new Event("seeking"));
        audio.dispatchEvent(new Event("timeupdate"));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return Number(document.querySelector(".audio-phrase--active")?.dataset.phraseIndex);
      };
      const first = await seekTo(.2);
      const later = await seekTo(.8);
      const style = getComputedStyle(document.querySelector(".audio-phrase--active"));
      return {
        phraseCount: document.querySelectorAll(".audio-phrase").length,
        first,
        later,
        activeStyle: {
          background: style.backgroundColor,
          borderBottomWidth: style.borderBottomWidth,
          color: style.color
        }
      };
    });
    assert.ok(karaokeSeek.phraseCount > 10);
    assert.ok(karaokeSeek.first >= 0, JSON.stringify(karaokeSeek));
    assert.ok(karaokeSeek.later > karaokeSeek.first);
    assert.deepEqual(karaokeSeek.activeStyle, {
      background: "rgba(0, 0, 0, 0)",
      borderBottomWidth: "0px",
      color: "rgb(164, 56, 43)"
    });
    await page.getByRole("button", { name: "Change theme" }).click();
    assert.deepEqual(
      await page.locator(".audio-phrase--active").evaluate(element => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, color: style.color };
      }),
      { background: "rgba(0, 0, 0, 0)", color: "rgb(229, 161, 142)" }
    );
    await page.getByRole("button", { name: "Change theme" }).click();

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

    await page.getByRole("searchbox", { name: "Search everything" }).fill("a");
    await assertAutocompleteScrolls(page, "Stories");
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
    await page.getByRole("combobox", { name: "Maximum length" }).selectOption("6");
    const prefilteredStory = await page.locator("h1").innerText();
    await page.getByRole("button", { name: "Surprise me" }).click();
    await page.waitForFunction(title => document.querySelector("h1")?.textContent !== title, prefilteredStory);
    const selectedFacts = await page.locator(".author-facts").innerText();
    assert.match(selectedFacts, /Colombia/);
    assert.match(selectedFacts, /Unknown/);

    await page.goto(`${base}/poems-info.html`);
    assert.deepEqual(
      await page.getByRole("combobox", { name: "Maximum length" }).locator("option").evaluateAll(options =>
        options.map(option => option.value)
      ),
      ["", "2", "4", "6", "8", "10", "15", "20"]
    );
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
    await page.getByRole("searchbox", { name: "Search everything" }).fill("a");
    await assertAutocompleteScrolls(page, "Poems");
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
    await assertReadableCompactList(page, "#poems-by-author", "Poem list");
    await assertReadableCompactList(page, "#related-poem-authors", "Related poem authors");
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
      if (route === "/") {
        await page.locator("#colophon-title").scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector("#colophon-title")?.classList.contains("is-writing"));
      }
      assert.equal(
        await page.evaluate(() =>
          document.documentElement.scrollWidth <= document.documentElement.clientWidth
        ),
        true,
        `${route} has horizontal overflow at 390px`
      );
      if (route === "/stories-info.html" || route === "/poems-info.html") {
        const compactButton = page.locator(".compact-list button").first();
        await compactButton.waitFor();
        const bounds = await compactButton.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return { height: rect.height, left: rect.left, right: rect.right };
        });
        assert.ok(bounds.height >= 44, `${route} compact links are too small for touch`);
        assert.ok(bounds.left >= 0 && bounds.right <= 390, `${route} compact links overflow the viewport`);
      }
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
