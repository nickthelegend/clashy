use anchor_lang::prelude::*;

use crate::constants::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct Coin {
    /// Price account for this coin: a Clashy `PriceFeed` (crank-pushed) or a MagicBlock oracle account.
    pub feed: Pubkey,
    pub symbol: [u8; 8],
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    /// Pushes prices into Clashy feeds (a keeper reading a public price API).
    pub crank: Pubkey,
    pub rake_bps: u16,
    /// When true (devnet / mainnet), coins are rolled only by MagicBlock VRF.
    /// When false (local stack without a VRF oracle), a two-party commit-reveal roll is allowed.
    pub vrf_required: bool,
    pub coin_count: u8,
    pub coins: [Coin; MAX_COINS],
    pub bump: u8,
    /// The MagicBlock VRF oracle queue coin rolls go to: the base queue on devnet and mainnet, or
    /// MagicBlock's test queue on a local stack running their `vrf-oracle`.
    pub vrf_queue: Pubkey,
    /// The MagicBlock rollup validator duels and tournaments may be delegated to (set by the admin).
    pub er_validator: Pubkey,
}

/// Clashy-owned price feed. Delegated to the ER and updated about every second by the crank;
/// the crank commits it back to Solana periodically so base-layer reads stay fresh.
#[account]
#[derive(InitSpace)]
pub struct PriceFeed {
    pub coin: u8,
    pub price: u64,
    pub updated_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Player {
    pub owner: Pubkey,
    pub rating: i32,
    pub rp: u32,
    pub wins: u32,
    pub losses: u32,
    pub streak: u16,
    pub best_streak: u16,
    pub clan: Pubkey,
    pub bump: u8,
}

pub mod duel_status {
    pub const OPEN: u8 = 0;
    pub const MATCHED: u8 = 1;
    pub const ROLLED: u8 = 2;
    pub const LIVE: u8 = 3;
    pub const FINISHED: u8 = 4;
    pub const SETTLED: u8 = 5;
    pub const CANCELLED: u8 = 6;
}

pub mod side {
    pub const LONG: u8 = 1;
    pub const SHORT: u8 = 2;
}

/// A 1v1 knockout duel. Stakes sit in the `vault` PDA on Solana; the duel itself is
/// delegated to the ER while it is live.
#[account]
#[derive(InitSpace)]
pub struct Duel {
    pub creator: Pubkey,
    pub joiner: Pubkey,
    pub nonce: u64,
    pub stake: u64,
    pub status: u8,
    /// Bitmask over config coins the roll may pick.
    pub pool_mask: u8,
    pub coin: u8,
    pub len_secs: u32,
    pub expires_at: i64,
    pub vrf_pending: bool,
    pub randomness: [u8; 32],
    /// Commit-reveal seeds for the local roll (unused when VRF rolls).
    pub seed_hash: [[u8; 32]; 2],
    pub seed: [[u8; 32]; 2],
    pub seeds_revealed: u8,
    /// Sealed picks: sha256(side || leverage_le || salt).
    pub pick_hash: [[u8; 32]; 2],
    pub picks_committed: u8,
    pub side: [u8; 2],
    pub lev: [u16; 2],
    pub picks_revealed: u8,
    pub entry_price: u64,
    pub exit_price: u64,
    pub start_ts: i64,
    pub end_ts: i64,
    /// Leveraged P&L in basis points of stake, per player.
    pub pnl_bps: [i64; 2],
    pub ko: u8,
    /// 0 none, 1 creator, 2 joiner, 3 tie.
    pub winner: u8,
    pub bump: u8,
    pub vault_bump: u8,
    /// When the joiner matched; after DUEL_SETUP_SECS a duel stuck before the rollup can be aborted.
    pub matched_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Clan {
    pub name: [u8; CLAN_NAME_LEN],
    pub captain: Pubkey,
    pub crest: u8,
    pub members: u32,
    /// Lamports in the chest vault: members' deposits, minus war stakes lost, plus war pots won.
    pub chest: u64,
    /// Total chest shares held by members. A share is worth `chest / shares` lamports.
    pub shares: u64,
    /// Realized paper P&L of the clan's voted trades, in lamports of notional.
    pub score_pnl: i64,
    pub proposals: u64,
    pub positions_open: u16,
    /// Proposals still open. Withdrawals wait until they close, so one deposit cannot vote twice.
    pub open_votes: u16,
    pub wins: u32,
    pub losses: u32,
    pub war: Pubkey,
    pub bump: u8,
    pub chest_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Member {
    pub clan: Pubkey,
    pub wallet: Pubkey,
    /// Lamports this member put in, net of withdrawals (cost basis, for display).
    pub deposit: u64,
    /// Chest shares: withdrawals pay `shares * chest / clan.shares`, and votes weigh by shares.
    pub shares: u64,
    pub joined_at: i64,
    pub bump: u8,
}

pub mod proposal_status {
    pub const OPEN: u8 = 0;
    pub const EXECUTED: u8 = 1;
    pub const REJECTED: u8 = 2;
}

#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub clan: Pubkey,
    pub id: u64,
    pub proposer: Pubkey,
    pub coin: u8,
    pub side: u8,
    pub lev: u16,
    pub size_bps: u16,
    pub yes: u64,
    pub no: u64,
    pub deadline: i64,
    pub status: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Vote {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub yes: bool,
    pub weight: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ClanPosition {
    pub clan: Pubkey,
    pub proposal: u64,
    pub coin: u8,
    pub side: u8,
    pub lev: u16,
    pub notional: u64,
    pub entry_price: u64,
    pub exit_price: u64,
    pub opened_at: i64,
    pub closed_at: i64,
    pub pnl: i64,
    pub open: bool,
    pub bump: u8,
}

pub mod war_status {
    pub const DECLARED: u8 = 0;
    pub const LIVE: u8 = 1;
    pub const SETTLED: u8 = 2;
    pub const CANCELLED: u8 = 3;
}

#[account]
#[derive(InitSpace)]
pub struct War {
    pub clan_a: Pubkey,
    pub clan_b: Pubkey,
    pub nonce: u64,
    pub stake: u64,
    pub duration: i64,
    pub start_ts: i64,
    pub end_ts: i64,
    pub base_a: i64,
    pub base_b: i64,
    pub chest_a: u64,
    pub chest_b: u64,
    /// Return in basis points of the starting chest, recorded at settlement.
    pub return_bps: [i64; 2],
    pub status: u8,
    /// 0 none, 1 clan A, 2 clan B, 3 tie.
    pub winner: u8,
    pub bump: u8,
    pub vault_bump: u8,
}

pub mod tour_status {
    pub const OPEN: u8 = 0;
    pub const LIVE: u8 = 1;
    pub const FINISHED: u8 = 2;
    pub const SETTLED: u8 = 3;
    pub const CANCELLED: u8 = 4;
}

/// An on-chain Royale: escrowed entries, up/down calls each round on the ER, last one standing.
#[account]
#[derive(InitSpace)]
pub struct Tournament {
    pub creator: Pubkey,
    pub nonce: u64,
    pub entry: u64,
    pub coin: u8,
    pub vrf_pending: bool,
    pub max_players: u8,
    pub count: u8,
    pub players: [Pubkey; MAX_TOUR_PLAYERS],
    pub lives: [u8; MAX_TOUR_PLAYERS],
    /// 0 no call, 1 up, 2 down, for the current round.
    pub calls: [u8; MAX_TOUR_PLAYERS],
    pub start_lives: u8,
    pub alive: u8,
    pub round: u16,
    pub max_rounds: u16,
    pub round_secs: u32,
    pub round_price: u64,
    pub round_started_at: i64,
    pub status: u8,
    pub bump: u8,
    pub vault_bump: u8,
    /// Lobby opened; after TOUR_LOBBY_SECS anyone can cancel an unstarted tournament (full refunds).
    pub created_at: i64,
}
