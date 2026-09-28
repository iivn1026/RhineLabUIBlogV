import assert from "node:assert/strict";
import { records, replaceRecords, columnFiles, archiveColumns, fileLocation } from "../src/data.ts";
import { selectionCell, fileAtCell } from "../src/archive-loop.ts";
import { fixture } from "../server/fixtures/records.mjs";

assert.equal(records.length, 0, "frontend starts empty before the authenticated API responds");
const original = structuredClone(fixture.records);
try {
  const extra = Array.from({length:40},(_,i)=>({...original[0],id:`X-${String(41+i).padStart(3,"0")}`,category:archiveColumns[0]}));
  replaceRecords([...original,...extra]);
  const files = columnFiles(0);
  assert.equal(files.length,48);
  let cell = {lane:0,row:12};
  for(let i=1;i<=files.length*3;i++) {
    const index=files[i%files.length];
    cell=selectionCell(index,cell,{axis:"row",direction:1});
    assert.equal(fileAtCell(cell),index);
    assert.equal(fileLocation(index).lane,0);
  }
  const other = columnFiles(1)[0];
  cell=selectionCell(other,cell,{axis:"lane",direction:1});
  assert.equal(fileAtCell(cell),other);
  const last=files.at(-1);
  cell=selectionCell(last,cell,{axis:"lane",direction:-1});
  assert.equal(fileAtCell(cell),last);
  replaceRecords(original.filter(r => r.category !== archiveColumns[2]));
  assert.equal(columnFiles(2).length, 0);
  assert.equal(fileAtCell({lane:2,row:12}), -1);
  assert.equal(fileAtCell({lane:7,row:100}), -1);
  replaceRecords([]);
  assert.equal(fileLocation(-1, 4).lane, 4);
  assert.equal(fileAtCell({lane:-1,row:-100}), -1);
  console.log("Unequal columns, 48 records in a column, wraparound and cross-column selection: passed");
} finally { replaceRecords(original); }
