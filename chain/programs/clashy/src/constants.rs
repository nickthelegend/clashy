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
/// The one PDA that owns every vault token account (duel and tournament escrows, war pots, clan chests).
pub const AUTH_SEED: &[u8] = b"auth";
/// A player's public profile: handle, avatar, their own spending limits and day streak.
pub const PROFILE_SEED: &[u8] = b"profile";
/// Reserves a handle so two players cannot take the same name.
pub const HANDLE_SEED: &[u8] = b"handle";
/// A player's savings jar (the Stash) and its USDC vault.
pub const STASH_SEED: &[u8] = b"stash";
pub const STASH_VAULT_SEED: &[u8] = b"stashv";
/// A clan chat channel (a ring buffer of recent messages, live on the MagicBlock rollup).
pub const CHANNEL_SEED: &[u8] = b"chan";

/// Prices are stored as integer USD with 6 decimals.
pub const PRICE_SCALE: u64 = 1_000_000;
pub const BPS: i64 = 10_000;
pub const MAX_RAKE_BPS: u16 = 1_000;
pub const MAX_COINS: usize = 8;
pub const NO_COIN: u8 = 255;

/// Stakes are USDC base units (6 decimals): 1_000_000 = 1 USDC.
pub const MIN_STAKE: u64 = 1_000_000; // 1 USDC
pub const MIN_DUEL_SECS: u32 = 30;
/// Up to a day: quick 60 s duels and slow market duels on tokenized stocks.
pub const MAX_DUEL_SECS: u32 = 86_400;
pub const MAX_LEVERAGE: u16 = 100;
pub const MAX_CHALLENGE_SECS: i64 = 7 * 86_400;
/// A matched duel must reach the rollup within this; otherwise anyone can abort it (refund or forfeit).
pub const DUEL_SETUP_SECS: i64 = 600;
/// After picks close, both players get this long to reveal (audit: no forfeit while a reveal is still possible).
pub const DUEL_REVEAL_SECS: i64 = 300;
/// A live duel or Royale round nobody could finish this long after its bell can be voided by anyone (audit M-H2):
/// the duel refunds both stakes; the Royale ends with its current leaders.
pub const VOID_GRACE_SECS: i64 = 120;
/// A settled or cancelled duel stays on chain this long (match pages, history and the weekly cup read it), then anyone
/// can close it and its rent goes back to whoever paid it (the sponsor).
pub const DUEL_KEEP_SECS: i64 = 14 * 86_400;
/// An unstarted tournament lobby can be cancelled by anyone after this.
pub const TOUR_LOBBY_SECS: i64 = 3_600;
/// A proposal the captain never executes can be closed by anyone this long after its deadline.
pub const EXECUTE_GRACE_SECS: i64 = 3_600;

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

/// Handles: 3 to 16 characters, lowercase letters, digits and underscore.
pub const NAME_LEN: usize = 16;
pub const MIN_NAME_LEN: usize = 3;
pub const AVATARS: u8 = 20;
/// A new profile's daily stake limit (the player can lower it any time; raising it waits a day).
pub const DEFAULT_DAILY_LIMIT: u64 = 50_000_000; // 50 USDC
pub const LIMIT_RAISE_DELAY: i64 = 86_400;
/// A self-imposed break can be at most this long, and cannot be shortened once taken.
pub const MAX_BREAK_SECS: i64 = 30 * 86_400;
pub const DAY_SECS: i64 = 86_400;
pub const GOAL_NAME_LEN: usize = 24;
/// Chat: messages kept per channel and the longest message.
pub const CHAT_MSGS: usize = 24;
pub const CHAT_TEXT: usize = 120;
pub const MAX_CHANNELS: u8 = 4;

/// Counts profiles; each profile gets a number (used for one-like-per-player on feed posts).
pub const REGISTRY_SEED: &[u8] = b"registry";
/// A player's position in one tokenized stock: shares bought through the Stash and their USDC cost.
pub const HOLDING_SEED: &[u8] = b"hold";
/// The public calls feed (a ring of recent posts, live on the MagicBlock rollup).
pub const BOARD_SEED: &[u8] = b"board";
pub const BOARD_POSTS: usize = 24;
pub const POST_TEXT: usize = 140;
/// Players who can like posts: one bit each (profile numbers below this).
pub const LIKE_BITS: usize = 1024;
/// Orca Whirlpool: the AMM the Stash buys and sells tokenized stocks through.
pub const WHIRLPOOL_PROGRAM_ID: Pubkey = pubkey!("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
pub const MEMO_PROGRAM_ID: Pubkey = pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
/// Whirlpool `swap_v2` instruction discriminator: sha256("global:swap_v2")[..8].
pub const WHIRLPOOL_SWAP_V2: [u8; 8] = [43, 4, 237, 11, 26, 201, 30, 98];
pub const MIN_SQRT_PRICE_X64: u128 = 4295048016;
pub const MAX_SQRT_PRICE_X64: u128 = 79226673515401279992447579055;
