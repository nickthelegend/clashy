/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/clashy.json`.
 */
export type Clashy = {
  "address": "FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS",
  "metadata": {
    "name": "clashy",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Clashy: PvP trading games (knockout duels, clans, clan wars, tournaments) on MagicBlock Ephemeral Rollups"
  },
  "instructions": [
    {
      "name": "abortDuel",
      "docs": [
        "Anyone can end a duel that matched but never reached the rollup within DUEL_SETUP_SECS (a seed,",
        "pick or VRF answer never came). If both picks were committed and only one player revealed, the",
        "other forfeits: the revealer takes the pot minus rake. Otherwise both stakes are refunded."
      ],
      "discriminator": [
        207,
        7,
        124,
        8,
        239,
        20,
        114,
        226
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "creatorUsdc",
          "writable": true
        },
        {
          "name": "joinerUsdc",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "rentPayer",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "acceptWar",
      "discriminator": [
        135,
        176,
        251,
        103,
        14,
        85,
        2,
        189
      ],
      "accounts": [
        {
          "name": "captain",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "clanA"
        },
        {
          "name": "clanB",
          "writable": true
        },
        {
          "name": "chestB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "clanB"
              }
            ]
          }
        },
        {
          "name": "war",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  97,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "war.clan_a",
                "account": "war"
              },
              {
                "kind": "account",
                "path": "war.clan_b",
                "account": "war"
              },
              {
                "kind": "account",
                "path": "war.nonce",
                "account": "war"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "war"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "callRound",
      "docs": [
        "ER, player: calls up (1) or down (2) for the current round. Can be changed until the bell."
      ],
      "discriminator": [
        190,
        161,
        11,
        20,
        67,
        35,
        86,
        21
      ],
      "accounts": [
        {
          "name": "player",
          "signer": true
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "tournament.creator",
                "account": "tournament"
              },
              {
                "kind": "account",
                "path": "tournament.nonce",
                "account": "tournament"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "dir",
          "type": "u8"
        }
      ]
    },
    {
      "name": "cancelDuel",
      "docs": [
        "Refunds an unmatched duel: the creator any time, anyone after expiry. No rake."
      ],
      "discriminator": [
        83,
        124,
        224,
        237,
        235,
        44,
        38,
        57
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "creatorUsdc",
          "writable": true
        },
        {
          "name": "rentPayer",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "cancelTournament",
      "docs": [
        "Creator cancels an unstarted tournament; remaining accounts are every player's USDC token account in join order."
      ],
      "discriminator": [
        249,
        227,
        133,
        5,
        9,
        142,
        29,
        122
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "tournament.creator",
                "account": "tournament"
              },
              {
                "kind": "account",
                "path": "tournament.nonce",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "rentPayer",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "cancelWar",
      "docs": [
        "The declaring captain withdraws an unaccepted war; the stake goes back to the chest."
      ],
      "discriminator": [
        187,
        60,
        84,
        73,
        129,
        19,
        220,
        159
      ],
      "accounts": [
        {
          "name": "captain",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "clanA",
          "writable": true
        },
        {
          "name": "chestA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "clanA"
              }
            ]
          }
        },
        {
          "name": "war",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  97,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "war.clan_a",
                "account": "war"
              },
              {
                "kind": "account",
                "path": "war.clan_b",
                "account": "war"
              },
              {
                "kind": "account",
                "path": "war.nonce",
                "account": "war"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "war"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "rentPayer",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "checkDuel",
      "docs": [
        "ER, permissionless (a crank or either player): scores both sides at the live price. When",
        "someone is knocked out or the clock runs out, the duel finishes, is committed and goes home."
      ],
      "discriminator": [
        80,
        53,
        189,
        167,
        56,
        85,
        219,
        49
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "price"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "closePosition",
      "docs": [
        "Captain closes a clan position at the oracle price; the P&L feeds the clan's score."
      ],
      "discriminator": [
        123,
        134,
        81,
        0,
        49,
        68,
        98,
        98
      ],
      "accounts": [
        {
          "name": "closer",
          "docs": [
            "The captain, or anyone once the clan's war window is over."
          ],
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "clan",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "price"
        },
        {
          "name": "war",
          "docs": [
            "The clan's war, needed when someone other than the captain closes."
          ],
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "coinRollCallback",
      "docs": [
        "VRF callback (only the VRF program can call it): picks the coin from the duel's pool."
      ],
      "discriminator": [
        245,
        14,
        83,
        54,
        90,
        243,
        243,
        255
      ],
      "accounts": [
        {
          "name": "vrfProgramIdentity",
          "docs": [
            "Scoped VRF identity PDA, bound to this program. Its presence as a signer proves",
            "the callback was issued by the VRF program for this program."
          ],
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "commitPick",
      "docs": [
        "Seals a pick: hash = sha256(side || leverage_le || salt)."
      ],
      "discriminator": [
        65,
        84,
        23,
        115,
        143,
        214,
        142,
        210
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "hash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "createClan",
      "discriminator": [
        89,
        254,
        237,
        205,
        249,
        101,
        142,
        223
      ],
      "accounts": [
        {
          "name": "founder",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "founder"
              }
            ]
          }
        },
        {
          "name": "clan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "name"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "chest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "clan"
              }
            ]
          }
        },
        {
          "name": "member",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "clan"
              },
              {
                "kind": "account",
                "path": "founder"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "crest",
          "type": "u8"
        }
      ]
    },
    {
      "name": "createProfile",
      "docs": [
        "A player's handle and avatar. The handle account makes names unique."
      ],
      "discriminator": [
        225,
        205,
        234,
        143,
        17,
        186,
        50,
        220
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "handle",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100,
                  108,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "name"
              }
            ]
          }
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "avatar",
          "type": "u8"
        }
      ]
    },
    {
      "name": "createTournament",
      "discriminator": [
        158,
        137,
        233,
        231,
        73,
        132,
        191,
        68
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "entry",
          "type": "u64"
        },
        {
          "name": "maxPlayers",
          "type": "u8"
        },
        {
          "name": "coin",
          "type": "u8"
        },
        {
          "name": "startLives",
          "type": "u8"
        },
        {
          "name": "maxRounds",
          "type": "u16"
        },
        {
          "name": "roundSecs",
          "type": "u32"
        }
      ]
    },
    {
      "name": "declareWar",
      "discriminator": [
        184,
        73,
        169,
        200,
        244,
        124,
        29,
        116
      ],
      "accounts": [
        {
          "name": "captain",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "clanA",
          "writable": true
        },
        {
          "name": "clanB"
        },
        {
          "name": "chestA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "clanA"
              }
            ]
          }
        },
        {
          "name": "war",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  97,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "clanA"
              },
              {
                "kind": "account",
                "path": "clanB"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "war"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "stake",
          "type": "u64"
        },
        {
          "name": "duration",
          "type": "i64"
        }
      ]
    },
    {
      "name": "delegateBoard",
      "discriminator": [
        111,
        167,
        6,
        152,
        230,
        48,
        8,
        91
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bufferBoard",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "board"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                213,
                253,
                108,
                43,
                15,
                63,
                226,
                137,
                8,
                37,
                73,
                9,
                225,
                160,
                13,
                102,
                203,
                201,
                247,
                230,
                228,
                244,
                61,
                118,
                101,
                154,
                89,
                169,
                166,
                46,
                47,
                233
              ]
            }
          }
        },
        {
          "name": "delegationRecordBoard",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "board"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataBoard",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "board"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "board",
          "writable": true
        },
        {
          "name": "ownerProgram",
          "address": "FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u8"
        }
      ]
    },
    {
      "name": "delegateChannel",
      "docs": [
        "Moves a channel onto the MagicBlock rollup, where members post for free and instantly."
      ],
      "discriminator": [
        218,
        18,
        146,
        113,
        52,
        187,
        159,
        134
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "wallet",
          "signer": true
        },
        {
          "name": "member",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "clan"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "bufferChannel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "channel"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                213,
                253,
                108,
                43,
                15,
                63,
                226,
                137,
                8,
                37,
                73,
                9,
                225,
                160,
                13,
                102,
                203,
                201,
                247,
                230,
                228,
                244,
                61,
                118,
                101,
                154,
                89,
                169,
                166,
                46,
                47,
                233
              ]
            }
          }
        },
        {
          "name": "delegationRecordChannel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "channel"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataChannel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "channel"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "channel",
          "writable": true
        },
        {
          "name": "ownerProgram",
          "address": "FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "clan",
          "type": "pubkey"
        },
        {
          "name": "id",
          "type": "u8"
        }
      ]
    },
    {
      "name": "delegateDuel",
      "docs": [
        "Hands the duel to the ER once both picks are revealed."
      ],
      "discriminator": [
        126,
        33,
        7,
        30,
        154,
        115,
        199,
        100
      ],
      "accounts": [
        {
          "name": "player",
          "docs": [
            "One of the duel's two players."
          ],
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bufferDuel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                213,
                253,
                108,
                43,
                15,
                63,
                226,
                137,
                8,
                37,
                73,
                9,
                225,
                160,
                13,
                102,
                203,
                201,
                247,
                230,
                228,
                244,
                61,
                118,
                101,
                154,
                89,
                169,
                166,
                46,
                47,
                233
              ]
            }
          }
        },
        {
          "name": "delegationRecordDuel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataDuel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "creator",
          "type": "pubkey"
        },
        {
          "name": "nonce",
          "type": "u64"
        }
      ]
    },
    {
      "name": "delegateFeed",
      "discriminator": [
        60,
        208,
        248,
        25,
        136,
        243,
        106,
        82
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bufferFeed",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "feed"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                213,
                253,
                108,
                43,
                15,
                63,
                226,
                137,
                8,
                37,
                73,
                9,
                225,
                160,
                13,
                102,
                203,
                201,
                247,
                230,
                228,
                244,
                61,
                118,
                101,
                154,
                89,
                169,
                166,
                46,
                47,
                233
              ]
            }
          }
        },
        {
          "name": "delegationRecordFeed",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "feed"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataFeed",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "feed"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "feed",
          "writable": true
        },
        {
          "name": "ownerProgram",
          "address": "FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "coin",
          "type": "u8"
        }
      ]
    },
    {
      "name": "delegateTournament",
      "discriminator": [
        7,
        240,
        38,
        122,
        244,
        230,
        168,
        10
      ],
      "accounts": [
        {
          "name": "host",
          "docs": [
            "The tournament's creator."
          ],
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bufferTournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                213,
                253,
                108,
                43,
                15,
                63,
                226,
                137,
                8,
                37,
                73,
                9,
                225,
                160,
                13,
                102,
                203,
                201,
                247,
                230,
                228,
                244,
                61,
                118,
                101,
                154,
                89,
                169,
                166,
                46,
                47,
                233
              ]
            }
          }
        },
        {
          "name": "delegationRecordTournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataTournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "creator",
          "type": "pubkey"
        },
        {
          "name": "nonce",
          "type": "u64"
        }
      ]
    },
    {
      "name": "depositChest",
      "discriminator": [
        228,
        31,
        135,
        71,
        209,
        121,
        72,
        9
      ],
      "accounts": [
        {
          "name": "wallet",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "clan",
          "writable": true
        },
        {
          "name": "member",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "clan"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "chest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "clan"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "walletUsdc",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeProposal",
      "docs": [
        "Captain executes a passed proposal at the oracle price: opens a scored clan position.",
        "Passed = more yes than no, and either the window closed or yes holds over half of all shares."
      ],
      "discriminator": [
        186,
        60,
        116,
        133,
        108,
        128,
        111,
        28
      ],
      "accounts": [
        {
          "name": "captain",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "clan",
          "writable": true,
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "proposal",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "clan"
              },
              {
                "kind": "account",
                "path": "proposal.id",
                "account": "proposal"
              }
            ]
          }
        },
        {
          "name": "price"
        },
        {
          "name": "war",
          "docs": [
            "The clan's war, required while it is at war."
          ],
          "optional": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initBaseFeed",
      "docs": [
        "A never-delegated copy of a coin's feed on Solana, for Solana-side reads (clan trades).",
        "MagicBlock sponsors only a few commits per delegated account, so the rollup feeds are not",
        "committed back; the crank writes this account directly instead."
      ],
      "discriminator": [
        108,
        243,
        12,
        77,
        150,
        200,
        67,
        134
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "feed",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "coin",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initFeed",
      "discriminator": [
        203,
        50,
        143,
        146,
        170,
        34,
        46,
        93
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "feed",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "coin",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initPlayer",
      "discriminator": [
        114,
        27,
        219,
        144,
        50,
        15,
        228,
        66
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "docs": [
            "The stake currency (USDC)."
          ]
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "rakeBps",
          "type": "u16"
        },
        {
          "name": "vrfRequired",
          "type": "bool"
        },
        {
          "name": "crank",
          "type": "pubkey"
        },
        {
          "name": "treasury",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "joinClan",
      "discriminator": [
        218,
        113,
        190,
        239,
        4,
        91,
        106,
        206
      ],
      "accounts": [
        {
          "name": "wallet",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "clan",
          "writable": true
        },
        {
          "name": "member",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "clan"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "joinDuel",
      "discriminator": [
        7,
        247,
        76,
        103,
        101,
        139,
        254,
        61
      ],
      "accounts": [
        {
          "name": "joiner",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "player",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "joiner"
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "joiner"
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "joinerUsdc",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "seedHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "joinTournament",
      "discriminator": [
        77,
        21,
        212,
        206,
        77,
        82,
        124,
        31
      ],
      "accounts": [
        {
          "name": "player",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "tournament.creator",
                "account": "tournament"
              },
              {
                "kind": "account",
                "path": "tournament.nonce",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "playerUsdc",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "leaveClan",
      "docs": [
        "Leaves the clan. Withdraw your deposit first; the captain leaves last."
      ],
      "discriminator": [
        44,
        213,
        211,
        174,
        100,
        163,
        85,
        190
      ],
      "accounts": [
        {
          "name": "wallet",
          "signer": true
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "clan",
          "writable": true
        },
        {
          "name": "member",
          "docs": [
            "Membership is proven by this account existing (seeds), not by the player's main squad."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "clan"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "rentPayer",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "like",
      "docs": [
        "One like per player per post (by profile number)."
      ],
      "discriminator": [
        116,
        148,
        16,
        9,
        250,
        48,
        5,
        114
      ],
      "accounts": [
        {
          "name": "liker",
          "signer": true
        },
        {
          "name": "profile",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "liker"
              }
            ]
          }
        },
        {
          "name": "board",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "seq",
          "type": "u64"
        }
      ]
    },
    {
      "name": "openBoard",
      "discriminator": [
        78,
        99,
        223,
        200,
        178,
        142,
        47,
        166
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "board",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u8"
        }
      ]
    },
    {
      "name": "openChannel",
      "discriminator": [
        91,
        45,
        253,
        71,
        140,
        166,
        107,
        109
      ],
      "accounts": [
        {
          "name": "wallet",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "clan"
        },
        {
          "name": "member",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "clan"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "channel",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u8"
        }
      ]
    },
    {
      "name": "openDuel",
      "docs": [
        "Opens a duel and escrows the creator's stake. With a short expiry it is a quick-match",
        "ticket; with a long one it is an open challenge on the board."
      ],
      "discriminator": [
        57,
        46,
        157,
        124,
        71,
        205,
        196,
        29
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "player",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "creatorUsdc",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "stake",
          "type": "u64"
        },
        {
          "name": "poolMask",
          "type": "u8"
        },
        {
          "name": "lenSecs",
          "type": "u32"
        },
        {
          "name": "expiresIn",
          "type": "i64"
        },
        {
          "name": "seedHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "openStash",
      "discriminator": [
        20,
        235,
        22,
        88,
        145,
        2,
        128,
        169
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stash",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  115,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  115,
                  104,
                  118
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "goal",
          "type": "u64"
        },
        {
          "name": "goalName",
          "type": "string"
        }
      ]
    },
    {
      "name": "post",
      "docs": [
        "Posts to the feed (players with a profile). A call points at a stock mint and the app shows the",
        "author's live position in it; a reply points at the post it answers."
      ],
      "discriminator": [
        223,
        96,
        234,
        236,
        158,
        106,
        145,
        94
      ],
      "accounts": [
        {
          "name": "author",
          "signer": true
        },
        {
          "name": "profile",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "author"
              }
            ]
          }
        },
        {
          "name": "board",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "text",
          "type": "string"
        },
        {
          "name": "kind",
          "type": "u8"
        },
        {
          "name": "refkey",
          "type": "pubkey"
        },
        {
          "name": "replyTo",
          "type": "u64"
        }
      ]
    },
    {
      "name": "postMessage",
      "docs": [
        "Posts to a clan channel (members only). Runs inside the rollup."
      ],
      "discriminator": [
        214,
        50,
        100,
        209,
        38,
        34,
        7,
        76
      ],
      "accounts": [
        {
          "name": "author",
          "signer": true
        },
        {
          "name": "channel",
          "writable": true
        },
        {
          "name": "member",
          "docs": [
            "The author's membership in the channel's clan (the handler checks it is the same clan)."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "member.clan",
                "account": "member"
              },
              {
                "kind": "account",
                "path": "author"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "text",
          "type": "string"
        },
        {
          "name": "kind",
          "type": "u8"
        },
        {
          "name": "refkey",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "propose",
      "docs": [
        "Group trading: a member proposes a trade on the chest."
      ],
      "discriminator": [
        93,
        253,
        82,
        168,
        118,
        33,
        102,
        90
      ],
      "accounts": [
        {
          "name": "wallet",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "clan",
          "writable": true
        },
        {
          "name": "member",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "clan"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "clan"
              },
              {
                "kind": "account",
                "path": "clan.proposals",
                "account": "clan"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "coin",
          "type": "u8"
        },
        {
          "name": "dir",
          "type": "u8"
        },
        {
          "name": "lev",
          "type": "u16"
        },
        {
          "name": "sizeBps",
          "type": "u16"
        },
        {
          "name": "voteSecs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "pushBasePrice",
      "docs": [
        "Crank-only, on Solana."
      ],
      "discriminator": [
        123,
        142,
        208,
        166,
        123,
        160,
        96,
        229
      ],
      "accounts": [
        {
          "name": "crank",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "feed",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "price",
          "type": "u64"
        }
      ]
    },
    {
      "name": "pushPrice",
      "docs": [
        "Crank-only. Works on Solana and inside the ER (where the feed is delegated)."
      ],
      "discriminator": [
        113,
        238,
        232,
        235,
        60,
        71,
        127,
        203
      ],
      "accounts": [
        {
          "name": "crank",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "feed",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "price",
          "type": "u64"
        }
      ]
    },
    {
      "name": "rejectProposal",
      "docs": [
        "Anyone can close a proposal that failed once its window is over."
      ],
      "discriminator": [
        114,
        162,
        164,
        82,
        191,
        11,
        102,
        25
      ],
      "accounts": [
        {
          "name": "clan",
          "writable": true
        },
        {
          "name": "proposal",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "requestCoinRoll",
      "docs": [
        "Asks MagicBlock VRF (base-layer queue) to roll the coin for both players."
      ],
      "discriminator": [
        148,
        63,
        220,
        108,
        189,
        232,
        207,
        239
      ],
      "accounts": [
        {
          "name": "player",
          "docs": [
            "One of the duel's two players."
          ],
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "oracleQueue",
          "writable": true
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "callerSeed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "requestTournamentCoin",
      "docs": [
        "Asks MagicBlock VRF to roll the tournament's coin (required on devnet / mainnet)."
      ],
      "discriminator": [
        73,
        255,
        240,
        125,
        234,
        139,
        39,
        192
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "tournament.creator",
                "account": "tournament"
              },
              {
                "kind": "account",
                "path": "tournament.nonce",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "oracleQueue",
          "writable": true
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "callerSeed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "resolveRound",
      "docs": [
        "ER, permissionless after the bell: wrong or missing calls lose a life. When one player (or",
        "none) is left, or the last round ends, the tournament finishes and goes back to Solana."
      ],
      "discriminator": [
        165,
        114,
        237,
        158,
        1,
        36,
        70,
        254
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "tournament.creator",
                "account": "tournament"
              },
              {
                "kind": "account",
                "path": "tournament.nonce",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "price"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "revealPick",
      "discriminator": [
        31,
        183,
        41,
        226,
        204,
        19,
        57,
        132
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "dir",
          "type": "u8"
        },
        {
          "name": "lev",
          "type": "u16"
        },
        {
          "name": "salt",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "revealSeed",
      "docs": [
        "Local fallback when no VRF oracle runs: both players reveal the seeds they committed at",
        "open/join and the coin comes from sha256(seed_a || seed_b). Refused when VRF is required."
      ],
      "discriminator": [
        196,
        119,
        194,
        112,
        156,
        211,
        239,
        105
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "seed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "setAvatar",
      "discriminator": [
        35,
        44,
        230,
        191,
        57,
        199,
        184,
        248
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "profile"
          ]
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "avatar",
          "type": "u8"
        }
      ]
    },
    {
      "name": "setCoin",
      "docs": [
        "Sets coin `index` to read from `feed` (a Clashy PriceFeed or a MagicBlock oracle account)."
      ],
      "discriminator": [
        168,
        28,
        55,
        167,
        138,
        7,
        17,
        131
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        },
        {
          "name": "feed",
          "type": "pubkey"
        },
        {
          "name": "symbol",
          "type": {
            "array": [
              "u8",
              8
            ]
          }
        }
      ]
    },
    {
      "name": "setErValidator",
      "docs": [
        "Pins the rollup validator duels and tournaments are delegated to."
      ],
      "discriminator": [
        205,
        97,
        243,
        133,
        57,
        39,
        134,
        104
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "validator",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setGoal",
      "discriminator": [
        36,
        91,
        124,
        161,
        86,
        107,
        200,
        74
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "stash"
          ]
        },
        {
          "name": "stash",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  115,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "goal",
          "type": "u64"
        },
        {
          "name": "goalName",
          "type": "string"
        }
      ]
    },
    {
      "name": "setLimits",
      "docs": [
        "The player's own controls. A lower daily limit applies at once; a higher one waits a day."
      ],
      "discriminator": [
        207,
        50,
        250,
        67,
        211,
        33,
        70,
        91
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "profile"
          ]
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "dailyLimit",
          "type": "u64"
        },
        {
          "name": "saveBps",
          "type": "u16"
        },
        {
          "name": "roundupStep",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setVrfQueue",
      "docs": [
        "Points coin rolls at another MagicBlock VRF queue (it must be owned by the VRF program)."
      ],
      "discriminator": [
        202,
        97,
        92,
        18,
        245,
        254,
        206,
        102
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "queue"
        }
      ],
      "args": []
    },
    {
      "name": "settleDuel",
      "docs": [
        "Solana: pays the pot (minus rake) to the winner, or refunds both on a tie; updates ratings."
      ],
      "discriminator": [
        148,
        90,
        251,
        130,
        217,
        144,
        190,
        239
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "duel"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "creatorUsdc",
          "writable": true
        },
        {
          "name": "joinerUsdc",
          "writable": true
        },
        {
          "name": "creatorPlayer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "joinerPlayer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "duel.joiner",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "rentPayer",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "settleTournament",
      "docs": [
        "Solana: players left with the most lives split the pot minus rake. Remaining accounts are",
        "every player's USDC token account in join order."
      ],
      "discriminator": [
        106,
        1,
        252,
        206,
        251,
        192,
        194,
        84
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "tournament.creator",
                "account": "tournament"
              },
              {
                "kind": "account",
                "path": "tournament.nonce",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "tournament"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "rentPayer",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "settleWar",
      "docs": [
        "After the window: the clan with the better return (score change over starting chest) takes",
        "the pot minus rake into its chest; a tie refunds both."
      ],
      "discriminator": [
        165,
        205,
        21,
        245,
        164,
        115,
        160,
        40
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "clanA",
          "writable": true
        },
        {
          "name": "clanB",
          "writable": true
        },
        {
          "name": "chestA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "clanA"
              }
            ]
          }
        },
        {
          "name": "chestB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "clanB"
              }
            ]
          }
        },
        {
          "name": "war",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  97,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "war.clan_a",
                "account": "war"
              },
              {
                "kind": "account",
                "path": "war.clan_b",
                "account": "war"
              },
              {
                "kind": "account",
                "path": "war.nonce",
                "account": "war"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "war"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true
        },
        {
          "name": "rentPayer",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "startDuel",
      "docs": [
        "ER: sets the entry price from the live feed and starts the clock."
      ],
      "discriminator": [
        188,
        143,
        206,
        111,
        77,
        207,
        62,
        244
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "duel",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  101,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "duel.creator",
                "account": "duel"
              },
              {
                "kind": "account",
                "path": "duel.nonce",
                "account": "duel"
              }
            ]
          }
        },
        {
          "name": "price"
        }
      ],
      "args": []
    },
    {
      "name": "startTournament",
      "docs": [
        "ER, creator: starts round 1 at the live price."
      ],
      "discriminator": [
        164,
        168,
        208,
        157,
        43,
        10,
        220,
        241
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "tournament.creator",
                "account": "tournament"
              },
              {
                "kind": "account",
                "path": "tournament.nonce",
                "account": "tournament"
              }
            ]
          }
        },
        {
          "name": "price"
        }
      ],
      "args": []
    },
    {
      "name": "stashInvest",
      "docs": [
        "Buys a tokenized stock with USDC from the Stash, through Orca Whirlpool. The shares land in the",
        "player's own token account; the cost is recorded on chain in their Holding."
      ],
      "discriminator": [
        67,
        203,
        224,
        243,
        45,
        106,
        83,
        135
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "profile",
            "stash"
          ]
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "stash",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  115,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  115,
                  104,
                  118
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "holding",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "sw.stock_mint",
                "account": "stockSwap"
              }
            ]
          }
        },
        {
          "name": "sw",
          "accounts": [
            {
              "name": "whirlpool",
              "writable": true
            },
            {
              "name": "stockMint"
            },
            {
              "name": "usdcMint"
            },
            {
              "name": "ownerStock",
              "writable": true
            },
            {
              "name": "vaultA",
              "writable": true
            },
            {
              "name": "vaultB",
              "writable": true
            },
            {
              "name": "tickArray0",
              "writable": true
            },
            {
              "name": "tickArray1",
              "writable": true
            },
            {
              "name": "tickArray2",
              "writable": true
            },
            {
              "name": "oracle",
              "writable": true
            },
            {
              "name": "tokenProgram",
              "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
            },
            {
              "name": "token2022Program",
              "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
            },
            {
              "name": "memoProgram",
              "address": "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
            },
            {
              "name": "whirlpoolProgram",
              "address": "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"
            }
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "usdcIn",
          "type": "u64"
        },
        {
          "name": "minShares",
          "type": "u64"
        }
      ]
    },
    {
      "name": "stashSave",
      "docs": [
        "Moves USDC from the player's wallet into their Stash. `kind` records where it came from:",
        "put in by hand, a round-up on a payment made in the same transaction, or a slice of a win."
      ],
      "discriminator": [
        4,
        14,
        254,
        57,
        124,
        194,
        1,
        81
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "profile",
            "stash"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "stash",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  115,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  115,
                  104,
                  118
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "ownerUsdc",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "kind",
          "type": "u8"
        }
      ]
    },
    {
      "name": "stashSell",
      "docs": [
        "Sells shares bought through the Stash back to USDC (into the Stash), through Orca Whirlpool."
      ],
      "discriminator": [
        196,
        252,
        18,
        163,
        192,
        9,
        225,
        141
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "profile",
            "stash"
          ]
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "stash",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  115,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  115,
                  104,
                  118
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "holding",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "sw.stock_mint",
                "account": "stockSwap"
              }
            ]
          }
        },
        {
          "name": "sw",
          "accounts": [
            {
              "name": "whirlpool",
              "writable": true
            },
            {
              "name": "stockMint"
            },
            {
              "name": "usdcMint"
            },
            {
              "name": "ownerStock",
              "writable": true
            },
            {
              "name": "vaultA",
              "writable": true
            },
            {
              "name": "vaultB",
              "writable": true
            },
            {
              "name": "tickArray0",
              "writable": true
            },
            {
              "name": "tickArray1",
              "writable": true
            },
            {
              "name": "tickArray2",
              "writable": true
            },
            {
              "name": "oracle",
              "writable": true
            },
            {
              "name": "tokenProgram",
              "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
            },
            {
              "name": "token2022Program",
              "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
            },
            {
              "name": "memoProgram",
              "address": "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
            },
            {
              "name": "whirlpoolProgram",
              "address": "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"
            }
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        },
        {
          "name": "minUsdc",
          "type": "u64"
        }
      ]
    },
    {
      "name": "stashWithdraw",
      "docs": [
        "The owner can always take their savings out."
      ],
      "discriminator": [
        147,
        125,
        6,
        52,
        121,
        74,
        170,
        195
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "profile",
            "stash"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "stash",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  115,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  115,
                  104,
                  118
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "ownerUsdc",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "takeBreak",
      "docs": [
        "A break from staking that the player sets on themselves. It can be extended, never shortened."
      ],
      "discriminator": [
        48,
        120,
        169,
        107,
        195,
        195,
        154,
        35
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "profile"
          ]
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "secs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "tournamentCoinCallback",
      "discriminator": [
        234,
        45,
        192,
        58,
        153,
        53,
        129,
        199
      ],
      "accounts": [
        {
          "name": "vrfProgramIdentity",
          "docs": [
            "Scoped VRF identity PDA, bound to this program. Its presence as a signer proves",
            "the callback was issued by the VRF program for this program."
          ],
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "tournament",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  117,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "tournament.creator",
                "account": "tournament"
              },
              {
                "kind": "account",
                "path": "tournament.nonce",
                "account": "tournament"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "updateConfig",
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "rakeBps",
          "type": "u16"
        },
        {
          "name": "vrfRequired",
          "type": "bool"
        },
        {
          "name": "crank",
          "type": "pubkey"
        },
        {
          "name": "treasury",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "vote",
      "docs": [
        "Votes are weighted by the member's chest shares; one vote per member per proposal."
      ],
      "discriminator": [
        227,
        110,
        155,
        23,
        136,
        126,
        172,
        25
      ],
      "accounts": [
        {
          "name": "wallet",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "clan",
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "member",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "clan"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "proposal",
          "writable": true
        },
        {
          "name": "vote",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  111,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "proposal"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "yes",
          "type": "bool"
        }
      ]
    },
    {
      "name": "withdrawChest",
      "docs": [
        "Redeems `shares` of your chest shares for their pro-rata part of the chest, so war wins and",
        "losses are shared by every member whatever order they leave in. Blocked while at war."
      ],
      "discriminator": [
        213,
        44,
        156,
        136,
        142,
        235,
        4,
        185
      ],
      "accounts": [
        {
          "name": "wallet",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "clan",
          "writable": true
        },
        {
          "name": "member",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "clan"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "chest",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "clan"
              }
            ]
          }
        },
        {
          "name": "auth",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104
                ]
              }
            ]
          }
        },
        {
          "name": "walletUsdc",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "board",
      "discriminator": [
        79,
        48,
        160,
        63,
        153,
        132,
        240,
        56
      ]
    },
    {
      "name": "channel",
      "discriminator": [
        49,
        159,
        99,
        106,
        220,
        87,
        219,
        88
      ]
    },
    {
      "name": "clan",
      "discriminator": [
        179,
        33,
        233,
        29,
        6,
        237,
        105,
        241
      ]
    },
    {
      "name": "clanPosition",
      "discriminator": [
        219,
        119,
        0,
        254,
        4,
        113,
        209,
        53
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "duel",
      "discriminator": [
        126,
        229,
        210,
        60,
        177,
        135,
        124,
        224
      ]
    },
    {
      "name": "handle",
      "discriminator": [
        150,
        96,
        143,
        54,
        64,
        147,
        63,
        63
      ]
    },
    {
      "name": "holding",
      "discriminator": [
        23,
        96,
        64,
        250,
        235,
        191,
        0,
        144
      ]
    },
    {
      "name": "member",
      "discriminator": [
        54,
        19,
        162,
        21,
        29,
        166,
        17,
        198
      ]
    },
    {
      "name": "player",
      "discriminator": [
        205,
        222,
        112,
        7,
        165,
        155,
        206,
        218
      ]
    },
    {
      "name": "priceFeed",
      "discriminator": [
        189,
        103,
        252,
        23,
        152,
        35,
        243,
        156
      ]
    },
    {
      "name": "profile",
      "discriminator": [
        184,
        101,
        165,
        188,
        95,
        63,
        127,
        188
      ]
    },
    {
      "name": "proposal",
      "discriminator": [
        26,
        94,
        189,
        187,
        116,
        136,
        53,
        33
      ]
    },
    {
      "name": "registry",
      "discriminator": [
        47,
        174,
        110,
        246,
        184,
        182,
        252,
        218
      ]
    },
    {
      "name": "stash",
      "discriminator": [
        154,
        19,
        11,
        205,
        56,
        69,
        175,
        234
      ]
    },
    {
      "name": "tournament",
      "discriminator": [
        175,
        139,
        119,
        242,
        115,
        194,
        57,
        92
      ]
    },
    {
      "name": "vote",
      "discriminator": [
        96,
        91,
        104,
        57,
        145,
        35,
        172,
        155
      ]
    },
    {
      "name": "war",
      "discriminator": [
        54,
        31,
        229,
        114,
        29,
        29,
        212,
        65
      ]
    }
  ],
  "events": [
    {
      "name": "duelFinished",
      "discriminator": [
        127,
        102,
        161,
        129,
        33,
        105,
        117,
        116
      ]
    },
    {
      "name": "duelSettled",
      "discriminator": [
        254,
        160,
        50,
        193,
        155,
        112,
        122,
        64
      ]
    },
    {
      "name": "roundResolved",
      "discriminator": [
        204,
        146,
        253,
        187,
        8,
        61,
        75,
        29
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Only the config authority can do this"
    },
    {
      "code": 6001,
      "name": "rakeTooHigh",
      "msg": "Rake is above the 10% cap"
    },
    {
      "code": 6002,
      "name": "badCoin",
      "msg": "Coin index is out of range or not configured"
    },
    {
      "code": 6003,
      "name": "feedMismatch",
      "msg": "Price account does not match the configured feed"
    },
    {
      "code": 6004,
      "name": "feedInvalid",
      "msg": "Price account has the wrong owner or layout"
    },
    {
      "code": 6005,
      "name": "priceStale",
      "msg": "Price is stale"
    },
    {
      "code": 6006,
      "name": "priceZero",
      "msg": "Price must be positive"
    },
    {
      "code": 6007,
      "name": "stakeTooLow",
      "msg": "Stake is below the minimum"
    },
    {
      "code": 6008,
      "name": "badLength",
      "msg": "Duel length is out of range"
    },
    {
      "code": 6009,
      "name": "badLeverage",
      "msg": "Leverage is out of range"
    },
    {
      "code": 6010,
      "name": "badSide",
      "msg": "Side must be 1 (long) or 2 (short)"
    },
    {
      "code": 6011,
      "name": "wrongStatus",
      "msg": "This step is not allowed in the current status"
    },
    {
      "code": 6012,
      "name": "expired",
      "msg": "The challenge has expired"
    },
    {
      "code": 6013,
      "name": "notExpired",
      "msg": "The challenge has not expired yet"
    },
    {
      "code": 6014,
      "name": "selfJoin",
      "msg": "You cannot join your own duel"
    },
    {
      "code": 6015,
      "name": "notPlayer",
      "msg": "Not a player in this game"
    },
    {
      "code": 6016,
      "name": "alreadyDone",
      "msg": "Already done"
    },
    {
      "code": 6017,
      "name": "revealMismatch",
      "msg": "Reveal does not match the committed hash"
    },
    {
      "code": 6018,
      "name": "commitsPending",
      "msg": "Both players must commit before revealing"
    },
    {
      "code": 6019,
      "name": "vrfRequired",
      "msg": "This deployment requires MagicBlock VRF for randomness"
    },
    {
      "code": 6020,
      "name": "invalidQueue",
      "msg": "VRF queue does not match"
    },
    {
      "code": 6021,
      "name": "vrfInflight",
      "msg": "A VRF request is already in flight"
    },
    {
      "code": 6022,
      "name": "emptyPool",
      "msg": "Coin pool is empty"
    },
    {
      "code": 6023,
      "name": "stillRunning",
      "msg": "The game is still running"
    },
    {
      "code": 6024,
      "name": "payoutMismatch",
      "msg": "Payout account does not match"
    },
    {
      "code": 6025,
      "name": "badName",
      "msg": "Clan name is empty or too long"
    },
    {
      "code": 6026,
      "name": "alreadyInClan",
      "msg": "Already in a clan"
    },
    {
      "code": 6027,
      "name": "notInClan",
      "msg": "Not in this clan"
    },
    {
      "code": 6028,
      "name": "notCaptain",
      "msg": "Only the clan captain can do this"
    },
    {
      "code": 6029,
      "name": "chestTooLow",
      "msg": "Not enough in the clan chest"
    },
    {
      "code": 6030,
      "name": "warLocked",
      "msg": "The chest is locked by an active war"
    },
    {
      "code": 6031,
      "name": "badVoteWindow",
      "msg": "Vote window is out of range"
    },
    {
      "code": 6032,
      "name": "votingClosed",
      "msg": "Voting is closed"
    },
    {
      "code": 6033,
      "name": "votingOpen",
      "msg": "Voting is still open and has no majority yet"
    },
    {
      "code": 6034,
      "name": "notPassed",
      "msg": "The proposal did not pass"
    },
    {
      "code": 6035,
      "name": "noWeight",
      "msg": "You need a chest deposit to vote"
    },
    {
      "code": 6036,
      "name": "badSize",
      "msg": "Size must be between 1 and 100 percent"
    },
    {
      "code": 6037,
      "name": "selfWar",
      "msg": "A clan cannot war itself"
    },
    {
      "code": 6038,
      "name": "badWarLength",
      "msg": "War length is out of range"
    },
    {
      "code": 6039,
      "name": "warNotOver",
      "msg": "The war has not ended"
    },
    {
      "code": 6040,
      "name": "tourFull",
      "msg": "Tournament is full"
    },
    {
      "code": 6041,
      "name": "alreadyJoined",
      "msg": "Already joined"
    },
    {
      "code": 6042,
      "name": "tooFewPlayers",
      "msg": "Need at least two players"
    },
    {
      "code": 6043,
      "name": "roundRunning",
      "msg": "Round is still running"
    },
    {
      "code": 6044,
      "name": "roundOver",
      "msg": "Round is over; wait for it to resolve"
    },
    {
      "code": 6045,
      "name": "eliminated",
      "msg": "You are out of this tournament"
    },
    {
      "code": 6046,
      "name": "overflow",
      "msg": "Math overflow"
    },
    {
      "code": 6047,
      "name": "warStakeTooBig",
      "msg": "A war can stake at most half the chest"
    },
    {
      "code": 6048,
      "name": "notEnoughShares",
      "msg": "Not enough chest shares"
    },
    {
      "code": 6049,
      "name": "noValidator",
      "msg": "The rollup validator is not configured"
    },
    {
      "code": 6050,
      "name": "positionsOpen",
      "msg": "Close every clan position first"
    },
    {
      "code": 6051,
      "name": "voteOpen",
      "msg": "Withdrawals wait until the clan's open votes close"
    },
    {
      "code": 6052,
      "name": "badHandle",
      "msg": "Names are 3 to 16 characters: lowercase letters, digits and underscore"
    },
    {
      "code": 6053,
      "name": "badGoalName",
      "msg": "Goal name is too long"
    },
    {
      "code": 6054,
      "name": "badAvatar",
      "msg": "Pick one of the 20 avatars"
    },
    {
      "code": 6055,
      "name": "onBreak",
      "msg": "You are on a break you set yourself; staking opens again when it ends"
    },
    {
      "code": 6056,
      "name": "dailyLimit",
      "msg": "This would go over the daily limit you set"
    },
    {
      "code": 6057,
      "name": "badBreak",
      "msg": "A break can be up to 30 days and cannot be shortened"
    },
    {
      "code": 6058,
      "name": "badSaveShare",
      "msg": "Save at most 100 percent"
    },
    {
      "code": 6059,
      "name": "stashLow",
      "msg": "Not enough USDC in your Stash"
    },
    {
      "code": 6060,
      "name": "badMessage",
      "msg": "Messages are 1 to 120 bytes"
    },
    {
      "code": 6061,
      "name": "notMember",
      "msg": "Only clan members can post here"
    },
    {
      "code": 6062,
      "name": "badChannel",
      "msg": "Unknown channel"
    },
    {
      "code": 6063,
      "name": "zeroAmount",
      "msg": "Amount must be above zero"
    },
    {
      "code": 6064,
      "name": "badPool",
      "msg": "That pool is not this stock against USDC on Orca Whirlpool"
    },
    {
      "code": 6065,
      "name": "slippage",
      "msg": "The swap returned less than your minimum"
    },
    {
      "code": 6066,
      "name": "notEnoughStock",
      "msg": "Not enough shares"
    },
    {
      "code": 6067,
      "name": "badPost",
      "msg": "Posts are 1 to 140 bytes"
    },
    {
      "code": 6068,
      "name": "alreadyLiked",
      "msg": "Already liked"
    },
    {
      "code": 6069,
      "name": "postGone",
      "msg": "That post is no longer on the board"
    },
    {
      "code": 6070,
      "name": "crankIsAdmin",
      "msg": "The crank key must not be the admin key"
    },
    {
      "code": 6071,
      "name": "stepClosed",
      "msg": "Too late: the time for this step has passed"
    },
    {
      "code": 6072,
      "name": "noShares",
      "msg": "Only members with shares in the chest can propose a trade"
    }
  ],
  "types": [
    {
      "name": "board",
      "docs": [
        "The public calls feed: the last BOARD_POSTS posts in a ring, live on the MagicBlock rollup."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "count",
            "type": "u64"
          },
          {
            "name": "id",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                6
              ]
            }
          },
          {
            "name": "posts",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "post"
                  }
                },
                24
              ]
            }
          }
        ]
      }
    },
    {
      "name": "channel",
      "docs": [
        "One clan channel: the last CHAT_MSGS messages in a ring. Delegated to the MagicBlock rollup, so",
        "posting is instant and costs the player nothing; members of the clan only."
      ],
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "clan",
            "type": "pubkey"
          },
          {
            "name": "count",
            "docs": [
              "Messages ever posted; the newest sits at (count - 1) % CHAT_MSGS."
            ],
            "type": "u64"
          },
          {
            "name": "id",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                6
              ]
            }
          },
          {
            "name": "msgs",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "chatMsg"
                  }
                },
                24
              ]
            }
          }
        ]
      }
    },
    {
      "name": "chatMsg",
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "author",
            "type": "pubkey"
          },
          {
            "name": "refkey",
            "type": "pubkey"
          },
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "len",
            "type": "u8"
          },
          {
            "name": "text",
            "type": {
              "array": [
                "u8",
                120
              ]
            }
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                6
              ]
            }
          }
        ]
      }
    },
    {
      "name": "clan",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": {
              "array": [
                "u8",
                24
              ]
            }
          },
          {
            "name": "captain",
            "type": "pubkey"
          },
          {
            "name": "crest",
            "type": "u8"
          },
          {
            "name": "members",
            "type": "u32"
          },
          {
            "name": "chest",
            "docs": [
              "USDC base units in the chest vault: members' deposits, minus war stakes lost, plus war pots won."
            ],
            "type": "u64"
          },
          {
            "name": "shares",
            "docs": [
              "Total chest shares held by members. A share is worth `chest / shares` USDC base units."
            ],
            "type": "u64"
          },
          {
            "name": "scorePnl",
            "docs": [
              "Realized paper P&L of the clan's voted trades, in USDC base units of notional."
            ],
            "type": "i64"
          },
          {
            "name": "proposals",
            "type": "u64"
          },
          {
            "name": "positionsOpen",
            "type": "u16"
          },
          {
            "name": "openVotes",
            "docs": [
              "Proposals still open. Withdrawals wait until they close, so one deposit cannot vote twice."
            ],
            "type": "u16"
          },
          {
            "name": "wins",
            "type": "u32"
          },
          {
            "name": "losses",
            "type": "u32"
          },
          {
            "name": "war",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "chestBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "clanPosition",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "clan",
            "type": "pubkey"
          },
          {
            "name": "proposal",
            "type": "u64"
          },
          {
            "name": "coin",
            "type": "u8"
          },
          {
            "name": "side",
            "type": "u8"
          },
          {
            "name": "lev",
            "type": "u16"
          },
          {
            "name": "notional",
            "type": "u64"
          },
          {
            "name": "entryPrice",
            "type": "u64"
          },
          {
            "name": "exitPrice",
            "type": "u64"
          },
          {
            "name": "openedAt",
            "type": "i64"
          },
          {
            "name": "closedAt",
            "type": "i64"
          },
          {
            "name": "pnl",
            "type": "i64"
          },
          {
            "name": "open",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "coin",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feed",
            "docs": [
              "Price account for this coin: a Clashy `PriceFeed` (crank-pushed) or a MagicBlock oracle account."
            ],
            "type": "pubkey"
          },
          {
            "name": "symbol",
            "type": {
              "array": [
                "u8",
                8
              ]
            }
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "crank",
            "docs": [
              "Pushes prices into Clashy feeds (a keeper reading a public price API)."
            ],
            "type": "pubkey"
          },
          {
            "name": "rakeBps",
            "type": "u16"
          },
          {
            "name": "vrfRequired",
            "docs": [
              "When true (devnet / mainnet), coins are rolled only by MagicBlock VRF.",
              "When false (local stack without a VRF oracle), a two-party commit-reveal roll is allowed."
            ],
            "type": "bool"
          },
          {
            "name": "coinCount",
            "type": "u8"
          },
          {
            "name": "coins",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "coin"
                  }
                },
                8
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vrfQueue",
            "docs": [
              "The MagicBlock VRF oracle queue coin rolls go to: the base queue on devnet and mainnet, or",
              "MagicBlock's test queue on a local stack running their `vrf-oracle`."
            ],
            "type": "pubkey"
          },
          {
            "name": "erValidator",
            "docs": [
              "The MagicBlock rollup validator duels and tournaments may be delegated to (set by the admin)."
            ],
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "docs": [
              "The stake currency: every stake, chest, war pot and entry is this SPL mint (USDC)."
            ],
            "type": "pubkey"
          },
          {
            "name": "authBump",
            "docs": [
              "Bump of the `auth` PDA that owns every vault token account."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "duel",
      "docs": [
        "A 1v1 knockout duel. Stakes sit in the `vault` PDA on Solana; the duel itself is",
        "delegated to the ER while it is live."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "joiner",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "poolMask",
            "docs": [
              "Bitmask over config coins the roll may pick."
            ],
            "type": "u8"
          },
          {
            "name": "coin",
            "type": "u8"
          },
          {
            "name": "lenSecs",
            "type": "u32"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "vrfPending",
            "type": "bool"
          },
          {
            "name": "randomness",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "seedHash",
            "docs": [
              "Commit-reveal seeds for the local roll (unused when VRF rolls)."
            ],
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                2
              ]
            }
          },
          {
            "name": "seed",
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                2
              ]
            }
          },
          {
            "name": "seedsRevealed",
            "type": "u8"
          },
          {
            "name": "pickHash",
            "docs": [
              "Sealed picks: sha256(side || leverage_le || salt)."
            ],
            "type": {
              "array": [
                {
                  "array": [
                    "u8",
                    32
                  ]
                },
                2
              ]
            }
          },
          {
            "name": "picksCommitted",
            "type": "u8"
          },
          {
            "name": "side",
            "type": {
              "array": [
                "u8",
                2
              ]
            }
          },
          {
            "name": "lev",
            "type": {
              "array": [
                "u16",
                2
              ]
            }
          },
          {
            "name": "picksRevealed",
            "type": "u8"
          },
          {
            "name": "entryPrice",
            "type": "u64"
          },
          {
            "name": "exitPrice",
            "type": "u64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "pnlBps",
            "docs": [
              "Leveraged P&L in basis points of stake, per player."
            ],
            "type": {
              "array": [
                "i64",
                2
              ]
            }
          },
          {
            "name": "ko",
            "type": "u8"
          },
          {
            "name": "winner",
            "docs": [
              "0 none, 1 creator, 2 joiner, 3 tie."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "matchedAt",
            "docs": [
              "When the joiner matched; after DUEL_SETUP_SECS a duel stuck before the rollup can be aborted."
            ],
            "type": "i64"
          },
          {
            "name": "rentPayer",
            "docs": [
              "Paid the rent for the duel and its vault (the sponsor); gets the vault's rent back when it closes."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "duelFinished",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duel",
            "type": "pubkey"
          },
          {
            "name": "coin",
            "type": "u8"
          },
          {
            "name": "entryPrice",
            "type": "u64"
          },
          {
            "name": "exitPrice",
            "type": "u64"
          },
          {
            "name": "pnlBps",
            "type": {
              "array": [
                "i64",
                2
              ]
            }
          },
          {
            "name": "ko",
            "type": "u8"
          },
          {
            "name": "winner",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "duelSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "duel",
            "type": "pubkey"
          },
          {
            "name": "winner",
            "type": "u8"
          },
          {
            "name": "paid",
            "type": "u64"
          },
          {
            "name": "rake",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "handle",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "holding",
      "docs": [
        "Shares of one tokenized stock bought through the Stash, with what they cost. The shares",
        "themselves sit in the player's own token account; this records the cost basis on chain so",
        "a position's profit can be shown without trusting the app."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "docs": [
              "Raw token units bought and not yet sold through the Stash."
            ],
            "type": "u64"
          },
          {
            "name": "cost",
            "docs": [
              "USDC base units paid for those shares (reduced pro rata on sells)."
            ],
            "type": "u64"
          },
          {
            "name": "bought",
            "type": "u64"
          },
          {
            "name": "soldUsdc",
            "type": "u64"
          },
          {
            "name": "realized",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "member",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "clan",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "deposit",
            "docs": [
              "USDC base units this member put in, net of withdrawals (cost basis, for display)."
            ],
            "type": "u64"
          },
          {
            "name": "shares",
            "docs": [
              "Chest shares: withdrawals pay `shares * chest / clan.shares`, and votes weigh by shares."
            ],
            "type": "u64"
          },
          {
            "name": "joinedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "rentPayer",
            "docs": [
              "Paid the member account's rent; gets it back when the member leaves."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "player",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "rating",
            "type": "i32"
          },
          {
            "name": "rp",
            "type": "u32"
          },
          {
            "name": "wins",
            "type": "u32"
          },
          {
            "name": "losses",
            "type": "u32"
          },
          {
            "name": "streak",
            "type": "u16"
          },
          {
            "name": "bestStreak",
            "type": "u16"
          },
          {
            "name": "clan",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "post",
      "serialization": "bytemuck",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seq",
            "type": "u64"
          },
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "replyTo",
            "docs": [
              "Seq of the post this replies to (u64::MAX when it is not a reply)."
            ],
            "type": "u64"
          },
          {
            "name": "author",
            "type": "pubkey"
          },
          {
            "name": "refkey",
            "type": "pubkey"
          },
          {
            "name": "likes",
            "type": "u32"
          },
          {
            "name": "replies",
            "type": "u16"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "len",
            "type": "u8"
          },
          {
            "name": "text",
            "type": {
              "array": [
                "u8",
                140
              ]
            }
          },
          {
            "name": "liked",
            "docs": [
              "One bit per profile number: who liked it."
            ],
            "type": {
              "array": [
                "u8",
                128
              ]
            }
          },
          {
            "name": "pad",
            "type": {
              "array": [
                "u8",
                4
              ]
            }
          }
        ]
      }
    },
    {
      "name": "priceFeed",
      "docs": [
        "Clashy-owned price feed. Delegated to the ER and updated about every second by the crank;",
        "the crank commits it back to Solana periodically so base-layer reads stay fresh."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "coin",
            "type": "u8"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "profile",
      "docs": [
        "A player's public face and the controls they set on themselves. Every stake checks it on chain:",
        "the break, the daily limit, and the day streak."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "avatar",
            "type": "u8"
          },
          {
            "name": "dailyLimit",
            "docs": [
              "Most USDC (base units) this player can stake in one UTC day. Lowering applies at once."
            ],
            "type": "u64"
          },
          {
            "name": "pendingLimit",
            "docs": [
              "A raise waits LIMIT_RAISE_DELAY before it applies (0 when none is pending)."
            ],
            "type": "u64"
          },
          {
            "name": "pendingAt",
            "type": "i64"
          },
          {
            "name": "day",
            "docs": [
              "UTC day index of `staked_today`."
            ],
            "type": "i64"
          },
          {
            "name": "stakedToday",
            "type": "u64"
          },
          {
            "name": "breakUntil",
            "docs": [
              "No staking until this time (a break the player took)."
            ],
            "type": "i64"
          },
          {
            "name": "lastActiveDay",
            "docs": [
              "Days in a row with at least one stake or save, and the best run."
            ],
            "type": "i64"
          },
          {
            "name": "dayStreak",
            "type": "u16"
          },
          {
            "name": "bestDayStreak",
            "type": "u16"
          },
          {
            "name": "saveBps",
            "docs": [
              "Share of each win the app moves to the Stash, in basis points (the player's own setting)."
            ],
            "type": "u16"
          },
          {
            "name": "roundupStep",
            "docs": [
              "Round each payment up to this step and save the difference (USDC base units; 0 = off)."
            ],
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "number",
            "docs": [
              "Order in which profiles were made (from the registry)."
            ],
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "proposal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "clan",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "proposer",
            "type": "pubkey"
          },
          {
            "name": "coin",
            "type": "u8"
          },
          {
            "name": "side",
            "type": "u8"
          },
          {
            "name": "lev",
            "type": "u16"
          },
          {
            "name": "sizeBps",
            "type": "u16"
          },
          {
            "name": "yes",
            "type": "u64"
          },
          {
            "name": "no",
            "type": "u64"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "registry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "profiles",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "roundResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tournament",
            "type": "pubkey"
          },
          {
            "name": "round",
            "type": "u16"
          },
          {
            "name": "startPrice",
            "type": "u64"
          },
          {
            "name": "endPrice",
            "type": "u64"
          },
          {
            "name": "alive",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "stash",
      "docs": [
        "The savings jar: USDC in a vault only its owner can take out, with a goal and a record of where",
        "the money came from (put in, round-ups on payments, slices of wins)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "goal",
            "type": "u64"
          },
          {
            "name": "goalName",
            "type": {
              "array": [
                "u8",
                24
              ]
            }
          },
          {
            "name": "savedManual",
            "type": "u64"
          },
          {
            "name": "savedRoundup",
            "type": "u64"
          },
          {
            "name": "savedWins",
            "type": "u64"
          },
          {
            "name": "withdrawn",
            "type": "u64"
          },
          {
            "name": "saves",
            "type": "u32"
          },
          {
            "name": "openedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "rentPayer",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "tournament",
      "docs": [
        "An on-chain Royale: escrowed entries, up/down calls each round on the ER, last one standing."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "entry",
            "type": "u64"
          },
          {
            "name": "coin",
            "type": "u8"
          },
          {
            "name": "vrfPending",
            "type": "bool"
          },
          {
            "name": "maxPlayers",
            "type": "u8"
          },
          {
            "name": "count",
            "type": "u8"
          },
          {
            "name": "players",
            "type": {
              "array": [
                "pubkey",
                16
              ]
            }
          },
          {
            "name": "lives",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "calls",
            "docs": [
              "0 no call, 1 up, 2 down, for the current round."
            ],
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "startLives",
            "type": "u8"
          },
          {
            "name": "alive",
            "type": "u8"
          },
          {
            "name": "round",
            "type": "u16"
          },
          {
            "name": "maxRounds",
            "type": "u16"
          },
          {
            "name": "roundSecs",
            "type": "u32"
          },
          {
            "name": "roundPrice",
            "type": "u64"
          },
          {
            "name": "roundStartedAt",
            "type": "i64"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "createdAt",
            "docs": [
              "Lobby opened; after TOUR_LOBBY_SECS anyone can cancel an unstarted tournament (full refunds)."
            ],
            "type": "i64"
          },
          {
            "name": "rentPayer",
            "docs": [
              "Paid the tournament vault's rent; gets it back when the vault closes."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "vote",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proposal",
            "type": "pubkey"
          },
          {
            "name": "voter",
            "type": "pubkey"
          },
          {
            "name": "yes",
            "type": "bool"
          },
          {
            "name": "weight",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "war",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "clanA",
            "type": "pubkey"
          },
          {
            "name": "clanB",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "duration",
            "type": "i64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "baseA",
            "type": "i64"
          },
          {
            "name": "baseB",
            "type": "i64"
          },
          {
            "name": "chestA",
            "type": "u64"
          },
          {
            "name": "chestB",
            "type": "u64"
          },
          {
            "name": "returnBps",
            "docs": [
              "Return in basis points of the starting chest, recorded at settlement."
            ],
            "type": {
              "array": [
                "i64",
                2
              ]
            }
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "winner",
            "docs": [
              "0 none, 1 clan A, 2 clan B, 3 tie."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "rentPayer",
            "docs": [
              "Paid the war vault's rent; gets it back when the vault closes."
            ],
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
