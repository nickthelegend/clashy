//! Reads a coin price from either a Clashy `PriceFeed` (pushed by the crank) or a MagicBlock
//! pricing-oracle account (PriceUpdateV2 layout, republished Pyth Lazer feeds).
use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

use crate::constants::*;
use crate::error::ClashyError;
use crate::state::PriceFeed;

#[derive(AnchorDeserialize)]
struct PriceFeedMessage {
    _feed_id: [u8; 32],
    price: i64,
    _conf: u64,
    exponent: i32,
    publish_time: i64,
}

#[derive(AnchorDeserialize)]
enum VerificationLevel {
    Partial { _num_signatures: u8 },
    Full,
}

#[derive(AnchorDeserialize)]
struct PriceUpdateV2Head {
    _write_authority: Pubkey,
    _verification_level: VerificationLevel,
    message: PriceFeedMessage,
}

/// Returns the price scaled to `PRICE_SCALE`, checking identity, owner, layout and freshness.
pub fn read_price(account: &AccountInfo, expected: &Pubkey, now: i64, max_age: i64) -> Result<u64> {
    require_keys_eq!(account.key(), *expected, ClashyError::FeedMismatch);
    let data = account.try_borrow_data()?;
    require!(data.len() > 8, ClashyError::FeedInvalid);
    let (price, ts) = if account.owner == &crate::ID {
        require!(data[..8] == PriceFeed::DISCRIMINATOR[..], ClashyError::FeedInvalid);
        let feed = PriceFeed::try_deserialize(&mut &data[..]).map_err(|_| error!(ClashyError::FeedInvalid))?;
        (feed.price, feed.updated_at)
    } else if account.owner == &ORACLE_PROGRAM_ID {
        require!(data[..8] == PRICE_UPDATE_DISCRIMINATOR[..], ClashyError::FeedInvalid);
        let mut body = &data[8..];
        let head = PriceUpdateV2Head::deserialize(&mut body).map_err(|_| error!(ClashyError::FeedInvalid))?;
        let m = head.message;
        require!(m.price > 0, ClashyError::PriceZero);
        (scale(m.price as u128, oracle_exponent(m.exponent))?, m.publish_time)
    } else {
        return err!(ClashyError::FeedInvalid);
    };
    require!(price > 0, ClashyError::PriceZero);
    require!(now - ts <= max_age && ts - now <= 5, ClashyError::PriceStale);
    Ok(price)
}

/// MagicBlock's oracle writes the exponent as a positive count of decimals (+8 means value x 10^-8, checked against
/// live devnet feeds on Nov 25, 2026), while Pyth's own PriceUpdateV2 uses a negative one. A price is never quoted in
/// units of 10^8 USD, so a positive exponent is read as decimals.
fn oracle_exponent(e: i32) -> i32 {
    if e > 0 { -e } else { e }
}

/// Converts `value * 10^exponent` USD into `PRICE_SCALE` (6 decimals).
fn scale(value: u128, exponent: i32) -> Result<u64> {
    let shift = exponent + 6;
    let v = if shift >= 0 {
        value.checked_mul(10u128.pow(shift as u32)).ok_or(ClashyError::Overflow)?
    } else {
        value / 10u128.pow((-shift) as u32)
    };
    u64::try_from(v).map_err(|_| error!(ClashyError::Overflow))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scales_pyth_exponents() {
        // 64,123.45678901 with exponent -8 -> 64,123.456789 at 6 decimals
        assert_eq!(scale(6_412_345_678_901, -8).unwrap(), 64_123_456_789);
        assert_eq!(scale(71, 0).unwrap(), 71_000_000);
    }

    /// A real MagicBlock oracle account (SOL/USD, Pyth Lazer id 6), read from devnet-as.magicblock.app on Nov 25, 2026.
    const SOL_FEED_B64: &str = "6qEOJKzvD+gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHGrT6EHZwPJIrf+Qz3dvg5/Vnxy9j/vI+UAog+oW6EID/DYJoBAAAAAAAAAAAAAAAIAAAAk4oGawAAAACTigZrAAAAAAAAAAAAAAAAAAAAAAAAAAAV5zpFAAAAAAA=";

    #[test]
    fn reads_a_real_magicblock_oracle_account() {
        use base64::Engine;
        let mut data = base64::engine::general_purpose::STANDARD.decode(SOL_FEED_B64).unwrap();
        let key = pubkey!("ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu");
        let owner = ORACLE_PROGRAM_ID;
        let mut lamports = 1u64;
        let info = AccountInfo::new(&key, false, false, &mut lamports, &mut data, &owner, false, 0);
        let ts = 1_795_590_803i64; // the feed's publish_time
        let p = read_price(&info, &key, ts, 15).unwrap();
        assert!((60_000_000..80_000_000).contains(&p), "SOL read as {p}"); // about $68.87 at 6 decimals
        assert!(read_price(&info, &key, ts + 60, 15).is_err(), "a minute-old price must be stale");
    }
}
