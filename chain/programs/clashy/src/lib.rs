//! Clashy: PvP trading games on Solana, run on MagicBlock Ephemeral Rollups.
//!
//! - **Knockout duel (quick match / challenge):** both stakes escrowed in a vault PDA on Solana;
//!   MagicBlock VRF rolls one coin for both players; long/short picks are sealed by commit-reveal;
//!   the duel is delegated to the ER where it is scored against a live price with knockout checks,
//!   then committed back and settled on Solana (rake, Elo, rank points).
//! - **Clans:** a chest vault, proposals voted by deposit weight, captain-executed positions scored
//!   on the oracle price (group trading).
//! - **Clan war:** both clans escrow a war pot from their chests; the better return over the window wins.
//! - **Tournaments:** an on-chain Royale. Entries escrowed; up/down calls and round resolution run
//!   on the ER; the last players standing split the pot.
//!
//! Money is USDC (an SPL token, 6 decimals): every escrow, chest and pot is a token account owned
//! by the program's `auth` PDA. Rent and fees are paid by a separate `payer` signer (the sponsor),
//! so a player's wallet only ever needs USDC; vault rent goes back to whoever paid it.
//!
//! Prices come from Clashy `PriceFeed` accounts (crank-pushed, delegated to the ER) or MagicBlock
//! pricing-oracle accounts; see `price.rs`.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};
use solana_sha256_hasher::hashv;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer as TokenTransfer};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;
use ephemeral_rollups_sdk::vrf::anchor::{vrf, vrf_callback};
use ephemeral_rollups_sdk::vrf::instructions::{create_request_randomness_ix, RequestRandomnessParams};
use ephemeral_rollups_sdk::vrf::types::SerializableAccountMeta;

pub mod constants;
pub mod error;
pub mod math;
pub mod price;
pub mod state;

use constants::*;
use error::ClashyError;
use state::*;

declare_id!("FQKy8fTDjciqwzTfo5Ae7Qt6iT3Fi9fhtY6aR2gg1wdS");

#[event]
pub struct DuelFinished {
    pub duel: Pubkey,
    pub coin: u8,
    pub entry_price: u64,
    pub exit_price: u64,
    pub pnl_bps: [i64; 2],
    pub ko: u8,
    pub winner: u8,
}

#[event]
pub struct DuelSettled {
    pub duel: Pubkey,
    pub winner: u8,
    pub paid: u64,
    pub rake: u64,
}

#[event]
pub struct RoundResolved {
    pub tournament: Pubkey,
    pub round: u16,
    pub start_price: u64,
    pub end_price: u64,
    pub alive: u8,
}

/// Moves USDC out of a vault token account; the `auth` PDA signs.
fn pay_out<'info>(token_program: &AccountInfo<'info>, from: &AccountInfo<'info>, to: &AccountInfo<'info>, auth: &AccountInfo<'info>, auth_bump: u8, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let bump = [auth_bump];
    let seeds: &[&[u8]] = &[AUTH_SEED, &bump];
    token::transfer(
        CpiContext::new_with_signer(token_program.clone(), TokenTransfer { from: from.clone(), to: to.clone(), authority: auth.clone() }, &[seeds]),
        amount,
    )
}

/// Moves USDC from a player's own token account into a vault; the player signs.
fn pay_in<'info>(token_program: &AccountInfo<'info>, from: &AccountInfo<'info>, to: &AccountInfo<'info>, owner: &AccountInfo<'info>, amount: u64) -> Result<()> {
    token::transfer(CpiContext::new(token_program.clone(), TokenTransfer { from: from.clone(), to: to.clone(), authority: owner.clone() }), amount)
}

/// Closes an emptied vault token account and returns its rent to whoever paid it.
fn close_vault<'info>(token_program: &AccountInfo<'info>, vault: &AccountInfo<'info>, rent_to: &AccountInfo<'info>, auth: &AccountInfo<'info>, auth_bump: u8) -> Result<()> {
    let bump = [auth_bump];
    let seeds: &[&[u8]] = &[AUTH_SEED, &bump];
    token::close_account(CpiContext::new_with_signer(
        token_program.clone(),
        CloseAccount { account: vault.clone(), destination: rent_to.clone(), authority: auth.clone() },
        &[seeds],
    ))
}

/// The token balance of an SPL token account (bytes 64..72 of the account layout).
fn token_amount(info: &AccountInfo) -> Result<u64> {
    require_keys_eq!(*info.owner, token::ID, ClashyError::PayoutMismatch);
    let data = info.try_borrow_data()?;
    require!(data.len() >= 72, ClashyError::PayoutMismatch);
    Ok(u64::from_le_bytes(data[64..72].try_into().unwrap()))
}

/// A payout destination passed as a remaining account: a USDC token account owned by `owner`.
fn check_usdc_account(info: &AccountInfo, owner: &Pubkey, mint: &Pubkey) -> Result<()> {
    require_keys_eq!(*info.owner, token::ID, ClashyError::PayoutMismatch);
    let data = info.try_borrow_data()?;
    let ta = TokenAccount::try_deserialize(&mut &data[..])?;
    require_keys_eq!(ta.owner, *owner, ClashyError::PayoutMismatch);
    require_keys_eq!(ta.mint, *mint, ClashyError::PayoutMismatch);
    Ok(())
}

fn player_index(duel: &Duel, who: &Pubkey) -> Result<usize> {
    if *who == duel.creator {
        Ok(0)
    } else if *who == duel.joiner {
        Ok(1)
    } else {
        err!(ClashyError::NotPlayer)
    }
}

fn coin_feed(config: &Config, coin: u8) -> Result<Pubkey> {
    require!((coin as usize) < config.coin_count as usize, ClashyError::BadCoin);
    Ok(config.coins[coin as usize].feed)
}

/// Reads a coin's price on Solana (not in the rollup). The rollup feeds are delegated, so Solana reads the
/// crank's never-delegated base feed for the coin.
fn solana_price(config: &Config, coin: u8, account: &AccountInfo, now: i64) -> Result<u64> {
    coin_feed(config, coin)?;
    // one source only, so a captain cannot pick whichever of two prices suits them
    let expected = Pubkey::find_program_address(&[BASE_FEED_SEED, &[coin]], &crate::ID).0;
    price::read_price(account, &expected, now, MAX_BASE_PRICE_AGE)
}

/// Finishes a live duel at `price`: records exit, P&L, knockouts and the winner.
fn finish_duel(duel: &mut Duel, price: u64, now: i64) {
    duel.exit_price = price;
    duel.end_ts = now;
    duel.status = duel_status::FINISHED;
    let ka = duel.pnl_bps[0] <= -BPS;
    let kb = duel.pnl_bps[1] <= -BPS;
    duel.ko = (ka as u8) | ((kb as u8) << 1);
    duel.winner = if ka && !kb {
        2
    } else if kb && !ka {
        1
    } else if duel.pnl_bps[0] > duel.pnl_bps[1] {
        1
    } else if duel.pnl_bps[1] > duel.pnl_bps[0] {
        2
    } else {
        3
    };
}

fn update_players(a: &mut Player, b: &mut Player, winner: u8) {
    let score_a = match winner {
        1 => 10_000,
        2 => 0,
        _ => 5_000,
    };
    let (ra, rb) = math::elo(a.rating, b.rating, score_a);
    a.rating = ra;
    b.rating = rb;
    let apply = |p: &mut Player, won: Option<bool>| match won {
        Some(true) => {
            p.wins += 1;
            p.rp = p.rp.saturating_add(RP_WIN);
            p.streak = p.streak.saturating_add(1);
            p.best_streak = p.best_streak.max(p.streak);
        }
        Some(false) => {
            p.losses += 1;
            p.rp = p.rp.saturating_sub(RP_LOSS);
            p.streak = 0;
        }
        None => {}
    };
    match winner {
        1 => {
            apply(a, Some(true));
            apply(b, Some(false));
        }
        2 => {
            apply(a, Some(false));
            apply(b, Some(true));
        }
        _ => {}
    }
}

/// UTC day index of a unix time.
fn day_of(ts: i64) -> i64 {
    ts.div_euclid(DAY_SECS)
}

/// Counts an active day (a stake or a save) toward the player's day streak.
fn mark_active(p: &mut Profile, now: i64) {
    let today = day_of(now);
    if p.last_active_day == today {
        return;
    }
    p.day_streak = if p.last_active_day == today - 1 { p.day_streak.saturating_add(1) } else { 1 };
    p.best_day_streak = p.best_day_streak.max(p.day_streak);
    p.last_active_day = today;
}

/// Every stake goes through here: the player's own break and daily limit are enforced on chain,
/// so no app (ours included) can stake past them.
fn check_stake(p: &mut Profile, amount: u64, now: i64) -> Result<()> {
    require!(now >= p.break_until, ClashyError::OnBreak);
    if p.pending_at != 0 && now >= p.pending_at {
        p.daily_limit = p.pending_limit;
        p.pending_limit = 0;
        p.pending_at = 0;
    }
    let today = day_of(now);
    if p.day != today {
        p.day = today;
        p.staked_today = 0;
    }
    let after = p.staked_today.checked_add(amount).ok_or(ClashyError::Overflow)?;
    require!(after <= p.daily_limit, ClashyError::DailyLimit);
    p.staked_today = after;
    mark_active(p, now);
    Ok(())
}

/// Handles are 3 to 16 bytes of lowercase letters, digits and underscore.
fn check_name(name: &str) -> Result<[u8; NAME_LEN]> {
    let b = name.as_bytes();
    require!(b.len() >= MIN_NAME_LEN && b.len() <= NAME_LEN, ClashyError::BadHandle);
    require!(b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'_'), ClashyError::BadHandle);
    let mut out = [0u8; NAME_LEN];
    out[..b.len()].copy_from_slice(b);
    Ok(out)
}

fn fixed<const N: usize>(text: &str) -> Result<[u8; N]> {
    let b = text.as_bytes();
    require!(b.len() <= N, ClashyError::BadGoalName);
    let mut out = [0u8; N];
    out[..b.len()].copy_from_slice(b);
    Ok(out)
}

/// Token balance of an SPL Token or Token-2022 account (both keep the amount at bytes 64..72).
fn raw_amount(info: &AccountInfo) -> Result<u64> {
    require!(*info.owner == token::ID || *info.owner == anchor_spl::token_2022::ID, ClashyError::PayoutMismatch);
    let data = info.try_borrow_data()?;
    require!(data.len() >= 72, ClashyError::PayoutMismatch);
    Ok(u64::from_le_bytes(data[64..72].try_into().unwrap()))
}

/// Mint and owner of an SPL Token or Token-2022 account.
fn token_mint_owner(info: &AccountInfo) -> Result<(Pubkey, Pubkey)> {
    require!(*info.owner == token::ID || *info.owner == anchor_spl::token_2022::ID, ClashyError::PayoutMismatch);
    let data = info.try_borrow_data()?;
    require!(data.len() >= 72, ClashyError::PayoutMismatch);
    Ok((Pubkey::new_from_array(data[0..32].try_into().unwrap()), Pubkey::new_from_array(data[32..64].try_into().unwrap())))
}

/// The parts of an Orca Whirlpool account a swap needs: (mint A, vault A, mint B, vault B).
fn whirlpool_sides(info: &AccountInfo) -> Result<(Pubkey, Pubkey, Pubkey, Pubkey)> {
    require_keys_eq!(*info.owner, WHIRLPOOL_PROGRAM_ID, ClashyError::BadPool);
    let d = info.try_borrow_data()?;
    // discriminator 8, config 32, bump 1, tick spacing 2, fee tier seed 2, fee rate 2, protocol fee 2,
    // liquidity 16, sqrt price 16, tick 4, protocol fees owed 8 + 8 = 101 bytes before mint A
    let o = 8 + 32 + 1 + 2 + 2 + 2 + 2 + 16 + 16 + 4 + 8 + 8;
    require!(d.len() >= o + 32 + 32 + 16 + 32 + 32, ClashyError::BadPool);
    let k = |at: usize| Pubkey::new_from_array(d[at..at + 32].try_into().unwrap());
    Ok((k(o), k(o + 32), k(o + 32 + 32 + 16), k(o + 32 + 32 + 16 + 32)))
}

/// One swap through Orca Whirlpool's `swap_v2`, with `amount` of the input side. `a_to_b` sells token A.
#[allow(clippy::too_many_arguments)]
fn whirlpool_swap<'info>(
    sw: &StockSwap<'info>, a_to_b: bool, amount: u64, min_out: u64, authority: &AccountInfo<'info>,
    owner_a: &AccountInfo<'info>, owner_b: &AccountInfo<'info>, prog_a: &AccountInfo<'info>, prog_b: &AccountInfo<'info>,
    mint_a: &AccountInfo<'info>, mint_b: &AccountInfo<'info>, signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut data = WHIRLPOOL_SWAP_V2.to_vec();
    data.extend_from_slice(&amount.to_le_bytes());
    data.extend_from_slice(&min_out.to_le_bytes());
    let limit = if a_to_b { MIN_SQRT_PRICE_X64 } else { MAX_SQRT_PRICE_X64 };
    data.extend_from_slice(&limit.to_le_bytes());
    data.push(1); // amount is the input
    data.push(a_to_b as u8);
    data.push(0); // no remaining-accounts info
    let metas = vec![
        AccountMeta::new_readonly(prog_a.key(), false),
        AccountMeta::new_readonly(prog_b.key(), false),
        AccountMeta::new_readonly(MEMO_PROGRAM_ID, false),
        AccountMeta::new_readonly(authority.key(), true),
        AccountMeta::new(sw.whirlpool.key(), false),
        AccountMeta::new_readonly(mint_a.key(), false),
        AccountMeta::new_readonly(mint_b.key(), false),
        AccountMeta::new(owner_a.key(), false),
        AccountMeta::new(sw.vault_a.key(), false),
        AccountMeta::new(owner_b.key(), false),
        AccountMeta::new(sw.vault_b.key(), false),
        AccountMeta::new(sw.tick_array_0.key(), false),
        AccountMeta::new(sw.tick_array_1.key(), false),
        AccountMeta::new(sw.tick_array_2.key(), false),
        AccountMeta::new(sw.oracle.key(), false),
    ];
    let infos = vec![
        prog_a.clone(), prog_b.clone(), sw.memo_program.to_account_info(), authority.clone(), sw.whirlpool.to_account_info(),
        mint_a.clone(), mint_b.clone(), owner_a.clone(), sw.vault_a.to_account_info(), owner_b.clone(), sw.vault_b.to_account_info(),
        sw.tick_array_0.to_account_info(), sw.tick_array_1.to_account_info(), sw.tick_array_2.to_account_info(), sw.oracle.to_account_info(),
        sw.whirlpool_program.to_account_info(),
    ];
    invoke_signed(&Instruction { program_id: WHIRLPOOL_PROGRAM_ID, accounts: metas, data }, &infos, signer_seeds)?;
    Ok(())
}

