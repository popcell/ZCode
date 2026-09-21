import assert from "node:assert/strict";
import test from "node:test";
import {
  createHostApiNetworkTransport,
  resolveHostProxyDispatcherKind,
  resolveHostProxyForUrl,
} from "../src/providers/api/nodeApiNetwork.js";

test("resolveHostProxyForUrl accepts http and socks5 proxies", () => {
  assert.equal(
    resolveHostProxyForUrl("https://zcode.z.ai/api", { httpProxy: "http://127.0.0.1:7890" }).kind,
    "proxy",
  );
  const socks5 = resolveHostProxyForUrl("https://zcode.z.ai/api", {
    httpProxy: "socks5://127.0.0.1:1080",
  });
  assert.equal(socks5.kind, "proxy");
  if (socks5.kind === "proxy") {
    assert.match(socks5.proxyUrl, /^socks5:\/\/127\.0\.0\.1:1080\/?$/);
    assert.equal(resolveHostProxyDispatcherKind(socks5), "socks-proxy");
  }

  const socks5h = resolveHostProxyForUrl("https://zcode.z.ai/api", {
    httpProxy: "socks5h://127.0.0.1:1080",
  });
  assert.equal(socks5h.kind, "proxy");
  if (socks5h.kind === "proxy") {
    assert.equal(resolveHostProxyDispatcherKind(socks5h), "socks-proxy");
  }

  const httpProxy = resolveHostProxyForUrl("https://zcode.z.ai/api", {
    httpProxy: "http://127.0.0.1:7890",
  });
  assert.equal(httpProxy.kind, "proxy");
  if (httpProxy.kind === "proxy") {
    assert.equal(resolveHostProxyDispatcherKind(httpProxy), "http-proxy");
  }
});

test("resolveHostProxyForUrl rejects socks:// and fail-closes instead of going direct", () => {
  const route = resolveHostProxyForUrl("https://zcode.z.ai/api", {
    httpProxy: "socks://127.0.0.1:1080",
  });
  assert.deepEqual(route, {
    kind: "invalid",
    reason: "Configured Host proxy URL is invalid",
  });
});

test("resolveHostProxyForUrl honors noProxy", () => {
  const route = resolveHostProxyForUrl("https://localhost/health", {
    httpProxy: "socks5://127.0.0.1:1080",
    noProxy: "localhost,127.0.0.1,::1",
  });
  assert.equal(route.kind, "direct");
  if (route.kind === "direct") {
    assert.equal(route.noProxyMatched, true);
  }
});

test("createHostApiNetworkTransport throws invalid socks:// before creating a dispatcher", async () => {
  let created = 0;
  const transport = createHostApiNetworkTransport(
    async () => ({ httpProxy: "socks://127.0.0.1:1080" }),
    {
      createDispatcher: async () => {
        created += 1;
        return {
          close: async () => {},
          destroy: async () => {},
        } as never;
      },
    },
  );

  await assert.rejects(
    () => transport.fetch("https://zcode.z.ai/api/v1/client/scenes"),
    /Configured Host proxy URL is invalid/,
  );
  assert.equal(created, 0);
  transport.dispose();
});

test("createHostApiNetworkTransport routes socks5 to injected dispatcher instead of HTTP CONNECT", async () => {
  const kinds: string[] = [];
  const transport = createHostApiNetworkTransport(
    async () => ({ httpProxy: "socks5://127.0.0.1:1080" }),
    {
      createDispatcher: async (route) => {
        kinds.push(resolveHostProxyDispatcherKind(route));
        return {
          close: async () => {},
          destroy: async () => {},
        } as never;
      },
      fetchWithDispatcher: async () => new Response("ok"),
    },
  );

  const response = await transport.fetch("https://zcode.z.ai/api/v1/client/scenes");
  assert.equal(await response.text(), "ok");
  assert.deepEqual(kinds, ["socks-proxy"]);
  transport.dispose();
});
