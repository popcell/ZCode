# Tag 多平台编译

打 `v*` tag 后，GitHub Actions 在对应操作系统 runner 上编译桌面安装包与命令行发行包，并把产物挂到该 tag 的 GitHub Release。

## 产品规则

- 触发：推送 `v*` tag（与 `release-it` 的 `v${version}` 一致），或手动 `workflow_dispatch`。
- tag 去掉 `v` 前缀后必须等于根目录 `package.json` 的 `version`，否则失败。手动运行且不在 tag 上时，只编译、不发 Release。
- 桌面矩阵（各跑一遍现有 `pnpm bundle:desktop`）：

  | runner | `--os` | `--arch` |
  | --- | --- | --- |
  | macos-14 | mac | arm64 |
  | macos-14 | mac | x64 |
  | windows-latest | win | x64 |
  | windows-latest | win | arm64 |
  | ubuntu-24.04 | linux | x64 |
  | ubuntu-24.04-arm | linux | arm64 |

- 命令行发行包在 `ubuntu-24.04` 跑 `pnpm build:zcode`，`--version` 用 tag 版本；`--base-url` 默认指向该 tag 的 GitHub Release 下载根。`install.sh` 仍按 `releases/<version>/` 目录约定，GitHub Release 只保证 tarball / sha256 可下载。
- 默认不签名、不公证。`ZCODE_ENABLE_MAC_SIGN` 保持关闭；`CSC_IDENTITY_AUTO_DISCOVERY=false`。未签名 macOS 包会触发隔离，Windows 可能被 SmartScreen 拦截。
- 桌面矩阵 `fail-fast: false`。全部桌面目标与 CLI 都成功后才创建或更新 GitHub Release；失败目标的产物仍留在 Actions artifact。
- 不写业务状态。所有者是本 workflow；不另起并行打包入口。

## 验收

1. 推送 `v<package.json.version>` 后，六个桌面目标与 CLI 任务都启动。
2. 版本不匹配的 tag 在 resolve 步失败。
3. 全绿后该 tag 的 Release 含各平台安装包、`zcode-<version>.tar.gz` 与 `sha256.txt`。
