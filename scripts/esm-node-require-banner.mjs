// Node ESM bundle 内联的 CommonJS 依赖（如 socks、smart-buffer）会用 require("events") 等
// 加载内置模块。esbuild 在 ESM 输出里把它们改写成 __require 垫片，垫片只在文件顶层读一次
// `require` 标识符，读不到就抛 "Dynamic require of \"events\" is not supported"，
// Electron 主进程与 server entry 都会在模块求值阶段直接崩溃。
// 这里给每个 ESM 输出文件（含 code-splitting chunk）前置一个基于自身位置的真实 require，
// 让 __require 委托给 Node 原生解析；规则见 packages/desktop/spec/esm-bundle-cjs-require.md。
// 只能用纯字符串，不能引用 import.meta.dirname：tsup 会先打包配置文件，重定位后的路径不可信。
export const ESM_NODE_REQUIRE_BANNER = [
  'import { createRequire as __zcodeCreateRequire } from "node:module";',
  "const require = __zcodeCreateRequire(import.meta.url);",
].join("\n");
