const path = require("node:path");

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

const releaseChannel = firstNonEmpty(process.env.AI_NOVEL_RELEASE_CHANNEL, "beta").toLowerCase();
const isBetaRelease = releaseChannel === "beta";
const githubOwner = firstNonEmpty(process.env.AI_NOVEL_GITHUB_OWNER, "ExplosiveCoderflome");
const githubRepo = firstNonEmpty(process.env.AI_NOVEL_GITHUB_REPO, "AI-Novel-Writing-Assistant");
const buildArgs = process.argv.slice(2);
const windowsSigningLink = firstNonEmpty(
  process.env.CSC_LINK,
  process.env.WIN_CSC_LINK,
  process.env.AI_NOVEL_WINDOWS_CSC_LINK,
  process.env.AI_NOVEL_WINDOWS_CSC_FILE,
);
const macSigningIdentity = firstNonEmpty(
  process.env.MAC_CSC_NAME,
  process.env.AI_NOVEL_MAC_SIGNING_IDENTITY,
  process.env.CSC_NAME,
);
const allowUnsignedWindowsRelease =
  firstNonEmpty(
    process.env.AI_NOVEL_ALLOW_UNSIGNED_RELEASE,
    process.env.AI_NOVEL_ALLOW_UNSIGNED_WINDOWS_RELEASE,
  ).toLowerCase() === "true";
const allowUnsignedMacRelease =
  firstNonEmpty(
    process.env.AI_NOVEL_ALLOW_UNSIGNED_RELEASE,
    process.env.AI_NOVEL_ALLOW_UNSIGNED_MAC_RELEASE,
  ).toLowerCase() === "true";
const hasWindowsSigningMaterial = Boolean(windowsSigningLink);
const hasMacSigningMaterial = Boolean(macSigningIdentity);
const windowsIconPath = path.join("builder", "app-icon.ico");
const macIconPath = path.join("builder", "app-icon.icns");

function includesAnyArg(args, names) {
  return args.some((arg) => names.includes(arg));
}

function hasExplicitPlatformTarget(args) {
  return includesAnyArg(args, ["--win", "--windows", "-w", "--mac", "-m", "--linux", "-l"]);
}

function isWindowsBuildRequested(args) {
  if (includesAnyArg(args, ["--win", "--windows", "-w"])) {
    return true;
  }
  return !hasExplicitPlatformTarget(args) && process.platform === "win32";
}

function isMacBuildRequested(args) {
  if (includesAnyArg(args, ["--mac", "-m"])) {
    return true;
  }
  return !hasExplicitPlatformTarget(args) && process.platform === "darwin";
}

function resolveMacTargetArchs(args) {
  if (includesAnyArg(args, ["--universal"])) {
    return ["universal"];
  }
  if (includesAnyArg(args, ["--x64", "-x64"])) {
    return ["x64"];
  }
  if (includesAnyArg(args, ["--arm64", "-arm64"])) {
    return ["arm64"];
  }
  return ["arm64"];
}

if (!isBetaRelease && isWindowsBuildRequested(buildArgs) && !hasWindowsSigningMaterial && !allowUnsignedWindowsRelease) {
  throw new Error(
    "Public Windows desktop releases require signing material. Provide CSC_LINK/WIN_CSC_LINK, or explicitly opt in to an unsigned release.",
  );
}

if (!isBetaRelease && isMacBuildRequested(buildArgs) && !hasMacSigningMaterial && !allowUnsignedMacRelease) {
  throw new Error(
    "Public macOS desktop releases require Apple signing material. Provide MAC_CSC_NAME/AI_NOVEL_MAC_SIGNING_IDENTITY, or explicitly opt in to an unsigned release.",
  );
}

const macTargetArchs = resolveMacTargetArchs(buildArgs);

module.exports = {
  appId: "com.ai-novel.desktop",
  productName: "AI Novel Writing Assistant v2",
  directories: {
    app: "build/app",
    output: "build/dist",
    buildResources: "builder",
  },
  files: [
    "dist/**/*",
    "package.json",
    "node_modules/.prisma/**/*",
  ],
  extraResources: [
    {
      from: "builder/app-icon.ico",
      to: "icons/app-icon.ico",
    },
    {
      from: "builder/app-icon.icns",
      to: "icons/app-icon.icns",
    },
    {
      from: "build/resources/app-update.yml",
      to: "app-update.yml",
    },
    {
      from: "build/resources/client",
      to: "client",
      filter: ["**/*"],
    },
  ],
  asar: true,
  asarUnpack: [
    "node_modules/**/*.node",
  ],
  npmRebuild: true,
  nativeRebuilder: "sequential",
  extraMetadata: {
    main: "dist/main.js",
  },
  publish: [
    {
      provider: "github",
      owner: githubOwner,
      repo: githubRepo,
      releaseType: isBetaRelease ? "prerelease" : "release",
    },
  ],
  electronUpdaterCompatibility: ">=2.16",
  generateUpdatesFilesForAllChannels: false,
  win: {
    icon: windowsIconPath,
    // Keep EXE resource editing enabled for unsigned builds so Windows uses the app icon and metadata.
    signAndEditExecutable: true,
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
      {
        target: "portable",
        arch: ["x64"],
      },
    ],
  },
  mac: {
    icon: macIconPath,
    category: "public.app-category.productivity",
    identity: macSigningIdentity || "-",
    hardenedRuntime: hasMacSigningMaterial,
    gatekeeperAssess: hasMacSigningMaterial,
    target: [
      {
        target: "dmg",
        arch: macTargetArchs,
      },
      {
        target: "zip",
        arch: macTargetArchs,
      },
    ],
  },
  dmg: {
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },
  nsis: {
    artifactName: "${productName}-${version}-setup-${arch}.${ext}",
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
    installerIcon: windowsIconPath,
    uninstallerIcon: windowsIconPath,
    installerHeaderIcon: windowsIconPath,
  },
  portable: {
    artifactName: "${productName}-${version}-portable-${arch}.${ext}",
  },
};
