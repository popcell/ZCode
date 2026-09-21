# Node ESM bundle 内联 CommonJS 依赖的 `require` 能力

## 行为

desktop 的 `main` / `host` / `scheduler`、`@zcode/server` 的 `entry-http`、`@zcode/server-cli` 的 `server-cli` / `server-core` 都以 `format: "esm"` 打包，并把 `@zcode/services` 等 workspace 包整体内联。内联的第三方 CommonJS 依赖（如 `socks`、`smart-buffer`）在源码里用 `require("events")` / `require("net")` 加载 Node 内置模块；esbuild 在 ESM 输出中把这些调用改写成 `__require(...)` 垫片，垫片在文件顶层读取 `require` 标识符，读不到就抛 `Dynamic require of "<module>" is not supported`。

规则：**每个 Node ESM bundle 输出文件（含 code-splitting chunk）必须在顶部提供真实的 `require`**，让内联 CommonJS 依赖能加载 Node 内置模块和外部依赖。产物不得在模块求值阶段因动态 `require` 崩溃。

## 状态所有者

- banner 文本唯一来源：`scripts/esm-node-require-banner.mjs` 导出的 `ESM_NODE_REQUIRE_BANNER`
- 接入点：各包 tsup 配置的 `banner.js`（`packages/desktop/tsup.config.ts`、`packages/server/tsup.config.ts`、`packages/zcode-server-cli/tsup.config.ts`）
- 运行时 `require` 由 `createRequire(import.meta.url)` 创建，解析基准是产物文件自身位置（asar 内亦可用，与 `packages/desktop/src/main/editors.ts` 的现有用法一致）

## 与 external 名单的关系

`desktopNodeRuntimeExternals`、`SERVER_HTTP_EXTERNAL_DEPENDENCIES` 等 external 名单继续保留：native addon、需要按平台分发、或已被 `REQUIRED_ASAR_RUNTIME_MODULES` 注入的依赖仍走外部加载。banner 解决的是“内联 CJS 依赖动态 require 内置模块”这一类崩溃，不再要求为每个新的 CJS 依赖同步扩充 external、desktop `package.json`、asar 注入和 bundle 校验四处名单。

CJS 产物（desktop `preload`、`packages/server/build-remote.ts` 的 remote 单文件 bundle）天然有 `require`，不接入 banner。

## 失败语义

- banner 缺失：产物在 `import()` / 模块求值阶段抛 `Dynamic require of "<module>" is not supported`，Electron 主进程表现为启动即 Uncaught Exception
- banner 存在但依赖确实不在产物和运行时 `node_modules` 中：抛 `Cannot find module`，由 asar 注入与 bundle 校验名单负责

## 验收场景

1. 用 esbuild 以 `format: "esm"` 打包一个顶层 `require("events")` 的 CommonJS fixture：不加 banner 时 `import()` 抛 `Dynamic require of "events"`；加 `ESM_NODE_REQUIRE_BANNER` 后可导入且拿到 `EventEmitter`
2. desktop `pnpm exec tsup` 后，`out/main`、`out/host`、`out/scheduler` 下每个 `.js` 以 banner 开头
3. desktop 主进程与 `@zcode/server` 的 `entry-http` 在内联 `socks` 的情况下通过模块求值，不再出现 `Dynamic require of "events"`
