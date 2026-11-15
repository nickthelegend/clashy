use anchor_lang::prelude::*;

#[error_code]
pub enum ClashyError {
    #[msg("Only the config authority can do this")]
    Unauthorized,
    #[msg("Rake is above the 10% cap")]
    RakeTooHigh,
    #[msg("Coin index is out of range or not configured")]
    BadCoin,
    #[msg("Price account does not match the configured feed")]
    FeedMismatch,
    #[msg("Price account has the wrong owner or layout")]
    FeedInvalid,
    #[msg("Price is stale")]
    PriceStale,
    #[msg("Price must be positive")]
    PriceZero,
    #[msg("Stake is below the minimum")]
    StakeTooLow,
    #[msg("Duel length is out of range")]
    BadLength,
    #[msg("Leverage is out of range")]
    BadLeverage,
    #[msg("Side must be 1 (long) or 2 (short)")]
    BadSide,
    #[msg("This step is not allowed in the current status")]
    WrongStatus,
    #[msg("The challenge has expired")]
    Expired,
    #[msg("The challenge has not expired yet")]
    NotExpired,
    #[msg("You cannot join your own duel")]
    SelfJoin,
    #[msg("Not a player in this game")]
    NotPlayer,
    #[msg("Already done")]
    AlreadyDone,
    #[msg("Reveal does not match the committed hash")]
    RevealMismatch,
    #[msg("Both players must commit before revealing")]
    CommitsPending,
    #[msg("This deployment requires MagicBlock VRF for randomness")]
    VrfRequired,
    #[msg("VRF queue does not match")]
    InvalidQueue,
    #[msg("A VRF request is already in flight")]
    VrfInflight,
    #[msg("Coin pool is empty")]
    EmptyPool,
    #[msg("The game is still running")]
    StillRunning,
    #[msg("Payout account does not match")]
    PayoutMismatch,
    #[msg("Clan name is empty or too long")]
    BadName,
    #[msg("Already in a clan")]
    AlreadyInClan,
    #[msg("Not in this clan")]
    NotInClan,
    #[msg("Only the clan captain can do this")]
    NotCaptain,
    #[msg("Not enough in the clan chest")]
    ChestTooLow,
    #[msg("The chest is locked by an active war")]
    WarLocked,
    #[msg("Vote window is out of range")]
    BadVoteWindow,
    #[msg("Voting is closed")]
    VotingClosed,
    #[msg("Voting is still open and has no majority yet")]
    VotingOpen,
    #[msg("The proposal did not pass")]
    NotPassed,
    #[msg("You need a chest deposit to vote")]
    NoWeight,
    #[msg("Size must be between 1 and 100 percent")]
    BadSize,
    #[msg("A clan cannot war itself")]
    SelfWar,
    #[msg("War length is out of range")]
    BadWarLength,
    #[msg("The war has not ended")]
    WarNotOver,
    #[msg("Tournament is full")]
    TourFull,
    #[msg("Already joined")]
    AlreadyJoined,
    #[msg("Need at least two players")]
    TooFewPlayers,
    #[msg("Round is still running")]
    RoundRunning,
    #[msg("Round is over; wait for it to resolve")]
    RoundOver,
    #[msg("You are out of this tournament")]
    Eliminated,
    #[msg("Math overflow")]
    Overflow,
    #[msg("A war can stake at most half the chest")]
    WarStakeTooBig,
    #[msg("Not enough chest shares")]
    NotEnoughShares,
    #[msg("The rollup validator is not configured")]
    NoValidator,
    #[msg("Close every clan position first")]
    PositionsOpen,
    #[msg("Withdrawals wait until the clan's open votes close")]
    VoteOpen,
}
