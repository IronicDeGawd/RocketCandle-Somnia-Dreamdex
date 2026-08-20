// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title RocketCandleGame
 * @dev Combined ERC20 token and game logic contract for Rocket Candle
 * Unified contract with game mechanics and WICK token economy
 */
contract RocketCandleGame is ERC20, Ownable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    struct GameSession {
        uint256 score;
        uint256 level;
        uint256 gameTime;
        uint256 timestamp;
        address player;
        uint16 enemiesDestroyed;
        uint16 rocketsUsed;
        /*
         * The trade that paid for the run.
         *
         * A run and its trade were two records with nothing joining them: the
         * contract stored the score, an off-chain service stored the trade, and
         * showing them together meant matching on timestamps and hoping. Held
         * here so the run IS the trade.
         *
         * uint128 and int128 share one slot, which on Somnia is 200,000 gas
         * rather than the 400,000 two slots would cost. Both are USDso at 18
         * decimals, so uint128 tops out around 3.4e20 USDso - a range no player
         * will reach, and one the guards below refuse to truncate.
         */
        uint128 stakeUsdso;
        int128 pnlUsdso;
    }

    /**
     * @dev Everything the attestation service signs about one finished run.
     *
     * The field order here is the order in RUN_TYPEHASH, after the player. A
     * signature is computed over exactly this sequence, so the two must be read
     * together - a reordering that still compiles produces "Bad attestation"
     * with nothing pointing at the cause.
     */
    struct RunClaim {
        uint256 score;
        uint256 level;
        uint256 gameTime;
        uint16 enemiesDestroyed;
        uint16 rocketsUsed;
        uint128 stakeUsdso;
        int128 pnlUsdso;
        uint256 nonce;
        uint256 deadline;
    }

    struct LeaderboardEntry {
        address player;
        uint256 score;
        uint256 timestamp;
    }

    // Storage
    mapping(address => GameSession[]) public playerHistory;
    mapping(uint256 => bool) public weeklyRewardsClaimed;

    /*
     * The weekly board, keyed rather than scanned.
     *
     * This was an array searched linearly for the player, inside submitScore -
     * a write path a player pays for. Somnia charges 1,000,000 gas to touch a
     * slot not recently accessed, so the cost grew by up to a million per
     * player already on the board: the thousandth player of a week would have
     * paid about 6 SOMI to submit one score, and around fifteen thousand it
     * exceeds the block gas limit entirely.
     *
     * Keyed by player, the write touches only that player's own slots - which
     * their own transaction warms anyway - and costs the same whether they are
     * the first entrant of the week or the ten thousandth.
     */
    mapping(uint256 => mapping(address => uint256)) public weeklyBest;

    /*
     * Who has played each week, for enumeration only.
     *
     * Appended once, on a player's first run of the week. Nothing reads it in a
     * write path; putting a scan back in one is the mistake this replaced.
     */
    mapping(uint256 => address[]) public weeklyPlayers;

    /*
     * A player's best score ever.
     *
     * getPlayerStats used to derive this by looping every session the player
     * had ever recorded. A view costs the player nothing, but each session read
     * is a cold slot, so past a few dozen games the call approached the limit an
     * RPC will answer and the stats line silently stopped arriving.
     */
    mapping(address => uint256) public bestScoreOf;

    // Events
    event GameCompleted(
        address indexed player,
        uint256 score,
        uint256 level,
        uint256 gameTime,
        uint16 enemiesDestroyed
    );
    event TokensEarned(address indexed player, uint256 amount);
    event WeeklyLeaderboardUpdated(uint256 week, address player, uint256 score);
    event RevivePurchased(address indexed player, uint256 cost);

    // Token Economics Constants
    uint256 public constant TOKENS_PER_1000_SCORE = 1 * 10 ** 18; // 1 WICK per 1,000 score
    uint256 public constant TOKENS_PER_LEVEL = 15 * 10 ** 17; // 1.5 WICK per level completed
    uint256 public constant REVIVE_COST = 50 * 10 ** 18; // 50 WICK for revive
    uint256 public constant FIREPOWER_COST = 75 * 10 ** 18; // 75 WICK for a bigger opening position
    uint256 public constant MARKET_PASS_COST = 150 * 10 ** 18; // 150 WICK to enter the expensive market
    uint256 public constant MARKET_PASS_DURATION = 7 days;

    /// @dev Smallest balance that can claim a share of a week's pot.
    uint256 public constant CLAIM_THRESHOLD = 100 * 10 ** 18;
    uint256 public constant MAX_TOTAL_SUPPLY = 10000000 * 10 ** 18; // 10 million WICK max
    uint256 public constant TREASURY_RESERVE = 9000000 * 10 ** 18; // 9 million for rewards

    // Anti-cheat constants
    uint256 public constant MIN_GAME_TIME = 5; // Minimum 5 seconds
    uint256 public constant MAX_SCORE_PER_SECOND = 2000; // Max score rate
    uint256 public constant MAX_LEVEL = 7; // Maximum level in game

    /// @dev Field order must match the attestation service exactly.
    bytes32 private constant RUN_TYPEHASH =
        keccak256(
            "Run(address player,uint256 score,uint256 level,uint256 gameTime,uint16 enemiesDestroyed,uint16 rocketsUsed,uint128 stakeUsdso,int128 pnlUsdso,uint256 nonce,uint256 deadline)"
        );

    /// @dev Address whose signature this contract will accept for a run.
    address public runAttestor;

    /// @dev Nonces already claimed, so a signed run cannot be submitted twice.
    mapping(uint256 => bool) public usedRunNonces;

    event RunAttestorUpdated(address indexed oldAttestor, address indexed newAttestor);

    /**
     * @dev Point the contract at a different signing key.
     *
     * This is the whole reason the attestor is a variable rather than a
     * constant: if the signing key leaks, rotating it here stops every forged
     * attestation immediately, without redeploying or migrating balances.
     */
    function setRunAttestor(address _attestor) external onlyOwner {
        require(_attestor != address(0), "Invalid attestor");
        emit RunAttestorUpdated(runAttestor, _attestor);
        runAttestor = _attestor;
    }

    constructor(address _runAttestor, address _stakeToken)
        ERC20("Rocket Candle Wick", "WICK")
        Ownable(msg.sender)
        EIP712("RocketCandle", "1")
    {
        require(_runAttestor != address(0), "Invalid attestor");
        require(_stakeToken != address(0), "Invalid stake token");
        runAttestor = _runAttestor;
        stakeToken = IERC20(_stakeToken);

        // Mint treasury to contract
        _mint(address(this), TREASURY_RESERVE);
        // Mint initial supply to deployer
        _mint(msg.sender, 1000000 * 10 ** 18);
    }

    /**
     * @dev Submit game score and receive WICK tokens
     */
    function submitScore(
        RunClaim calldata _run,
        bytes calldata _signature
    ) external nonReentrant whenNotPaused {
        // A player used to be able to report whatever score they liked. Now the
        // numbers have to arrive countersigned by the attestation service, and
        // each signature spends a nonce so the same run cannot be claimed twice.
        require(block.timestamp <= _run.deadline, "Attestation expired");
        require(!usedRunNonces[_run.nonce], "Run already claimed");

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    RUN_TYPEHASH,
                    msg.sender,
                    _run.score,
                    _run.level,
                    _run.gameTime,
                    _run.enemiesDestroyed,
                    _run.rocketsUsed,
                    _run.stakeUsdso,
                    _run.pnlUsdso,
                    _run.nonce,
                    _run.deadline
                )
            )
        );
        require(digest.recover(_signature) == runAttestor, "Bad attestation");

        usedRunNonces[_run.nonce] = true;

        require(_run.score > 0, "Invalid score");
        require(_run.level > 0 && _run.level <= MAX_LEVEL, "Invalid level");
        require(_run.gameTime >= MIN_GAME_TIME, "Game too short");
        require(_run.enemiesDestroyed > 0, "Must destroy enemies");
        require(_run.rocketsUsed > 0, "Must use rockets");

        // Basic anti-cheat validation
        require(isScoreValid(_run.score, _run.gameTime), "Suspicious score");

        // Create game session
        GameSession memory session = GameSession({
            score: _run.score,
            level: _run.level,
            gameTime: _run.gameTime,
            timestamp: block.timestamp,
            player: msg.sender,
            enemiesDestroyed: _run.enemiesDestroyed,
            rocketsUsed: _run.rocketsUsed,
            stakeUsdso: _run.stakeUsdso,
            pnlUsdso: _run.pnlUsdso
        });

        // Store in player history
        playerHistory[msg.sender].push(session);

        // Kept rather than derived. Deriving it meant looping every session a
        // player had ever recorded, and each of those reads is a cold slot.
        if (_run.score > bestScoreOf[msg.sender]) {
            bestScoreOf[msg.sender] = _run.score;
        }

        // Update weekly leaderboard
        uint256 currentWeek = getCurrentWeek();
        updateWeeklyLeaderboard(currentWeek, msg.sender, _run.score);

        // Calculate and award tokens from treasury
        uint256 tokensEarned = calculateTokenReward(_run.score, _run.level);
        if (tokensEarned > 0 && balanceOf(address(this)) >= tokensEarned) {
            _transfer(address(this), msg.sender, tokensEarned);
            emit TokensEarned(msg.sender, tokensEarned);

            // Record the points against this week so the pot can be shared out
            // once the week closes. Counted at the moment they are earned, so a
            // later purchase or transfer cannot change anybody's slice.
            weeklyPointsEarned[currentWeek][msg.sender] += tokensEarned;
            weeklyPointsTotal[currentWeek] += tokensEarned;
        }

        emit GameCompleted(
            msg.sender,
            _run.score,
            _run.level,
            _run.gameTime,
            _run.enemiesDestroyed
        );
    }


    // --- Weekly pot -------------------------------------------------------
    //
    // WICK is points, not a promise of a fixed amount of money. A fixed rate -
    // so many points always buy so much - is a well with no bottom: anybody who
    // earns faster than planned drains it, and the only way out is to break the
    // rate, which players never forgive.
    //
    // So a week's pot is shared out instead. Your points that week, divided by
    // everybody's points that week, is your slice. A busy week pays a bigger
    // pot; a quiet one pays less. The pot can never pay out more than went into
    // it, so somebody farming points mostly dilutes themselves.

    /// @dev What the pot is paid in - USDso, the currency runs are staked in.
    IERC20 public stakeToken;

    mapping(uint256 => uint256) public weeklyPot;
    mapping(uint256 => uint256) public weeklyPointsTotal;
    mapping(uint256 => mapping(address => uint256)) public weeklyPointsEarned;
    mapping(uint256 => mapping(address => bool)) public weeklyClaimed;

    event WeeklyPotFunded(uint256 indexed week, address indexed from, uint256 amount);
    event WeeklyShareClaimed(uint256 indexed week, address indexed player, uint256 amount);

    /**
     * @dev Add to the current week's pot.
     *
     * Open to anyone: entry stakes will feed it, and the treasury can top it up
     * to get a demo going. Funds land in whichever week is running when they
     * arrive, so a late contribution cannot dilute a week already being claimed.
     */
    function fundWeeklyPot(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Nothing to add");

        uint256 week = getCurrentWeek();
        // Measure what actually arrived rather than what was asked for, so a
        // token that takes a cut on transfer cannot leave the pot overstated.
        uint256 before = stakeToken.balanceOf(address(this));
        stakeToken.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 received = stakeToken.balanceOf(address(this)) - before;

        weeklyPot[week] += received;
        emit WeeklyPotFunded(week, msg.sender, received);
    }

    /**
     * @dev Claim your share of a finished week.
     *
     * Only past weeks can be claimed, so the split is over a total that can no
     * longer move. Holding the threshold is a gate on claiming, not a price:
     * claiming spends no WICK, and your slice depends on what you earned that
     * week, not on what you hold now.
     */
    function claimWeeklyShare(uint256 _week) external nonReentrant whenNotPaused {
        require(_week < getCurrentWeek(), "Week still running");
        require(!weeklyClaimed[_week][msg.sender], "Already claimed");
        require(balanceOf(msg.sender) >= CLAIM_THRESHOLD, "Below claim threshold");

        uint256 earned = weeklyPointsEarned[_week][msg.sender];
        require(earned > 0, "Nothing earned that week");

        uint256 total = weeklyPointsTotal[_week];
        uint256 pot = weeklyPot[_week];
        require(total > 0 && pot > 0, "Nothing to share");

        weeklyClaimed[_week][msg.sender] = true;

        uint256 share = (pot * earned) / total;
        require(share > 0, "Share rounds to nothing");

        stakeToken.safeTransfer(msg.sender, share);
        emit WeeklyShareClaimed(_week, msg.sender, share);
    }

    // --- Sinks ------------------------------------------------------------
    //
    // A points token that is only ever earned inflates until it means nothing.
    // These burn it. Every one of them buys something a player actually wants,
    // and none of them can be bought with money - only with points.

    mapping(address => uint256) public marketPassExpiry;

    event FirepowerPurchased(address indexed player, uint256 cost);
    event MarketPassPurchased(address indexed player, uint256 cost, uint256 expiresAt);

    /**
     * @dev Spend points for a bigger opening position on the next run.
     *
     * Buys more firepower without staking more real money, which is the point:
     * a player who has been grinding can punch above their stake.
     */
    function purchaseFirepower() external nonReentrant whenNotPaused {
        require(balanceOf(msg.sender) >= FIREPOWER_COST, "Insufficient WICK");
        _burn(msg.sender, FIREPOWER_COST);
        emit FirepowerPurchased(msg.sender, FIREPOWER_COST);
    }

    /**
     * @dev Spend points to enter the expensive market.
     *
     * Bitcoin's minimum trade is a real wall for a new player. This lets points
     * pay that entry instead of cash.
     */
    function purchaseMarketPass() external nonReentrant whenNotPaused {
        require(balanceOf(msg.sender) >= MARKET_PASS_COST, "Insufficient WICK");
        _burn(msg.sender, MARKET_PASS_COST);

        // Extend from whenever the current pass runs out, so buying early never
        // throws away time already paid for.
        uint256 from = marketPassExpiry[msg.sender] > block.timestamp
            ? marketPassExpiry[msg.sender]
            : block.timestamp;
        marketPassExpiry[msg.sender] = from + MARKET_PASS_DURATION;

        emit MarketPassPurchased(msg.sender, MARKET_PASS_COST, marketPassExpiry[msg.sender]);
    }

    /// @dev Does this player currently hold a pass to the expensive market?
    function hasMarketPass(address _player) external view returns (bool) {
        return marketPassExpiry[_player] > block.timestamp;
    }

    /**
     * @dev Purchase revive using WICK tokens
     */
    function purchaseRevive() external nonReentrant whenNotPaused {
        require(
            balanceOf(msg.sender) >= REVIVE_COST,
            "Insufficient WICK"
        );

        // Burn tokens for revive
        _burn(msg.sender, REVIVE_COST);

        emit RevivePurchased(msg.sender, REVIVE_COST);
    }

    /**
     * @dev Calculate token reward based on score and level
     */
    function calculateTokenReward(
        uint256 _score,
        uint256 _level
    ) public pure returns (uint256) {
        uint256 scoreReward = (_score / 1000) * TOKENS_PER_1000_SCORE;
        uint256 levelReward = _level * TOKENS_PER_LEVEL;
        return scoreReward + levelReward;
    }

    /**
     * @dev Validate score against time played (anti-cheat)
     */
    function isScoreValid(
        uint256 _score,
        uint256 _gameTime
    ) public pure returns (bool) {
        if (_gameTime < MIN_GAME_TIME) return false;

        uint256 maxPossibleScore = _gameTime * MAX_SCORE_PER_SECOND;
        return _score <= maxPossibleScore;
    }

    /**
     * @dev Get current week number (for leaderboards)
     */
    function getCurrentWeek() public view returns (uint256) {
        return block.timestamp / (7 days);
    }

    /**
     * @dev Record a player's best score for the week.
     */
    function updateWeeklyLeaderboard(
        uint256 _week,
        address _player,
        uint256 _score
    ) internal {
        /*
         * Two slot touches, whoever the player is.
         *
         * This used to search the whole week's array for the player. On Somnia a
         * slot nobody has touched lately costs 1,000,000 gas, so that search
         * charged up to a million per player already on the board - a bill the
         * last arrivals of a busy week paid on behalf of everyone before them,
         * and one that passes the block gas limit at around fifteen thousand.
         */
        if (weeklyBest[_week][_player] == 0) {
            // First run of the week for this player: remember them so the board
            // can still be enumerated. Appended once, never scanned.
            weeklyPlayers[_week].push(_player);
        }

        if (_score > weeklyBest[_week][_player]) {
            weeklyBest[_week][_player] = _score;
        }

        emit WeeklyLeaderboardUpdated(_week, _player, _score);
    }

    /** @dev How many players have a score this week. */
    function getWeeklyPlayerCount(
        uint256 _week
    ) external view returns (uint256) {
        return weeklyPlayers[_week].length;
    }

    /**
     * @dev A week's board, in the order players first appeared.
     *
     * Unsorted on purpose. This used to bubble sort in memory, quadratic in the
     * entries requested, with its own comment apologising for it - and ordering
     * is work the page can do for nothing once the call has returned.
     *
     * Paged, because a week with thousands of players is not a call any node
     * will answer in one piece.
     *
     * @param _offset where to start in the week's player list
     * @param _limit how many to return from there
     */
    function getWeeklyScores(
        uint256 _week,
        uint256 _offset,
        uint256 _limit
    ) external view returns (LeaderboardEntry[] memory) {
        address[] storage players = weeklyPlayers[_week];

        if (_offset >= players.length) return new LeaderboardEntry[](0);

        uint256 remaining = players.length - _offset;
        uint256 count = remaining < _limit ? remaining : _limit;

        LeaderboardEntry[] memory entries = new LeaderboardEntry[](count);
        for (uint256 i = 0; i < count; i++) {
            address player = players[_offset + i];
            entries[i] = LeaderboardEntry({
                player: player,
                score: weeklyBest[_week][player],
                // The board keeps a best score, not the moment it was set. A
                // timestamp per entry is another slot per player for something
                // nothing displays.
                timestamp: 0
            });
        }

        return entries;
    }

    /**
     * @dev Get player statistics
     */
    function getPlayerStats(
        address _player
    )
        external
        view
        returns (uint256 totalGames, uint256 bestScore, uint256 totalTokens)
    {
        // Read, not derived. The loop this replaced touched one cold slot per
        // session, so a player with a few dozen games could push this view past
        // what an RPC will answer - and the stats line simply stopped arriving,
        // with no error to explain why.
        totalGames = playerHistory[_player].length;
        bestScore = bestScoreOf[_player];
        totalTokens = balanceOf(_player);
    }

    /**
     * @dev Get player's game history
     */
    function getPlayerHistory(
        address _player
    ) external view returns (GameSession[] memory) {
        return playerHistory[_player];
    }

    // Emergency pause functionality
    bool public paused = false;

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    // --- Carrying players across a redeploy ------------------------------
    //
    // A new deployment is a new token contract: every balance and every score
    // starts empty. That is harmless while only the developers have played, and
    // unacceptable once it is not - so the recovery path exists before it is
    // needed rather than after.
    //
    // It is a window, not a permanent power. While open the owner can seed a
    // player's best score and hand them WICK from the treasury; sealing it is
    // irreversible, and a sealed contract has no path to either.

    /// @dev True until the owner seals it, after which it can never reopen.
    bool public migrationOpen = true;

    event PlayerMigrated(address indexed player, uint256 bestScore, uint256 wick);
    event MigrationSealed(uint256 at);

    /**
     * @dev Carry one player's standing over from a previous deployment.
     *
     * Deliberately narrow. It restores the best score and moves WICK out of the
     * treasury - it does not mint, so nothing here can exceed what the treasury
     * already holds, and it cannot fabricate game history: the sessions
     * themselves stay on the old contract, where they remain readable.
     *
     * @param _player who is being carried over
     * @param _bestScore their best score on the previous deployment
     * @param _wick WICK to hand them from the treasury, or zero
     */
    function migratePlayer(
        address _player,
        uint256 _bestScore,
        uint256 _wick
    ) external onlyOwner {
        require(migrationOpen, "Migration sealed");
        require(_player != address(0), "Invalid player");

        // Never downgrade somebody who has already played here.
        if (_bestScore > bestScoreOf[_player]) {
            bestScoreOf[_player] = _bestScore;
        }

        if (_wick > 0) {
            require(
                balanceOf(address(this)) >= _wick,
                "Insufficient treasury"
            );
            _transfer(address(this), _player, _wick);
        }

        emit PlayerMigrated(_player, _bestScore, _wick);
    }

    /**
     * @dev Close the window for good.
     *
     * One way on purpose. A migration window that can be reopened is just an
     * owner mint with extra steps, and the point of sealing it is that players
     * can verify it is shut.
     */
    function sealMigration() external onlyOwner {
        require(migrationOpen, "Already sealed");
        migrationOpen = false;
        emit MigrationSealed(block.timestamp);
    }

    function emergencyTokenTransfer(
        address _to,
        uint256 _amount
    ) external onlyOwner {
        require(
            balanceOf(address(this)) >= _amount,
            "Insufficient contract balance"
        );
        _transfer(address(this), _to, _amount);
    }
}
