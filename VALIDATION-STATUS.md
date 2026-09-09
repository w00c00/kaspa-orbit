# Verification snapshot / 验证范围

Recorded 2026-09-09. This is a development wallet, not a production-readiness claim.
以下记录区分离线测试、节点查询与真实资金交易，不能互相替代。

- `169f2b2`: local Node suite has 80 passing tests; isolated Electron smoke passed.
- `d16a77a`: macOS, Windows and Linux desktop CI passed (run `34334814463`).
- `2d522d6`: pinned Kaspa script-engine CI passed four selected groups / 28
  scenarios (run `34334349408`); seven included upstream tests are filtered out.
- `3e65914` macOS ARM64 DMG: CRC verified and all 49 desktop/UI files matched
  the commit. SHA-256: `6d6ec69ce3d2c3691d9f4f2cb7a364e4915ec390d6d015c9fad4e6568e461eeb`.
  This package predates the latest EVM response/parameter fixes.
- Read-only configured-node probes passed for Igra mainnet (38833), Igra
  testnet (38836), and Kasplex mainnet (202555): chain ID and block number.
- Resolver-selected TN10 node reported synced, UTXO index enabled, server
  2.0.1 and DAA 565873849; the TN10 activation gate accepted this observation.

## Not yet proven / 尚未验证

- Live KCC20 transfer, resulting token change and confirmation/recovery flow.
- Mainnet KCC20 signing: deliberately disabled pending exact-profile review.
- Broad third-party dApp compatibility: local provider fixtures do not prove
  real websites' connection, signing, transaction and recovery flows.
- Real user installation and live transactions on every supported OS.
- Independent security review of the exact release candidate.

No real wallet profile, seed or funded signing key was used for these checks.
No transaction was broadcast by the node probes or script-engine tests.

## Public-page browser probe

`node scripts/run-desktop-smoke.cjs --live https://kascov.io` passed using an
empty disposable profile: page loaded, EIP-6963 discovery returned Orbit,
`eth_accounts` returned no accounts, and shell/Node APIs were absent.
This does not prove the website's wallet-selection UI, connection approval,
signing or transaction behavior. The command makes public website requests,
never creates a wallet, and removes its temporary profile after Electron exits.

The same public-page probe also passed for `https://app.zealousswap.com/`:
document ready state `complete`, Orbit discovery present, no accounts exposed.
No connect button was approved, and no trade was prepared or submitted.

With `--wallet-picker`, the Zealous Swap probe waits for SPA hydration and opens
the observed Connect button. The site's actual picker listed **Kaspa Orbit**
under installed wallets. No wallet option was selected, no connection approval
was granted and the profile remained empty. This establishes UI discovery only.
