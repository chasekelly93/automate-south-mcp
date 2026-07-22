import "dotenv/config";
import express from "express";
import { chromium } from "playwright";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const PORT = Number(process.env.PORT || 8080);
const SCRAPER_SECRET = process.env.SCRAPER_SECRET;
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 20000);
const MAX_TEXT_CHARS = Number(process.env.MAX_TEXT_CHARS || 6000);

if (!SCRAPER_SECRET) {
  console.error("SCRAPER_SECRET is not set. Refusing to start.");
  process.exit(1);
}

const app = express();
app.use(express.json());

let browser;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browser;
}

function stripBoilerplate(dom) {
  const doc = dom.window.document;
  const junkSelectors = [
    "nav",
    "footer",
    "header",
    "script",
    "style",
    "noscript",
    "iframe",
    "svg",
    "[role='navigation']",
    "[role='banner']",
    "[role='contentinfo']",
    ".cookie-banner",
    ".ads",
    ".advertisement",
  ];
  for (const selector of junkSelectors) {
    doc.querySelectorAll(selector).forEach((el) => el.remove());
  }
  return doc.body ? doc.body.textContent : "";
}

function cleanText(raw) {
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function scrapeUrl(url) {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent:
      "Mozilla/5.0 (compatible; RepairRelayLeadResearch/1.0; +https://automatesouth.com)",
  });
  const page = await context.newPage();
  try {
    await page.goto(url, {
      timeout: NAV_TIMEOUT_MS,
      waitUntil: "domcontentloaded",
    });
    // Give lazy-loaded content a brief moment without hanging on slow trackers.
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

    const html = await page.content();
    const title = await page.title();

    let text = "";
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      if (article?.textContent && article.textContent.trim().length > 200) {
        text = article.textContent;
      } else {
        text = stripBoilerplate(new JSDOM(html, { url }));
      }
    } catch {
      text = stripBoilerplate(new JSDOM(html, { url }));
    }

    text = cleanText(text).slice(0, MAX_TEXT_CHARS);

    return { url, title, text, success: true };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/scrape", async (req, res) => {
  if (req.get("x-scraper-secret") !== SCRAPER_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "body.url is required" });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "url is not valid" });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return res.status(400).json({ error: "only http/https urls are allowed" });
  }

  try {
    const result = await scrapeUrl(url);
    res.json(result);
  } catch (err) {
    console.error(`scrape failed for ${url}:`, err.message);
    res.status(200).json({ url, success: false, error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`lead-enrichment-scraper listening on :${PORT}`);
});

async function shutdown() {
  console.log("shutting down...");
  server.close();
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
