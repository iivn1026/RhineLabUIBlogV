const password = randomBytes(24).toString("hex");
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, createUser } from "../server/store.mjs";
import { createApp } from "../server/app.mjs";
import { fixture } from "../server/fixtures/records.mjs";

const dir = await mkdtemp(join(tmpdir(), "rhine-reader-ui-"));
const db = openStore(join(dir, "test.sqlite"));
const body = "## 第一节\n\n正文 **重点**。\n\n| 名称 | 数值 |\n| --- | --- |\n| A | 1 |\n\n" + "阅读段落。\n\n".repeat(25) + "## 第二节\n\n```js\nconst x = 1;\n\n  run(x);\n```\n\n<script>window.articleAttack=true</script><img src=x onerror=window.articleAttack=true>";
const record = { ...fixture.records[0], title: "Markdown 阅读测试", bodyMarkdown: body };
db.prepare("INSERT INTO records(id,code,data) VALUES(1,?,?)").run(record.id, JSON.stringify(record));
createUser(db, "readeradmin", password, "admin");
createUser(db, "readonly", password, "reader");
const app = createApp({ db });
await new Promise(resolve => app.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true, args: ["--enable-unsafe-swiftshader"] });
const errors = [];
async function enter(page, role) {
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/?scene=detail");
  if (role === "guest") await page.locator("[data-guest]").click();
  else {
    await page.locator('.access-gate [name="username"]').fill(role);
    await page.locator('.access-gate [name="password"]').fill(password);
    await page.locator('.access-gate button[type="submit"]').click();
  }
  await page.locator("#loading").waitFor({ state: "detached", timeout: 45000 });
  if (await page.locator("#stage").getAttribute("data-mode") !== "detail") await page.locator('.read-file').click();
  await page.locator('[data-action="read-article"]').click();
  await page.locator(".article-reader[open]").waitFor();
}
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await enter(page, "guest");
  assert.equal(await page.locator(".article-markdown table").count(), 1);
  assert.equal(await page.locator(".article-toc button").count(), 2);
  assert.equal(await page.evaluate(() => window.articleAttack), undefined);
  await page.locator(".article-toc").hover();
  await page.getByRole("button", { name: "第二节", exact: true }).click();
  assert.ok(await page.locator(".article-scroll").evaluate(el => el.scrollTop) > 200);
  await expect(page.getByRole("button", { name: "第二节", exact: true })).toHaveAttribute("aria-current", "location");
  assert.equal(await page.locator(".article-markdown pre code").textContent(), "const x = 1;\n\n  run(x);\n");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await page.locator("#selected-title").textContent(), record.title);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".article-reader[open]").count(), 0);
  assert.equal(await page.locator('[data-action="read-article"]').evaluate(el => document.activeElement === el), true);
  assert.equal(await page.locator("#stage").getAttribute("data-mode"), "detail");
  // Reopen after the closing transition and ensure content starts at the top.
  await page.locator('[data-action="read-article"]').click();
  assert.equal(await page.locator(".article-scroll").evaluate(el => el.scrollTop), 0);
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const phone = await mobile.newPage();
  await enter(phone, "readonly");
  const bounds = await phone.locator(".article-reader").boundingBox();
  assert.ok(bounds.width <= 390 && bounds.height <= 844);
  assert.ok(await phone.locator(".markdown-body").evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16);
  await phone.getByRole("button", { name: "第二节", exact: true }).click();
  assert.ok(await phone.locator(".article-scroll").evaluate(el => el.scrollTop) > 200);
  await expect(phone.getByRole("button", { name: "第二节", exact: true })).toHaveAttribute("aria-current", "location");
  await phone.getByRole("button", { name: "关闭全文" }).click();
  await mobile.close();

  const adminContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
  const admin = await adminContext.newPage();
  await enter(admin, "readeradmin");
  await admin.getByRole("button", { name: "关闭全文" }).click();
  await admin.locator('[data-action="edit-record"]').click();
  assert.equal(await admin.locator('[name="bodyMarkdown"]').inputValue(), body);
  await admin.locator('[name="bodyMarkdown"]').fill("## 编辑后的全文\n\n保存正文。\n\n~~~js\n  test();\n~~~");
  await admin.locator('.archive-editor button[type="submit"]').click();
  await admin.locator('.archive-editor[open]').waitFor({ state: "detached" });
  await admin.locator('[data-action="read-article"]').click();
  assert.equal(await admin.locator(".article-markdown h2").textContent(), "编辑后的全文");
  await admin.getByRole("button", { name: "关闭全文" }).click();
  await admin.locator('[data-action="edit-record"]').click();
  await admin.locator('[name="bodyMarkdown"]').fill("");
  await admin.locator('.archive-editor button[type="submit"]').click();
  await admin.locator('.archive-editor[open]').waitFor({ state: "detached" });
  await admin.locator('[data-action="read-article"]').click();
  assert.ok((await admin.locator(".article-markdown").textContent()).includes(record.findings[0]));
  assert.equal(await admin.locator(".article-toc").isVisible(), false);
  await adminContext.close();
  assert.deepEqual(errors, []);
  console.log("Reader browser checks passed: admin edit/save, guest and reader access, safe Markdown, desktop/mobile TOC, focus restoration, reopening and legacy fallback.");
} finally {
  await browser.close();
  app.closeAllConnections(); await new Promise(resolve => app.close(resolve));
  db.close(); await rm(dir, { recursive: true, force: true });
}