#[ephemeral]
#[program]
pub mod clashy {
    use super::*;

    // ------------------------------------------------------------------ admin

    pub fn initialize(ctx: Context<Initialize>, rake_bps: u16, vrf_required: bool, crank: Pubkey, treasury: Pubkey) -> Result<()> {
        require!(rake_bps <= MAX_RAKE_BPS, ClashyError::RakeTooHigh);
        let c = &mut ctx.accounts.config;
        c.authority = ctx.accounts.authority.key();
        c.treasury = treasury;
        c.crank = crank;
        c.rake_bps = rake_bps;
        c.vrf_required = vrf_required;
        c.coin_count = 0;
        c.coins = [Coin::default(); MAX_COINS];
        c.bump = ctx.bumps.config;
        c.vrf_queue = VRF_BASE_QUEUE;
        c.er_validator = Pubkey::default();
        c.usdc_mint = ctx.accounts.usdc_mint.key();
        c.auth_bump = ctx.bumps.auth;
        Ok(())
    }

    /// Pins the rollup validator duels and tournaments are delegated to.
    pub fn set_er_validator(ctx: Context<AdminConfig>, validator: Pubkey) -> Result<()> {
        ctx.accounts.config.er_validator = validator;
        Ok(())
    }

    /// Points coin rolls at another MagicBlock VRF queue (it must be owned by the VRF program).
    pub fn set_vrf_queue(ctx: Context<SetVrfQueue>) -> Result<()> {
        ctx.accounts.config.vrf_queue = ctx.accounts.queue.key();
        Ok(())
    }

    pub fn update_config(ctx: Context<AdminConfig>, rake_bps: u16, vrf_required: bool, crank: Pubkey, treasury: Pubkey) -> Result<()> {
        require!(rake_bps <= MAX_RAKE_BPS, ClashyError::RakeTooHigh);
        let c = &mut ctx.accounts.config;
        c.rake_bps = rake_bps;
        c.vrf_required = vrf_required;
        c.crank = crank;
        c.treasury = treasury;
        Ok(())
    }

    /// Sets coin `index` to read from `feed` (a Clashy PriceFeed or a MagicBlock oracle account).
    pub fn set_coin(ctx: Context<AdminConfig>, index: u8, feed: Pubkey, symbol: [u8; 8]) -> Result<()> {
        require!((index as usize) < MAX_COINS, ClashyError::BadCoin);
        let c = &mut ctx.accounts.config;
        require!(index <= c.coin_count, ClashyError::BadCoin);
        c.coins[index as usize] = Coin { feed, symbol };
        if index == c.coin_count {
            c.coin_count += 1;
        }
        Ok(())
    }

    // ------------------------------------------------------------------ price feeds

    pub fn init_feed(ctx: Context<InitFeed>, coin: u8) -> Result<()> {
        let f = &mut ctx.accounts.feed;
        f.coin = coin;
        f.price = 0;
        f.updated_at = 0;
        f.bump = ctx.bumps.feed;
        Ok(())
    }

