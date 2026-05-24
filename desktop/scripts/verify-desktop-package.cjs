const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");

const desktopDir = path.resolve(__dirname, "..");
const electronBuilderPackageJson = require.resolve("electron-builder/package.json", { paths: [desktopDir] });
const electronBuilderRequire = createRequire(electronBuilderPackageJson);
const asar = electronBuilderRequire("@electron/asar");
const buildDir = path.join(desktopDir, "build");
const appDir = path.join(buildDir, "app");
const appPackageJsonPath = path.join(appDir, "package.json");
const stagedServerEntry = path.join(appDir, "node_modules", "@ai-novel", "server", "dist", "app.js");
const stagedPrismaRuntimeEntry = path.join(appDir, "node_modules", ".prisma", "client", "default.js");
const stagedGeneratedPrismaClientEntry = path.join(
  appDir,
  "node_modules",
  ".pnpm",
  "node_modules",
  "@prisma",
  "client",
  "generated-client",
  "default.js",
);
const stagedServerMigrationsDir = path.join(appDir, "node_modules", "@ai-novel", "server", "src", "prisma", "migrations");
const stagedAppUpdateConfig = path.join(buildDir, "resources", "app-update.yml");
const stagedClientIndex = path.join(buildDir, "resources", "client", "dist", "index.html");
const stagedRuntimeFile = path.join(appDir, "dist", "runtime", "server.js");

function assertExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${description}: ${targetPath}`);
  }
}

function assertNotExists(targetPath, description) {
  if (fs.existsSync(targetPath)) {
    throw new Error(`Unexpected ${description}: ${targetPath}`);
  }
}

function assertResolvesWithinDirectory(targetPath, expectedParentDir, description) {
  const resolvedPath = fs.realpathSync(targetPath);
  const normalizedParentDir = path.resolve(expectedParentDir);
  if (!resolvedPath.startsWith(normalizedParentDir)) {
    throw new Error(`${description} must resolve inside ${normalizedParentDir}, but resolved to ${resolvedPath}.`);
  }
}

function assertSomeMatch(entries, pattern, description) {
  const matchedEntry = entries.find((entry) => pattern.test(entry));
  if (!matchedEntry) {
    throw new Error(`Packaged app archive is missing ${description}.`);
  }
}

function parsePlatformArg(argv) {
  const platformIndex = argv.indexOf("--platform");
  if (platformIndex >= 0) {
    const platform = argv[platformIndex + 1]?.trim().toLowerCase();
    if (platform === "win" || platform === "windows") {
      return "win";
    }
    if (platform === "mac" || platform === "darwin") {
      return "mac";
    }
    throw new Error(`Unsupported --platform value: ${platform || "(empty)"}. Expected win or mac.`);
  }

  return process.platform === "darwin" ? "mac" : "win";
}

function findExistingDir(candidates, description) {
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Missing ${description}. Checked: ${candidates.join(", ")}`);
  }
  return found;
}

