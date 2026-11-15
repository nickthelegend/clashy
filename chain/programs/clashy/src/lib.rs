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
//! Prices come from Clashy `PriceFeed` accounts (crank-pushed, delegated to the ER) or MagicBlock
//! pricing-oracle accounts; see `price.rs`.

use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;
use anchor_lang::system_program::{transfer, Transfer};
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

fn pay_from_vault<'info>(
    vault: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    seeds: &[&[u8]],
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    transfer(
        CpiContext::new_with_signer(system_program.clone(), Transfer { from: vault.clone(), to: to.clone() }, &[seeds]),
        amount,
    )
}

fn deposit<'info>(from: &AccountInfo<'info>, to: &AccountInfo<'info>, system_program: &AccountInfo<'info>, amount: u64) -> Result<()> {
    transfer(CpiContext::new(system_program.clone(), Transfer { from: from.clone(), to: to.clone() }), amount)
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
/// crank's never-delegated base feed for the coin, or the coin's configured feed when that is an oracle
/// account (MagicBlock pricing oracle) that lives on Solana.
fn solana_price(config: &Config, coin: u8, account: &AccountInfo, now: i64) -> Result<u64> {
    let configured = coin_feed(config, coin)?;
    let expected = if account.key() == configured {
        configured
    } else {
        Pubkey::find_program_address(&[BASE_FEED_SEED, &[coin]], &crate::ID).0
    };
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

    // ------------------------------------------------------------------ knockout duel

    /// Opens a duel and escrows the creator's stake. With a short expiry it is a quick-match
    /// ticket; with a long one it is an open challenge on the board.
    pub fn open_duel(ctx: Context<OpenDuel>, nonce: u64, stake: u64, pool_mask: u8, len_secs: u32, expires_in: i64, seed_hash: [u8; 32]) -> Result<()> {
        require!(stake >= MIN_STAKE, ClashyError::StakeTooLow);
        require!((MIN_DUEL_SECS..=MAX_DUEL_SECS).contains(&len_secs), ClashyError::BadLength);
        require!(expires_in > 0 && expires_in <= MAX_CHALLENGE_SECS, ClashyError::Expired);
        let cfg = &ctx.accounts.config;
        require!(math::pick_coin(&[0u8; 32], pool_mask, cfg.coin_count).is_some(), ClashyError::EmptyPool);
        deposit(&ctx.accounts.creator.to_account_info(), &ctx.accounts.vault.to_account_info(), &ctx.accounts.system_program.to_account_info(), stake)?;
        let d = &mut ctx.accounts.duel;
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
        deposit(&ctx.accounts.joiner.to_account_info(), &ctx.accounts.vault.to_account_info(), &ctx.accounts.system_program.to_account_info(), d.stake)?;
        d.joiner = ctx.accounts.joiner.key();
        d.seed_hash[1] = seed_hash;
        d.status = duel_status::MATCHED;
        Ok(())
    }

    /// Refunds an unmatched duel: the creator any time, anyone after expiry. No rake.
    pub fn cancel_duel(ctx: Context<CancelDuel>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let d = &ctx.accounts.duel;
        require!(d.status == duel_status::OPEN, ClashyError::WrongStatus);
        require!(ctx.accounts.signer.key() == d.creator || now > d.expires_at, ClashyError::NotExpired);
        let duel_key = d.key();
        let seeds: &[&[u8]] = &[VAULT_SEED, duel_key.as_ref(), &[d.vault_bump]];
        let amount = ctx.accounts.vault.lamports();
        pay_from_vault(&ctx.accounts.vault.to_account_info(), &ctx.accounts.creator.to_account_info(), &ctx.accounts.system_program.to_account_info(), seeds, amount)?;
        ctx.accounts.duel.status = duel_status::CANCELLED;
        Ok(())
    }

    /// Asks MagicBlock VRF (base-layer queue) to roll the coin for both players.
    pub fn request_coin_roll(ctx: Context<RequestCoinRoll>, caller_seed: [u8; 32]) -> Result<()> {
        require_keys_eq!(ctx.accounts.oracle_queue.key(), ctx.accounts.config.vrf_queue, ClashyError::InvalidQueue);
        let d = &mut ctx.accounts.duel;
        require!(d.status == duel_status::MATCHED, ClashyError::WrongStatus);
        require!(!d.vrf_pending, ClashyError::VrfInflight);
        let signer = ctx.accounts.payer.key();
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
        require!(hashv(&[&math::pick_preimage(dir, lev, &salt)]).to_bytes() == d.pick_hash[i], ClashyError::RevealMismatch);
        d.side[i] = dir;
        d.lev[i] = lev;
        d.picks_revealed |= 1 << i;
        Ok(())
    }

    /// Hands the duel to the ER once both picks are revealed.
    pub fn delegate_duel(ctx: Context<DelegateDuel>, creator: Pubkey, nonce: u64) -> Result<()> {
        ctx.accounts.delegate_duel(
            &ctx.accounts.payer,
            &[DUEL_SEED, creator.as_ref(), &nonce.to_le_bytes()],
            DelegateConfig { validator: ctx.remaining_accounts.first().map(|a| a.key()), ..Default::default() },
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
        require_keys_eq!(ctx.accounts.creator.key(), d.creator, ClashyError::PayoutMismatch);
        require_keys_eq!(ctx.accounts.joiner.key(), d.joiner, ClashyError::PayoutMismatch);
        require_keys_eq!(ctx.accounts.treasury.key(), ctx.accounts.config.treasury, ClashyError::PayoutMismatch);
        let duel_key = d.key();
        let seeds: &[&[u8]] = &[VAULT_SEED, duel_key.as_ref(), &[d.vault_bump]];
        let vault = ctx.accounts.vault.to_account_info();
        let sys = ctx.accounts.system_program.to_account_info();
        let pot = vault.lamports();
        let winner = d.winner;
        let (paid, rake) = match winner {
            1 | 2 => {
                let (to_winner, rake) = math::split_rake(pot, ctx.accounts.config.rake_bps);
                let dest = if winner == 1 { ctx.accounts.creator.to_account_info() } else { ctx.accounts.joiner.to_account_info() };
                // rake first: a vault left holding only the rake would sit below rent-exempt and fail
                pay_from_vault(&vault, &ctx.accounts.treasury.to_account_info(), &sys, seeds, rake)?;
                pay_from_vault(&vault, &dest, &sys, seeds, to_winner)?;
                (to_winner, rake)
            }
            _ => {
                let half = pot / 2;
                pay_from_vault(&vault, &ctx.accounts.creator.to_account_info(), &sys, seeds, half)?;
                pay_from_vault(&vault, &ctx.accounts.joiner.to_account_info(), &sys, seeds, pot - half)?;
                (pot, 0)
            }
        };
        update_players(&mut ctx.accounts.creator_player, &mut ctx.accounts.joiner_player, winner);
        ctx.accounts.duel.status = duel_status::SETTLED;
        emit!(DuelSettled { duel: duel_key, winner, paid, rake });
        Ok(())
    }

    // ------------------------------------------------------------------ clans

    pub fn create_clan(ctx: Context<CreateClan>, name: String, crest: u8) -> Result<()> {
        let bytes = name.as_bytes();
        require!(!bytes.is_empty() && bytes.len() <= CLAN_NAME_LEN, ClashyError::BadName);
        require!(ctx.accounts.player.clan == Pubkey::default(), ClashyError::AlreadyInClan);
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
        ctx.accounts.player.clan = clan_key;
        Ok(())
    }

    pub fn join_clan(ctx: Context<JoinClan>) -> Result<()> {
        require!(ctx.accounts.player.clan == Pubkey::default(), ClashyError::AlreadyInClan);
        let clan_key = ctx.accounts.clan.key();
        let m = &mut ctx.accounts.member;
        m.clan = clan_key;
        m.wallet = ctx.accounts.wallet.key();
        m.deposit = 0;
        m.shares = 0;
        m.joined_at = Clock::get()?.unix_timestamp;
        m.bump = ctx.bumps.member;
        ctx.accounts.clan.members += 1;
        ctx.accounts.player.clan = clan_key;
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
        ctx.accounts.player.clan = Pubkey::default();
        Ok(())
    }

    pub fn deposit_chest(ctx: Context<ChestMove>, amount: u64) -> Result<()> {
        require!(amount > 0, ClashyError::StakeTooLow);
        let minted = math::shares_for_deposit(amount, ctx.accounts.clan.chest, ctx.accounts.clan.shares).ok_or(ClashyError::ChestTooLow)?;
        require!(minted > 0, ClashyError::StakeTooLow);
        deposit(&ctx.accounts.wallet.to_account_info(), &ctx.accounts.chest.to_account_info(), &ctx.accounts.system_program.to_account_info(), amount)?;
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
        let held = ctx.accounts.member.shares;
        require!(shares > 0 && shares <= held, ClashyError::NotEnoughShares);
        let payout = math::payout_for_shares(shares, c.chest, c.shares);
        require!(payout > 0, ClashyError::ChestTooLow);
        let clan_key = c.key();
        let seeds: &[&[u8]] = &[CHEST_SEED, clan_key.as_ref(), &[c.chest_bump]];
        pay_from_vault(&ctx.accounts.chest.to_account_info(), &ctx.accounts.wallet.to_account_info(), &ctx.accounts.system_program.to_account_info(), seeds, payout)?;
        let m = &mut ctx.accounts.member;
        m.deposit -= (m.deposit as u128 * shares as u128 / held as u128) as u64;
        m.shares -= shares;
        let c = &mut ctx.accounts.clan;
        c.chest -= payout;
        c.shares -= shares;
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
        Ok(())
    }

    /// Anyone can close a proposal that failed once its window is over.
    pub fn reject_proposal(ctx: Context<RejectProposal>) -> Result<()> {
        let p = &mut ctx.accounts.proposal;
        require!(p.status == proposal_status::OPEN, ClashyError::WrongStatus);
        require!(Clock::get()?.unix_timestamp > p.deadline && p.yes <= p.no, ClashyError::VotingOpen);
        p.status = proposal_status::REJECTED;
        Ok(())
    }

    /// Captain closes a clan position at the oracle price; the P&L feeds the clan's score.
    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let pos = &ctx.accounts.position;
        require!(pos.open, ClashyError::WrongStatus);
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
        let seeds: &[&[u8]] = &[CHEST_SEED, a_key.as_ref(), &[a.chest_bump]];
        pay_from_vault(&ctx.accounts.chest_a.to_account_info(), &ctx.accounts.vault.to_account_info(), &ctx.accounts.system_program.to_account_info(), seeds, stake)?;
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
        let b_key = b.key();
        let seeds: &[&[u8]] = &[CHEST_SEED, b_key.as_ref(), &[b.chest_bump]];
        pay_from_vault(&ctx.accounts.chest_b.to_account_info(), &ctx.accounts.vault.to_account_info(), &ctx.accounts.system_program.to_account_info(), seeds, stake)?;
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
        let war_key = w.key();
        let seeds: &[&[u8]] = &[VAULT_SEED, war_key.as_ref(), &[w.vault_bump]];
        let amount = w.stake;
        pay_from_vault(&ctx.accounts.vault.to_account_info(), &ctx.accounts.chest_a.to_account_info(), &ctx.accounts.system_program.to_account_info(), seeds, amount)?;
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
        require_keys_eq!(ctx.accounts.treasury.key(), ctx.accounts.config.treasury, ClashyError::PayoutMismatch);
        let ra = math::war_return_bps(ctx.accounts.clan_a.score_pnl, w.base_a, w.chest_a);
        let rb = math::war_return_bps(ctx.accounts.clan_b.score_pnl, w.base_b, w.chest_b);
        let winner = if ra > rb { 1 } else if rb > ra { 2 } else { 3 };
        let war_key = w.key();
        let seeds: &[&[u8]] = &[VAULT_SEED, war_key.as_ref(), &[w.vault_bump]];
        let vault = ctx.accounts.vault.to_account_info();
        let sys = ctx.accounts.system_program.to_account_info();
        let pot = vault.lamports();
        match winner {
            1 | 2 => {
                let (to_winner, rake) = math::split_rake(pot, ctx.accounts.config.rake_bps);
                let dest = if winner == 1 { ctx.accounts.chest_a.to_account_info() } else { ctx.accounts.chest_b.to_account_info() };
                pay_from_vault(&vault, &ctx.accounts.treasury.to_account_info(), &sys, seeds, rake)?;
                pay_from_vault(&vault, &dest, &sys, seeds, to_winner)?;
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
                pay_from_vault(&vault, &ctx.accounts.chest_a.to_account_info(), &sys, seeds, half)?;
                pay_from_vault(&vault, &ctx.accounts.chest_b.to_account_info(), &sys, seeds, pot - half)?;
                ctx.accounts.clan_a.chest += half;
                ctx.accounts.clan_b.chest += pot - half;
            }
        }
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
        Ok(())
    }

    pub fn join_tournament(ctx: Context<JoinTournament>) -> Result<()> {
        let t = &ctx.accounts.tournament;
        require!(t.status == tour_status::OPEN, ClashyError::WrongStatus);
        require!((t.count as usize) < t.max_players as usize, ClashyError::TourFull);
        let me = ctx.accounts.player.key();
        require!(!t.players[..t.count as usize].contains(&me), ClashyError::AlreadyJoined);
        deposit(&ctx.accounts.player.to_account_info(), &ctx.accounts.vault.to_account_info(), &ctx.accounts.system_program.to_account_info(), t.entry)?;
        let t = &mut ctx.accounts.tournament;
        let i = t.count as usize;
        t.players[i] = me;
        t.lives[i] = t.start_lives;
        t.count += 1;
        Ok(())
    }

    /// Creator cancels an unstarted tournament; remaining accounts are every player's wallet in join order.
    pub fn cancel_tournament<'info>(ctx: Context<'_, '_, 'info, 'info, CancelTournament<'info>>) -> Result<()> {
        let t = &ctx.accounts.tournament;
        require!(t.status == tour_status::OPEN, ClashyError::WrongStatus);
        require!(ctx.remaining_accounts.len() == t.count as usize, ClashyError::PayoutMismatch);
        let key = t.key();
        let seeds: &[&[u8]] = &[VAULT_SEED, key.as_ref(), &[t.vault_bump]];
        for (i, acc) in ctx.remaining_accounts.iter().enumerate() {
            require_keys_eq!(acc.key(), t.players[i], ClashyError::PayoutMismatch);
            pay_from_vault(&ctx.accounts.vault.to_account_info(), acc, &ctx.accounts.system_program.to_account_info(), seeds, t.entry)?;
        }
        ctx.accounts.tournament.status = tour_status::CANCELLED;
        Ok(())
    }

    /// Asks MagicBlock VRF to roll the tournament's coin (required on devnet / mainnet).
    pub fn request_tournament_coin(ctx: Context<RequestTournamentCoin>, caller_seed: [u8; 32]) -> Result<()> {
        require_keys_eq!(ctx.accounts.oracle_queue.key(), ctx.accounts.config.vrf_queue, ClashyError::InvalidQueue);
        let t = &mut ctx.accounts.tournament;
        require!(t.status == tour_status::OPEN && t.coin == NO_COIN && !t.vrf_pending, ClashyError::WrongStatus);
        require_keys_eq!(ctx.accounts.payer.key(), t.creator, ClashyError::Unauthorized);
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
        ctx.accounts.delegate_tournament(
            &ctx.accounts.payer,
            &[TOUR_SEED, creator.as_ref(), &nonce.to_le_bytes()],
            DelegateConfig { validator: ctx.remaining_accounts.first().map(|a| a.key()), ..Default::default() },
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
    /// every player's wallet in join order.
    pub fn settle_tournament<'info>(ctx: Context<'_, '_, 'info, 'info, SettleTournament<'info>>) -> Result<()> {
        let t = &ctx.accounts.tournament;
        require!(t.status == tour_status::FINISHED, ClashyError::WrongStatus);
        require!(ctx.remaining_accounts.len() == t.count as usize, ClashyError::PayoutMismatch);
        require_keys_eq!(ctx.accounts.treasury.key(), ctx.accounts.config.treasury, ClashyError::PayoutMismatch);
        let n = t.count as usize;
        let top = *t.lives[..n].iter().max().unwrap_or(&0);
        let winners: Vec<usize> = (0..n).filter(|i| top > 0 && t.lives[*i] == top).collect();
        let key = t.key();
        let seeds: &[&[u8]] = &[VAULT_SEED, key.as_ref(), &[t.vault_bump]];
        let vault = ctx.accounts.vault.to_account_info();
        let sys = ctx.accounts.system_program.to_account_info();
        let pot = vault.lamports();
        let (to_winners, rake) = math::split_rake(pot, ctx.accounts.config.rake_bps);
        pay_from_vault(&vault, &ctx.accounts.treasury.to_account_info(), &sys, seeds, rake)?;
        let share = to_winners / winners.len().max(1) as u64;
        for (k, i) in winners.iter().enumerate() {
            let acc = &ctx.remaining_accounts[*i];
            require_keys_eq!(acc.key(), t.players[*i], ClashyError::PayoutMismatch);
            let amount = if k == winners.len() - 1 { to_winners - share * (winners.len() as u64 - 1) } else { share };
            pay_from_vault(&vault, acc, &sys, seeds, amount)?;
        }
        ctx.accounts.tournament.status = tour_status::SETTLED;
        Ok(())
    }
}

// ====================================================================== accounts

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
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
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(init, payer = owner, space = 8 + Player::INIT_SPACE, seeds = [PLAYER_SEED, owner.key().as_ref()], bump)]
    pub player: Account<'info, Player>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct OpenDuel<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [PLAYER_SEED, creator.key().as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
    #[account(init, payer = creator, space = 8 + Duel::INIT_SPACE, seeds = [DUEL_SEED, creator.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub duel: Account<'info, Duel>,
    /// CHECK: system-owned escrow PDA holding both stakes.
    #[account(mut, seeds = [VAULT_SEED, duel.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinDuel<'info> {
    #[account(mut)]
    pub joiner: Signer<'info>,
    #[account(seeds = [PLAYER_SEED, joiner.key().as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
    #[account(mut, seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()], bump = duel.bump)]
    pub duel: Account<'info, Duel>,
    #[account(mut, seeds = [VAULT_SEED, duel.key().as_ref()], bump = duel.vault_bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelDuel<'info> {
    pub signer: Signer<'info>,
    #[account(mut, seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()], bump = duel.bump)]
    pub duel: Account<'info, Duel>,
    #[account(mut, seeds = [VAULT_SEED, duel.key().as_ref()], bump = duel.vault_bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: refund destination, must be the creator.
    #[account(mut, address = duel.creator @ ClashyError::PayoutMismatch)]
    pub creator: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[vrf]
