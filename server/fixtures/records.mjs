import { readFileSync } from "node:fs";

// Synthetic test data only. Never imported by the website or production server.
const site = JSON.parse(readFileSync(new URL("../../content/site.json", import.meta.url), "utf8"));
export const fixture = {
  ...site,
  records: Array.from({ length: 40 }, (_, i) => ({
    id: `X-${String(i + 1).padStart(3, "0")}`,
    title: `测试档案 ${i + 1}`,
    en: `TEST RECORD ${i + 1}`,
    department: "测试分类",
    category: site.categories[i % 5],
    date: "2026-01-01",
    lead: "Test Author",
    clearance: "PUBLIC",
    abstract: "Synthetic content for archive navigation and database regression tests. This data is never shipped with the blog.",
    findings: ["测试段落一", "测试段落二", "测试段落三"],
    source: "https://example.com/",
  })),
};

export function populateTestStore(db) {
  const insert = db.prepare("INSERT INTO records(id,code,data) VALUES(?,?,?)");
  fixture.records.forEach((record, i) => insert.run(i + 1, record.id, JSON.stringify(record)));
}
