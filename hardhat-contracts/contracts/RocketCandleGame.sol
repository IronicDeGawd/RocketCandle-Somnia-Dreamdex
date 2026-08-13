// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title RocketCandleGame
 * @dev Combined ERC20 token and game logic contract for Rocket Candle
 * Unified contract with game mechanics and RocketFUEL token economy
 */
contract RocketCandleGame is ERC20, Ownable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    struct GameSession {
        uint256 score;
        uint256 level;
        uint256 gameTime;
        uint256 timestamp;
        address player;
        uint16 enemiesDestroyed;
        uint16 rocketsUsed;
    }

    struct LeaderboardEntry {
        address player;
        uint256 score;
        uint256 timestamp;
    }

    // Storage
    mapping(address => GameSession[]) public playerHistory;
    mapping(uint256 => LeaderboardEntry[]) public weeklyLeaderboards;
    mapping(uint256 => bool) public weeklyRewardsClaimed;

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
    uint256 public constant TOKENS_PER_1000_SCORE = 1 * 10 ** 18; // 1 RocketFUEL per 1,000 score
    uint256 public constant TOKENS_PER_LEVEL = 15 * 10 ** 17; // 1.5 RocketFUEL per level completed
    uint256 public constant REVIVE_COST = 50 * 10 ** 18; // 50 RocketFUEL for revive
    uint256 public constant MAX_TOTAL_SUPPLY = 10000000 * 10 ** 18; // 10 million RocketFUEL max
    uint256 public constant TREASURY_RESERVE = 9000000 * 10 ** 18; // 9 million for rewards

    // Weekly rewards
    uint256 public constant FIRST_PLACE_REWARD = 500 * 10 ** 18; // 500 RocketFUEL
    uint256 public constant SECOND_PLACE_REWARD = 300 * 10 ** 18; // 300 RocketFUEL
    uint256 public constant THIRD_PLACE_REWARD = 150 * 10 ** 18; // 150 RocketFUEL
    uint256 public constant TOP_10_REWARD = 25 * 10 ** 18; // 25 RocketFUEL for places 4-10

    // Anti-cheat constants
    uint256 public constant MIN_GAME_TIME = 5; // Minimum 5 seconds
    uint256 public constant MAX_SCORE_PER_SECOND = 2000; // Max score rate
    uint256 public constant MAX_LEVEL = 7; // Maximum level in game

    /// @dev Field order must match the attestation service exactly.
    bytes32 private constant RUN_TYPEHASH =
        keccak256(
            "Run(address player,uint256 score,uint256 level,uint256 gameTime,uint16 enemiesDestroyed,uint16 rocketsUsed,uint256 nonce,uint256 deadline)"
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

    constructor(address _runAttestor)
        ERC20("Rocket Candle Fuel", "RocketFUEL")
        Ownable(msg.sender)
        EIP712("RocketCandle", "1")
    {
        require(_runAttestor != address(0), "Invalid attestor");
        runAttestor = _runAttestor;

        // Mint treasury to contract
        _mint(address(this), TREASURY_RESERVE);
        // Mint initial supply to deployer
        _mint(msg.sender, 1000000 * 10 ** 18);
    }

    /**
     * @dev Submit game score and receive RocketFUEL tokens
     */
    function submitScore(
        uint256 _score,
        uint256 _level,
        uint256 _gameTime,
        uint16 _enemiesDestroyed,
        uint16 _rocketsUsed,
        uint256 _nonce,
        uint256 _deadline,
        bytes calldata _signature
    ) external nonReentrant whenNotPaused {
        // A player used to be able to report whatever score they liked. Now the
        // numbers have to arrive countersigned by the attestation service, and
        // each signature spends a nonce so the same run cannot be claimed twice.
        require(block.timestamp <= _deadline, "Attestation expired");
        require(!usedRunNonces[_nonce], "Run already claimed");

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    RUN_TYPEHASH,
                    msg.sender,
                    _score,
                    _level,
                    _gameTime,
                    _enemiesDestroyed,
                    _rocketsUsed,
                    _nonce,
                    _deadline
                )
            )
        );
        require(digest.recover(_signature) == runAttestor, "Bad attestation");

        usedRunNonces[_nonce] = true;

        require(_score > 0, "Invalid score");
        require(_level > 0 && _level <= MAX_LEVEL, "Invalid level");
        require(_gameTime >= MIN_GAME_TIME, "Game too short");
        require(_enemiesDestroyed > 0, "Must destroy enemies");
        require(_rocketsUsed > 0, "Must use rockets");

        // Basic anti-cheat validation
        require(isScoreValid(_score, _gameTime), "Suspicious score");

        // Create game session
        GameSession memory session = GameSession({
            score: _score,
            level: _level,
            gameTime: _gameTime,
            timestamp: block.timestamp,
            player: msg.sender,
            enemiesDestroyed: _enemiesDestroyed,
            rocketsUsed: _rocketsUsed
        });

        // Store in player history
        playerHistory[msg.sender].push(session);

        // Update weekly leaderboard
        uint256 currentWeek = getCurrentWeek();
        updateWeeklyLeaderboard(currentWeek, msg.sender, _score);

        // Calculate and award tokens from treasury
        uint256 tokensEarned = calculateTokenReward(_score, _level);
        if (tokensEarned > 0 && balanceOf(address(this)) >= tokensEarned) {
            _transfer(address(this), msg.sender, tokensEarned);
            emit TokensEarned(msg.sender, tokensEarned);
        }

        emit GameCompleted(
            msg.sender,
            _score,
            _level,
            _gameTime,
            _enemiesDestroyed
        );
    }

    /**
     * @dev Purchase revive using RocketFUEL tokens
     */
    function purchaseRevive() external nonReentrant whenNotPaused {
        require(
            balanceOf(msg.sender) >= REVIVE_COST,
            "Insufficient RocketFUEL tokens"
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
     * @dev Update weekly leaderboard
     */
    function updateWeeklyLeaderboard(
        uint256 _week,
        address _player,
        uint256 _score
    ) internal {
        LeaderboardEntry[] storage leaderboard = weeklyLeaderboards[_week];

        // Check if player already exists in leaderboard
        bool playerExists = false;
        for (uint256 i = 0; i < leaderboard.length; i++) {
            if (leaderboard[i].player == _player) {
                if (_score > leaderboard[i].score) {
                    leaderboard[i].score = _score;
                    leaderboard[i].timestamp = block.timestamp;
                }
                playerExists = true;
                break;
            }
        }

        // Add new player if not exists
        if (!playerExists) {
            leaderboard.push(
                LeaderboardEntry({
                    player: _player,
                    score: _score,
                    timestamp: block.timestamp
                })
            );
        }

        emit WeeklyLeaderboardUpdated(_week, _player, _score);
    }

    /**
     * @dev Get weekly top scores
     */
    function getWeeklyTopScores(
        uint256 _week,
        uint256 _limit
    ) external view returns (LeaderboardEntry[] memory) {
        LeaderboardEntry[] storage leaderboard = weeklyLeaderboards[_week];
        uint256 length = leaderboard.length < _limit
            ? leaderboard.length
            : _limit;

        if (length == 0) {
            return new LeaderboardEntry[](0);
        }

        // Simple sorting - in production, consider more efficient sorting
        LeaderboardEntry[] memory sortedEntries = new LeaderboardEntry[](
            length
        );

        // Copy entries
        for (uint256 i = 0; i < leaderboard.length && i < _limit; i++) {
            sortedEntries[i] = leaderboard[i];
        }

        // Bubble sort by score (descending)
        for (uint256 i = 0; i < length - 1; i++) {
            for (uint256 j = 0; j < length - i - 1; j++) {
                if (sortedEntries[j].score < sortedEntries[j + 1].score) {
                    LeaderboardEntry memory temp = sortedEntries[j];
                    sortedEntries[j] = sortedEntries[j + 1];
                    sortedEntries[j + 1] = temp;
                }
            }
        }

        return sortedEntries;
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
        GameSession[] storage sessions = playerHistory[_player];
        totalGames = sessions.length;
        bestScore = 0;

        for (uint256 i = 0; i < sessions.length; i++) {
            if (sessions[i].score > bestScore) {
                bestScore = sessions[i].score;
            }
        }

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
