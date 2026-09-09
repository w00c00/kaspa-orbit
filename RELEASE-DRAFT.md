# v0.1.0 — Developer Preview / 开发预览版

Kaspa Orbit · Release state: **Draft + Pre-release**.

> **Security hold / 安全暂停：**现有附件尚未包含 SIGHASH 映射修复，请勿使用这些
> 安装包进行 KRC20 转账或 PSKT 签名。原调用误把 WASM 枚举 `None=1` 当成链上
> `SIGHASH_ALL=0x01`。源码已改为显式 `SighashType.All`，附件待重建及验证。
> Existing assets do not contain the sighash mapping fix. Do not use them for
> KRC20 transfers or PSKT signing. Rebuilt, verified assets are pending.

## 中文

首个开发预览版：跨平台 Kaspa 生态桌面钱包，集成隔离的 dApp 浏览器。

- 本地加密钱包，支持创建、导入、锁定和按网站授权。
- 默认 Kaspa 主网，可切换 TN10；支持 Igra 主网/测试网及 Kasplex 主网。
- KAS 转账、KRC20 持仓与转账恢复、ERC20 查询与转账。
- KCC20 持仓查询及底层契约输出核验；**原生 KCC20 转账尚未启用**。
- EVM provider、KasWare 风格接口、消息签名和指定输入的 Safe-JSON PSKT 签名。
- 多标签浏览、网站断开授权、自定义节点、发送记录及节点状态查询。
- 普通转账选币排除契约绑定资金。

**重要限制：**这不是可托付真实资产的正式钱包。Mac、Windows、Linux 的 CI 均已
通过 51 项测试、Electron 冒烟测试及打包，但真实代币转账、第三方 dApp 全流程、
安装包在用户机器上的验证及独立安全审查尚未完成。不保证兼容所有 dApp。签名与广播需要用户确认。

改名前后的钱包继续使用 `kaspa-nexus` 数据目录；加密格式和派生路径不变。
Mac 构建未做 Developer ID 签名或公证。跨平台打包成功不等于对应平台运行验证。
KRC20 查询依赖 Kasplex 索引器，KCC20 候选/持仓查询依赖 kascov；节点核验与
索引器报告分开标注。请优先用 TN10 的无价值测试资金体验，不要导入储蓄钱包。

## English

First developer preview of a desktop wallet and isolated dApp browser for the
Kaspa ecosystem.

- Locally encrypted wallet creation/import, locking and per-site authorization.
- Kaspa mainnet by default with TN10 switching; Igra mainnet/testnet and Kasplex.
- Native KAS transfers, KRC20 holdings/transfers/recovery and ERC20 lookup/send.
- KCC20 holdings and backend cell-binding verification; **native KCC20 transfers
  are not enabled**.
- EVM provider, KasWare-style interfaces, message signing and selective Safe-JSON
  PSKT signing; multi-tab browsing, custom RPC and outgoing transaction history.
- Ordinary transfer funding excludes covenant-bound UTXOs.

**Not a production wallet.** All three OS runners passed 51 automated tests,
the Electron smoke test and native packaging. Live token transfers, third-party
dApp end-to-end flows, installed-package tests on end-user machines and
independent security review are incomplete.
Not every dApp/API is supported. User approval is required for signing/broadcast.

The legacy `kaspa-nexus` data directory, encryption format and derivation paths
are preserved across the branding change.
Mac builds are unsigned and unnotarized. Packaging success is not OS runtime
validation. KRC20 queries use the Kasplex indexer; KCC20 candidate/holding queries
use kascov. Node binding verification is distinct from indexer claims and contract
safety. Prefer TN10 with valueless test funds; do not import a savings wallet.

## Downloads / 下载

Validation evidence / 验证记录: [CI run 34250818751](https://github.com/w00c00/kaspa-orbit/actions/runs/34250818751).
This historical run tests commit `d11f784`. It predates the sighash fix and
does not validate the fixed build. 此历史记录早于签名修复，不代表修复版安装包已验证。

Choose the asset matching your OS and CPU architecture. Windows ZIP builds are
portable; extract the entire archive before running the application.
请选择匹配操作系统和 CPU 架构的文件。Windows ZIP 为便携包，完整解压后运行。
