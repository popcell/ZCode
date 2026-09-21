# Tag 多平台编译

打 `v*` tag 或手动运行后，GitHub Actions 在对应操作系统 runner 上编译桌面安装包与命令行发行包。全部成功后自动创建或更新 GitHub Release：标题为 `ZCode-<version>`，只挂 `ZCode-` 开头的附件。

## 产品规则

- 触发：推送 `v*` tag（与 `release-it` 的 `v${version}` 一致），或手动 `workflow_dispatch`。
- tag 去掉 `v` 前缀后必须等于根目录 `package.json` 的 `version`，否则失败。
- 发布名与附件前缀固定为 `ZCode-<version>`（例如 `ZCode-3.14.0`）。git tag 仍是 `v<version>`。Release 任务在桌面矩阵与 CLI 全绿后自动执行，不要求操作者再点 Publish。
- 桌面矩阵（各跑一遍现有 `pnpm bundle:desktop`），`ZCODE_ENV=production`，避免 `_TEST` 后缀：

  | runner | `--os` | `--arch` | 附件示例 |
  | --- | --- | --- | --- |
  | macos-14 | mac | arm64 | `ZCode-<version>-mac-arm64.dmg` / `.zip` |
  | macos-14 | mac | x64 | `ZCode-<version>-mac-x64.dmg` / `.zip` |
  | windows-latest | win | x64 | `ZCode-<version>-win-x64.exe` |
  | windows-latest | win | arm64 | `ZCode-<version>-win-arm64.exe` |
  | ubuntu-24.04 | linux | x64 | `ZCode-<version>-linux-x64.AppImage` 等 |
  | ubuntu-24.04-arm | linux | arm64 | `ZCode-<version>-linux-arm64.AppImage` 等 |

- 命令行发行包在 `ubuntu-24.04` 跑 `pnpm build:zcode`。挂到 Release 时改名为 `ZCode-<version>-cli.tar.gz` 与 `ZCode-<version>-cli.sha256.txt`。`install.sh` / `latest.json` 不进 Release（文件名不是 `ZCode-` 前缀，且 `install.sh` 依赖目录托管布局）。
- `build:zcode` 必须先编出 TUI 闭包里仍导出 `src` 的 workspace 包（至少 `@zcode/shared` 的 `dist/index.js`），再收集 SEA TUI 资源。只跑 `@zcode/cli...` 且该包没有 `build` script 时，组包会在 `Missing @zcode/shared dist files` 处失败。
- 默认不签名、不公证。`ZCODE_ENABLE_MAC_SIGN` 保持关闭；`CSC_IDENTITY_AUTO_DISCOVERY=false`。未签名 macOS 包会触发隔离，Windows 可能被 SmartScreen 拦截。
- 桌面矩阵 `fail-fast: false`。全部桌面目标与 CLI 都成功后才发 Release；失败目标的产物仍留在 Actions artifact。
- 已有同 tag 的 Release 时更新标题并 `--clobber` 覆盖同名附件；没有则创建。`workflow_dispatch` 同样发 Release，tag 不存在时用当前 SHA 建 `v<version>`。
- 不写业务状态。所有者是本 workflow；不另起并行打包入口。

## 验收

1. 推送 `v<package.json.version>` 后，六个桌面目标与 CLI 任务都启动。
2. 版本不匹配的 tag 在 resolve 步失败。
3. 全绿后出现标题为 `ZCode-<version>` 的 GitHub Release，附件均以 `ZCode-` 开头，含各平台安装包与 `ZCode-<version>-cli.tar.gz`。
4. CLI 任务在干净 checkout 上能编出 `@zcode/shared/dist/index.js`，不再因 `Missing @zcode/shared dist files` 失败。
5. 手动 `workflow_dispatch` 全绿后同样发出或更新该 Release。
