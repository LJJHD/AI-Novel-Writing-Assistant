# 桌面打包边界

## Background

桌面端使用 Electron 承载同一套 React 前端和内置 Express 服务。打包链路先通过 `pnpm run stage:desktop` 把前端资源、桌面主进程、服务端代码、Prisma 运行时和本地更新配置集中到 `desktop/build/app` 与 `desktop/build/resources`，再交给 `electron-builder` 产出平台安装包。

桌面包不是独立重写的产品线。它必须继续复用 Web / Server / Shared 的主业务实现，只在宿主层处理本地启动、资源定位、数据目录、图标、安装器和更新能力。

## Decision

Windows 和 macOS 共用同一个 staging 阶段，平台差异只进入 builder 配置、图标资产、安装包目标和打包后验证脚本。

- Windows 继续产出 `nsis` 安装版和 `portable` 版。
- macOS 本地构建产出 `dmg` 和 `zip`，默认面向 Apple Silicon。
- Intel Mac 使用单独的 `pnpm run dist:desktop:mac:x64` 入口。
- macOS 图标使用 `desktop/builder/app-icon.icns`，Windows 图标使用 `desktop/builder/app-icon.ico`。
- `desktop/scripts/verify-desktop-package.cjs` 必须按平台检查打包后的资源目录，而不是固定读取 `win-unpacked`。

## Current Rule

桌面构建入口：

- `pnpm run dist:desktop:nsis`：生成 Windows 安装版。
- `pnpm run dist:desktop:portable`：生成 Windows portable 版。
- `pnpm run dist:desktop:mac`：生成 macOS Apple Silicon `dmg` / `zip`。
- `pnpm run dist:desktop:mac:x64`：生成 macOS Intel `dmg` / `zip`。

桌面验证入口：

- `pnpm run verify:desktop-package:reuse-stage`：验证 Windows unpacked 包。
- `pnpm run verify:desktop-package:mac:reuse-stage`：验证 macOS unpacked 包。

macOS 本地自用构建允许使用 ad-hoc 签名。公开分发给普通用户前，必须准备 Apple Developer 签名身份和公证流程；不能把未签名或未公证的本地包当作正式发布包。

## Failure Modes

- 只新增 `--mac` 脚本但不生成 `.icns`，会导致 macOS App 使用默认图标或 builder 报错。
- 验证脚本固定读取 `win-unpacked`，会让 macOS 产物无法被检查，资源遗漏也不会被发现。
- 公共发布时缺少签名或公证，普通用户会遇到 Gatekeeper 阻断或强警告。
- staging 阶段遗漏 Prisma generated client、迁移文件或前端 `index.html`，桌面包可以生成但启动后本地服务或页面会失败。

## Related Modules

- `desktop/electron-builder.config.cjs`
- `desktop/scripts/stage-desktop.cjs`
- `desktop/scripts/run-electron-builder.cjs`
- `desktop/scripts/verify-desktop-package.cjs`
- `desktop/scripts/generate-desktop-icons.py`
- `desktop/src/runtime/paths.ts`
