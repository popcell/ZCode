import assert from "node:assert/strict";
import test from "node:test";
import {
  parseProxyUrl,
  resolveProxyProbePort,
  toElectronProxyRules,
} from "../src/httpProxyUrl.js";
import { appSettingsPatchSchema, appSettingsSchema } from "../src/validationAppSettings.js";

test("parseProxyUrl accepts http, https, socks5, socks5h and bare host:port", () => {
  assert.equal(parseProxyUrl("http://127.0.0.1:7890")?.href, "http://127.0.0.1:7890/");
  assert.equal(parseProxyUrl("https://proxy.example:8443")?.protocol, "https:");
  assert.equal(parseProxyUrl("socks5://127.0.0.1:1080")?.protocol, "socks5:");
  assert.equal(parseProxyUrl("socks5h://127.0.0.1:1080")?.remoteDns, true);
  assert.equal(parseProxyUrl("127.0.0.1:7890")?.href, "http://127.0.0.1:7890/");
  assert.equal(parseProxyUrl("socks5://127.0.0.1")?.port, "1080");
  assert.equal(parseProxyUrl("socks5://user:pass@127.0.0.1:1080")?.username, "user");
});

test("parseProxyUrl rejects socks and other unsupported schemes", () => {
  assert.equal(parseProxyUrl("socks://127.0.0.1:1080"), undefined);
  assert.equal(parseProxyUrl("socks4://127.0.0.1:1080"), undefined);
  assert.equal(parseProxyUrl("ftp://127.0.0.1:1080"), undefined);
  assert.equal(parseProxyUrl(""), undefined);
  assert.equal(parseProxyUrl("   "), undefined);
});

test("toElectronProxyRules maps socks5h to socks5 and keeps socks5", () => {
  assert.equal(toElectronProxyRules("socks5h://127.0.0.1:1080"), "socks5://127.0.0.1:1080");
  assert.equal(toElectronProxyRules("socks5://127.0.0.1:1080"), "socks5://127.0.0.1:1080");
  assert.equal(toElectronProxyRules("http://127.0.0.1:7890"), "http://127.0.0.1:7890");
  assert.equal(toElectronProxyRules("socks://127.0.0.1:1080"), undefined);
});

test("resolveProxyProbePort defaults SOCKS to 1080", () => {
  assert.equal(resolveProxyProbePort("socks5:", ""), "1080");
  assert.equal(resolveProxyProbePort("socks5h:", ""), "1080");
  assert.equal(resolveProxyProbePort("socks:", ""), "1080");
  assert.equal(resolveProxyProbePort("https:", ""), "443");
  assert.equal(resolveProxyProbePort("http:", ""), "80");
  assert.equal(resolveProxyProbePort("socks5:", "55555"), "55555");
});

test("saving httpProxy rejects socks:// but accepts socks5", () => {
  assert.equal(appSettingsPatchSchema.safeParse({ httpProxy: "socks5://127.0.0.1:1080" }).success, true);
  assert.equal(appSettingsPatchSchema.safeParse({ httpProxy: "socks5h://127.0.0.1:1080" }).success, true);
  assert.equal(appSettingsPatchSchema.safeParse({ httpProxy: "http://127.0.0.1:7890" }).success, true);
  assert.equal(appSettingsPatchSchema.safeParse({ httpProxy: "socks://127.0.0.1:1080" }).success, false);
});

test("loading existing settings does not drop other fields when httpProxy is unsupported", () => {
  const result = appSettingsSchema.safeParse({
    localePreference: "en-US",
    httpProxy: "socks://127.0.0.1:1080",
  });
  assert.equal(result.success, true);
  assert.equal(result.data?.localePreference, "en-US");
  assert.equal(result.data?.httpProxy, "socks://127.0.0.1:1080");
});