    /// Crank-only. Works on Solana and inside the ER (where the feed is delegated).
    pub fn push_price(ctx: Context<PushPrice>, price: u64) -> Result<()> {
        require!(price > 0, ClashyError::PriceZero);
        let f = &mut ctx.accounts.feed;
        f.price = price;
        f.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn delegate_feed(ctx: Context<DelegateFeed>, coin: u8) -> Result<()> {
        ctx.accounts.delegate_feed(
            &ctx.accounts.authority,
            &[FEED_SEED, &[coin]],
            DelegateConfig { validator: ctx.remaining_accounts.first().map(|a| a.key()), ..Default::default() },
        )?;
        Ok(())
    }

    /// A never-delegated copy of a coin's feed on Solana, for Solana-side reads (clan trades).
    /// MagicBlock sponsors only a few commits per delegated account, so the rollup feeds are not
    /// committed back; the crank writes this account directly instead.
    pub fn init_base_feed(ctx: Context<InitBaseFeed>, coin: u8) -> Result<()> {
        let f = &mut ctx.accounts.feed;
        f.coin = coin;
        f.price = 0;
        f.updated_at = 0;
        f.bump = ctx.bumps.feed;
        Ok(())
    }

    /// Crank-only, on Solana.
    pub fn push_base_price(ctx: Context<PushBasePrice>, price: u64) -> Result<()> {
        require!(price > 0, ClashyError::PriceZero);
        let f = &mut ctx.accounts.feed;
        f.price = price;
        f.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    // ------------------------------------------------------------------ players

    pub fn init_player(ctx: Context<InitPlayer>) -> Result<()> {
        let p = &mut ctx.accounts.player;
        p.owner = ctx.accounts.owner.key();
        p.rating = ELO_START;
        p.rp = 0;
        p.wins = 0;
        p.losses = 0;
        p.streak = 0;
        p.best_streak = 0;
        p.clan = Pubkey::default();
        p.bump = ctx.bumps.player;
        Ok(())
    }


    // ------------------------------------------------------------------ profile, limits, Stash

    /// A player's handle and avatar. The handle account makes names unique.
    pub fn create_profile(ctx: Context<CreateProfile>, name: String, avatar: u8) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(avatar < AVATARS, ClashyError::BadAvatar);
        let p = &mut ctx.accounts.profile;
        p.owner = ctx.accounts.owner.key();
        p.name = check_name(&name)?;
        p.avatar = avatar;
        p.daily_limit = DEFAULT_DAILY_LIMIT;
        p.day = day_of(now);
        p.save_bps = 0;
        p.roundup_step = 0;
        p.created_at = now;
        p.bump = ctx.bumps.profile;
        let r = &mut ctx.accounts.registry;
        r.bump = ctx.bumps.registry;
        p.number = r.profiles;
        r.profiles = r.profiles.checked_add(1).ok_or(ClashyError::Overflow)?;
        let h = &mut ctx.accounts.handle;
        h.owner = ctx.accounts.owner.key();
        h.bump = ctx.bumps.handle;
        Ok(())
    }

    pub fn set_avatar(ctx: Context<OwnProfile>, avatar: u8) -> Result<()> {
        require!(avatar < AVATARS, ClashyError::BadAvatar);
        ctx.accounts.profile.avatar = avatar;
        Ok(())
    }

    /// The player's own controls. A lower daily limit applies at once; a higher one waits a day.
    pub fn set_limits(ctx: Context<OwnProfile>, daily_limit: u64, save_bps: u16, roundup_step: u64) -> Result<()> {
        require!(save_bps <= BPS as u16, ClashyError::BadSaveShare);
        let now = Clock::get()?.unix_timestamp;
        let p = &mut ctx.accounts.profile;
        if daily_limit <= p.daily_limit {
            p.daily_limit = daily_limit;
            p.pending_limit = 0;
            p.pending_at = 0;
        } else {
            p.pending_limit = daily_limit;
            p.pending_at = now + LIMIT_RAISE_DELAY;
        }
        p.save_bps = save_bps;
        p.roundup_step = roundup_step;
        Ok(())
    }

    /// A break from staking that the player sets on themselves. It can be extended, never shortened.
    pub fn take_break(ctx: Context<OwnProfile>, secs: i64) -> Result<()> {
        require!(secs > 0 && secs <= MAX_BREAK_SECS, ClashyError::BadBreak);
        let now = Clock::get()?.unix_timestamp;
        let p = &mut ctx.accounts.profile;
        p.break_until = p.break_until.max(now + secs);
        Ok(())
    }

    pub fn open_stash(ctx: Context<OpenStash>, goal: u64, goal_name: String) -> Result<()> {
        let s = &mut ctx.accounts.stash;
        s.owner = ctx.accounts.owner.key();
        s.goal = goal;
        s.goal_name = fixed::<GOAL_NAME_LEN>(&goal_name)?;
        s.opened_at = Clock::get()?.unix_timestamp;
        s.bump = ctx.bumps.stash;
        s.vault_bump = ctx.bumps.vault;
        s.rent_payer = ctx.accounts.payer.key();
        Ok(())
    }

    pub fn set_goal(ctx: Context<StashOwner>, goal: u64, goal_name: String) -> Result<()> {
        let s = &mut ctx.accounts.stash;
        s.goal = goal;
        s.goal_name = fixed::<GOAL_NAME_LEN>(&goal_name)?;
        Ok(())
    }

    /// Moves USDC from the player's wallet into their Stash. `kind` records where it came from:
    /// put in by hand, a round-up on a payment made in the same transaction, or a slice of a win.
    pub fn stash_save(ctx: Context<StashMove>, amount: u64, kind: u8) -> Result<()> {
        require!(amount > 0, ClashyError::ZeroAmount);
        pay_in(&ctx.accounts.token_program.to_account_info(), &ctx.accounts.owner_usdc.to_account_info(), &ctx.accounts.vault.to_account_info(), &ctx.accounts.owner.to_account_info(), amount)?;
        let s = &mut ctx.accounts.stash;
        match kind {
            save_kind::ROUNDUP => s.saved_roundup += amount,
            save_kind::WIN => s.saved_wins += amount,
            _ => s.saved_manual += amount,
        }
        s.saves += 1;
        mark_active(&mut ctx.accounts.profile, Clock::get()?.unix_timestamp);
        Ok(())
    }

    /// The owner can always take their savings out.
    pub fn stash_withdraw(ctx: Context<StashMove>, amount: u64) -> Result<()> {
        require!(amount > 0, ClashyError::ZeroAmount);
        let vault = ctx.accounts.vault.to_account_info();
        require!(token_amount(&vault)? >= amount, ClashyError::StashLow);
        pay_out(&ctx.accounts.token_program.to_account_info(), &vault, &ctx.accounts.owner_usdc.to_account_info(), &ctx.accounts.auth.to_account_info(), ctx.accounts.config.auth_bump, amount)?;
        ctx.accounts.stash.withdrawn += amount;
        Ok(())
    }


    /// Buys a tokenized stock with USDC from the Stash, through Orca Whirlpool. The shares land in the
    /// player's own token account; the cost is recorded on chain in their Holding.
    pub fn stash_invest(ctx: Context<StashInvest>, usdc_in: u64, min_shares: u64) -> Result<()> {
        require!(usdc_in > 0, ClashyError::ZeroAmount);
        let usdc = ctx.accounts.config.usdc_mint;
        let stock = ctx.accounts.sw.stock_mint.key();
        let (mint_a, vault_a, mint_b, vault_b) = whirlpool_sides(&ctx.accounts.sw.whirlpool)?;
        require!((mint_a == stock && mint_b == usdc) || (mint_a == usdc && mint_b == stock), ClashyError::BadPool);
        require_keys_eq!(vault_a, ctx.accounts.sw.vault_a.key(), ClashyError::BadPool);
        require_keys_eq!(vault_b, ctx.accounts.sw.vault_b.key(), ClashyError::BadPool);
        let (m, o) = token_mint_owner(&ctx.accounts.sw.owner_stock)?;
        require!(m == stock && o == ctx.accounts.owner.key(), ClashyError::PayoutMismatch);
        let stash_vault = ctx.accounts.vault.to_account_info();
        let usdc_before = raw_amount(&stash_vault)?;
        require!(usdc_before >= usdc_in, ClashyError::StashLow);
        let shares_before = raw_amount(&ctx.accounts.sw.owner_stock)?;
        let a_to_b = mint_a == usdc; // selling USDC
        let sw = &ctx.accounts.sw;
        let (usdc_prog, stock_prog) = (sw.token_program.to_account_info(), sw.token_2022_program.to_account_info());
        let (usdc_mint, stock_mint) = (sw.usdc_mint.to_account_info(), sw.stock_mint.to_account_info());
        let stock_acc = sw.owner_stock.to_account_info();
        let auth = ctx.accounts.auth.to_account_info();
        let bump = [ctx.accounts.config.auth_bump];
        let seeds: &[&[u8]] = &[AUTH_SEED, &bump];
        if a_to_b {
            whirlpool_swap(sw, true, usdc_in, min_shares, &auth, &stash_vault, &stock_acc, &usdc_prog, &stock_prog, &usdc_mint, &stock_mint, &[seeds])?;
        } else {
            whirlpool_swap(sw, false, usdc_in, min_shares, &auth, &stock_acc, &stash_vault, &stock_prog, &usdc_prog, &stock_mint, &usdc_mint, &[seeds])?;
        }
        let spent = usdc_before - raw_amount(&stash_vault)?;
        let got = raw_amount(&ctx.accounts.sw.owner_stock)? - shares_before;
        require!(got >= min_shares && got > 0, ClashyError::Slippage);
        let h = &mut ctx.accounts.holding;
        if h.owner == Pubkey::default() {
            h.owner = ctx.accounts.owner.key();
            h.mint = stock;
            h.bump = ctx.bumps.holding;
        }
        h.shares += got;
        h.cost += spent;
        h.bought += spent;
        mark_active(&mut ctx.accounts.profile, Clock::get()?.unix_timestamp);
        Ok(())
    }

    /// Sells shares bought through the Stash back to USDC (into the Stash), through Orca Whirlpool.
    pub fn stash_sell(ctx: Context<StashInvest>, shares: u64, min_usdc: u64) -> Result<()> {
        require!(shares > 0, ClashyError::ZeroAmount);
        require!(ctx.accounts.holding.shares >= shares, ClashyError::NotEnoughStock);
        let usdc = ctx.accounts.config.usdc_mint;
        let stock = ctx.accounts.sw.stock_mint.key();
        require_keys_eq!(ctx.accounts.holding.mint, stock, ClashyError::BadPool);
        let (mint_a, vault_a, mint_b, vault_b) = whirlpool_sides(&ctx.accounts.sw.whirlpool)?;
        require!((mint_a == stock && mint_b == usdc) || (mint_a == usdc && mint_b == stock), ClashyError::BadPool);
        require_keys_eq!(vault_a, ctx.accounts.sw.vault_a.key(), ClashyError::BadPool);
        require_keys_eq!(vault_b, ctx.accounts.sw.vault_b.key(), ClashyError::BadPool);
        let (m, o) = token_mint_owner(&ctx.accounts.sw.owner_stock)?;
        require!(m == stock && o == ctx.accounts.owner.key(), ClashyError::PayoutMismatch);
        let stash_vault = ctx.accounts.vault.to_account_info();
        let usdc_before = raw_amount(&stash_vault)?;
        let a_to_b = mint_a == stock; // selling the stock
        let sw = &ctx.accounts.sw;
        let (usdc_prog, stock_prog) = (sw.token_program.to_account_info(), sw.token_2022_program.to_account_info());
        let (usdc_mint, stock_mint) = (sw.usdc_mint.to_account_info(), sw.stock_mint.to_account_info());
        let stock_acc = sw.owner_stock.to_account_info();
        let owner = ctx.accounts.owner.to_account_info();
        if a_to_b {
            whirlpool_swap(sw, true, shares, min_usdc, &owner, &stock_acc, &stash_vault, &stock_prog, &usdc_prog, &stock_mint, &usdc_mint, &[])?;
        } else {
            whirlpool_swap(sw, false, shares, min_usdc, &owner, &stash_vault, &stock_acc, &usdc_prog, &stock_prog, &usdc_mint, &stock_mint, &[])?;
        }
        let got = raw_amount(&stash_vault)? - usdc_before;
        require!(got >= min_usdc, ClashyError::Slippage);
        let h = &mut ctx.accounts.holding;
        let cost_part = ((h.cost as u128) * (shares as u128) / (h.shares as u128)) as u64;
        h.realized += got as i64 - cost_part as i64;
        h.cost -= cost_part;
        h.shares -= shares;
        h.sold_usdc += got;
        Ok(())
    }

    // ------------------------------------------------------------------ calls feed (on the rollup)

    pub fn open_board(ctx: Context<OpenBoard>, id: u8) -> Result<()> {
        let mut b = ctx.accounts.board.load_init()?;
        b.id = id;
        b.count = 0;
        b.bump = ctx.bumps.board;
        Ok(())
    }

    pub fn delegate_board(ctx: Context<DelegateBoard>, id: u8) -> Result<()> {
        ctx.accounts.delegate_board(
            &ctx.accounts.authority,
            &[BOARD_SEED, &[id]],
            DelegateConfig { validator: ctx.remaining_accounts.first().map(|a| a.key()), ..Default::default() },
        )?;
        Ok(())
    }

    /// Posts to the feed (players with a profile). A call points at a stock mint and the app shows the
    /// author's live position in it; a reply points at the post it answers.
    pub fn post(ctx: Context<PostToBoard>, text: String, kind: u8, refkey: Pubkey, reply_to: u64) -> Result<()> {
        let bytes = text.as_bytes();
        require!(!bytes.is_empty() && bytes.len() <= POST_TEXT, ClashyError::BadPost);
        let now = Clock::get()?.unix_timestamp;
        let mut b = ctx.accounts.board.load_mut()?;
        if reply_to != u64::MAX {
            let i = b.posts.iter().position(|p| p.seq == reply_to && p.author != Pubkey::default()).ok_or(ClashyError::PostGone)?;
            b.posts[i].replies = b.posts[i].replies.saturating_add(1);
        }
        let seq = b.count;
        let p = &mut b.posts[(seq % BOARD_POSTS as u64) as usize];
        p.seq = seq;
        p.ts = now;
        p.reply_to = reply_to;
        p.author = ctx.accounts.author.key();
        p.refkey = refkey;
        p.likes = 0;
        p.replies = 0;
        p.kind = kind;
        p.len = bytes.len() as u8;
        p.text = [0; POST_TEXT];
        p.text[..bytes.len()].copy_from_slice(bytes);
        p.liked = [0; LIKE_BITS / 8];
        b.count += 1;
        Ok(())
    }

    /// One like per player per post (by profile number).
    pub fn like(ctx: Context<LikePost>, seq: u64) -> Result<()> {
        let n = ctx.accounts.profile.number as usize;
        require!(n < LIKE_BITS, ClashyError::Overflow);
        let mut b = ctx.accounts.board.load_mut()?;
        let i = b.posts.iter().position(|p| p.seq == seq && p.author != Pubkey::default()).ok_or(ClashyError::PostGone)?;
        let (byte, bit) = (n / 8, 1u8 << (n % 8));
        require!(b.posts[i].liked[byte] & bit == 0, ClashyError::AlreadyLiked);
        b.posts[i].liked[byte] |= bit;
        b.posts[i].likes += 1;
        Ok(())
    }

    // ------------------------------------------------------------------ clan chat (on the rollup)

    pub fn open_channel(ctx: Context<OpenChannel>, id: u8) -> Result<()> {
        require!(id < MAX_CHANNELS, ClashyError::BadChannel);
        let mut c = ctx.accounts.channel.load_init()?;
        c.clan = ctx.accounts.clan.key();
        c.id = id;
        c.count = 0;
        c.bump = ctx.bumps.channel;
        Ok(())
    }

    /// Moves a channel onto the MagicBlock rollup, where members post for free and instantly.
    pub fn delegate_channel(ctx: Context<DelegateChannel>, clan: Pubkey, id: u8) -> Result<()> {
        ctx.accounts.delegate_channel(
            &ctx.accounts.payer,
            &[CHANNEL_SEED, clan.as_ref(), &[id]],
            DelegateConfig { validator: ctx.remaining_accounts.first().map(|a| a.key()), ..Default::default() },
        )?;
        Ok(())
    }

    /// Posts to a clan channel (members only). Runs inside the rollup.
    pub fn post_message(ctx: Context<PostMessage>, text: String, kind: u8, refkey: Pubkey) -> Result<()> {
        let b = text.as_bytes();
        require!(!b.is_empty() && b.len() <= CHAT_TEXT, ClashyError::BadMessage);
        let now = Clock::get()?.unix_timestamp;
        let mut c = ctx.accounts.channel.load_mut()?;
        require_keys_eq!(c.clan, ctx.accounts.member.clan, ClashyError::NotMember);
        let i = (c.count % CHAT_MSGS as u64) as usize;
        let m = &mut c.msgs[i];
        m.author = ctx.accounts.author.key();
        m.refkey = refkey;
        m.ts = now;
        m.kind = kind;
        m.len = b.len() as u8;
        m.text = [0; CHAT_TEXT];
        m.text[..b.len()].copy_from_slice(b);
        c.count += 1;
        Ok(())
    }

    // ------------------------------------------------------------------ knockout duel

    /// Opens a duel and escrows the creator's stake. With a short expiry it is a quick-match
    /// ticket; with a long one it is an open challenge on the board.
    pub fn open_duel(ctx: Context<OpenDuel>, nonce: u64, stake: u64, pool_mask: u8, len_secs: u32, expires_in: i64, seed_hash: [u8; 32]) -> Result<()> {
        require!(stake >= MIN_STAKE, ClashyError::StakeTooLow);
        require!((MIN_DUEL_SECS..=MAX_DUEL_SECS).contains(&len_secs), ClashyError::BadLength);
        require!(expires_in > 0 && expires_in <= MAX_CHALLENGE_SECS, ClashyError::Expired);
        let cfg = &ctx.accounts.config;
        require!(math::pick_coin(&[0u8; 32], pool_mask, cfg.coin_count).is_some(), ClashyError::EmptyPool);
        check_stake(&mut ctx.accounts.profile, stake, Clock::get()?.unix_timestamp)?;
        pay_in(&ctx.accounts.token_program.to_account_info(), &ctx.accounts.creator_usdc.to_account_info(), &ctx.accounts.vault.to_account_info(), &ctx.accounts.creator.to_account_info(), stake)?;
        let d = &mut ctx.accounts.duel;
        d.rent_payer = ctx.accounts.payer.key();
        d.creator = ctx.accounts.creator.key();
        d.joiner = Pubkey::default();
        d.nonce = nonce;
        d.stake = stake;
        d.status = duel_status::OPEN;
        d.pool_mask = pool_mask;
        d.coin = NO_COIN;
        d.len_secs = len_secs;
        d.expires_at = Clock::get()?.unix_timestamp + expires_in;
        d.seed_hash[0] = seed_hash;
        d.bump = ctx.bumps.duel;
        d.vault_bump = ctx.bumps.vault;
        Ok(())
    }

    pub fn join_duel(ctx: Context<JoinDuel>, seed_hash: [u8; 32]) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let d = &mut ctx.accounts.duel;
        require!(d.status == duel_status::OPEN, ClashyError::WrongStatus);
        require!(now <= d.expires_at, ClashyError::Expired);
        require_keys_neq!(ctx.accounts.joiner.key(), d.creator, ClashyError::SelfJoin);
        check_stake(&mut ctx.accounts.profile, d.stake, now)?;
        pay_in(&ctx.accounts.token_program.to_account_info(), &ctx.accounts.joiner_usdc.to_account_info(), &ctx.accounts.vault.to_account_info(), &ctx.accounts.joiner.to_account_info(), d.stake)?;
        d.joiner = ctx.accounts.joiner.key();
        d.seed_hash[1] = seed_hash;
        d.status = duel_status::MATCHED;
        d.matched_at = now;
        Ok(())
    }

    /// Refunds an unmatched duel: the creator any time, anyone after expiry. No rake.
    pub fn cancel_duel(ctx: Context<CancelDuel>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let d = &ctx.accounts.duel;
        require!(d.status == duel_status::OPEN, ClashyError::WrongStatus);
        require!(ctx.accounts.signer.key() == d.creator || now > d.expires_at, ClashyError::NotExpired);
        let bump = ctx.accounts.config.auth_bump;
        let (tp, vault, auth) = (ctx.accounts.token_program.to_account_info(), ctx.accounts.vault.to_account_info(), ctx.accounts.auth.to_account_info());
        let amount = token_amount(&vault)?;
        pay_out(&tp, &vault, &ctx.accounts.creator_usdc.to_account_info(), &auth, bump, amount)?;
        close_vault(&tp, &vault, &ctx.accounts.rent_payer.to_account_info(), &auth, bump)?;
        ctx.accounts.duel.status = duel_status::CANCELLED;
        Ok(())
    }

    /// Anyone can end a duel that matched but never reached the rollup within DUEL_SETUP_SECS (a seed,
    /// pick or VRF answer never came). If both picks were committed and only one player revealed, the
    /// other forfeits: the revealer takes the pot minus rake. Otherwise both stakes are refunded.
    pub fn abort_duel(ctx: Context<AbortDuel>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let d = &ctx.accounts.duel;
        require!(d.status == duel_status::MATCHED || d.status == duel_status::ROLLED, ClashyError::WrongStatus);
        require!(now > d.matched_at + DUEL_SETUP_SECS, ClashyError::NotExpired);
        require_keys_eq!(ctx.accounts.treasury.key(), ctx.accounts.config.treasury, ClashyError::PayoutMismatch);
        let forfeit_to: u8 = if d.picks_committed == 0b11 && d.picks_revealed == 0b01 { 1 }
            else if d.picks_committed == 0b11 && d.picks_revealed == 0b10 { 2 } else { 0 };
        let stake = d.stake;
        let (bump, rake_bps) = (ctx.accounts.config.auth_bump, ctx.accounts.config.rake_bps);
        let (tp, vault, auth) = (ctx.accounts.token_program.to_account_info(), ctx.accounts.vault.to_account_info(), ctx.accounts.auth.to_account_info());
        if forfeit_to == 0 {
            pay_out(&tp, &vault, &ctx.accounts.creator_usdc.to_account_info(), &auth, bump, stake)?;
            let rest = token_amount(&vault)?;
            pay_out(&tp, &vault, &ctx.accounts.joiner_usdc.to_account_info(), &auth, bump, rest)?;
            ctx.accounts.duel.status = duel_status::CANCELLED;
        } else {
            let (_, rake) = math::split_rake(token_amount(&vault)?, rake_bps);
            pay_out(&tp, &vault, &ctx.accounts.treasury.to_account_info(), &auth, bump, rake)?;
            let dest = if forfeit_to == 1 { ctx.accounts.creator_usdc.to_account_info() } else { ctx.accounts.joiner_usdc.to_account_info() };
            let rest = token_amount(&vault)?;
            pay_out(&tp, &vault, &dest, &auth, bump, rest)?;
            let d = &mut ctx.accounts.duel;
            d.winner = forfeit_to;
            d.status = duel_status::SETTLED;
        }
        close_vault(&tp, &vault, &ctx.accounts.rent_payer.to_account_info(), &auth, bump)?;
        Ok(())
    }

