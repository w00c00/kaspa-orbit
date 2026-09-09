# Kaspa Orbit

跨平台 Kaspa 生态桌面钱包与内置 dApp 浏览器，开发中。
Cross-platform Kaspa ecosystem desktop wallet and embedded dApp browser. In development.

Repository / 仓库: https://github.com/w00c00/kaspa-orbit

v0.1.0 是开发预览版，不是正式资产钱包。发布草稿仅仓库维护者可见。
v0.1.0 is a developer preview, not a production wallet. Draft releases are visible only to repository maintainers.

改名保留 `kaspa-nexus` 钱包数据目录、加密格式和派生路径，不迁移或覆盖钱包。
The rename preserves the legacy `kaspa-nexus` profile, encryption format and derivation paths.

目标 / Scope: Kaspa native KAS, KRC20, KCC20, Igra and Kasplex EVM, macOS / Windows / Linux.

## Run / 运行

Node.js 22 or newer:

```sh
npm install
npm test
npm run test:desktop
npm start
```

`npm run dist` packages for the current OS. Code signing and notarization are not configured.

`test:desktop` runs the actual Electron shell with a temporary profile and an
ephemeral, unfunded wallet. It never opens the user's existing wallet. It checks
creation, backup dismissal, lock/unlock, feature controls and protected history.
On headless Linux use `xvfb-run -a npm run test:desktop`. The GitHub workflow
runs unit tests, this smoke test and packaging independently on all three OSes;
the workflow file alone is not evidence that those jobs passed.

## Current status / 当前状态

- Local AES-256-GCM vault, scrypt password derivation, BIP39 creation/import and locking.
- Kaspa and EVM account derivation; isolated Chromium dApp view and origin-scoped connection approval.
- Initial bilingual interface.
- Igra testnet/mainnet and Kasplex mainnet RPC identity checks and balance queries.
- EVM message/typed-data signing and reviewed transaction signing path; EIP-6963 discovery and provider event listeners. Transaction tests currently use mock RPC.
- EVM 同一 provider 同时提供于 `window.ethereum` 与 `window.kasware.ethereum`，兼容 KasWare 的连接入口。
  Both EVM entry points share the same provider, network, permissions and events.
- EVM 网站可调用 `wallet_revokePermissions`，参数为 `[{eth_accounts:{}}]`，撤销当前网站的账户授权；不会影响其他域名或 Kaspa 权限。
  EVM dApps can revoke their own account permission with `wallet_revokePermissions`; other origins and Kaspa permissions are unaffected.
- Kaspa `signMessage(message, {type, noAuxRand})` 返回 KIP-5 Schnorr 十六进制签名；支持 `auto` / `schnorr` 和布尔值 `noAuxRand`。ECDSA、未知参数明确拒绝，不会静默降级，也不声称兼容旧版 Base64 签名格式。
  Message signing returns KIP-5 Schnorr hex. ECDSA and unknown options are rejected; legacy Base64 formats are not supported.
- Kaspa 主网默认；可切换 TN10，记住网络选择。切换网络会断开网站授权并清除旧网络显示。
  Kaspa mainnet by default, with a persistent TN10 selector. Switching disconnects sites and clears stale network views.
- KAS 转账界面和 dApp `sendKaspa(recipient, sompi, options)`；金额按 sompi 处理，只支持空 options，不会静默忽略手续费选项。
  Native KAS transfers from the wallet and dApps, reviewed before signing. Empty options only; unsupported fee options are rejected.
- KRC20 持仓、两步转账及恢复记录；ERC20 查询和转账；KCC20 索引器持仓查询。
  KRC20 holdings, commit/reveal transfers and recovery records; ERC20 lookup/transfers; indexed KCC20 holdings.
