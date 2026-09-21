import { lookup } from "node:dns/promises";
import { isIP, type Socket } from "node:net";
import { connect as tlsConnect, type ConnectionOptions, type TLSSocket } from "node:tls";
import { SocksClient, type SocksProxy } from "socks";
import { parseProxyUrl, type NormalizedProxyUrl } from "@zcode/shared";
import { buildConnector } from "undici";

/**
 * undici ProxyAgent 只做 HTTP CONNECT，不能对 SOCKS 端口握手。
 * 这里用 socks 库先打隧道，HTTPS 再在隧道上做目标站点 TLS（含自定义 CA）。
 */
export function createHostSocksConnector(
  proxy: NormalizedProxyUrl,
  ca: string[] | undefined,
): buildConnector.connector {
  return (options, callback) => {
    void connectThroughSocks(proxy, options, ca).then(
      (socket) => {
        callback(null, socket);
      },
      (error: unknown) => {
        callback(error instanceof Error ? error : new Error(String(error)), null);
      },
    );
  };
}

async function connectThroughSocks(
  proxy: NormalizedProxyUrl,
  options: buildConnector.Options,
  ca: string[] | undefined,
): Promise<TLSSocket | Socket> {
  const destinationHost = await resolveSocksDestination(options.hostname, proxy.remoteDns);
  const destinationPort = Number(options.port || (options.protocol === "http:" ? "80" : "443"));
  const { socket } = await SocksClient.createConnection({
    proxy: toSocksProxy(proxy),
    command: "connect",
    destination: {
      host: destinationHost,
      port: destinationPort,
    },
  });

  if (options.protocol !== "https:") {
    return socket as Socket;
  }

  const tlsOptions: ConnectionOptions = {
    socket,
    host: options.hostname,
    servername: options.servername || options.hostname,
    ALPNProtocols: ["http/1.1"],
  };
  if (ca) {
    tlsOptions.ca = ca;
  }

  const tlsSocket = tlsConnect(tlsOptions);
  await waitForSecureConnect(tlsSocket);
  return tlsSocket;
}

export function requireParsedProxyUrl(proxyUrl: string): NormalizedProxyUrl {
  const parsed = parseProxyUrl(proxyUrl);
  if (!parsed) {
    throw new Error("Configured Host proxy URL is invalid");
  }
  return parsed;
}

async function resolveSocksDestination(hostname: string, remoteDns: boolean): Promise<string> {
  if (remoteDns || isIP(hostname) !== 0) {
    return hostname;
  }
  // socks5 是本机 DNS：先解析再把 IP 交给代理，避免代理侧解析被污染的域名。
  const { address } = await lookup(hostname);
  return address;
}

function toSocksProxy(proxy: NormalizedProxyUrl): SocksProxy {
  const socksProxy: SocksProxy = {
    host: proxy.hostname,
    port: Number(proxy.port),
    type: 5,
  };
  if (proxy.username) {
    socksProxy.userId = proxy.username;
    socksProxy.password = proxy.password;
  }
  return socksProxy;
}

function waitForSecureConnect(socket: TLSSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      reject(error);
    };
    socket.on("error", onError);
    socket.once("secureConnect", () => {
      socket.off("error", onError);
      resolve();
    });
  });
}
