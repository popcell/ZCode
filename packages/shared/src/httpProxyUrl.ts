const PROXY_URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//iu;

export const HTTP_PROXY_PROTOCOLS = ["http:", "https:"] as const;
export const SOCKS_PROXY_PROTOCOLS = ["socks5:", "socks5h:"] as const;
export const SUPPORTED_PROXY_PROTOCOLS = [...HTTP_PROXY_PROTOCOLS, ...SOCKS_PROXY_PROTOCOLS] as const;

export type HttpProxyProtocol = (typeof HTTP_PROXY_PROTOCOLS)[number];
export type SocksProxyProtocol = (typeof SOCKS_PROXY_PROTOCOLS)[number];
export type SupportedProxyProtocol = (typeof SUPPORTED_PROXY_PROTOCOLS)[number];

export interface NormalizedProxyUrl {
  href: string;
  protocol: SupportedProxyProtocol;
  hostname: string;
  port: string;
  username: string;
  password: string;
  /** socks5h 把 hostname 交给代理；socks5 由本机解析后再连 IP。HTTP 代理无此语义。 */
  remoteDns: boolean;
}

const DEFAULT_PROXY_PORTS: Record<SupportedProxyProtocol, string> = {
  "http:": "80",
  "https:": "443",
  "socks5:": "1080",
  "socks5h:": "1080",
};

export function isSupportedProxyProtocol(protocol: string): protocol is SupportedProxyProtocol {
  return (SUPPORTED_PROXY_PROTOCOLS as readonly string[]).includes(protocol);
}

export function isSocksProxyProtocol(protocol: string): protocol is SocksProxyProtocol {
  return (SOCKS_PROXY_PROTOCOLS as readonly string[]).includes(protocol);
}

export function defaultProxyPort(protocol: string): string | undefined {
  return isSupportedProxyProtocol(protocol) ? DEFAULT_PROXY_PORTS[protocol] : undefined;
}

export function parseProxyUrl(value: string | undefined): NormalizedProxyUrl | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const candidate = PROXY_URL_SCHEME_RE.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname || !isSupportedProxyProtocol(url.protocol)) {
      return undefined;
    }
    const port = url.port || DEFAULT_PROXY_PORTS[url.protocol];
    url.port = port;
    return {
      href: url.href,
      protocol: url.protocol,
      hostname: url.hostname,
      port,
      username: decodeUriComponentSafe(url.username),
      password: decodeUriComponentSafe(url.password),
      remoteDns: url.protocol === "socks5h:",
    };
  } catch {
    return undefined;
  }
}

/**
 * Chromium `session.setProxy` 的 proxyRules。
 * `socks5h://` 不是 Chromium scheme，映射为 `socks5://`；Chromium SOCKS5 本身做远端 DNS。
 */
export function toElectronProxyRules(value: string | undefined): string | undefined {
  const parsed = parseProxyUrl(value);
  if (!parsed) {
    return undefined;
  }
  const protocol = parsed.protocol === "socks5h:" ? "socks5:" : parsed.protocol;
  const auth = formatProxyAuth(parsed.username, parsed.password);
  return `${protocol}//${auth}${formatProxyHost(parsed.hostname, parsed.port)}`;
}

export function resolveProxyProbePort(protocol: string, explicitPort: string): string {
  if (explicitPort) {
    return explicitPort;
  }
  return (
    defaultProxyPort(protocol) ?? (protocol.startsWith("socks") ? "1080" : protocol === "https:" ? "443" : "80")
  );
}

function formatProxyAuth(username: string, password: string): string {
  if (!username) {
    return "";
  }
  const user = encodeURIComponent(username);
  return password ? `${user}:${encodeURIComponent(password)}@` : `${user}@`;
}

function formatProxyHost(hostname: string, port: string): string {
  const host = hostname.includes(":") ? `[${hostname}]` : hostname;
  return `${host}:${port}`;
}

function decodeUriComponentSafe(value: string): string {
  if (!value) {
    return "";
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
