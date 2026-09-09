# SilverScript v1.0.0 compatibility / 正式版兼容性

Verified 2026-09-10 against official tag v1.0.0 and HEAD
`3ed973335b59269293564805cc2c58a14595ec03`.
Release: https://github.com/kaspanet/silverscript/releases/tag/v1.0.0

## 中文

- 引擎验证和 CI 已固定到正式标签的完整提交哈希，拒绝不同版本或已修改的上游源码。
- 正式版相对此前 158534d 的 ABI API 将 `verify()` 改为
  `check_consistency()`。这不是可信来源、安全性或源码与字节码一致性的证明。
  Orbit 未调用旧 Rust API，因此无需伪造一个运行时替换。
- 旧研究源码迁移为 `entry`、显式 `State` 读取、`unsigned(byte)`，
  构造参数采用 `{kind,value}`，字节数组采用 `bytes`。
- 注意：官方 v1.0.0 的 `COMPILER_VERSION` 仍为 `0.1.0`，
  `^1.0.0` 声明实际编译失败。因此探针保留 `^0.1.0`，以提交哈希确认正式版，
  不修改官方编译器、不把输出中的版本字段伪造为 1.0.0。
- 新编译探针是 2760 字节、状态偏移 1；已有资产是 2433 字节、状态偏移 0。
  二者不能互换。运行时保留旧模板的严格身份检查，新探针不加入可签名模板白名单。
- 已通过完整编译、旧资产 28 项脚本引擎场景、84 项 Node 测试和隔离 Electron
  桌面测试。未使用真实钱包、未广播交易。KCC20 主网发送继续关闭。

## English

The engine harness and CI now pin the official v1.0.0 commit. The ABI method
rename to `check_consistency()` does not establish artifact trust; Orbit does
not call the former Rust method. The compilation probe migrates legacy entry,
state-read, byte conversion and constructor JSON syntax.

The official tag still embeds compiler version `0.1.0` and rejects a `^1.0.0`
pragma. We retain its accepted pragma and identify the compiler by its exact Git
commit, without patching upstream or falsifying artifact metadata.

The new 2760-byte probe is NOT interchangeable with deployed 2433-byte tokens.
Existing template recognition remains unchanged. The new probe is compilation
coverage, not a supported deployment or a semantic-equivalence proof.
All 28 legacy engine scenarios, 84 Node tests and isolated desktop smoke tests
passed. No real-wallet access or transaction broadcast occurred. Mainnet KCC20
sending remains disabled pending the existing deployment review gates.

## Reproduction

```sh
node scripts/run-kcc20-engine.cjs /path/to/clean/silverscript-v1.0.0
```

The runner fully compiles the committed probe with explicit constructor values,
checks bytecode SHA256, ABI metadata SHA256 (including dispatch and parameter
types) and state span, then executes the legacy adversarial and
synthetic wallet transaction tests. CI runs the same checks. A changed artifact
fails closed and requires review, rather than automatically updating a hash.

- Local rustc: 1.95.0; locked dependencies from official tag.
- Local silverc SHA256: `965d5f8a05441b1eb8321f6e1f91d9e90e248e3d913ec93c8fb6e52a911c6daf` (platform/build specific).
- New probe bytecode SHA256: `a3e6a3525ae1dffcc1e284246c41e2b5d6c15d421999a46cc46ec8889c1b7dff`.
- Probe state span: offset 1, length 46; full program length 2760.
- Legacy fixture compiler provenance remains `2c4623124d75bd8a9a7f87ded9413ef9f6b17acd`.

This change upgrades source verification tooling, not the installed desktop app
or release assets. No wallet data migration is necessary.