    /// Asks MagicBlock VRF (base-layer queue) to roll the coin for both players.
    pub fn request_coin_roll(ctx: Context<RequestCoinRoll>, caller_seed: [u8; 32]) -> Result<()> {
        require_keys_eq!(ctx.accounts.oracle_queue.key(), ctx.accounts.config.vrf_queue, ClashyError::InvalidQueue);
        let d = &mut ctx.accounts.duel;
        require!(d.status == duel_status::MATCHED, ClashyError::WrongStatus);
        require!(!d.vrf_pending, ClashyError::VrfInflight);
        let signer = ctx.accounts.player.key();
        require!(signer == d.creator || signer == d.joiner, ClashyError::NotPlayer);
        d.vrf_pending = true;
        let duel_key = d.key();
        let seed = hashv(&[&caller_seed, duel_key.as_ref(), &Clock::get()?.slot.to_le_bytes()]).to_bytes();
        let ix = create_request_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: instruction::CoinRollCallback::DISCRIMINATOR.to_vec(),
            caller_seed: seed,
            accounts_metas: Some(vec![
                SerializableAccountMeta { pubkey: ctx.accounts.config.key(), is_signer: false, is_writable: false },
                SerializableAccountMeta { pubkey: duel_key, is_signer: false, is_writable: true },
            ]),
            callback_args: None,
        });
        ctx.accounts.duel.exit(&crate::ID)?;
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        Ok(())
    }

    /// VRF callback (only the VRF program can call it): picks the coin from the duel's pool.
    pub fn coin_roll_callback(ctx: Context<CoinRollCallback>, randomness: [u8; 32]) -> Result<()> {
        let count = ctx.accounts.config.coin_count;
        let d = &mut ctx.accounts.duel;
        require!(d.status == duel_status::MATCHED && d.vrf_pending, ClashyError::WrongStatus);
        d.vrf_pending = false;
        d.randomness = randomness;
        d.coin = math::pick_coin(&randomness, d.pool_mask, count).ok_or(ClashyError::EmptyPool)?;
        d.status = duel_status::ROLLED;
        Ok(())
    }

    /// Local fallback when no VRF oracle runs: both players reveal the seeds they committed at
    /// open/join and the coin comes from sha256(seed_a || seed_b). Refused when VRF is required.
    pub fn reveal_seed(ctx: Context<PlayerDuel>, seed: [u8; 32]) -> Result<()> {
        require!(!ctx.accounts.config.vrf_required, ClashyError::VrfRequired);
        let count = ctx.accounts.config.coin_count;
        let d = &mut ctx.accounts.duel;
        require!(d.status == duel_status::MATCHED, ClashyError::WrongStatus);
        let i = player_index(d, &ctx.accounts.signer.key())?;
        require!(d.seeds_revealed & (1 << i) == 0, ClashyError::AlreadyDone);
        require!(hashv(&[&seed]).to_bytes() == d.seed_hash[i], ClashyError::RevealMismatch);
        d.seed[i] = seed;
        d.seeds_revealed |= 1 << i;
        if d.seeds_revealed == 0b11 {
            let r = hashv(&[&d.seed[0], &d.seed[1]]).to_bytes();
            d.randomness = r;
            d.coin = math::pick_coin(&r, d.pool_mask, count).ok_or(ClashyError::EmptyPool)?;
            d.status = duel_status::ROLLED;
        }
        Ok(())
    }

    /// Seals a pick: hash = sha256(side || leverage_le || salt).
    pub fn commit_pick(ctx: Context<PlayerDuel>, hash: [u8; 32]) -> Result<()> {
        let d = &mut ctx.accounts.duel;
        require!(d.status == duel_status::ROLLED, ClashyError::WrongStatus);
        let i = player_index(d, &ctx.accounts.signer.key())?;
        require!(d.picks_committed & (1 << i) == 0, ClashyError::AlreadyDone);
        d.pick_hash[i] = hash;
        d.picks_committed |= 1 << i;
        Ok(())
    }

    pub fn reveal_pick(ctx: Context<PlayerDuel>, dir: u8, lev: u16, salt: [u8; 32]) -> Result<()> {
        let d = &mut ctx.accounts.duel;
        require!(d.status == duel_status::ROLLED, ClashyError::WrongStatus);
        require!(d.picks_committed == 0b11, ClashyError::CommitsPending);
        require!(dir == side::LONG || dir == side::SHORT, ClashyError::BadSide);
        require!(lev >= 1 && lev <= MAX_LEVERAGE, ClashyError::BadLeverage);
        let i = player_index(d, &ctx.accounts.signer.key())?;
        require!(d.picks_revealed & (1 << i) == 0, ClashyError::AlreadyDone);
        require!(hashv(&[&math::pick_preimage(&d.key(), &ctx.accounts.signer.key(), dir, lev, &salt)]).to_bytes() == d.pick_hash[i], ClashyError::RevealMismatch);
        d.side[i] = dir;
        d.lev[i] = lev;
        d.picks_revealed |= 1 << i;
        Ok(())
    }

    /// Hands the duel to the ER once both picks are revealed.
    pub fn delegate_duel(ctx: Context<DelegateDuel>, creator: Pubkey, nonce: u64) -> Result<()> {
        {
            // only a rolled duel with both picks revealed, only by one of its players, only to the pinned validator
            let info = &ctx.accounts.duel;
            require_keys_eq!(*info.owner, crate::ID, ClashyError::WrongStatus);
            let d = Duel::try_deserialize(&mut &info.try_borrow_data()?[..])?;
            require!(d.status == duel_status::ROLLED && d.picks_revealed == 0b11, ClashyError::WrongStatus);
            let who = ctx.accounts.player.key();
            require!(who == d.creator || who == d.joiner, ClashyError::NotPlayer);
        }
        let validator = ctx.accounts.config.er_validator;
        require!(validator != Pubkey::default(), ClashyError::NoValidator);
        ctx.accounts.delegate_duel(
            &ctx.accounts.payer,
            &[DUEL_SEED, creator.as_ref(), &nonce.to_le_bytes()],
            DelegateConfig { validator: Some(validator), ..Default::default() },
        )?;
        Ok(())
    }

    /// ER: sets the entry price from the live feed and starts the clock.
    pub fn start_duel(ctx: Context<RunDuel>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let feed = coin_feed(&ctx.accounts.config, ctx.accounts.duel.coin)?;
        let price = price::read_price(&ctx.accounts.price.to_account_info(), &feed, now, MAX_ER_PRICE_AGE)?;
        let d = &mut ctx.accounts.duel;
        require!(d.status == duel_status::ROLLED && d.picks_revealed == 0b11, ClashyError::WrongStatus);
        d.entry_price = price;
        d.start_ts = now;
        d.status = duel_status::LIVE;
        Ok(())
    }

    /// ER, permissionless (a crank or either player): scores both sides at the live price. When
    /// someone is knocked out or the clock runs out, the duel finishes, is committed and goes home.
    pub fn check_duel(ctx: Context<CheckDuel>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let feed = coin_feed(&ctx.accounts.config, ctx.accounts.duel.coin)?;
        let price = price::read_price(&ctx.accounts.price.to_account_info(), &feed, now, MAX_ER_PRICE_AGE)?;
        let finished = {
            let d = &mut ctx.accounts.duel;
            require!(d.status == duel_status::LIVE, ClashyError::WrongStatus);
            d.pnl_bps[0] = math::pnl_bps(d.entry_price, price, d.side[0], d.lev[0]);
            d.pnl_bps[1] = math::pnl_bps(d.entry_price, price, d.side[1], d.lev[1]);
            d.exit_price = price;
            let ko = d.pnl_bps[0] <= -BPS || d.pnl_bps[1] <= -BPS;
            if ko || now >= d.start_ts + d.len_secs as i64 {
                finish_duel(d, price, now);
                emit!(DuelFinished { duel: d.key(), coin: d.coin, entry_price: d.entry_price, exit_price: price, pnl_bps: d.pnl_bps, ko: d.ko, winner: d.winner });
                true
            } else {
                false
            }
        };
        if finished {
            ctx.accounts.duel.exit(&crate::ID)?;
            MagicIntentBundleBuilder::new(
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.magic_context.to_account_info(),
                ctx.accounts.magic_program.to_account_info(),
            )
            .commit_and_undelegate(&[ctx.accounts.duel.to_account_info()])
            .build_and_invoke()?;
        }
        Ok(())
    }

    /// Solana: pays the pot (minus rake) to the winner, or refunds both on a tie; updates ratings.
    pub fn settle_duel(ctx: Context<SettleDuel>) -> Result<()> {
        let d = &ctx.accounts.duel;
        require!(d.status == duel_status::FINISHED, ClashyError::WrongStatus);
        let duel_key = d.key();
        let (bump, rake_bps) = (ctx.accounts.config.auth_bump, ctx.accounts.config.rake_bps);
        let (tp, vault, auth) = (ctx.accounts.token_program.to_account_info(), ctx.accounts.vault.to_account_info(), ctx.accounts.auth.to_account_info());
        let pot = token_amount(&vault)?;
        let winner = d.winner;
        let (paid, rake) = match winner {
            1 | 2 => {
                let (to_winner, rake) = math::split_rake(pot, rake_bps);
                let dest = if winner == 1 { ctx.accounts.creator_usdc.to_account_info() } else { ctx.accounts.joiner_usdc.to_account_info() };
                pay_out(&tp, &vault, &ctx.accounts.treasury.to_account_info(), &auth, bump, rake)?;
                pay_out(&tp, &vault, &dest, &auth, bump, to_winner)?;
                (to_winner, rake)
            }
            _ => {
                let half = pot / 2;
                pay_out(&tp, &vault, &ctx.accounts.creator_usdc.to_account_info(), &auth, bump, half)?;
                pay_out(&tp, &vault, &ctx.accounts.joiner_usdc.to_account_info(), &auth, bump, pot - half)?;
                (pot, 0)
            }
        };
        close_vault(&tp, &vault, &ctx.accounts.rent_payer.to_account_info(), &auth, bump)?;
        update_players(&mut ctx.accounts.creator_player, &mut ctx.accounts.joiner_player, winner);
        ctx.accounts.duel.status = duel_status::SETTLED;
        emit!(DuelSettled { duel: duel_key, winner, paid, rake });
        Ok(())
    }

    // ------------------------------------------------------------------ clans

    pub fn create_clan(ctx: Context<CreateClan>, name: String, crest: u8) -> Result<()> {
        let bytes = name.as_bytes();
        require!(!bytes.is_empty() && bytes.len() <= CLAN_NAME_LEN, ClashyError::BadName);
        let mut fixed = [0u8; CLAN_NAME_LEN];
        fixed[..bytes.len()].copy_from_slice(bytes);
        let clan_key = ctx.accounts.clan.key();
        let c = &mut ctx.accounts.clan;
        c.name = fixed;
        c.captain = ctx.accounts.founder.key();
        c.crest = crest;
        c.members = 1;
        c.chest = 0;
        c.shares = 0;
        c.score_pnl = 0;
        c.proposals = 0;
        c.positions_open = 0;
        c.open_votes = 0;
        c.war = Pubkey::default();
        c.bump = ctx.bumps.clan;
        c.chest_bump = ctx.bumps.chest;
        let m = &mut ctx.accounts.member;
        m.clan = clan_key;
        m.wallet = ctx.accounts.founder.key();
        m.deposit = 0;
        m.shares = 0;
        m.joined_at = Clock::get()?.unix_timestamp;
        m.bump = ctx.bumps.member;
        m.rent_payer = ctx.accounts.payer.key();
        // a player can be in any number of squads (each membership is its own Member account); the first one is their main squad
        if ctx.accounts.player.clan == Pubkey::default() {
            ctx.accounts.player.clan = clan_key;
        }
        Ok(())
    }

    pub fn join_clan(ctx: Context<JoinClan>) -> Result<()> {
        let clan_key = ctx.accounts.clan.key();
        let m = &mut ctx.accounts.member;
        m.clan = clan_key;
        m.wallet = ctx.accounts.wallet.key();
        m.deposit = 0;
        m.shares = 0;
        m.joined_at = Clock::get()?.unix_timestamp;
        m.bump = ctx.bumps.member;
        m.rent_payer = ctx.accounts.payer.key();
        ctx.accounts.clan.members += 1;
        // a player can be in any number of squads (each membership is its own Member account); the first one is their main squad
        if ctx.accounts.player.clan == Pubkey::default() {
            ctx.accounts.player.clan = clan_key;
        }
        Ok(())
    }

    /// Leaves the clan. Withdraw your deposit first; the captain leaves last.
    pub fn leave_clan(ctx: Context<LeaveClan>) -> Result<()> {
        require!(ctx.accounts.member.shares == 0, ClashyError::ChestTooLow);
        let c = &mut ctx.accounts.clan;
        if ctx.accounts.wallet.key() == c.captain {
            require!(c.members == 1, ClashyError::NotCaptain);
        }
        c.members -= 1;
        if ctx.accounts.player.clan == c.key() {
            ctx.accounts.player.clan = Pubkey::default();
        }
        Ok(())
    }

    pub fn deposit_chest(ctx: Context<ChestMove>, amount: u64) -> Result<()> {
        require!(amount > 0, ClashyError::StakeTooLow);
        // no deposits during a war: the stake is out of the chest, so shares would be mispriced
        require!(ctx.accounts.clan.war == Pubkey::default(), ClashyError::WarLocked);
        let minted = math::shares_for_deposit(amount, ctx.accounts.clan.chest, ctx.accounts.clan.shares).ok_or(ClashyError::ChestTooLow)?;
        require!(minted > 0, ClashyError::StakeTooLow);
        pay_in(&ctx.accounts.token_program.to_account_info(), &ctx.accounts.wallet_usdc.to_account_info(), &ctx.accounts.chest.to_account_info(), &ctx.accounts.wallet.to_account_info(), amount)?;
        let m = &mut ctx.accounts.member;
        m.deposit += amount;
        m.shares += minted;
        let c = &mut ctx.accounts.clan;
        c.chest += amount;
        c.shares += minted;
        Ok(())
    }

    /// Redeems `shares` of your chest shares for their pro-rata part of the chest, so war wins and
    /// losses are shared by every member whatever order they leave in. Blocked while at war.
    pub fn withdraw_chest(ctx: Context<ChestMove>, shares: u64) -> Result<()> {
        let c = &ctx.accounts.clan;
        require!(c.war == Pubkey::default(), ClashyError::WarLocked);
        require!(c.open_votes == 0, ClashyError::VoteOpen);
        let held = ctx.accounts.member.shares;
        require!(shares > 0 && shares <= held, ClashyError::NotEnoughShares);
        // the last redeemer takes everything left in the chest, so a stray transfer cannot strand it
        let payout = if shares == c.shares { token_amount(&ctx.accounts.chest.to_account_info())? } else { math::payout_for_shares(shares, c.chest, c.shares) };
        require!(payout > 0, ClashyError::ChestTooLow);
        pay_out(&ctx.accounts.token_program.to_account_info(), &ctx.accounts.chest.to_account_info(), &ctx.accounts.wallet_usdc.to_account_info(), &ctx.accounts.auth.to_account_info(), ctx.accounts.config.auth_bump, payout)?;
        let m = &mut ctx.accounts.member;
        m.deposit -= (m.deposit as u128 * shares as u128 / held as u128) as u64;
        m.shares -= shares;
        let c = &mut ctx.accounts.clan;
        c.chest = c.chest.saturating_sub(payout);
        c.shares -= shares;
        if c.shares == 0 {
            c.chest = 0;
        }
        Ok(())
    }

    /// Group trading: a member proposes a trade on the chest.
    pub fn propose(ctx: Context<Propose>, coin: u8, dir: u8, lev: u16, size_bps: u16, vote_secs: i64) -> Result<()> {
        coin_feed(&ctx.accounts.config, coin)?;
        require!(dir == side::LONG || dir == side::SHORT, ClashyError::BadSide);
        require!(lev >= 1 && lev <= MAX_CLAN_LEV, ClashyError::BadLeverage);
        require!(size_bps >= 100 && size_bps as i64 <= BPS, ClashyError::BadSize);
        require!((MIN_VOTE_SECS..=MAX_VOTE_SECS).contains(&vote_secs), ClashyError::BadVoteWindow);
        let clan = &mut ctx.accounts.clan;
        let id = clan.proposals;
        clan.proposals += 1;
        let p = &mut ctx.accounts.proposal;
        p.clan = clan.key();
        p.id = id;
        p.proposer = ctx.accounts.wallet.key();
        p.coin = coin;
        p.side = dir;
        p.lev = lev;
        p.size_bps = size_bps;
        p.yes = 0;
        p.no = 0;
        p.deadline = Clock::get()?.unix_timestamp + vote_secs;
        p.status = proposal_status::OPEN;
        p.bump = ctx.bumps.proposal;
        ctx.accounts.clan.open_votes += 1;
        Ok(())
    }

    /// Votes are weighted by the member's chest shares; one vote per member per proposal.
    pub fn vote(ctx: Context<CastVote>, yes: bool) -> Result<()> {
        let weight = ctx.accounts.member.shares;
        require!(weight > 0, ClashyError::NoWeight);
        let p = &mut ctx.accounts.proposal;
        require!(p.status == proposal_status::OPEN, ClashyError::WrongStatus);
        require!(Clock::get()?.unix_timestamp <= p.deadline, ClashyError::VotingClosed);
        if yes {
            p.yes += weight;
        } else {
            p.no += weight;
        }
        let v = &mut ctx.accounts.vote;
        v.proposal = p.key();
        v.voter = ctx.accounts.wallet.key();
        v.yes = yes;
        v.weight = weight;
        v.bump = ctx.bumps.vote;
        Ok(())
    }

    /// Captain executes a passed proposal at the oracle price: opens a scored clan position.
    /// Passed = more yes than no, and either the window closed or yes holds over half of all shares.
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let chest = ctx.accounts.clan.chest;
        let shares = ctx.accounts.clan.shares;
        let p = &ctx.accounts.proposal;
        require!(p.status == proposal_status::OPEN, ClashyError::WrongStatus);
        require!(p.yes > p.no, ClashyError::NotPassed);
        // votes are in shares: early execution needs yes from over half of all shares
        require!(now > p.deadline || (p.yes as u128) * 2 > shares as u128, ClashyError::VotingOpen);
        if ctx.accounts.clan.war != Pubkey::default() {
            // at war: positions may only open inside the war window
            let w = ctx.accounts.war.as_ref().ok_or(ClashyError::WarLocked)?;
            require_keys_eq!(w.key(), ctx.accounts.clan.war, ClashyError::WarLocked);
            require!(w.status != war_status::LIVE || now < w.end_ts, ClashyError::WarLocked);
        }
        let price = solana_price(&ctx.accounts.config, p.coin, &ctx.accounts.price.to_account_info(), now)?;
        let notional = (chest as u128 * p.size_bps as u128 / BPS as u128) as u64;
        require!(notional > 0, ClashyError::ChestTooLow);
        let pos = &mut ctx.accounts.position;
        pos.clan = ctx.accounts.clan.key();
        pos.proposal = p.id;
        pos.coin = p.coin;
        pos.side = p.side;
        pos.lev = p.lev;
        pos.notional = notional;
        pos.entry_price = price;
        pos.opened_at = now;
        pos.open = true;
        pos.bump = ctx.bumps.position;
        ctx.accounts.proposal.status = proposal_status::EXECUTED;
        ctx.accounts.clan.positions_open += 1;
        ctx.accounts.clan.open_votes -= 1;
        Ok(())
    }

    /// Anyone can close a proposal that failed once its window is over.
    pub fn reject_proposal(ctx: Context<RejectProposal>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let p = &mut ctx.accounts.proposal;
        require!(p.status == proposal_status::OPEN, ClashyError::WrongStatus);
        // a failed vote once its window closes, or any vote the captain left unexecuted past the grace period
        require!((now > p.deadline && p.yes <= p.no) || now > p.deadline + EXECUTE_GRACE_SECS, ClashyError::VotingOpen);
        p.status = proposal_status::REJECTED;
        ctx.accounts.clan.open_votes -= 1;
        Ok(())
    }

    /// Captain closes a clan position at the oracle price; the P&L feeds the clan's score.
    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let pos = &ctx.accounts.position;
        require!(pos.open, ClashyError::WrongStatus);
        if ctx.accounts.closer.key() != ctx.accounts.clan.captain {
            // anyone may close a clan's positions once its war window is over, so a war can always settle
            let w = ctx.accounts.war.as_ref().ok_or(ClashyError::NotCaptain)?;
            require_keys_eq!(w.key(), ctx.accounts.clan.war, ClashyError::NotCaptain);
            require!(now >= w.end_ts && w.status == war_status::LIVE, ClashyError::NotCaptain);
        }
        let price = solana_price(&ctx.accounts.config, pos.coin, &ctx.accounts.price.to_account_info(), now)?;
        let pnl = math::position_pnl(pos.notional, pos.entry_price, price, pos.side, pos.lev);
        let pos = &mut ctx.accounts.position;
        pos.exit_price = price;
        pos.closed_at = now;
        pos.pnl = pnl;
        pos.open = false;
        let c = &mut ctx.accounts.clan;
        c.score_pnl = c.score_pnl.checked_add(pnl).ok_or(ClashyError::Overflow)?;
        c.positions_open -= 1;
        Ok(())
    }

    // ------------------------------------------------------------------ clan war

    pub fn declare_war(ctx: Context<DeclareWar>, nonce: u64, stake: u64, duration: i64) -> Result<()> {
        require!((MIN_WAR_SECS..=MAX_WAR_SECS).contains(&duration), ClashyError::BadWarLength);
        require!(stake >= MIN_STAKE, ClashyError::StakeTooLow);
        let a = &ctx.accounts.clan_a;
        require_keys_neq!(a.key(), ctx.accounts.clan_b.key(), ClashyError::SelfWar);
        require!(a.war == Pubkey::default(), ClashyError::WarLocked);
        require!(a.chest >= stake, ClashyError::ChestTooLow);
        require!(stake <= a.chest / 2, ClashyError::WarStakeTooBig);
        let a_key = a.key();
        pay_out(&ctx.accounts.token_program.to_account_info(), &ctx.accounts.chest_a.to_account_info(), &ctx.accounts.vault.to_account_info(), &ctx.accounts.auth.to_account_info(), ctx.accounts.config.auth_bump, stake)?;
        let war_key = ctx.accounts.war.key();
        let w = &mut ctx.accounts.war;
        w.clan_a = a_key;
        w.clan_b = ctx.accounts.clan_b.key();
        w.nonce = nonce;
        w.stake = stake;
        w.duration = duration;
        w.status = war_status::DECLARED;
        w.bump = ctx.bumps.war;
        w.vault_bump = ctx.bumps.vault;
        w.rent_payer = ctx.accounts.payer.key();
        let a = &mut ctx.accounts.clan_a;
        a.chest -= stake;
        a.war = war_key;
        Ok(())
    }

    pub fn accept_war(ctx: Context<AcceptWar>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(ctx.accounts.war.status == war_status::DECLARED, ClashyError::WrongStatus);
        let stake = ctx.accounts.war.stake;
        let b = &ctx.accounts.clan_b;
        require!(b.war == Pubkey::default(), ClashyError::WarLocked);
        require!(b.chest >= stake, ClashyError::ChestTooLow);
        require!(stake <= b.chest / 2, ClashyError::WarStakeTooBig);
        // only trades opened during the war count, so both clans start flat
        require!(b.positions_open == 0 && ctx.accounts.clan_a.positions_open == 0, ClashyError::PositionsOpen);
        pay_out(&ctx.accounts.token_program.to_account_info(), &ctx.accounts.chest_b.to_account_info(), &ctx.accounts.vault.to_account_info(), &ctx.accounts.auth.to_account_info(), ctx.accounts.config.auth_bump, stake)?;
        let war_key = ctx.accounts.war.key();
        let b = &mut ctx.accounts.clan_b;
        b.chest -= stake;
        b.war = war_key;
        let (sa, ca, sb, cb) = (ctx.accounts.clan_a.score_pnl, ctx.accounts.clan_a.chest + stake, ctx.accounts.clan_b.score_pnl, ctx.accounts.clan_b.chest + stake);
        let w = &mut ctx.accounts.war;
        w.start_ts = now;
        w.end_ts = now + w.duration;
        w.base_a = sa;
        w.base_b = sb;
        w.chest_a = ca;
        w.chest_b = cb;
        w.status = war_status::LIVE;
        Ok(())
    }

    /// The declaring captain withdraws an unaccepted war; the stake goes back to the chest.
    pub fn cancel_war(ctx: Context<CancelWar>) -> Result<()> {
        let w = &ctx.accounts.war;
        require!(w.status == war_status::DECLARED, ClashyError::WrongStatus);
        let bump = ctx.accounts.config.auth_bump;
        let (tp, vault, auth) = (ctx.accounts.token_program.to_account_info(), ctx.accounts.vault.to_account_info(), ctx.accounts.auth.to_account_info());
        let amount = token_amount(&vault)?;
        pay_out(&tp, &vault, &ctx.accounts.chest_a.to_account_info(), &auth, bump, amount)?;
        close_vault(&tp, &vault, &ctx.accounts.rent_payer.to_account_info(), &auth, bump)?;
        let a = &mut ctx.accounts.clan_a;
        a.chest += amount;
        a.war = Pubkey::default();
        ctx.accounts.war.status = war_status::CANCELLED;
        Ok(())
    }

    /// After the window: the clan with the better return (score change over starting chest) takes
    /// the pot minus rake into its chest; a tie refunds both.
    pub fn settle_war(ctx: Context<SettleWar>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let w = &ctx.accounts.war;
        require!(w.status == war_status::LIVE, ClashyError::WrongStatus);
        require!(now >= w.end_ts, ClashyError::WarNotOver);
        // open positions would let a captain bank winners and park losers; everything must be closed
        require!(ctx.accounts.clan_a.positions_open == 0 && ctx.accounts.clan_b.positions_open == 0, ClashyError::PositionsOpen);
        let ra = math::war_return_bps(ctx.accounts.clan_a.score_pnl, w.base_a, w.chest_a);
        let rb = math::war_return_bps(ctx.accounts.clan_b.score_pnl, w.base_b, w.chest_b);
        let winner = if ra > rb { 1 } else if rb > ra { 2 } else { 3 };
        let (bump, rake_bps) = (ctx.accounts.config.auth_bump, ctx.accounts.config.rake_bps);
        let (tp, vault, auth) = (ctx.accounts.token_program.to_account_info(), ctx.accounts.vault.to_account_info(), ctx.accounts.auth.to_account_info());
        let pot = token_amount(&vault)?;
        match winner {
            1 | 2 => {
                let (to_winner, rake) = math::split_rake(pot, rake_bps);
                let dest = if winner == 1 { ctx.accounts.chest_a.to_account_info() } else { ctx.accounts.chest_b.to_account_info() };
                pay_out(&tp, &vault, &ctx.accounts.treasury.to_account_info(), &auth, bump, rake)?;
                pay_out(&tp, &vault, &dest, &auth, bump, to_winner)?;
                if winner == 1 {
                    ctx.accounts.clan_a.chest += to_winner;
                    ctx.accounts.clan_a.wins += 1;
                    ctx.accounts.clan_b.losses += 1;
                } else {
                    ctx.accounts.clan_b.chest += to_winner;
                    ctx.accounts.clan_b.wins += 1;
                    ctx.accounts.clan_a.losses += 1;
                }
            }
            _ => {
                let half = pot / 2;
                pay_out(&tp, &vault, &ctx.accounts.chest_a.to_account_info(), &auth, bump, half)?;
                pay_out(&tp, &vault, &ctx.accounts.chest_b.to_account_info(), &auth, bump, pot - half)?;
                ctx.accounts.clan_a.chest += half;
                ctx.accounts.clan_b.chest += pot - half;
            }
        }
        close_vault(&tp, &vault, &ctx.accounts.rent_payer.to_account_info(), &auth, bump)?;
        ctx.accounts.clan_a.war = Pubkey::default();
        ctx.accounts.clan_b.war = Pubkey::default();
        let w = &mut ctx.accounts.war;
        w.return_bps = [ra, rb];
        w.winner = winner;
        w.status = war_status::SETTLED;
        Ok(())
    }

    // ------------------------------------------------------------------ tournaments (Royale)

    pub fn create_tournament(ctx: Context<CreateTournament>, nonce: u64, entry: u64, max_players: u8, coin: u8, start_lives: u8, max_rounds: u16, round_secs: u32) -> Result<()> {
        require!(entry >= MIN_STAKE, ClashyError::StakeTooLow);
        require!(max_players >= 2 && max_players as usize <= MAX_TOUR_PLAYERS, ClashyError::TooFewPlayers);
        require!((MIN_ROUND_SECS..=MAX_ROUND_SECS).contains(&round_secs), ClashyError::BadLength);
        require!(max_rounds >= 1 && max_rounds <= MAX_ROUNDS && start_lives >= 1, ClashyError::BadLength);
        if coin != NO_COIN {
            require!(!ctx.accounts.config.vrf_required, ClashyError::VrfRequired);
            coin_feed(&ctx.accounts.config, coin)?;
        }
        let t = &mut ctx.accounts.tournament;
        t.creator = ctx.accounts.creator.key();
        t.nonce = nonce;
        t.entry = entry;
        t.coin = coin;
        t.max_players = max_players;
        t.count = 0;
        t.start_lives = start_lives;
        t.max_rounds = max_rounds;
        t.round_secs = round_secs;
        t.status = tour_status::OPEN;
        t.bump = ctx.bumps.tournament;
        t.vault_bump = ctx.bumps.vault;
        t.created_at = Clock::get()?.unix_timestamp;
        t.rent_payer = ctx.accounts.payer.key();
        Ok(())
    }

    pub fn join_tournament(ctx: Context<JoinTournament>) -> Result<()> {
        let t = &ctx.accounts.tournament;
        require!(t.status == tour_status::OPEN, ClashyError::WrongStatus);
        require!((t.count as usize) < t.max_players as usize, ClashyError::TourFull);
        let me = ctx.accounts.player.key();
        require!(!t.players[..t.count as usize].contains(&me), ClashyError::AlreadyJoined);
        let entry = t.entry;
        check_stake(&mut ctx.accounts.profile, entry, Clock::get()?.unix_timestamp)?;
        pay_in(&ctx.accounts.token_program.to_account_info(), &ctx.accounts.player_usdc.to_account_info(), &ctx.accounts.vault.to_account_info(), &ctx.accounts.player.to_account_info(), t.entry)?;
        let t = &mut ctx.accounts.tournament;
        let i = t.count as usize;
        t.players[i] = me;
        t.lives[i] = t.start_lives;
        t.count += 1;
        Ok(())
    }

    /// Creator cancels an unstarted tournament; remaining accounts are every player's USDC token account in join order.
    pub fn cancel_tournament<'info>(ctx: Context<'_, '_, 'info, 'info, CancelTournament<'info>>) -> Result<()> {
        let t = &ctx.accounts.tournament;
        require!(t.status == tour_status::OPEN, ClashyError::WrongStatus);
        // the creator any time; anyone once the lobby is stale, so entries cannot be held hostage
        let now = Clock::get()?.unix_timestamp;
        require!(ctx.accounts.signer.key() == t.creator || now > t.created_at + TOUR_LOBBY_SECS, ClashyError::NotExpired);
        require!(ctx.remaining_accounts.len() == t.count as usize, ClashyError::PayoutMismatch);
        let (bump, mint) = (ctx.accounts.config.auth_bump, ctx.accounts.config.usdc_mint);
        let (tp, vault, auth) = (ctx.accounts.token_program.to_account_info(), ctx.accounts.vault.to_account_info(), ctx.accounts.auth.to_account_info());
        let n = ctx.remaining_accounts.len();
        for (i, acc) in ctx.remaining_accounts.iter().enumerate() {
            check_usdc_account(acc, &t.players[i], &mint)?;
            let amount = if i + 1 == n { token_amount(&vault)? } else { t.entry };
            pay_out(&tp, &vault, acc, &auth, bump, amount)?;
        }
        close_vault(&tp, &vault, &ctx.accounts.rent_payer.to_account_info(), &auth, bump)?;
        ctx.accounts.tournament.status = tour_status::CANCELLED;
        Ok(())
    }

    /// Asks MagicBlock VRF to roll the tournament's coin (required on devnet / mainnet).
    pub fn request_tournament_coin(ctx: Context<RequestTournamentCoin>, caller_seed: [u8; 32]) -> Result<()> {
        require_keys_eq!(ctx.accounts.oracle_queue.key(), ctx.accounts.config.vrf_queue, ClashyError::InvalidQueue);
        let t = &mut ctx.accounts.tournament;
        require!(t.status == tour_status::OPEN && t.coin == NO_COIN && !t.vrf_pending, ClashyError::WrongStatus);
        require_keys_eq!(ctx.accounts.creator.key(), t.creator, ClashyError::Unauthorized);
        t.vrf_pending = true;
        let key = t.key();
        let seed = hashv(&[&caller_seed, key.as_ref(), &Clock::get()?.slot.to_le_bytes()]).to_bytes();
        let ix = create_request_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: instruction::TournamentCoinCallback::DISCRIMINATOR.to_vec(),
            caller_seed: seed,
            accounts_metas: Some(vec![
                SerializableAccountMeta { pubkey: ctx.accounts.config.key(), is_signer: false, is_writable: false },
                SerializableAccountMeta { pubkey: key, is_signer: false, is_writable: true },
            ]),
            callback_args: None,
        });
        ctx.accounts.tournament.exit(&crate::ID)?;
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        Ok(())
    }

    pub fn tournament_coin_callback(ctx: Context<TournamentCoinCallback>, randomness: [u8; 32]) -> Result<()> {
        let count = ctx.accounts.config.coin_count;
        let t = &mut ctx.accounts.tournament;
        require!(t.vrf_pending, ClashyError::WrongStatus);
        t.vrf_pending = false;
        t.coin = math::pick_coin(&randomness, 0xff, count).ok_or(ClashyError::EmptyPool)?;
        Ok(())
    }

    pub fn delegate_tournament(ctx: Context<DelegateTournament>, creator: Pubkey, nonce: u64) -> Result<()> {
        {
            // only an open lobby with its coin rolled and two or more players, only by its creator
            let info = &ctx.accounts.tournament;
            require_keys_eq!(*info.owner, crate::ID, ClashyError::WrongStatus);
            let t = Tournament::try_deserialize(&mut &info.try_borrow_data()?[..])?;
            require!(t.status == tour_status::OPEN && t.coin != NO_COIN, ClashyError::WrongStatus);
            require!(t.count >= 2, ClashyError::TooFewPlayers);
            require_keys_eq!(ctx.accounts.host.key(), t.creator, ClashyError::Unauthorized);
        }
        let validator = ctx.accounts.config.er_validator;
        require!(validator != Pubkey::default(), ClashyError::NoValidator);
        ctx.accounts.delegate_tournament(
            &ctx.accounts.payer,
            &[TOUR_SEED, creator.as_ref(), &nonce.to_le_bytes()],
            DelegateConfig { validator: Some(validator), ..Default::default() },
        )?;
        Ok(())
    }

    /// ER, creator: starts round 1 at the live price.
    pub fn start_tournament(ctx: Context<RunTournament>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let t = &ctx.accounts.tournament;
        require!(t.status == tour_status::OPEN && t.coin != NO_COIN, ClashyError::WrongStatus);
        require!(t.count >= 2, ClashyError::TooFewPlayers);
        require_keys_eq!(ctx.accounts.signer.key(), t.creator, ClashyError::Unauthorized);
        let feed = coin_feed(&ctx.accounts.config, t.coin)?;
        let price = price::read_price(&ctx.accounts.price.to_account_info(), &feed, now, MAX_ER_PRICE_AGE)?;
        let t = &mut ctx.accounts.tournament;
        t.alive = t.count;
        t.round = 1;
        t.round_price = price;
        t.round_started_at = now;
        t.calls = [0; MAX_TOUR_PLAYERS];
        t.status = tour_status::LIVE;
        Ok(())
    }

    /// ER, player: calls up (1) or down (2) for the current round. Can be changed until the bell.
    pub fn call_round(ctx: Context<CallRound>, dir: u8) -> Result<()> {
        require!(dir == 1 || dir == 2, ClashyError::BadSide);
        let now = Clock::get()?.unix_timestamp;
        let t = &mut ctx.accounts.tournament;
        require!(t.status == tour_status::LIVE, ClashyError::WrongStatus);
        require!(now < t.round_started_at + t.round_secs as i64, ClashyError::RoundOver);
        let me = ctx.accounts.player.key();
        let i = t.players[..t.count as usize].iter().position(|p| *p == me).ok_or(ClashyError::NotPlayer)?;
        require!(t.lives[i] > 0, ClashyError::Eliminated);
        t.calls[i] = dir;
        Ok(())
    }

    /// ER, permissionless after the bell: wrong or missing calls lose a life. When one player (or
    /// none) is left, or the last round ends, the tournament finishes and goes back to Solana.
    pub fn resolve_round(ctx: Context<ResolveRound>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let coin = ctx.accounts.tournament.coin;
        let feed = coin_feed(&ctx.accounts.config, coin)?;
        let price = price::read_price(&ctx.accounts.price.to_account_info(), &feed, now, MAX_ER_PRICE_AGE)?;
        let finished = {
            let t = &mut ctx.accounts.tournament;
            require!(t.status == tour_status::LIVE, ClashyError::WrongStatus);
            require!(now >= t.round_started_at + t.round_secs as i64, ClashyError::RoundRunning);
            let start = t.round_price;
            let before = t.lives;
            let mut alive = 0u8;
            for i in 0..t.count as usize {
                if t.lives[i] == 0 {
                    continue;
                }
                if !math::royale_call_ok(t.calls[i], start, price) {
                    t.lives[i] -= 1;
                }
                if t.lives[i] > 0 {
                    alive += 1;
                }
            }
            emit!(RoundResolved { tournament: t.key(), round: t.round, start_price: start, end_price: price, alive });
            if alive == 0 {
                // everyone fell in the same round: the survivors of the previous round share the win
                t.lives = before;
                for i in 0..t.count as usize {
                    if t.lives[i] > 0 {
                        t.lives[i] = 1;
                    }
                }
                alive = t.lives[..t.count as usize].iter().filter(|l| **l > 0).count() as u8;
            }
            t.alive = alive;
            t.calls = [0; MAX_TOUR_PLAYERS];
            if alive <= 1 || t.round >= t.max_rounds {
                t.status = tour_status::FINISHED;
                true
            } else {
                t.round += 1;
                t.round_price = price;
                t.round_started_at = now;
                false
            }
        };
        if finished {
            ctx.accounts.tournament.exit(&crate::ID)?;
            MagicIntentBundleBuilder::new(
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.magic_context.to_account_info(),
                ctx.accounts.magic_program.to_account_info(),
            )
            .commit_and_undelegate(&[ctx.accounts.tournament.to_account_info()])
            .build_and_invoke()?;
        }
        Ok(())
    }

    /// Solana: players left with the most lives split the pot minus rake. Remaining accounts are
    /// every player's USDC token account in join order.
    pub fn settle_tournament<'info>(ctx: Context<'_, '_, 'info, 'info, SettleTournament<'info>>) -> Result<()> {
        let t = &ctx.accounts.tournament;
        require!(t.status == tour_status::FINISHED, ClashyError::WrongStatus);
        require!(ctx.remaining_accounts.len() == t.count as usize, ClashyError::PayoutMismatch);
        let n = t.count as usize;
        let top = *t.lives[..n].iter().max().unwrap_or(&0);
        let winners: Vec<usize> = (0..n).filter(|i| top > 0 && t.lives[*i] == top).collect();
        let (bump, rake_bps, mint) = (ctx.accounts.config.auth_bump, ctx.accounts.config.rake_bps, ctx.accounts.config.usdc_mint);
        let (tp, vault, auth) = (ctx.accounts.token_program.to_account_info(), ctx.accounts.vault.to_account_info(), ctx.accounts.auth.to_account_info());
        // every account must be that player's own USDC account, winner or not, so the list cannot be shuffled
        for (i, acc) in ctx.remaining_accounts.iter().enumerate() {
            check_usdc_account(acc, &t.players[i], &mint)?;
        }
        let pot = token_amount(&vault)?;
        // nobody standing (cannot happen after a resolved round, but never strand the pot): all of it is rake
        let (to_winners, rake) = if winners.is_empty() { (0, pot) } else { math::split_rake(pot, rake_bps) };
        pay_out(&tp, &vault, &ctx.accounts.treasury.to_account_info(), &auth, bump, rake)?;
        let share = to_winners / winners.len().max(1) as u64;
        for (k, i) in winners.iter().enumerate() {
            let acc = &ctx.remaining_accounts[*i];
            let amount = if k == winners.len() - 1 { to_winners - share * (winners.len() as u64 - 1) } else { share };
            pay_out(&tp, &vault, acc, &auth, bump, amount)?;
        }
        close_vault(&tp, &vault, &ctx.accounts.rent_payer.to_account_info(), &auth, bump)?;
        ctx.accounts.tournament.status = tour_status::SETTLED;
        Ok(())
    }
}

