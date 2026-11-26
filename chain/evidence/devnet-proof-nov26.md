# Devnet proof, Nov 26, 2026 (the demo film's games)

Three games played through the web app on Solana devnet and MagicBlock's TEE rollup (`devnet-tee.magicblock.app`), by
fresh device test wallets holding 0 SOL. Trails printed by `chain/scripts/devnet-proof.ts` and
`chain/scripts/royale-proof.ts` and `chain/scripts/squad-proof.ts`; every line links to Solana Explorer. The scripts read
transactions at version 1, so the Magic Action that settles each game on Solana shows as `ProcessUndelegation + SettleDuel`
(or `+ SettleTournament`), signed by MagicBlock's TEE validator.

| Game | Account | Trail |
|---|---|---|
| 1v1 private duel, ETH (VRF), Ben called down and won +9.70 USDC, 61 crank ticks | `4cVexGrafUwJ7MSPBHgGm36jUn4KrXQzZGaJtSxuv8Y2` | [devnet-proof-nov26-duel.txt](devnet-proof-nov26-duel.txt) (99 txs, 89 on the rollup) |
| 3-player Royale, BTC (VRF), 5 rounds, 12 session-key calls, 51 crank ticks, Ben survived (+5.82 USDC) | `LifRbotyx5vkJBcCRYDKZPutHbhV6gNofAaGguEsx1u` | [devnet-proof-nov26-royale.txt](devnet-proof-nov26-royale.txt) (93 txs, 84 on the rollup) |
| Squad war: moon-pack (Ana captain, Ben member; chest $35) vs night-owls (Cy; chest $25), $5 stake each, 2 minutes. Moon Pack voted SOL up 10×, Night Owls SOL down 10×; SOL 71.21 → 71.10, so Night Owls won (+0.61% vs −0.66%) and took the pot, 9.70 USDC after the 3% rake | `3KfTYbDNmggvcSJTn8RnHFwwoB6MSdyf13Ef1LbD8aSB`, `HTYjcTYtiiUgHHrH1hMZnge4cY6o81L3ribJz5yMdk92` | [devnet-proof-nov26-squad-war.txt](devnet-proof-nov26-squad-war.txt) (18 txs on Solana, none failed: CreateClan ×2, JoinClan, DepositChest ×3, DeclareWar, AcceptWar, Propose ×2, Vote ×3, ExecuteProposal ×2, ClosePosition ×2, SettleWar) |

## The failed transactions in these trails, and why

Read back with `getTransaction` on Nov 26.

| Where | Count | What it is |
|---|---|---|
| Rollup, within 3 s after the finishing tick (`MagicBlock scheduler: a run queued before the cancel`) | 8 in each game | Runs MagicBlock's scheduler had already queued when the finishing tick cancelled the crank. Each one stops at the scheduler's own first instruction (`eHyd5BU8…`, signer `EMArtfJE…`) with `InvalidAccountOwner`, fee 0, before Clashy's program runs. The finishing tick itself logs `Successfully added cancel request for task …`, and nothing runs after these. |
| Solana, VRF | 2 (duel), 1 (Royale) | MagicBlock VRF oracle retries before its callback landed. |
| Rollup, `StartPrivateDuel` | 1 | Error 6018 `CommitsPending`: one phone tried to start before the rival's pick was locked; the app retries and the next start succeeded. |
| Rollup, `StartTournamentCranked` | 1 | "Account is immutable": a start sent before the Royale had reached the rollup; the retry succeeded. |

None of them moved funds or changed a game. Earlier docs said "no failed tick follows" the finish; on the Nov 25 test
runs none appeared in the 8 s the tests watch, but these trails show the scheduler's in-flight runs can still land
as failures for a few seconds.
