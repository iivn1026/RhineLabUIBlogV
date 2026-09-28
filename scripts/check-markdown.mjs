import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html>");
globalThis.window = dom.window;
const { renderMarkdown } = await import("../src/markdown.ts");

test("Markdown preserves headings, GFM tables, lists and code whitespace", () => {
  const source = "## 标题\n\n| 名称 | 值 |\n| --- | --- |\n| A | **B** |\n\n- 项目\n\n```js\nconst x = 1;\n\n  run(x);\n```";
  const document = new JSDOM(renderMarkdown(source)).window.document;
  assert.equal(document.querySelector("h2").textContent, "标题");
  assert.equal(document.querySelector("td strong").textContent, "B");
  assert.equal(document.querySelector("li").textContent, "项目");
  assert.equal(document.querySelector("pre code").textContent, "const x = 1;\n\n  run(x);\n");
});

test("Markdown cannot execute scripts, smuggle DOM IDs or embed active content", () => {
  const source = '<script>alert(1)</script><img src=x onerror=alert(1)><svg onload=alert(2)></svg><iframe src="https://example.com"></iframe><form><input name="csrf"></form><h2 id="stage" style="position:fixed">Safe</h2>\n\n[bad](javascript:alert%281%29)';
  const document = new JSDOM(renderMarkdown(source)).window.document;
  assert.equal(document.querySelector("script,svg,iframe,form,[id],[name],[style],[onerror],[onload]"), null);
  assert.equal(document.querySelector("a[href]")?.getAttribute("href"), undefined);
  assert.equal(document.querySelector("h2").textContent, "Safe");
});