// ====================================================================== accounts
//
// Money accounts: `vault` / `chest` are USDC token accounts at program PDAs, owned by the `auth` PDA.
// `payer` is whoever pays rent and fees (the sponsor in the app), never the source of a stake: stakes
// always come from the player's own USDC token account, signed by the player.

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    /// The stake currency (USDC).
    pub usdc_mint: Account<'info, Mint>,
    /// CHECK: the PDA that owns every vault token account; only its bump is stored.
    #[account(seeds = [AUTH_SEED], bump)]
    pub auth: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ ClashyError::Unauthorized)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(coin: u8)]
pub struct InitFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ ClashyError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(init, payer = authority, space = 8 + PriceFeed::INIT_SPACE, seeds = [FEED_SEED, &[coin]], bump)]
    pub feed: Account<'info, PriceFeed>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PushPrice<'info> {
    pub crank: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, constraint = config.crank == crank.key() @ ClashyError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [FEED_SEED, &[feed.coin]], bump = feed.bump)]
    pub feed: Account<'info, PriceFeed>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(coin: u8)]
pub struct DelegateFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ ClashyError::Unauthorized)]
    pub config: Account<'info, Config>,
    /// CHECK: the feed PDA for `coin`, checked by seeds.
    #[account(mut, del, seeds = [FEED_SEED, &[coin]], bump)]
    pub feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SetVrfQueue<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ ClashyError::Unauthorized)]
    pub config: Account<'info, Config>,
    /// CHECK: any MagicBlock VRF oracle queue; ownership is checked here.
    #[account(owner = VRF_PROGRAM_ID @ ClashyError::InvalidQueue)]
    pub queue: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(coin: u8)]