#[derive(Accounts)]
pub struct RequestCoinRoll<'info> {
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
    #[account(mut)]
    pub payer: Signer<'info>,
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
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [DUEL_SEED, duel.creator.as_ref(), &duel.nonce.to_le_bytes()], bump = duel.bump)]
    pub duel: Account<'info, Duel>,
    #[account(mut, seeds = [VAULT_SEED, duel.key().as_ref()], bump = duel.vault_bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: must equal duel.creator.
    #[account(mut)]
    pub creator: AccountInfo<'info>,
    /// CHECK: must equal duel.joiner.
    #[account(mut)]
    pub joiner: AccountInfo<'info>,
    #[account(mut, seeds = [PLAYER_SEED, duel.creator.as_ref()], bump = creator_player.bump)]
    pub creator_player: Account<'info, Player>,
    #[account(mut, seeds = [PLAYER_SEED, duel.joiner.as_ref()], bump = joiner_player.bump)]
    pub joiner_player: Account<'info, Player>,
    /// CHECK: must equal config.treasury.
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateClan<'info> {
    #[account(mut)]
    pub founder: Signer<'info>,
    #[account(mut, seeds = [PLAYER_SEED, founder.key().as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
    #[account(init, payer = founder, space = 8 + Clan::INIT_SPACE, seeds = [CLAN_SEED, name.as_bytes()], bump)]
    pub clan: Account<'info, Clan>,
    #[account(seeds = [CHEST_SEED, clan.key().as_ref()], bump)]
    pub chest: SystemAccount<'info>,
    #[account(init, payer = founder, space = 8 + Member::INIT_SPACE, seeds = [MEMBER_SEED, clan.key().as_ref(), founder.key().as_ref()], bump)]
    pub member: Account<'info, Member>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinClan<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(mut, seeds = [PLAYER_SEED, wallet.key().as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
    #[account(mut)]
    pub clan: Account<'info, Clan>,
    #[account(init, payer = wallet, space = 8 + Member::INIT_SPACE, seeds = [MEMBER_SEED, clan.key().as_ref(), wallet.key().as_ref()], bump)]
    pub member: Account<'info, Member>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LeaveClan<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(mut, seeds = [PLAYER_SEED, wallet.key().as_ref()], bump = player.bump, constraint = player.clan == clan.key() @ ClashyError::NotInClan)]
    pub player: Account<'info, Player>,
    #[account(mut)]
    pub clan: Account<'info, Clan>,
    #[account(mut, close = wallet, seeds = [MEMBER_SEED, clan.key().as_ref(), wallet.key().as_ref()], bump = member.bump)]
    pub member: Account<'info, Member>,
}

