# KCC20 transfer development

The desktop source includes an experimental TN10 transfer form calling these
modules. The dApp provider does not expose token sends. Signing is restricted to TN10.
No real wallet, funding or broadcast was used for the recorded tests.

## Pipeline

- `kcc20-codec.cjs`: exact 2433-byte profile, state/range/ownership validation.
- `kcc20-plan.cjs`: select at most four owned address-mode token inputs; node
  binding checks and conserved token outputs.
- `kcc20-assemble.cjs`: one ordinary owner P2PK funding input, explicit carrier,
  fee and change; covenant-aware Safe JSON and size estimation.
- `covenant-preflight.cjs`: re-observe every reviewed input through the selected
  node, including script, value, covenant identity, DAA score and coinbase flag.
- `kcc20-sign.cjs`: require exact reviewed transaction bytes and owner key;
  sign with the WASM `SighashType.All` enum, verify the wire flag and unchanged
  transaction fields. No vault access or broadcasting is performed here.
- `kcc20-prepare.cjs`: choose an ordinary owner funding input and recheck the
  full unsigned transaction against the selected node.
- `kcc20-authorize.cjs`: snapshot reviewed data, derive the review summary from
  validated transaction fields, obtain approval, recheck context/inputs, sign.
- `kcc20-submit.cjs`: bind the history account to the owner input, require a
  durable pre-broadcast record/checkpoint, bound node request duration and never
  automatically retry ambiguous submission outcomes.

Node observation is not a UTXO reservation or consensus verification. Callers
must recheck context and inputs after approval and before broadcasting.

## Provenance and evidence

The synthetic fixture contains public bytecode only, no private keys. It was
compiled using SilverScript commit
`2c4623124d75bd8a9a7f87ded9413ef9f6b17acd`.

- Compiler binary SHA-256:
  `81074575b71dbb402d7035b393f4c9d5fdd53fdeb5be218499d37634a72506a5`
- Local compiler artifact SHA-256:
  `c9150cf81ea62a2aff3f959bf49dca4d4734791617319de6115ef4b04a03c9ba`

`npm test` covers codec, planning, assembly, real WASM UTXO references, signed
transaction preservation, wrong owner/network and changed review rejection.
`scripts/probe-kcc20-signed.cjs` emits a synthetic signed transaction using a
fresh ephemeral unfunded key. It never emits that key.

A separate local Rust script-engine harness executed the generated single,
merged and partial (900 transferred, 100 returned) transactions, and rejected
altered change and missing signatures for all three. The partial transaction
uses Toccata mass mode and an explicit 200000-sompi synthetic fee. That
harness is not bundled in this repository or run by its CI; do not conflate
this local evidence with a reproducible CI consensus validation gate.

The TN10 form now defaults to local minimum-fee estimation (1 sompi/mass),
rebuilding the change output until the fee covers the measured mass, with a
bounded iteration count and 1-KAS cap. This is not a congestion estimate.
An explicitly entered inadequate fee is rejected, never silently increased.
The node activation/sync/index check runs during preparation, after approval
before key access, and again at submission. Node reports remain a trust boundary.

## Remaining integration gates

The preparation/authorization/submission components have isolated tests and
are connected to the TN10 wallet form. Real TN10 end-to-end tests, recovery UX,
portable engine-test provenance and independent review remain outstanding.
Do not enable mainnet signing on the strength of these unit tests alone.

## 中文摘要

这些是开发中的组件，已接入源码中的 TN10 实验表单，未开放 dApp API。签名仅允许 TN10，
测试使用临时无资金密钥和合成交易。节点复核不代表锁定 UTXO，也不代表完整
共识验证。选币、审核和广播边界已实现独立组件，但真实测试网全流程、
完整授权流程实测、广播恢复体验和独立审查
尚未完成，不能据此声称主网可用。