pub struct InitBaseFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ ClashyError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(init, payer = authority, space = 8 + PriceFeed::INIT_SPACE, seeds = [BASE_FEED_SEED, &[coin]], bump)]
    pub feed: Account<'info, PriceFeed>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PushBasePrice<'info> {
    pub crank: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, constraint = config.crank == crank.key() @ ClashyError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [BASE_FEED_SEED, &[feed.coin]], bump = feed.bump)]
    pub feed: Account<'info, PriceFeed>,
}

#[derive(Accounts)]
pub struct InitPlayer<'info> {
    pub owner: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, space = 8 + Player::INIT_SPACE, seeds = [PLAYER_SEED, owner.key().as_ref()], bump)]
    pub player: Account<'info, Player>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct OpenDuel<'info> {
    pub creator: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(seeds = [PLAYER_SEED, creator.key().as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
    #[account(mut, seeds = [PROFILE_SEED, creator.key().as_ref()], bump = profile.bump)]
    pub profile: Box<Account<'info, Profile>>,
    #[account(init, payer = payer, space = 8 + Duel::INIT_SPACE, seeds = [DUEL_SEED, creator.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub duel: Box<Account<'info, Duel>>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = creator)]
    pub creator_usdc: Box<Account<'info, TokenAccount>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(init, payer = payer, seeds = [VAULT_SEED, duel.key().as_ref()], bump, token::mint = usdc_mint, token::authority = auth)]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinDuel<'info> {
    pub joiner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(seeds = [PLAYER_SEED, joiner.key().as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
    #[account(mut, seeds = [PROFILE_SEED, joiner.key().as_ref()], bump = profile.bump)]
    pub profile: Box<Account<'info, Profile>>,
    #[account(mut, seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()], bump = duel.bump)]
    pub duel: Box<Account<'info, Duel>>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = joiner)]
    pub joiner_usdc: Box<Account<'info, TokenAccount>>,
    /// CHECK: the duel's USDC vault, checked by seeds; the token program checks the transfer.
    #[account(mut, seeds = [VAULT_SEED, duel.key().as_ref()], bump = duel.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AbortDuel<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()], bump = duel.bump)]
    pub duel: Box<Account<'info, Duel>>,
    /// CHECK: the duel's USDC vault, checked by seeds.
    #[account(mut, seeds = [VAULT_SEED, duel.key().as_ref()], bump = duel.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = duel.creator)]
    pub creator_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = duel.joiner)]
    pub joiner_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.treasury @ ClashyError::PayoutMismatch)]
    pub treasury: Box<Account<'info, TokenAccount>>,
    /// CHECK: gets the vault's rent back; must be who paid it.
    #[account(mut, address = duel.rent_payer @ ClashyError::PayoutMismatch)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelDuel<'info> {
    pub signer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()], bump = duel.bump)]
    pub duel: Box<Account<'info, Duel>>,
    /// CHECK: the duel's USDC vault, checked by seeds.
    #[account(mut, seeds = [VAULT_SEED, duel.key().as_ref()], bump = duel.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = duel.creator)]
    pub creator_usdc: Box<Account<'info, TokenAccount>>,
    /// CHECK: gets the vault's rent back; must be who paid it.
    #[account(mut, address = duel.rent_payer @ ClashyError::PayoutMismatch)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[vrf]
