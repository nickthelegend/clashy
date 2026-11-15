use crate::constants::*;
use crate::state::side;

/// Leveraged P&L of a position in basis points of its margin, floored at -100% (a knockout).
pub fn pnl_bps(entry: u64, price: u64, dir: u8, lev: u16) -> i64 {
    if entry == 0 {
        return 0;
    }
    // leverage is applied before dividing, so small moves at high leverage are not rounded away
    let lev_bps = ((price as i128 - entry as i128) * BPS as i128 * lev as i128) / entry as i128;
    let signed = if dir == side::SHORT { -lev_bps } else { lev_bps };
    signed.max(-(BPS as i128)).min(i64::MAX as i128) as i64
}

/// Picks a coin index from `pool_mask` (bits over `coin_count` coins) using 32 bytes of randomness.
pub fn pick_coin(randomness: &[u8; 32], pool_mask: u8, coin_count: u8) -> Option<u8> {
    let allowed: Vec<u8> = (0..coin_count.min(MAX_COINS as u8))
        .filter(|i| pool_mask & (1u8 << i) != 0)
        .collect();
    if allowed.is_empty() {
        return None;
    }
    let mut word = [0u8; 8];
    word.copy_from_slice(&randomness[..8]);
    let r = u64::from_le_bytes(word);
    Some(allowed[(r % allowed.len() as u64) as usize])
}

/// Splits a pot into (to_winners, rake) for a rake in basis points.
pub fn split_rake(pot: u64, rake_bps: u16) -> (u64, u64) {
    let rake = (pot as u128 * rake_bps as u128 / BPS as u128) as u64;
    (pot - rake, rake)
}

/// Elo update. Returns the new ratings for (a, b). `score_a` is 1.0 for a win, 0.5 tie, 0 loss,
/// passed as basis points (10000 / 5000 / 0) to stay in integers.
pub fn elo(a: i32, b: i32, score_a_bps: i32) -> (i32, i32) {
    let expected_a = expected_bps(b - a);
    // delta = K * (score - expected), rounded to the nearest point, in integers.
    let num = ELO_K * (score_a_bps - expected_a);
    let delta = if num >= 0 { (num + 5_000) / 10_000 } else { (num - 5_000) / 10_000 };
    (a + delta, b - delta)
}

/// Expected Elo score of the player rated `diff` points BELOW the opponent, in basis points:
/// 1 / (1 + 10^(diff / 400)), from a table at 50-point steps with linear interpolation (no floats on chain).
fn expected_bps(diff: i32) -> i32 {
    const T: [i32; 17] = [5000, 4285, 3599, 2974, 2403, 1924, 1510, 1172, 909, 697, 532, 404, 307, 232, 174, 131, 99];
    let d = diff.clamp(-800, 800);
    if d < 0 {
        return 10_000 - expected_bps(-d);
    }
    let i = (d / 50) as usize;
    if i >= 16 {
        return T[16];
    }
    let f = d % 50;
    T[i] + (T[i + 1] - T[i]) * f / 50
}

/// Commitment for a sealed pick: sha256(side || leverage_le || salt).
pub fn pick_preimage(dir: u8, lev: u16, salt: &[u8; 32]) -> Vec<u8> {
    let mut v = Vec::with_capacity(35);
    v.push(dir);
    v.extend_from_slice(&lev.to_le_bytes());
    v.extend_from_slice(salt);
    v
}

/// Paper P&L of a clan position in lamports of notional, floored at -notional.
pub fn position_pnl(notional: u64, entry: u64, price: u64, dir: u8, lev: u16) -> i64 {
    let bps = pnl_bps(entry, price, dir, lev);
    ((notional as i128 * bps as i128) / BPS as i128) as i64
}

/// Return of a clan over a war, in basis points of its starting chest.
pub fn war_return_bps(score_now: i64, score_start: i64, chest_start: u64) -> i64 {
    if chest_start == 0 {
        return 0;
    }
    (((score_now - score_start) as i128 * BPS as i128) / chest_start as i128) as i64
}

/// Outcome of one Royale round for a call (1 up, 2 down, 0 none) given the move.
/// A flat round is safe for everyone who called; no call always loses a life.
pub fn royale_call_ok(call: u8, start: u64, end: u64) -> bool {
    match call {
        1 => end >= start,
        2 => end <= start,
        _ => false,
    }
}

