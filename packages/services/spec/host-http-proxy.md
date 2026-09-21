# Host 出口代理

## 行为

设置页 `httpProxy` 是应用出口代理的唯一配置源，不读取用户 shell 的 `HTTP_PROXY` / `ALL_PROXY`。空值表示 Host / Agent / 渲染层直连；内置浏览器在空值时跟随系统代理。

一等 scheme：`http`、`https`、`socks5`、`socks5h`。无 scheme 的 `host:port` 按 `http://` 补齐。`socks://`、SOCKS4、PAC、`socks5s` 非法。

字段名保持 `httpProxy`，不做设置迁移。URL 中的 `user:pass` 作为代理认证（HTTP 基本认证或 SOCKS5 用户名密码）。

## 状态所有者

- 持久化：`ISettingService` / `setting.json` 的 `httpProxy`、`httpProxyNoProxy`、`httpProxyCaCertPath`
- Host Node API 出口：`createHostApiNetworkTransport` 按请求解析路由并持有 undici dispatcher
- Chromium：`applyDesktopChromiumNetworkPolicies` 调用 `session.setProxy`
- Agent 子进程：`buildAgentRuntimeEnv` 在 spawn 时注入环境变量

## 各层语义

| 层 | HTTP(S) 代理 | SOCKS5 | `socks5h` |
| --- | --- | --- | --- |
| 设置保存 | 合法 | 合法 | 合法 |
| Host undici | `ProxyAgent` HTTP CONNECT | `socks` 库隧道；本机 DNS 后再连 IP | 把目标 hostname 交给代理 |
| Electron `setProxy` | `http(s)://host:port` | `socks5://host:port` | 映射为 `socks5://`（Chromium SOCKS5 本身远端 DNS） |
| Agent / CLI | 环境变量 + `proxy-agent` | 同左 | 同左 |

自定义 CA 只用于目标站点 TLS。SOCKS 到代理的连接是明文 TCP，不走 `proxyTls`。

## 失败语义

- 配置了非空 `httpProxy` 但无法解析为一等 scheme：Host 抛 `Configured Host proxy URL is invalid`，**不回退直连**
- scheme 合法但代理不可达：表现为连接错误，不再是 invalid URL
- 设置读取失败：只影响当次请求，不把 Host API 锁死，也不直连
- 保存非法 URL：`appSettingsPatchSchema` 拒绝 patch；已落盘的非法值加载时不整文件回退默认，由 Host 运行时 fail-closed

## 不变量

- dispatcher 由 Host transport 单飞缓存，窗口/Host 重建时必须 close/destroy，不能留下 keep-alive
- `noProxy` 命中后直连，忽略已配置代理
- WSL 远端把 loopback 代理主机改写成 Windows host gateway 时保留 scheme；无端口的 SOCKS 探测默认 1080，HTTP 默认 80，HTTPS 默认 443
- `socks` 是 CommonJS 依赖且在 `hostSocksConnect` 中静态导入；内联它的 Node ESM bundle 必须按 `packages/desktop/spec/esm-bundle-cjs-require.md` 提供 `require`，否则消费方在模块求值阶段崩溃

## 验收场景

1. `http://127.0.0.1:7890`：Host 走 `ProxyAgent`，请求不再因 invalid URL 失败
2. `socks5://127.0.0.1:1080`：`resolveHostProxyForUrl` 返回 `kind: "proxy"`；dispatcher 为 SOCKS 而不是 HTTP CONNECT
3. `socks5h://127.0.0.1:1080`：Host 远端 DNS；Electron proxyRules 为 `socks5://127.0.0.1:1080`
4. `socks://127.0.0.1:1080`：保存失败；若运行时仍读到该值，Host 报 invalid 且不直连
5. `127.0.0.1:7890`：按 `http://` 补齐后生效
6. noProxy 命中 `localhost` 时直连