#[derive(Accounts)]
pub struct RequestCoinRoll<'info> {
    /// One of the duel's two players.
    pub player: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()], bump = duel.bump)]
    pub duel: Account<'info, Duel>,
    /// CHECK: the MagicBlock VRF base queue, checked in the handler.
    #[account(mut)]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct CoinRollCallback<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()], bump = duel.bump)]
    pub duel: Account<'info, Duel>,
}

#[derive(Accounts)]
pub struct PlayerDuel<'info> {
    pub signer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()], bump = duel.bump)]
    pub duel: Account<'info, Duel>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(creator: Pubkey, nonce: u64)]
pub struct DelegateDuel<'info> {
    /// One of the duel's two players.
    pub player: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: the duel PDA, checked by seeds. Must be rolled with both picks revealed.
    #[account(mut, del, seeds = [DUEL_SEED, creator.as_ref(), &nonce.to_le_bytes()], bump)]
    pub duel: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct RunDuel<'info> {
    pub signer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()], bump = duel.bump)]
    pub duel: Account<'info, Duel>,
    /// CHECK: validated against the configured feed for the duel's coin.
    pub price: UncheckedAccount<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct CheckDuel<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()], bump = duel.bump)]
    pub duel: Account<'info, Duel>,
    /// CHECK: validated against the configured feed for the duel's coin.
    pub price: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SettleDuel<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()], bump = duel.bump)]
    pub duel: Box<Account<'info, Duel>>,
    /// CHECK: the duel's USDC vault, checked by seeds.
    #[account(mut, seeds = [VAULT_SEED, duel.key().as_ref()], bump = duel.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = duel.creator)]
    pub creator_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = duel.joiner)]
    pub joiner_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [PLAYER_SEED, duel.creator.as_ref()], bump = creator_player.bump)]
    pub creator_player: Box<Account<'info, Player>>,
    #[account(mut, seeds = [PLAYER_SEED, duel.joiner.as_ref()], bump = joiner_player.bump)]
    pub joiner_player: Box<Account<'info, Player>>,
    #[account(mut, address = config.treasury @ ClashyError::PayoutMismatch)]
    pub treasury: Box<Account<'info, TokenAccount>>,
    /// CHECK: gets the vault's rent back; must be who paid it.
    #[account(mut, address = duel.rent_payer @ ClashyError::PayoutMismatch)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateClan<'info> {
    pub founder: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [PLAYER_SEED, founder.key().as_ref()], bump = player.bump)]
    pub player: Box<Account<'info, Player>>,
    #[account(init, payer = payer, space = 8 + Clan::INIT_SPACE, seeds = [CLAN_SEED, name.as_bytes()], bump)]
    pub clan: Box<Account<'info, Clan>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(init, payer = payer, seeds = [CHEST_SEED, clan.key().as_ref()], bump, token::mint = usdc_mint, token::authority = auth)]
    pub chest: Box<Account<'info, TokenAccount>>,
    #[account(init, payer = payer, space = 8 + Member::INIT_SPACE, seeds = [MEMBER_SEED, clan.key().as_ref(), founder.key().as_ref()], bump)]
    pub member: Box<Account<'info, Member>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinClan<'info> {
    pub wallet: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [PLAYER_SEED, wallet.key().as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
    #[account(mut)]
    pub clan: Account<'info, Clan>,
    #[account(init, payer = payer, space = 8 + Member::INIT_SPACE, seeds = [MEMBER_SEED, clan.key().as_ref(), wallet.key().as_ref()], bump)]
    pub member: Account<'info, Member>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LeaveClan<'info> {
    pub wallet: Signer<'info>,
    #[account(mut, seeds = [PLAYER_SEED, wallet.key().as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
    #[account(mut)]
    pub clan: Account<'info, Clan>,
    /// Membership is proven by this account existing (seeds), not by the player's main squad.
    #[account(mut, close = rent_payer, seeds = [MEMBER_SEED, clan.key().as_ref(), wallet.key().as_ref()], bump = member.bump)]
    pub member: Account<'info, Member>,
    /// CHECK: gets the member account's rent back; must be who paid it.
    #[account(mut, address = member.rent_payer @ ClashyError::PayoutMismatch)]
    pub rent_payer: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ChestMove<'info> {
    pub wallet: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub clan: Box<Account<'info, Clan>>,
    #[account(mut, seeds = [MEMBER_SEED, clan.key().as_ref(), wallet.key().as_ref()], bump = member.bump)]
    pub member: Box<Account<'info, Member>>,
    /// CHECK: the clan's USDC chest, checked by seeds.
    #[account(mut, seeds = [CHEST_SEED, clan.key().as_ref()], bump = clan.chest_bump)]
    pub chest: UncheckedAccount<'info>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = wallet)]
    pub wallet_usdc: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Propose<'info> {
    pub wallet: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub clan: Account<'info, Clan>,
    #[account(seeds = [MEMBER_SEED, clan.key().as_ref(), wallet.key().as_ref()], bump = member.bump)]
    pub member: Account<'info, Member>,
    #[account(init, payer = payer, space = 8 + Proposal::INIT_SPACE, seeds = [PROPOSAL_SEED, clan.key().as_ref(), &clan.proposals.to_le_bytes()], bump)]
    pub proposal: Account<'info, Proposal>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    pub wallet: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub clan: Account<'info, Clan>,
    #[account(seeds = [MEMBER_SEED, clan.key().as_ref(), wallet.key().as_ref()], bump = member.bump)]
    pub member: Account<'info, Member>,
    #[account(mut, has_one = clan)]
    pub proposal: Account<'info, Proposal>,
    #[account(init, payer = payer, space = 8 + Vote::INIT_SPACE, seeds = [VOTE_SEED, proposal.key().as_ref(), wallet.key().as_ref()], bump)]
    pub vote: Account<'info, Vote>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    pub captain: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, constraint = clan.captain == captain.key() @ ClashyError::NotCaptain)]
    pub clan: Box<Account<'info, Clan>>,
    #[account(mut, has_one = clan)]
    pub proposal: Box<Account<'info, Proposal>>,
    #[account(init, payer = payer, space = 8 + ClanPosition::INIT_SPACE, seeds = [POSITION_SEED, clan.key().as_ref(), &proposal.id.to_le_bytes()], bump)]
    pub position: Box<Account<'info, ClanPosition>>,
    /// CHECK: validated against the configured feed for the proposal's coin.
    pub price: UncheckedAccount<'info>,
    /// The clan's war, required while it is at war.
    pub war: Option<Account<'info, War>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RejectProposal<'info> {
    #[account(mut, address = proposal.clan)]
    pub clan: Account<'info, Clan>,
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    /// The captain, or anyone once the clan's war window is over.
    pub closer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub clan: Account<'info, Clan>,
    #[account(mut, has_one = clan)]
    pub position: Account<'info, ClanPosition>,
    /// CHECK: validated against the coin's base feed.
    pub price: UncheckedAccount<'info>,
    /// The clan's war, needed when someone other than the captain closes.
    pub war: Option<Account<'info, War>>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct DeclareWar<'info> {
    pub captain: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, constraint = clan_a.captain == captain.key() @ ClashyError::NotCaptain)]
    pub clan_a: Box<Account<'info, Clan>>,
    pub clan_b: Box<Account<'info, Clan>>,
    /// CHECK: clan A's USDC chest, checked by seeds.
    #[account(mut, seeds = [CHEST_SEED, clan_a.key().as_ref()], bump = clan_a.chest_bump)]
    pub chest_a: UncheckedAccount<'info>,
    #[account(init, payer = payer, space = 8 + War::INIT_SPACE, seeds = [WAR_SEED, clan_a.key().as_ref(), clan_b.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub war: Box<Account<'info, War>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(init, payer = payer, seeds = [VAULT_SEED, war.key().as_ref()], bump, token::mint = usdc_mint, token::authority = auth)]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptWar<'info> {
    pub captain: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(address = war.clan_a)]
    pub clan_a: Box<Account<'info, Clan>>,
    #[account(mut, address = war.clan_b, constraint = clan_b.captain == captain.key() @ ClashyError::NotCaptain)]
    pub clan_b: Box<Account<'info, Clan>>,
    /// CHECK: clan B's USDC chest, checked by seeds.
    #[account(mut, seeds = [CHEST_SEED, clan_b.key().as_ref()], bump = clan_b.chest_bump)]
    pub chest_b: UncheckedAccount<'info>,
    #[account(mut, seeds = [WAR_SEED, war.clan_a.as_ref(), war.clan_b.as_ref(), &war.nonce.to_le_bytes()], bump = war.bump)]
    pub war: Box<Account<'info, War>>,
    /// CHECK: the war's USDC vault, checked by seeds.
    #[account(mut, seeds = [VAULT_SEED, war.key().as_ref()], bump = war.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelWar<'info> {
    pub captain: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, address = war.clan_a, constraint = clan_a.captain == captain.key() @ ClashyError::NotCaptain)]
    pub clan_a: Box<Account<'info, Clan>>,
    /// CHECK: clan A's USDC chest, checked by seeds.
    #[account(mut, seeds = [CHEST_SEED, clan_a.key().as_ref()], bump = clan_a.chest_bump)]
    pub chest_a: UncheckedAccount<'info>,
    #[account(mut, seeds = [WAR_SEED, war.clan_a.as_ref(), war.clan_b.as_ref(), &war.nonce.to_le_bytes()], bump = war.bump)]
    pub war: Box<Account<'info, War>>,
    /// CHECK: the war's USDC vault, checked by seeds.
    #[account(mut, seeds = [VAULT_SEED, war.key().as_ref()], bump = war.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    /// CHECK: gets the vault's rent back; must be who paid it.
    #[account(mut, address = war.rent_payer @ ClashyError::PayoutMismatch)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SettleWar<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, address = war.clan_a)]
    pub clan_a: Box<Account<'info, Clan>>,
    #[account(mut, address = war.clan_b)]
    pub clan_b: Box<Account<'info, Clan>>,
    /// CHECK: clan A's USDC chest, checked by seeds.
    #[account(mut, seeds = [CHEST_SEED, clan_a.key().as_ref()], bump = clan_a.chest_bump)]
    pub chest_a: UncheckedAccount<'info>,
    /// CHECK: clan B's USDC chest, checked by seeds.
    #[account(mut, seeds = [CHEST_SEED, clan_b.key().as_ref()], bump = clan_b.chest_bump)]
    pub chest_b: UncheckedAccount<'info>,
    #[account(mut, seeds = [WAR_SEED, war.clan_a.as_ref(), war.clan_b.as_ref(), &war.nonce.to_le_bytes()], bump = war.bump)]
    pub war: Box<Account<'info, War>>,
    /// CHECK: the war's USDC vault, checked by seeds.
    #[account(mut, seeds = [VAULT_SEED, war.key().as_ref()], bump = war.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(mut, address = config.treasury @ ClashyError::PayoutMismatch)]
    pub treasury: Box<Account<'info, TokenAccount>>,
    /// CHECK: gets the vault's rent back; must be who paid it.
    #[account(mut, address = war.rent_payer @ ClashyError::PayoutMismatch)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateTournament<'info> {
    pub creator: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(init, payer = payer, space = 8 + Tournament::INIT_SPACE, seeds = [TOUR_SEED, creator.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub tournament: Box<Account<'info, Tournament>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(init, payer = payer, seeds = [VAULT_SEED, tournament.key().as_ref()], bump, token::mint = usdc_mint, token::authority = auth)]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinTournament<'info> {
    pub player: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [PROFILE_SEED, player.key().as_ref()], bump = profile.bump)]
    pub profile: Box<Account<'info, Profile>>,
    #[account(mut, seeds = [TOUR_SEED, tournament.creator.as_ref(), &tournament.nonce.to_le_bytes()], bump = tournament.bump)]
    pub tournament: Box<Account<'info, Tournament>>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = player)]
    pub player_usdc: Box<Account<'info, TokenAccount>>,
    /// CHECK: the tournament's USDC vault, checked by seeds.
    #[account(mut, seeds = [VAULT_SEED, tournament.key().as_ref()], bump = tournament.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelTournament<'info> {
    pub signer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [TOUR_SEED, tournament.creator.as_ref(), &tournament.nonce.to_le_bytes()], bump = tournament.bump)]
    pub tournament: Box<Account<'info, Tournament>>,
    /// CHECK: the tournament's USDC vault, checked by seeds.
    #[account(mut, seeds = [VAULT_SEED, tournament.key().as_ref()], bump = tournament.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    /// CHECK: gets the vault's rent back; must be who paid it.
    #[account(mut, address = tournament.rent_payer @ ClashyError::PayoutMismatch)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[vrf]