- dApp 可调用 `kasware.signKRC20Transaction(inscriptionJson, 4, destination?, 0)` 发起转账；`amt` 必须是最小单位整数字符串，只能指定 tick 或 ca 之一。接收地址冲突、未知字段、部署/铸造和非零自定义手续费会被拒绝。该接口会在用户确认后签名并广播，失败可从钱包恢复记录继续。
  KRC20 dApp transfers use type 4, atomic-unit string amounts and exactly one tick/ca identity. Review, persistent recovery and network checks precede broadcast. Deployment/mint and custom priority fees are not implemented; indexer balances are advisory, and live transfer outcomes remain unverified.
- Safe-JSON PSKT 指定输入签名，保留其他 Covenant 输入；尚未覆盖所有 PSKT 格式。
  Selective Safe-JSON PSKT signing preserves other covenant inputs; not all PSKT formats are supported.
- The source includes a TN10-only experimental KCC20 address-owner transfer form. Mainnet transfers, broader provider compatibility, real dApp end-to-end tests, and installed-package testing remain pending.

51 automated tests currently pass. These include real local Schnorr verification, mock RPC and main-process request-route tests, not proof of production readiness or live token-transfer success.

三平台验证 / Cross-platform validation: [CI run 34250818751](https://github.com/w00c00/kaspa-orbit/actions/runs/34250818751)
at commit `d11f78482ace70dfbc2de4752e827d019c607e4d` passed on macOS, Windows and Linux.
各平台均通过 51 项测试、实际 Electron 桌面冒烟测试和本机打包；测试覆盖临时钱包创建、锁定/解锁、隔离浏览器 provider、正常退出和清理。
Each runner passed the 51 tests, the real Electron smoke test and native packaging.
The smoke test uses a fresh unfunded wallet and an in-process HTTPS fixture, not
a third-party dApp or a live token transfer. It does not validate installation of
the packaged app, all CPU architectures, or every desktop environment.

本地发送记录支持 EVM 回执和 Kaspa 节点接受列表查询，不将其视为最终性保证。已对 Igra 和 Kaspa 主网公开交易做过只读验证；Kasplex 实际回执验证仍待完成。Kaspa 新交易保存查询检查点，旧记录或已裁剪的历史可能无法验证。
Local outgoing history supports EVM receipts and Kaspa node acceptance-list checks, not finality guarantees. Read-only public-transaction validation passed on Igra and Kaspa mainnet; live Kasplex receipts remain unverified. New Kaspa sends save a checkpoint; old or pruned history may be unverifiable.

当前版本尚未完成交易功能和安全审查。Do not treat this development build as a production wallet.

## References

### Wallet management / 多钱包管理

Use **Add wallet** to create an independent recovery phrase or import an existing
one even when another wallet exists. Each wallet has its own encrypted file and
password. Name and switch wallets from the selector; switching locks the old
wallet and disconnects dApp permissions. New wallets remain locked for backup.
Recovery phrases can be shown again only after password verification.

已有钱包时仍可通过“新建或导入”添加独立钱包，每个钱包使用独立的加密文件和
密码。支持命名、重命名和切换；切换会锁定旧钱包并断开网站授权。原有
`vault.json` 保持原位，地址、派生路径和加密格式不变。新钱包先备份后解锁；
需要再次备份时，可验证密码重新显示助记词。本版本尚不支持同一助记词下添加
多个派生账户，也不提供删除钱包功能。

This is independent multi-wallet support, not multiple derived accounts per
recovery phrase. Wallet deletion is not offered in this preview.

- https://docs.kasware.xyz/wallet/dev-base/kaspa
- https://github.com/kaspa-wallet-standard/kaspa-wallet-standard
- https://igra-labs.gitbook.io/igralabs-docs/quickstart/network-info
- https://github.com/kaspanet/kccs

Historical SilverScript upstream observation (2026-09-07): `c7d17a15ac88610d013ec9ffffa9520aeb69929b`, not a claim about current HEAD. Experimental transfer provenance and outstanding checks are documented in [KCC20-DEVELOPMENT.md](KCC20-DEVELOPMENT.md). Holdings remain indexer-reported; selected transfer inputs are separately checked against the node. Mainnet KCC20 sending remains disabled.
