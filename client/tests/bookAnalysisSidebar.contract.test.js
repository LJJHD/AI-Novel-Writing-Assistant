import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sidebarSource = readFileSync(
  join(clientRoot, "src/pages/bookAnalysis/components/BookAnalysisSidebar.tsx"),
  "utf8",
);

test("book analysis source document controls use the shared select field", () => {
  assert.match(
    sidebarSource,
    /import SelectField from "@\/components\/common\/SelectField";/,
    "source document and version controls should use the shared Radix select wrapper",
  );
  assert.match(sidebarSource, /label="知识文档"/);
  assert.match(sidebarSource, /label="文档版本"/);
  assert.doesNotMatch(
    sidebarSource,
    /onChange=\{\(event\) => onSelectDocument\(event\.target\.value\)\}/,
    "knowledge document selection should not depend on native select change events",
  );
  assert.doesNotMatch(
    sidebarSource,
    /onChange=\{\(event\) => onSelectVersion\(event\.target\.value\)\}/,
    "knowledge document version selection should not depend on native select change events",
  );
});