/// Shares minted for a deposit of `amount` into a chest worth `chest` with `shares` outstanding.
/// The first deposit (or any into an empty chest with no shares) mints 1:1.
pub fn shares_for_deposit(amount: u64, chest: u64, shares: u64) -> Option<u64> {
    if shares == 0 || chest == 0 {
        return if shares == 0 { Some(amount) } else { None };
    }
    u64::try_from(amount as u128 * shares as u128 / chest as u128).ok()
}

/// Lamports paid for redeeming `redeem` of `shares` outstanding from a chest worth `chest`.
pub fn payout_for_shares(redeem: u64, chest: u64, shares: u64) -> u64 {
    if shares == 0 {
        return 0;
    }
    (redeem as u128 * chest as u128 / shares as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chest_shares_are_pro_rata() {
        // two members put in 2 and 1 SOL: 3 SOL, 3e9 shares
        let s1 = shares_for_deposit(2_000_000_000, 0, 0).unwrap();
        let s2 = shares_for_deposit(1_000_000_000, 2_000_000_000, s1).unwrap();
        assert_eq!((s1, s2), (2_000_000_000, 1_000_000_000));
        // the clan loses a 0.6 SOL war stake: chest 2.4 SOL; each gets 80% back, in any order
        let chest = 2_400_000_000;
        let total = s1 + s2;
        let p2 = payout_for_shares(s2, chest, total);
        assert_eq!(p2, 800_000_000);
        assert_eq!(payout_for_shares(s1, chest - p2, total - s2), 1_600_000_000);
        // a new member after a win pays the higher share price
        let s3 = shares_for_deposit(1_200_000_000, 3_600_000_000, 3_000_000_000).unwrap();
        assert_eq!(s3, 1_000_000_000);
        // an empty chest with shares left cannot take deposits (old shares would dilute them)
        assert_eq!(shares_for_deposit(1, 0, 5), None);
    }

    #[test]
    fn pnl_long_and_short() {
        // 1% up at 50x = +50% = 5000 bps for a long, -5000 for a short
        assert_eq!(pnl_bps(100_000_000, 101_000_000, side::LONG, 50), 5_000);
        assert_eq!(pnl_bps(100_000_000, 101_000_000, side::SHORT, 50), -5_000);
    }

    #[test]
    fn pnl_keeps_small_moves_at_high_leverage() {
        // BTC 65,022.78 -> 65,025.25 is 0.38 bp; at 50x that is 18 bp, not 0
        assert_eq!(pnl_bps(65_022_780_000, 65_025_250_000, side::LONG, 50), 18);
        assert_eq!(pnl_bps(65_022_780_000, 65_025_250_000, side::SHORT, 50), -18);
    }

    #[test]
    fn pnl_floors_at_knockout() {
        assert_eq!(pnl_bps(100_000_000, 90_000_000, side::LONG, 100), -10_000);
    }

    #[test]
    fn pick_coin_respects_mask() {
        let r = [7u8; 32];
        for _ in 0..4 {
            let c = pick_coin(&r, 0b0000_0101, 3).unwrap();
            assert!(c == 0 || c == 2);
        }
        assert_eq!(pick_coin(&r, 0, 3), None);
        assert_eq!(pick_coin(&r, 0b1000_0000, 3), None, "bit beyond coin_count is ignored");
    }

    #[test]
    fn rake_split() {
        assert_eq!(split_rake(2_000_000, 300), (1_940_000, 60_000));
        assert_eq!(split_rake(2_000_000, 0), (2_000_000, 0));
    }

    #[test]
    fn elo_moves_symmetrically() {
        let (a, b) = elo(1000, 1000, 10_000);
        assert_eq!((a, b), (1016, 984));
        let (a, b) = elo(1000, 1000, 5_000);
        assert_eq!((a, b), (1000, 1000));
    }

    #[test]
    fn war_return() {
        assert_eq!(war_return_bps(500, 0, 10_000), 500);
        assert_eq!(war_return_bps(-200, 100, 10_000), -300);
    }

    #[test]
    fn royale_calls() {
        assert!(royale_call_ok(1, 100, 101));
        assert!(!royale_call_ok(1, 100, 99));
        assert!(royale_call_ok(2, 100, 99));
        assert!(royale_call_ok(2, 100, 100), "flat is safe for a caller");
        assert!(!royale_call_ok(0, 100, 101), "no call loses a life");
    }
}