function findMacAppBundle(unpackedDir) {
  const entries = fs.readdirSync(unpackedDir, { withFileTypes: true });
  const appEntry = entries.find((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
  if (!appEntry) {
    throw new Error(`Missing macOS .app bundle under ${unpackedDir}.`);
  }
  return path.join(unpackedDir, appEntry.name);
}

function resolvePackageLayout(platform) {
  if (platform === "mac") {
    const unpackedDir = findExistingDir(
      [
        path.join(buildDir, "dist", "mac-arm64"),
        path.join(buildDir, "dist", "mac-universal"),
        path.join(buildDir, "dist", "mac"),
        path.join(buildDir, "dist", "mac-x64"),
      ],
      "macOS unpacked app directory",
    );
    const appBundleDir = findMacAppBundle(unpackedDir);
    const resourcesDir = path.join(appBundleDir, "Contents", "Resources");
    return {
      platform,
      unpackedDir,
      builderIcon: path.join(desktopDir, "builder", "app-icon.icns"),
      packagedIcon: path.join(resourcesDir, "icons", "app-icon.icns"),
      packagedClientIndex: path.join(resourcesDir, "client", "dist", "index.html"),
      packagedAppArchive: path.join(resourcesDir, "app.asar"),
    };
  }

  const unpackedDir = path.join(buildDir, "dist", "win-unpacked");
  return {
    platform,
    unpackedDir,
    builderIcon: path.join(desktopDir, "builder", "app-icon.ico"),
    packagedIcon: path.join(unpackedDir, "resources", "icons", "app-icon.ico"),
    packagedClientIndex: path.join(unpackedDir, "resources", "client", "dist", "index.html"),
    packagedAppArchive: path.join(unpackedDir, "resources", "app.asar"),
  };
}

function main() {
  const layout = resolvePackageLayout(parsePlatformArg(process.argv.slice(2)));

  assertExists(appPackageJsonPath, "staged desktop package.json");
  assertExists(layout.builderIcon, "builder desktop window icon");
  assertExists(stagedAppUpdateConfig, "staged updater feed configuration");
  assertExists(stagedClientIndex, "staged renderer index");
  assertExists(layout.packagedClientIndex, "packaged renderer index");
  assertExists(layout.packagedAppArchive, "packaged app archive");
  assertExists(layout.packagedIcon, "packaged desktop window icon");
  assertExists(stagedRuntimeFile, "desktop runtime server bundle");
  assertNotExists(path.join(appDir, "src"), "desktop source directory inside staged app");
  assertNotExists(path.join(appDir, "node_modules", "electron"), "Electron runtime inside staged app node_modules");
  assertResolvesWithinDirectory(
    path.join(appDir, "node_modules", "@ai-novel", "server"),
    appDir,
    "Staged server package",
  );

  const appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, "utf8"));
  if (appPackageJson.dependencies?.electron) {
    throw new Error("Electron must not be bundled as an application dependency in the staged app.");
  }

  const runtimeSource = fs.readFileSync(stagedRuntimeFile, "utf8");
  if (runtimeSource.includes("pnpm --filter @ai-novel/server start")) {
    throw new Error("Packaged desktop runtime still references pnpm-based server startup.");
  }
  const stagedClientIndexSource = fs.readFileSync(stagedClientIndex, "utf8");
  if (stagedClientIndexSource.includes('src="/assets/') || stagedClientIndexSource.includes('href="/assets/')) {
    throw new Error("Packaged desktop renderer still references absolute /assets paths.");
  }
  const updaterConfigSource = fs.readFileSync(stagedAppUpdateConfig, "utf8");
  if (!updaterConfigSource.includes("provider: github")) {
    throw new Error("Desktop updater feed configuration is missing the GitHub provider.");
  }

  const packagedFiles = new Set(asar.listPackage(layout.packagedAppArchive).map((entry) => entry.replace(/^\\/, "").replace(/\\/g, "/")));
  const packagedEntries = Array.from(packagedFiles);
  assertSomeMatch(
    packagedEntries,
    /^dist\/runtime\/server\.js$/,
    "desktop runtime server bundle inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@ai-novel\/server\/dist\/app\.js$/,
    "bundled server entry inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@ai-novel\/server\/src\/prisma\/migrations\/[^/]+\/migration\.sql$/,
    "bundled Prisma migration files inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@prisma\/client\/generated-client\/default\.js$/,
    "embedded generated Prisma client inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@prisma\/client\/default\.js$/,
    "packaged Prisma client entrypoint inside app.asar",
  );

  console.log(`[verify:desktop-package] ${layout.platform} staged package layout looks valid.`);
  console.log(`[verify:desktop-package] unpacked app inspected at ${layout.unpackedDir}`);
}

try {
  main();
} catch (error) {
  console.error("[verify:desktop-package] failed.", error);
  process.exit(1);
}
