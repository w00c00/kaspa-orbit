# Verification snapshot / 验证范围

Recorded 2026-09-09. This is a development wallet, not a production-readiness claim.
以下记录区分离线测试、节点查询与真实资金交易，不能互相替代。

## 2026-09-11 integration update

- Commit `bb91d84`: desktop CI run `34474859792` passed on Windows x64,
  macOS ARM64 and Linux x64. Each ran 95 Node tests, isolated desktop smoke,
  packaging and comparison of all 52 packaged desktop/UI files with the commit.
- The smoke now covers automatic two-page KRC20 discovery, KCC20 empty-state
  discovery and distinct native L1/EVM balances using intercepted transports.
  It does not prove funded-wallet balances or real token transfers.
- Live mainnet queries with an ephemeral empty address succeeded for both
  Kasplex and kascov. Kasplex rejected a percent-encoded address-prefix colon
  with HTTP 403 / `address invalid`; the validated literal-address path returned
  HTTP 200. The regression is covered in `test/tokens.test.cjs`.
- Public-page probes on `https://kaspa.com/` and `https://defi.kaspa.com/swap`
  passed: complete document, EIP-6963 Orbit discovery, empty accounts and no
  privileged shell API. The DeFi page displayed a Connect Wallet control.
- The first body-text-only probe missed the DeFi wallet picker. The follow-up
  inspected open shadow roots and found `ONBOARD-V2`: its "Available Wallets (4)"
  list explicitly included **Kaspa Orbit**, alongside Kaspa Com Web Wallet,
  Coinbase Wallet and WalletConnect. This proves wallet-picker discovery, not
  connection or signing. One resource TLS handshake error was observed in an
  earlier run; full page health is not established. No wallet option was selected
  and no wallet connection, signature or transaction was approved.

三平台打包、自动查询及 KaspaCom 弹窗中的 Orbit 展示已验证；授权、签名和交易仍未验证。

### 2026-09-12 KaspaCom account connection

`node scripts/run-desktop-smoke.cjs --live https://defi.kaspa.com --wallet-picker --connect-empty`
passed on the local Mac. Unlike the default read-only probe, this opt-in test
creates an ephemeral unfunded wallet in the disposable profile, clicks the
observed **Kaspa Orbit** option in the real site's shadow-root picker, and
permits exactly one `https://defi.kaspa.com` EVM address-disclosure prompt.
The actual site triggered that permission; the permission store and provider
both reported the connection. Disconnect cleared provider accounts. All other
approval prompts are denied. The process exited normally and its temporary
profile was removed. No real user wallet, message signature, token approval or
transaction was used. This proves the site's account-connection path, not
swap execution, site-side account rendering or all network-switch flows.

KaspaCom 实站发起的空钱包地址授权及断开已通过；签名、代币授权和交易不在本次验证范围。

2026-09-10 update: official SilverScript v1.0.0 compilation probe and pinned
engine checks passed (28 scenarios), together with 84 Node tests and the isolated
Electron smoke. Passing an old upstream checkout to the runner was separately
confirmed to fail before compilation. See [v1 migration](SILVERSCRIPT-V1.md).
These are local source checks, not updated release assets or live transfers.

Package source verification can be repeated without opening a real wallet:

```sh
node scripts/verify-packaged-source.cjs /path/to/app.asar COMMIT
```

The verifier compares all tracked desktop/UI files and rejects unexpected files
in those directories. It was tested against the 4e9fb75 macOS CI package: all 49
files matched that commit, while comparison with dcb51fd correctly failed at
`desktop/kcc20-prepare.cjs`. This verifies source content, not dependencies,
code signing, installation behavior or transaction safety.

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

## Desktop permission and signing integration

The isolated desktop smoke also forcibly terminates its test dApp renderer after
locking the ephemeral wallet. It verifies that the shell displays reload guidance,
reloads the page, and checks that both injected providers return no locked accounts.
This exercises a real renderer exit, not only a mocked event. Pending-request
invalidation on exit is covered by the tab unit test; the crash test does not
claim to exercise a transaction concurrently awaiting approval.

The actual Electron Kaspa provider path also passes an isolated lifecycle:
address approval, public-key lookup, bilingual KIP-5 message signing, WASM
verification and altered-message rejection, account-cleared disconnect event,
and rejection of signing after revocation. Kaspa permission does not grant EVM
permission. Only the exact fixed local test origin/message is auto-approved;
the ephemeral profile is removed after exit. This is not a live third-party
dApp login or a Kaspa transaction broadcast.

The isolated Electron smoke now exercises the actual IPC/provider path with an
ephemeral unfunded wallet: request account permission, query permission, sign a
fixed personal message, sign a fixed EIP-712 test message, verify both signatures,
and revoke permission with an empty-account event. Wrong-chain typed data is
rejected. The test approves only the exact fixture origin and exact test prompts;
other prompts are rejected. No remote website receives these signatures.
The smoke also builds/signs a synthetic 1-wei self-transfer through the desktop
IPC route. Main-process fetch is fully intercepted with no network fallback;
the mock RPC checks the signed sender, recipient, value, chain ID and hash.
No transaction reaches a real node. Temporary wallet data is removed on exit.

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
