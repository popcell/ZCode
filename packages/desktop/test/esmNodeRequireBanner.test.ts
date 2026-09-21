import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { ESM_NODE_REQUIRE_BANNER } from "../../../scripts/esm-node-require-banner.mjs";

// 复现 socks 这类 CommonJS 依赖的形态：模块顶层 require 内置模块。
// esbuild 以 ESM 输出时会把它改写成 __require 垫片，垫片依赖文件顶层是否存在真实 require。
const CJS_FIXTURE_SOURCE = `
const events = require("events");
module.exports = { EventEmitter: events.EventEmitter };
`;

const ESM_ENTRY_SOURCE = `
import cjs from "./cjs-dep.cjs";
export const EventEmitter = cjs.EventEmitter;
`;

async function bundleFixtureAsEsm(options: { banner?: string }): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "zcode-esm-require-banner-"));
  await writeFile(join(dir, "cjs-dep.cjs"), CJS_FIXTURE_SOURCE, "utf8");
  await writeFile(join(dir, "entry.mjs"), ESM_ENTRY_SOURCE, "utf8");
  const outfile = join(dir, "out", "entry.mjs");
  await build({
    entryPoints: [join(dir, "entry.mjs")],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    outfile,
    logLevel: "silent",
    banner: options.banner ? { js: options.banner } : undefined,
  });
  return dir;
}

test("esbuild ESM bundle without a real require rejects inlined CJS require of builtins", async (t) => {
  const dir = await bundleFixtureAsEsm({});
  t.after(() => rm(dir, { recursive: true, force: true }));

  await assert.rejects(
    import(pathToFileURL(join(dir, "out", "entry.mjs")).href),
    /Dynamic require of "events" is not supported/,
  );
});

test("ESM_NODE_REQUIRE_BANNER lets inlined CJS dependencies require builtins", async (t) => {
  const dir = await bundleFixtureAsEsm({ banner: ESM_NODE_REQUIRE_BANNER });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const bundled = (await import(pathToFileURL(join(dir, "out", "entry.mjs")).href)) as {
    EventEmitter: unknown;
  };
  const { EventEmitter } = await import("node:events");
  assert.equal(bundled.EventEmitter, EventEmitter);
});

test("ESM_NODE_REQUIRE_BANNER only declares require from the bundle's own location", () => {
  // banner 会被 tsup 先打包再注入；这里锁定它必须是纯字符串、以 import.meta.url 为解析基准，
  // 不能依赖 import.meta.dirname 之类会被配置打包重定位的值。
  assert.match(ESM_NODE_REQUIRE_BANNER, /createRequire as __zcodeCreateRequire/);
  assert.match(
    ESM_NODE_REQUIRE_BANNER,
    /const require = __zcodeCreateRequire\(import\.meta\.url\);/,
  );
  assert.doesNotMatch(ESM_NODE_REQUIRE_BANNER, /import\.meta\.dirname/);
});
