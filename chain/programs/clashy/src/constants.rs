use anchor_lang::prelude::*;

pub const CONFIG_SEED: &[u8] = b"config";
pub const FEED_SEED: &[u8] = b"feed";
/// Never-delegated Solana copy of a coin feed (see `init_base_feed`).
pub const BASE_FEED_SEED: &[u8] = b"bfeed";
pub const PLAYER_SEED: &[u8] = b"player";
pub const DUEL_SEED: &[u8] = b"duel";
pub const VAULT_SEED: &[u8] = b"vault";
pub const CLAN_SEED: &[u8] = b"clan";
pub const MEMBER_SEED: &[u8] = b"member";
pub const CHEST_SEED: &[u8] = b"chest";
pub const PROPOSAL_SEED: &[u8] = b"proposal";
pub const VOTE_SEED: &[u8] = b"vote";
pub const POSITION_SEED: &[u8] = b"position";
pub const WAR_SEED: &[u8] = b"war";
pub const TOUR_SEED: &[u8] = b"tour";

/// Prices are stored as integer USD with 6 decimals.
pub const PRICE_SCALE: u64 = 1_000_000;
pub const BPS: i64 = 10_000;
pub const MAX_RAKE_BPS: u16 = 1_000;
pub const MAX_COINS: usize = 8;
pub const NO_COIN: u8 = 255;

pub const MIN_STAKE: u64 = 1_000_000; // 0.001 SOL
pub const MIN_DUEL_SECS: u32 = 30;
pub const MAX_DUEL_SECS: u32 = 3_600;
pub const MAX_LEVERAGE: u16 = 100;
pub const MAX_CHALLENGE_SECS: i64 = 7 * 86_400;

/// A feed read inside the rollup must be this fresh (the crank pushes about every second).
pub const MAX_ER_PRICE_AGE: i64 = 15;
/// A feed read on Solana (base feed or oracle) must be this fresh; the crank writes base feeds every ~5 s.
pub const MAX_BASE_PRICE_AGE: i64 = 30;

pub const ELO_START: i32 = 1_000;
pub const ELO_K: i32 = 32;
pub const RP_WIN: u32 = 25;
pub const RP_LOSS: u32 = 15;

pub const CLAN_NAME_LEN: usize = 24;
pub const MAX_CLAN_LEV: u16 = 20;
pub const MIN_VOTE_SECS: i64 = 30;
pub const MAX_VOTE_SECS: i64 = 7 * 86_400;
pub const MIN_WAR_SECS: i64 = 60;
pub const MAX_WAR_SECS: i64 = 14 * 86_400;

pub const MAX_TOUR_PLAYERS: usize = 16;
pub const MIN_ROUND_SECS: u32 = 5;
pub const MAX_ROUND_SECS: u32 = 600;
pub const MAX_ROUNDS: u16 = 100;

/// MagicBlock real-time pricing oracle (republishes Pyth Lazer feeds), readable inside the ER.
pub const ORACLE_PROGRAM_ID: Pubkey = pubkey!("PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd");
/// Discriminator of the oracle's PriceUpdateV2-layout accounts.
pub const PRICE_UPDATE_DISCRIMINATOR: [u8; 8] = [234, 161, 14, 36, 172, 239, 15, 232];
/// MagicBlock VRF base-layer queue with live oracles on devnet and mainnet (the default `Config::vrf_queue`).
pub const VRF_BASE_QUEUE: Pubkey = pubkey!("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");
/// MagicBlock VRF program: owns every oracle queue.
pub const VRF_PROGRAM_ID: Pubkey = pubkey!("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
/// MagicBlock delegation program: owns delegated accounts on Solana while they live in a rollup.
pub const DELEGATION_PROGRAM_ID: Pubkey = pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
