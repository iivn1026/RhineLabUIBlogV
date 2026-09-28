import content from "../content/site.json" with { type: "json" };

export interface ArchiveRecord {
  id: string;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  findings: string[];
  source: string;
  version?: number;
  photo?: string;
  bodyMarkdown?: string;
}

// Content arrives only from the authenticated API; no bundled demo archives.
export const records: ArchiveRecord[] = [];
export const categories = ["全部档案", ...content.categories];
export const archiveColumns = content.columns;

export function replaceRecords(next: ArchiveRecord[]) {
  if (!Array.isArray(next) || next.some(r => !archiveColumns.includes(r.category)))
    throw new Error("无效档案数据。");
  records.splice(0, records.length, ...next);
}

export function columnFiles(lane: number) {
  return records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.category === archiveColumns[lane])
    .map(({ index }) => index);
}
export function fileLocation(index: number, emptyLane = 2) {
  if (!records[index]) return { lane: emptyLane, row: 12, slot: emptyLane * 32 + 12 };
  const lane = archiveColumns.indexOf(records[index].category);
  const row = 12 + columnFiles(lane).indexOf(index);
  // slot belongs to the fixed reference timeline; interactive rows are unbounded.
  return { lane, row, slot: lane * 32 + 12 + ((row - 12) % 20) };
}
export function fileAtSlot(slot: number) {
  const files = columnFiles(Math.floor(slot / 32));
  return files[Math.max(0, Math.min(files.length - 1, (slot % 32) - 12))];
}