#[derive(Accounts)]
pub struct ChestMove<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(mut)]
    pub clan: Account<'info, Clan>,
    #[account(mut, seeds = [MEMBER_SEED, clan.key().as_ref(), wallet.key().as_ref()], bump = member.bump)]
    pub member: Account<'info, Member>,
    #[account(mut, seeds = [CHEST_SEED, clan.key().as_ref()], bump = clan.chest_bump)]
    pub chest: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Propose<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub clan: Account<'info, Clan>,
    #[account(seeds = [MEMBER_SEED, clan.key().as_ref(), wallet.key().as_ref()], bump = member.bump)]
    pub member: Account<'info, Member>,
    #[account(init, payer = wallet, space = 8 + Proposal::INIT_SPACE, seeds = [PROPOSAL_SEED, clan.key().as_ref(), &clan.proposals.to_le_bytes()], bump)]
    pub proposal: Account<'info, Proposal>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    pub clan: Account<'info, Clan>,
    #[account(seeds = [MEMBER_SEED, clan.key().as_ref(), wallet.key().as_ref()], bump = member.bump)]
    pub member: Account<'info, Member>,
    #[account(mut, has_one = clan)]
    pub proposal: Account<'info, Proposal>,
    #[account(init, payer = wallet, space = 8 + Vote::INIT_SPACE, seeds = [VOTE_SEED, proposal.key().as_ref(), wallet.key().as_ref()], bump)]
    pub vote: Account<'info, Vote>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(mut)]
    pub captain: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, constraint = clan.captain == captain.key() @ ClashyError::NotCaptain)]
    pub clan: Account<'info, Clan>,
    #[account(mut, has_one = clan)]
    pub proposal: Account<'info, Proposal>,
    #[account(init, payer = captain, space = 8 + ClanPosition::INIT_SPACE, seeds = [POSITION_SEED, clan.key().as_ref(), &proposal.id.to_le_bytes()], bump)]
    pub position: Account<'info, ClanPosition>,
    /// CHECK: validated against the configured feed for the proposal's coin.
    pub price: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RejectProposal<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    pub captain: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, constraint = clan.captain == captain.key() @ ClashyError::NotCaptain)]
    pub clan: Account<'info, Clan>,
    #[account(mut, has_one = clan)]
    pub position: Account<'info, ClanPosition>,
    /// CHECK: validated against the configured feed for the position's coin.
    pub price: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct DeclareWar<'info> {
    #[account(mut)]
    pub captain: Signer<'info>,
    #[account(mut, constraint = clan_a.captain == captain.key() @ ClashyError::NotCaptain)]
    pub clan_a: Account<'info, Clan>,
    pub clan_b: Account<'info, Clan>,
    #[account(mut, seeds = [CHEST_SEED, clan_a.key().as_ref()], bump = clan_a.chest_bump)]
    pub chest_a: SystemAccount<'info>,
    #[account(init, payer = captain, space = 8 + War::INIT_SPACE, seeds = [WAR_SEED, clan_a.key().as_ref(), clan_b.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub war: Account<'info, War>,
    #[account(mut, seeds = [VAULT_SEED, war.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptWar<'info> {
    pub captain: Signer<'info>,
    #[account(address = war.clan_a)]
    pub clan_a: Account<'info, Clan>,
    #[account(mut, address = war.clan_b, constraint = clan_b.captain == captain.key() @ ClashyError::NotCaptain)]
    pub clan_b: Account<'info, Clan>,
    #[account(mut, seeds = [CHEST_SEED, clan_b.key().as_ref()], bump = clan_b.chest_bump)]
    pub chest_b: SystemAccount<'info>,
    #[account(mut, seeds = [WAR_SEED, war.clan_a.as_ref(), war.clan_b.as_ref(), &war.nonce.to_le_bytes()], bump = war.bump)]
    pub war: Account<'info, War>,
    #[account(mut, seeds = [VAULT_SEED, war.key().as_ref()], bump = war.vault_bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelWar<'info> {
    pub captain: Signer<'info>,
    #[account(mut, address = war.clan_a, constraint = clan_a.captain == captain.key() @ ClashyError::NotCaptain)]
    pub clan_a: Account<'info, Clan>,
    #[account(mut, seeds = [CHEST_SEED, clan_a.key().as_ref()], bump = clan_a.chest_bump)]
    pub chest_a: SystemAccount<'info>,
    #[account(mut, seeds = [WAR_SEED, war.clan_a.as_ref(), war.clan_b.as_ref(), &war.nonce.to_le_bytes()], bump = war.bump)]
    pub war: Account<'info, War>,
    #[account(mut, seeds = [VAULT_SEED, war.key().as_ref()], bump = war.vault_bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleWar<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, address = war.clan_a)]
    pub clan_a: Account<'info, Clan>,
    #[account(mut, address = war.clan_b)]
    pub clan_b: Account<'info, Clan>,
    #[account(mut, seeds = [CHEST_SEED, clan_a.key().as_ref()], bump = clan_a.chest_bump)]
    pub chest_a: SystemAccount<'info>,
    #[account(mut, seeds = [CHEST_SEED, clan_b.key().as_ref()], bump = clan_b.chest_bump)]
    pub chest_b: SystemAccount<'info>,
    #[account(mut, seeds = [WAR_SEED, war.clan_a.as_ref(), war.clan_b.as_ref(), &war.nonce.to_le_bytes()], bump = war.bump)]
    pub war: Account<'info, War>,
    #[account(mut, seeds = [VAULT_SEED, war.key().as_ref()], bump = war.vault_bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: must equal config.treasury.
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateTournament<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(init, payer = creator, space = 8 + Tournament::INIT_SPACE, seeds = [TOUR_SEED, creator.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub tournament: Account<'info, Tournament>,
    #[account(seeds = [VAULT_SEED, tournament.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinTournament<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(mut, seeds = [TOUR_SEED, tournament.creator.as_ref(), &tournament.nonce.to_le_bytes()], bump = tournament.bump)]
    pub tournament: Account<'info, Tournament>,
    #[account(mut, seeds = [VAULT_SEED, tournament.key().as_ref()], bump = tournament.vault_bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelTournament<'info> {
    #[account(address = tournament.creator @ ClashyError::Unauthorized)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [TOUR_SEED, tournament.creator.as_ref(), &tournament.nonce.to_le_bytes()], bump = tournament.bump)]
    pub tournament: Account<'info, Tournament>,
    #[account(mut, seeds = [VAULT_SEED, tournament.key().as_ref()], bump = tournament.vault_bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[vrf]
#[derive(Accounts)]
pub struct RequestTournamentCoin<'info> {
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
    #[account(mut)]
    pub payer: Signer<'info>,
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
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TOUR_SEED, tournament.creator.as_ref(), &tournament.nonce.to_le_bytes()], bump = tournament.bump)]
    pub tournament: Account<'info, Tournament>,
    #[account(mut, seeds = [VAULT_SEED, tournament.key().as_ref()], bump = tournament.vault_bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: must equal config.treasury.
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}
