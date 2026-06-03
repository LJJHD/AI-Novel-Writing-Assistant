const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

test("root scripts expose macOS desktop packaging entrypoints", () => {
  const packageJson = readJson("package.json");

  assert.equal(
    packageJson.scripts["dist:desktop:mac"],
    "pnpm run stage:desktop && node desktop/scripts/run-electron-builder.cjs --mac --arm64",
  );
  assert.equal(
    packageJson.scripts["dist:desktop:mac:reuse-stage"],
    "node desktop/scripts/run-electron-builder.cjs --mac --arm64",
  );
  assert.equal(
    packageJson.scripts["dist:desktop:mac:x64"],
    "pnpm run stage:desktop && node desktop/scripts/run-electron-builder.cjs --mac --x64",
  );
  assert.equal(
    packageJson.scripts["verify:desktop-package:mac:reuse-stage"],
    "node desktop/scripts/run-electron-builder.cjs --dir --mac --arm64 && node desktop/scripts/verify-desktop-package.cjs --platform mac",
  );
});

test("electron-builder config declares installable macOS artifacts", () => {
  process.env.AI_NOVEL_RELEASE_CHANNEL = "beta";
  const config = require("../electron-builder.config.cjs");

  assert.equal(config.mac.icon, path.join("builder", "app-icon.icns"));
  assert.equal(config.mac.category, "public.app-category.productivity");
  assert.deepEqual(config.mac.target, [
    {
      target: "dmg",
      arch: ["arm64"],
    },
    {
      target: "zip",
      arch: ["arm64"],
    },
  ]);
  assert.equal(config.dmg.artifactName, "${productName}-${version}-${arch}.${ext}");
  assert.deepEqual(
    config.extraResources.map((entry) => entry.to),
    ["icons/app-icon.ico", "icons/app-icon.icns", "app-update.yml", "client"],
  );
});

test("electron-builder macOS target follows the requested architecture", () => {
  const configPath = require.resolve("../electron-builder.config.cjs");
  delete require.cache[configPath];
  process.env.AI_NOVEL_RELEASE_CHANNEL = "beta";
  process.argv.push("--mac", "--x64");
  try {
    const config = require("../electron-builder.config.cjs");
    assert.deepEqual(config.mac.target.map((target) => target.arch), [["x64"], ["x64"]]);
  } finally {
    process.argv.splice(process.argv.lastIndexOf("--x64"), 1);
    process.argv.splice(process.argv.lastIndexOf("--mac"), 1);
    delete require.cache[configPath];
  }
});

test("desktop icon generator is responsible for macOS icns output", () => {
  const source = fs.readFileSync(path.join(repoRoot, "desktop", "scripts", "generate-desktop-icons.py"), "utf8");

  assert.match(source, /ICNS_SIZES = \[/);
  assert.match(source, /app-icon\.icns/);
});

test("desktop package verifier selects platform-specific unpacked app roots", () => {
  const source = fs.readFileSync(path.join(repoRoot, "desktop", "scripts", "verify-desktop-package.cjs"), "utf8");

  assert.match(source, /--platform/);
  assert.match(source, /mac-universal|mac-arm64|mac/);
  assert.match(source, /app-icon\.icns/);
});

test("desktop package verifier normalizes asar entry roots across platforms", () => {
  const { normalizeAsarEntry } = require("../scripts/verify-desktop-package.cjs");

  assert.equal(normalizeAsarEntry("/dist/runtime/server.js"), "dist/runtime/server.js");
  assert.equal(normalizeAsarEntry("\\dist\\runtime\\server.js"), "dist/runtime/server.js");
});

test("electron-builder wrapper keeps pnpm traversal patch enabled for macOS builds", () => {
  const source = fs.readFileSync(path.join(repoRoot, "desktop", "scripts", "run-electron-builder.cjs"), "utf8");
  const traversalPatchIndex = source.indexOf("ensurePatchedAppFileCopier();");
  const windowsBranchIndex = source.indexOf("if (needsWindowsPackaging)");

  assert.ok(traversalPatchIndex > 0, "app file copier patch must be called");
  assert.ok(windowsBranchIndex > 0, "wrapper must keep the Windows-specific branch");
  assert.ok(
    traversalPatchIndex < windowsBranchIndex,
    "pnpm traversal patch must run before the Windows-only NSIS branch",
  );
});