#[derive(Accounts)]
pub struct RequestTournamentCoin<'info> {
    pub creator: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TOUR_SEED, tournament.creator.as_ref(), &tournament.nonce.to_le_bytes()], bump = tournament.bump)]
    pub tournament: Account<'info, Tournament>,
    /// CHECK: the MagicBlock VRF base queue, checked in the handler.
    #[account(mut)]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct TournamentCoinCallback<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TOUR_SEED, tournament.creator.as_ref(), &tournament.nonce.to_le_bytes()], bump = tournament.bump)]
    pub tournament: Account<'info, Tournament>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(creator: Pubkey, nonce: u64)]
pub struct DelegateTournament<'info> {
    /// The tournament's creator.
    pub host: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: the tournament PDA, checked by seeds.
    #[account(mut, del, seeds = [TOUR_SEED, creator.as_ref(), &nonce.to_le_bytes()], bump)]
    pub tournament: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct RunTournament<'info> {
    pub signer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TOUR_SEED, tournament.creator.as_ref(), &tournament.nonce.to_le_bytes()], bump = tournament.bump)]
    pub tournament: Account<'info, Tournament>,
    /// CHECK: validated against the configured feed for the tournament coin.
    pub price: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CallRound<'info> {
    pub player: Signer<'info>,
    #[account(mut, seeds = [TOUR_SEED, tournament.creator.as_ref(), &tournament.nonce.to_le_bytes()], bump = tournament.bump)]
    pub tournament: Account<'info, Tournament>,
}

#[commit]
#[derive(Accounts)]
pub struct ResolveRound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TOUR_SEED, tournament.creator.as_ref(), &tournament.nonce.to_le_bytes()], bump = tournament.bump)]
    pub tournament: Account<'info, Tournament>,
    /// CHECK: validated against the configured feed for the tournament coin.
    pub price: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SettleTournament<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [TOUR_SEED, tournament.creator.as_ref(), &tournament.nonce.to_le_bytes()], bump = tournament.bump)]
    pub tournament: Box<Account<'info, Tournament>>,
    /// CHECK: the tournament's USDC vault, checked by seeds.
    #[account(mut, seeds = [VAULT_SEED, tournament.key().as_ref()], bump = tournament.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(mut, address = config.treasury @ ClashyError::PayoutMismatch)]
    pub treasury: Box<Account<'info, TokenAccount>>,
    /// CHECK: gets the vault's rent back; must be who paid it.
    #[account(mut, address = tournament.rent_payer @ ClashyError::PayoutMismatch)]
    pub rent_payer: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateProfile<'info> {
    pub owner: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, space = 8 + Profile::INIT_SPACE, seeds = [PROFILE_SEED, owner.key().as_ref()], bump)]
    pub profile: Box<Account<'info, Profile>>,
    #[account(init, payer = payer, space = 8 + Handle::INIT_SPACE, seeds = [HANDLE_SEED, name.as_bytes()], bump)]
    pub handle: Account<'info, Handle>,
    #[account(init_if_needed, payer = payer, space = 8 + Registry::INIT_SPACE, seeds = [REGISTRY_SEED], bump)]
    pub registry: Account<'info, Registry>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OwnProfile<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [PROFILE_SEED, owner.key().as_ref()], bump = profile.bump, has_one = owner)]
    pub profile: Box<Account<'info, Profile>>,
}

#[derive(Accounts)]
pub struct OpenStash<'info> {
    pub owner: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(init, payer = payer, space = 8 + Stash::INIT_SPACE, seeds = [STASH_SEED, owner.key().as_ref()], bump)]
    pub stash: Box<Account<'info, Stash>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(init, payer = payer, seeds = [STASH_VAULT_SEED, owner.key().as_ref()], bump, token::mint = usdc_mint, token::authority = auth)]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StashOwner<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [STASH_SEED, owner.key().as_ref()], bump = stash.bump, has_one = owner)]
    pub stash: Box<Account<'info, Stash>>,
}

#[derive(Accounts)]
pub struct StashMove<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [PROFILE_SEED, owner.key().as_ref()], bump = profile.bump, has_one = owner)]
    pub profile: Box<Account<'info, Profile>>,
    #[account(mut, seeds = [STASH_SEED, owner.key().as_ref()], bump = stash.bump, has_one = owner)]
    pub stash: Box<Account<'info, Stash>>,
    /// CHECK: the Stash's USDC vault, checked by seeds; the token program checks the transfer.
    #[account(mut, seeds = [STASH_VAULT_SEED, owner.key().as_ref()], bump = stash.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = owner)]
    pub owner_usdc: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(id: u8)]
pub struct OpenChannel<'info> {
    pub wallet: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub clan: Box<Account<'info, Clan>>,
    #[account(seeds = [MEMBER_SEED, clan.key().as_ref(), wallet.key().as_ref()], bump = member.bump)]
    pub member: Box<Account<'info, Member>>,
    #[account(init, payer = payer, space = 8 + std::mem::size_of::<Channel>(), seeds = [CHANNEL_SEED, clan.key().as_ref(), &[id]], bump)]
    pub channel: AccountLoader<'info, Channel>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(clan: Pubkey, id: u8)]
pub struct DelegateChannel<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub wallet: Signer<'info>,
    #[account(seeds = [MEMBER_SEED, clan.as_ref(), wallet.key().as_ref()], bump = member.bump)]
    pub member: Box<Account<'info, Member>>,
    /// CHECK: the channel PDA, checked by seeds.
    #[account(mut, del, seeds = [CHANNEL_SEED, clan.as_ref(), &[id]], bump)]
    pub channel: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct PostMessage<'info> {
    pub author: Signer<'info>,
    #[account(mut, owner = crate::ID)]
    pub channel: AccountLoader<'info, Channel>,
    /// The author's membership in the channel's clan (the handler checks it is the same clan).
    #[account(seeds = [MEMBER_SEED, member.clan.as_ref(), author.key().as_ref()], bump = member.bump, constraint = member.wallet == author.key() @ ClashyError::NotMember)]
    pub member: Box<Account<'info, Member>>,
}

/// The Orca Whirlpool accounts one stock swap touches.
#[derive(Accounts)]
pub struct StockSwap<'info> {
    /// CHECK: an Orca Whirlpool pool; its mints and vaults are checked in the handler.
    #[account(mut, owner = WHIRLPOOL_PROGRAM_ID @ ClashyError::BadPool)]
    pub whirlpool: UncheckedAccount<'info>,
    /// CHECK: the tokenized stock's mint (Token-2022); checked against the pool.
    pub stock_mint: UncheckedAccount<'info>,
    /// CHECK: USDC's mint; checked against the config.
    pub usdc_mint: UncheckedAccount<'info>,
    /// CHECK: the player's own token account for the stock; mint and owner checked in the handler.
    #[account(mut)]
    pub owner_stock: UncheckedAccount<'info>,
    /// CHECK: the pool's vault A, checked against the pool.
    #[account(mut)]
    pub vault_a: UncheckedAccount<'info>,
    /// CHECK: the pool's vault B, checked against the pool.
    #[account(mut)]
    pub vault_b: UncheckedAccount<'info>,
    /// CHECK: tick array checked by the Whirlpool program.
    #[account(mut)]
    pub tick_array_0: UncheckedAccount<'info>,
    /// CHECK: tick array checked by the Whirlpool program.
    #[account(mut)]
    pub tick_array_1: UncheckedAccount<'info>,
    /// CHECK: tick array checked by the Whirlpool program.
    #[account(mut)]
    pub tick_array_2: UncheckedAccount<'info>,
    /// CHECK: the pool's oracle PDA, checked by the Whirlpool program.
    #[account(mut)]
    pub oracle: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    /// CHECK: the Token-2022 program.
    #[account(address = anchor_spl::token_2022::ID)]
    pub token_2022_program: UncheckedAccount<'info>,
    /// CHECK: the SPL Memo program (Whirlpool's swap_v2 asks for it).
    #[account(address = MEMO_PROGRAM_ID)]
    pub memo_program: UncheckedAccount<'info>,
    /// CHECK: Orca Whirlpool.
    #[account(address = WHIRLPOOL_PROGRAM_ID)]
    pub whirlpool_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct StashInvest<'info> {
    pub owner: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, constraint = sw.usdc_mint.key() == config.usdc_mint @ ClashyError::BadPool)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [PROFILE_SEED, owner.key().as_ref()], bump = profile.bump, has_one = owner)]
    pub profile: Box<Account<'info, Profile>>,
    #[account(seeds = [STASH_SEED, owner.key().as_ref()], bump = stash.bump, has_one = owner)]
    pub stash: Box<Account<'info, Stash>>,
    /// CHECK: the Stash's USDC vault, checked by seeds.
    #[account(mut, seeds = [STASH_VAULT_SEED, owner.key().as_ref()], bump = stash.vault_bump)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: vault owner PDA.
    #[account(seeds = [AUTH_SEED], bump = config.auth_bump)]
    pub auth: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payer, space = 8 + Holding::INIT_SPACE, seeds = [HOLDING_SEED, owner.key().as_ref(), sw.stock_mint.key().as_ref()], bump)]
    pub holding: Box<Account<'info, Holding>>,
    pub sw: StockSwap<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(id: u8)]
pub struct OpenBoard<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ ClashyError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,
    #[account(init, payer = authority, space = 8 + std::mem::size_of::<Board>(), seeds = [BOARD_SEED, &[id]], bump)]
    pub board: AccountLoader<'info, Board>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(id: u8)]
pub struct DelegateBoard<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ ClashyError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,
    /// CHECK: the board PDA, checked by seeds.
    #[account(mut, del, seeds = [BOARD_SEED, &[id]], bump)]
    pub board: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct PostToBoard<'info> {
    pub author: Signer<'info>,
    #[account(seeds = [PROFILE_SEED, author.key().as_ref()], bump = profile.bump)]
    pub profile: Box<Account<'info, Profile>>,
    #[account(mut, owner = crate::ID)]
    pub board: AccountLoader<'info, Board>,
}

#[derive(Accounts)]
pub struct LikePost<'info> {
    pub liker: Signer<'info>,
    #[account(seeds = [PROFILE_SEED, liker.key().as_ref()], bump = profile.bump)]
    pub profile: Box<Account<'info, Profile>>,
    #[account(mut, owner = crate::ID)]
    pub board: AccountLoader<'info, Board>,
}
