import { encodeEventTopics, parseEventLogs, type Log } from "viem";

// Contract ABI for RocketCandleGame
/*
 * Generated from the compiled artifact, not written by hand.
 *
 * This was a hand-maintained JSON blob, which is the failure mode the gas-model
 * work warned about: an interface that compiles, passes its tests against a
 * mock mirroring the same mistake, and does not exist on chain. Regenerate with
 * the snippet in context/progress.md after any contract change.
 */
export const GAME_CONTRACT_ABI = [
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_runAttestor",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_stakeToken",
          "type": "address"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "inputs": [],
      "name": "ECDSAInvalidSignature",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "length",
          "type": "uint256"
        }
      ],
      "name": "ECDSAInvalidSignatureLength",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "s",
          "type": "bytes32"
        }
      ],
      "name": "ECDSAInvalidSignatureS",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "spender",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "allowance",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "needed",
          "type": "uint256"
        }
      ],
      "name": "ERC20InsufficientAllowance",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "sender",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "balance",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "needed",
          "type": "uint256"
        }
      ],
      "name": "ERC20InsufficientBalance",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "approver",
          "type": "address"
        }
      ],
      "name": "ERC20InvalidApprover",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "receiver",
          "type": "address"
        }
      ],
      "name": "ERC20InvalidReceiver",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "sender",
          "type": "address"
        }
      ],
      "name": "ERC20InvalidSender",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "spender",
          "type": "address"
        }
      ],
      "name": "ERC20InvalidSpender",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "InvalidShortString",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "owner",
          "type": "address"
        }
      ],
      "name": "OwnableInvalidOwner",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "OwnableUnauthorizedAccount",
      "type": "error"
    },
    {
      "inputs": [],
      "name": "ReentrancyGuardReentrantCall",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "token",
          "type": "address"
        }
      ],
      "name": "SafeERC20FailedOperation",
      "type": "error"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "str",
          "type": "string"
        }
      ],
      "name": "StringTooLong",
      "type": "error"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "owner",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "spender",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "Approval",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [],
      "name": "EIP712DomainChanged",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "player",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "cost",
          "type": "uint256"
        }
      ],
      "name": "FirepowerPurchased",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "player",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "score",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "level",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "gameTime",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint16",
          "name": "enemiesDestroyed",
          "type": "uint16"
        }
      ],
      "name": "GameCompleted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "player",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "cost",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "expiresAt",
          "type": "uint256"
        }
      ],
      "name": "MarketPassPurchased",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "at",
          "type": "uint256"
        }
      ],
      "name": "MigrationSealed",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "previousOwner",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "newOwner",
          "type": "address"
        }
      ],
      "name": "OwnershipTransferred",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "player",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "bestScore",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "wick",
          "type": "uint256"
        }
      ],
      "name": "PlayerMigrated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "player",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "cost",
          "type": "uint256"
        }
      ],
      "name": "RevivePurchased",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "oldAttestor",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "newAttestor",
          "type": "address"
        }
      ],
      "name": "RunAttestorUpdated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "player",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "TokensEarned",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "to",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "Transfer",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "fromWeek",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "toWeek",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "WeekRolledOver",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "week",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "address",
          "name": "player",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "score",
          "type": "uint256"
        }
      ],
      "name": "WeeklyLeaderboardUpdated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "week",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "from",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "WeeklyPotFunded",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "week",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "player",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "WeeklyShareClaimed",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "CLAIM_THRESHOLD",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "FIREPOWER_COST",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MARKET_PASS_COST",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MARKET_PASS_DURATION",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MAX_LEVEL",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MAX_SCORE_PER_SECOND",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MAX_TOTAL_SUPPLY",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "MIN_GAME_TIME",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "REVIVE_COST",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "ROLLOVER_GRACE_WEEKS",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "TOKENS_PER_1000_SCORE",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "TOKENS_PER_LEVEL",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "TREASURY_RESERVE",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "owner",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "spender",
          "type": "address"
        }
      ],
      "name": "allowance",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "spender",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "approve",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "account",
          "type": "address"
        }
      ],
      "name": "balanceOf",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "bestScoreOf",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_score",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_level",
          "type": "uint256"
        }
      ],
      "name": "calculateTokenReward",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "pure",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_week",
          "type": "uint256"
        }
      ],
      "name": "claimWeeklyShare",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "decimals",
      "outputs": [
        {
          "internalType": "uint8",
          "name": "",
          "type": "uint8"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "eip712Domain",
      "outputs": [
        {
          "internalType": "bytes1",
          "name": "fields",
          "type": "bytes1"
        },
        {
          "internalType": "string",
          "name": "name",
          "type": "string"
        },
        {
          "internalType": "string",
          "name": "version",
          "type": "string"
        },
        {
          "internalType": "uint256",
          "name": "chainId",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "verifyingContract",
          "type": "address"
        },
        {
          "internalType": "bytes32",
          "name": "salt",
          "type": "bytes32"
        },
        {
          "internalType": "uint256[]",
          "name": "extensions",
          "type": "uint256[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_to",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_amount",
          "type": "uint256"
        }
      ],
      "name": "emergencyTokenTransfer",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_amount",
          "type": "uint256"
        }
      ],
      "name": "fundWeeklyPot",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getCurrentWeek",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_player",
          "type": "address"
        }
      ],
      "name": "getPlayerHistory",
      "outputs": [
        {
          "components": [
            {
              "internalType": "uint256",
              "name": "score",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "level",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "gameTime",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "timestamp",
              "type": "uint256"
            },
            {
              "internalType": "address",
              "name": "player",
              "type": "address"
            },
            {
              "internalType": "uint16",
              "name": "enemiesDestroyed",
              "type": "uint16"
            },
            {
              "internalType": "uint16",
              "name": "rocketsUsed",
              "type": "uint16"
            },
            {
              "internalType": "uint128",
              "name": "stakeUsdso",
              "type": "uint128"
            },
            {
              "internalType": "int128",
              "name": "pnlUsdso",
              "type": "int128"
            }
          ],
          "internalType": "struct RocketCandleGame.GameSession[]",
          "name": "",
          "type": "tuple[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_player",
          "type": "address"
        }
      ],
      "name": "getPlayerStats",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "totalGames",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "bestScore",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "totalTokens",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_week",
          "type": "uint256"
        }
      ],
      "name": "getWeeklyPlayerCount",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_week",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_offset",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_limit",
          "type": "uint256"
        }
      ],
      "name": "getWeeklyScores",
      "outputs": [
        {
          "components": [
            {
              "internalType": "address",
              "name": "player",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "score",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "timestamp",
              "type": "uint256"
            }
          ],
          "internalType": "struct RocketCandleGame.LeaderboardEntry[]",
          "name": "",
          "type": "tuple[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_player",
          "type": "address"
        }
      ],
      "name": "hasMarketPass",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_score",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_gameTime",
          "type": "uint256"
        }
      ],
      "name": "isScoreValid",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "pure",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "marketPassExpiry",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_player",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_bestScore",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "_wick",
          "type": "uint256"
        }
      ],
      "name": "migratePlayer",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "migrationOpen",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "name",
      "outputs": [
        {
          "internalType": "string",
          "name": "",
          "type": "string"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "owner",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "paused",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "playerHistory",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "score",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "level",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "gameTime",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "timestamp",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "player",
          "type": "address"
        },
        {
          "internalType": "uint16",
          "name": "enemiesDestroyed",
          "type": "uint16"
        },
        {
          "internalType": "uint16",
          "name": "rocketsUsed",
          "type": "uint16"
        },
        {
          "internalType": "uint128",
          "name": "stakeUsdso",
          "type": "uint128"
        },
        {
          "internalType": "int128",
          "name": "pnlUsdso",
          "type": "int128"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "purchaseFirepower",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "purchaseMarketPass",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "purchaseRevive",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "renounceOwnership",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "_week",
          "type": "uint256"
        }
      ],
      "name": "rollOverWeek",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "runAttestor",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "sealMigration",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bool",
          "name": "_paused",
          "type": "bool"
        }
      ],
      "name": "setPaused",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_attestor",
          "type": "address"
        }
      ],
      "name": "setRunAttestor",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "stakeToken",
      "outputs": [
        {
          "internalType": "contract IERC20",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "components": [
            {
              "internalType": "uint256",
              "name": "score",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "level",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "gameTime",
              "type": "uint256"
            },
            {
              "internalType": "uint16",
              "name": "enemiesDestroyed",
              "type": "uint16"
            },
            {
              "internalType": "uint16",
              "name": "rocketsUsed",
              "type": "uint16"
            },
            {
              "internalType": "uint128",
              "name": "stakeUsdso",
              "type": "uint128"
            },
            {
              "internalType": "int128",
              "name": "pnlUsdso",
              "type": "int128"
            },
            {
              "internalType": "uint256",
              "name": "nonce",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "deadline",
              "type": "uint256"
            }
          ],
          "internalType": "struct RocketCandleGame.RunClaim",
          "name": "_run",
          "type": "tuple"
        },
        {
          "internalType": "bytes",
          "name": "_signature",
          "type": "bytes"
        }
      ],
      "name": "submitScore",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "symbol",
      "outputs": [
        {
          "internalType": "string",
          "name": "",
          "type": "string"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "totalSupply",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "to",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "transfer",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "from",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "to",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "value",
          "type": "uint256"
        }
      ],
      "name": "transferFrom",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "newOwner",
          "type": "address"
        }
      ],
      "name": "transferOwnership",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "usedRunNonces",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "weekPot",
      "outputs": [
        {
          "internalType": "uint128",
          "name": "funded",
          "type": "uint128"
        },
        {
          "internalType": "uint128",
          "name": "paid",
          "type": "uint128"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "weeklyBest",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "weeklyClaimed",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "weeklyPlayers",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "weeklyPointsEarned",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "weeklyPointsTotal",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "weeklyRewardsClaimed",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
] as const;

export interface PlayerStats {
  totalGames: number;
  bestScore: number;
  totalTokens: number;
}

export interface GameSession {
  score: number;
  level: number;
  gameTime: number;
  timestamp: number;
  player: string;
  enemiesDestroyed: number;
  rocketsUsed: number;
}

export interface LeaderboardEntry {
  player: string;
  score: number;
  timestamp: number;
}

// Get contract address - this will be updated after deployment
export function getGameContractAddress(): string {
  const contractAddress = process.env.NEXT_PUBLIC_GAME_CONTRACT_ADDRESS;
  
  if (!contractAddress) {
    console.warn("⚠️ Game contract address not set in environment variables");
    return "0x0000000000000000000000000000000000000000"; // Placeholder
  }
  
  return contractAddress;
}

// Format token amounts from wei to readable format
export function formatTokenAmount(weiAmount: bigint | string | number, decimals: number = 18): number {
  const amount = typeof weiAmount === 'bigint' ? weiAmount : BigInt(weiAmount);
  return Number(amount) / Math.pow(10, decimals);
}

// Convert readable token amount to wei
export function parseTokenAmount(amount: number, decimals: number = 18): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

/**
 * What submitScore() actually minted, read out of the TokensEarned event a
 * confirmed transaction's receipt carries - never recomputed client-side.
 *
 * The contract only emits this event when it both owed a reward and had the
 * treasury balance to pay it (see RocketCandleGame.sol's submitScore). A run
 * that fell through that guard leaves no log behind, which is the truth -
 * zero was minted - not a gap in what got measured.
 *
 * Returns `null` - never 0 - when the receipt cannot be trusted: a log whose
 * topic matches TokensEarned but whose body failed to decode (truncated/
 * malformed data), or any other decode failure. viem's parseEventLogs does
 * not throw for that case by default (strict mode silently drops the log,
 * confirmed empirically in tests/minted-reward.test.ts) - it just goes
 * missing from the decoded list, which would otherwise look identical to
 * "the contract genuinely never emitted the event". The topic0 pre-check
 * below is what tells those two cases apart. A thrown error from viem is
 * still caught as a second line of defence.
 */
export function getMintedReward(logs: Log[]): number | null {
  try {
    // topic0 alone, no args - this is just the event's signature hash, used
    // to spot "something claiming to be TokensEarned showed up" independent
    // of whether it went on to decode.
    const [topic0] = encodeEventTopics({
      abi: GAME_CONTRACT_ABI,
      eventName: "TokensEarned",
    });
    const candidateLogs = logs.filter((log) => log.topics[0] === topic0);

    const decoded = parseEventLogs({
      abi: GAME_CONTRACT_ABI,
      eventName: "TokensEarned",
      logs,
    });

    if (candidateLogs.length > decoded.length) {
      console.error(
        "getMintedReward: a TokensEarned-tagged log failed to decode",
        { candidateCount: candidateLogs.length, decodedCount: decoded.length }
      );
      return null;
    }

    if (decoded.length === 0) return 0;

    const amount = (decoded[0].args as { amount?: bigint }).amount;
    if (typeof amount !== "bigint") {
      console.error("getMintedReward: TokensEarned log decoded without an amount", decoded[0]);
      return null;
    }
    return formatTokenAmount(amount);
  } catch (error) {
    console.error("getMintedReward: failed to read receipt logs", error);
    return null;
  }
}

// Calculate expected token reward for a score. A projection only - the
// contract's own math (calculateTokenReward in RocketCandleGame.sol) is what
// actually decides a mint. Never present this number as a settled fact; see
// getMintedReward for what was really minted.
export function calculateExpectedReward(score: number, level: number): number {
  const TOKENS_PER_1000_SCORE = 1; // 1 WICK per 1000 score
  const TOKENS_PER_LEVEL = 1.5; // 1.5 WICK per level
  
  const scoreReward = Math.floor(score / 1000) * TOKENS_PER_1000_SCORE;
  const levelReward = level * TOKENS_PER_LEVEL;
  
  return scoreReward + levelReward;
}

// Validate score against basic anti-cheat rules
export function validateScore(score: number, gameTime: number, level: number): boolean {
  const MIN_GAME_TIME = 5; // seconds
  const MAX_SCORE_PER_SECOND = 2000;
  const MAX_LEVEL = 7;
  
  // Check minimum game time
  if (gameTime < MIN_GAME_TIME) {
    console.warn(`Game time too short: ${gameTime}s (min: ${MIN_GAME_TIME}s)`);
    return false;
  }
  
  // Check score rate
  const scorePerSecond = score / gameTime;
  if (scorePerSecond > MAX_SCORE_PER_SECOND) {
    console.warn(`Score rate too high: ${scorePerSecond}/s (max: ${MAX_SCORE_PER_SECOND}/s)`);
    return false;
  }
  
  // Check level bounds
  if (level < 1 || level > MAX_LEVEL) {
    console.warn(`Invalid level: ${level} (range: 1-${MAX_LEVEL})`);
    return false;
  }
  
  return true;
}

// Format address for display
export function formatAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Get current week number for leaderboards
export function getCurrentWeek(): number {
  return Math.floor(Date.now() / 1000 / (7 * 24 * 60 * 60));
}

// Format timestamp to readable date
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}