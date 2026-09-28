import assert from "node:assert/strict";
import { test } from "node:test";
import { site, labels, validateRecord, archiveCode } from "../server/store.mjs";
import { fixture } from "../server/fixtures/records.mjs";
import { escapeHtml } from "../src/html.ts";

test("five unique columns and matching blog labels", () => {
  assert.equal(new Set(site.columns).size, 5);
  assert.deepEqual([...site.categories].sort(), [...site.columns].sort());
  assert.equal(labels.length, 5);
  assert.ok(!("records" in site), "configuration must contain no archive content");
});
test("server validates plain text, body limits, category and links", () => {
  const record = fixture.records[0];
  for (const invalid of [null, [], {}, { ...record, title: " " }, { ...record, category: "missing" }, { ...record, findings: [] }, { ...record, findings: [42] }, { ...record, source: "javascript:alert(1)" }])
    assert.throws(() => validateRecord(invalid));
  const title = `<玻璃> & "实验" 'A'`;
  assert.equal(validateRecord({ ...record, title }).title, title);
  assert.equal(escapeHtml(title), "&lt;玻璃&gt; &amp; &quot;实验&quot; &#39;A&#39;");
});
test("custom codes normalize to a single namespace", () => {
  assert.equal(archiveCode("photo-01"), "X-PHOTO-01");
  assert.equal(archiveCode("0001"), "X-001");
  assert.throws(() => archiveCode("../001"));
});
