#!/usr/bin/env node
/**
 * scripts/crawl.mjs
 *
 * Playwright script that crawls the TODO app's UI states (this is a
 * single-page app with no routing, so "screens" here means the distinct
 * states a user reaches: empty list, populated list, each filter, inline
 * edit, drag-and-drop reorder, etc.) and saves a screenshot of each, so a
 * change can be visually verified without opening a browser by hand.
 *
 * Setup (first run only):
 *   npm install
 *   npx playwright install chromium
 *
 * Usage:
 *   node scripts/crawl.mjs [baseUrl]
 *
 * baseUrl defaults to a file:// URL for index.html at the repo root, which
 * needs no server. Pass an http(s) URL (e.g. http://localhost:8931) to
 * crawl a served copy instead. Both file:// and localhost are secure
 * contexts for crypto.randomUUID(); a non-localhost plain http URL is not
 * (see CLAUDE.md Gotchas) and addTodo() will throw.
 *
 * Screenshots land in scripts/screenshots/ (gitignored), one PNG per
 * crawled state, numbered in visit order. Exits non-zero if the page
 * logged any console error or uncaught exception during the crawl.
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const screenshotDir = path.join(__dirname, "screenshots");
fs.mkdirSync(screenshotDir, { recursive: true });

const baseUrl = process.argv[2] ?? `file://${path.join(repoRoot, "index.html")}`;

const todayISO = () => new Date().toISOString().slice(0, 10);
const pastISO = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

async function shot(page, name) {
  const file = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ✓ ${name} -> ${path.relative(repoRoot, file)}`);
}

async function addTask(page, { text, priority, due }) {
  await page.fill("#todo-input", text);
  await page.selectOption("#todo-priority", priority);
  if (due) await page.fill("#todo-due", due);
  else await page.evaluate(() => (document.getElementById("todo-due").value = ""));
  await page.click('#todo-form button[type="submit"]');
}

async function main() {
  const consoleErrors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  console.log(`Crawling ${baseUrl}\n`);

  // 1. Initial (empty) state
  await page.goto(baseUrl);
  await page.waitForSelector("#todo-list");
  await shot(page, "01-empty");

  // 2. Add tasks covering each priority and due-date state
  await addTask(page, { text: "牛乳を買う", priority: "low", due: null });
  await addTask(page, { text: "レポートを提出する", priority: "high", due: pastISO(3) }); // overdue
  await addTask(page, { text: "歯医者の予約", priority: "medium", due: todayISO() }); // due today
  await shot(page, "02-tasks-added");

  // 3. Drag-and-drop reorder (swap the first two rows via their drag handles).
  // Uses native HTML5 draggable="true" — Playwright's dragTo drives real
  // mouse input via CDP, which Chromium does translate into native
  // dragstart/dragover/drop, but keep this best-effort in case that
  // ever regresses across browser/Playwright versions.
  try {
    const handles = page.locator(".drag-handle");
    await handles.nth(1).dragTo(handles.nth(0));
    await shot(page, "03-drag-reordered");
  } catch (err) {
    console.warn(`  ! drag-and-drop step skipped: ${err.message}`);
  }

  // 4. Complete one task
  await page.locator(".todo-item .todo-main input[type=checkbox]").first().click();
  await shot(page, "04-task-completed");

  // 5. Filter views
  await page.click('.filter-btn[data-filter="active"]');
  await shot(page, "05-filter-active");
  await page.click('.filter-btn[data-filter="completed"]');
  await shot(page, "06-filter-completed");
  await page.click('.filter-btn[data-filter="all"]');

  // 6. Inline edit an incomplete task
  const label = page.locator(".todo-item:not(.completed) .label").first();
  await label.dblclick();
  await page.locator(".todo-item:not(.completed) .edit-input").first().fill("牛乳とパンを買う");
  await page.keyboard.press("Enter");
  await shot(page, "07-inline-edit");

  // 7. Change priority via a row's own select
  await page
    .locator(".todo-item:not(.completed) .priority-select")
    .first()
    .selectOption("high");
  await shot(page, "08-priority-changed");

  // 8. Clear completed
  await page.click("#clear-completed");
  await shot(page, "09-cleared-completed");

  await browser.close();

  if (consoleErrors.length > 0) {
    console.error(`\n${consoleErrors.length} console error(s) captured during crawl:`);
    for (const e of consoleErrors) console.error(`  - ${e}`);
    process.exitCode = 1;
  } else {
    console.log("\nNo console errors detected.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
