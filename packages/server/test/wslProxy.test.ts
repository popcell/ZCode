import assert from "node:assert/strict";
import test from "node:test";
import { buildWslProxyPortProbeCommand, replaceProxyHostname } from "../src/remote/wslProxy.js";

test("WSL proxy port probe defaults SOCKS to 1080", () => {
  const command = buildWslProxyPortProbeCommand("socks5://127.0.0.1");
  assert.ok(command?.includes("/1080"));
  assert.ok(buildWslProxyPortProbeCommand("http://127.0.0.1")?.includes("/80"));
  assert.ok(buildWslProxyPortProbeCommand("https://127.0.0.1")?.includes("/443"));
  assert.ok(buildWslProxyPortProbeCommand("socks5://127.0.0.1:55555")?.includes("/55555"));
});

test("WSL loopback rewrite keeps socks5 scheme", () => {
  assert.equal(
    replaceProxyHostname("socks5://127.0.0.1:1080", "192.168.1.1"),
    "socks5://192.168.1.1:1080",
  );
});
