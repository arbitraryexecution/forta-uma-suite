# Forta UMA Mint Call Monitor

## Description

This agent monitors for unauthorized calls to mint voting tokens.

## Supported Chains

- Ethereum

## Alerts

- AE-UMA-UNAUTHORIZED-MINT
  - Fired when the UMA VotingToken.mint() method is called by any address other than the UMA Voting contract
  - Severity is always "critical"
  - Type is always set to "exploit"
  - Metadata field contains VotingToken contract address, caller address, and transaction hash
  - Must have traces enabled for this to operate correctly

## Agent Configuration

The agent-config.json file contains user-configurable agent settings.

- disputePriceErrorPercent: Sets the percent difference between proposed price and actual price that
  will trigger the AE-UMA-OO-PROPOSEPRICE alert (default value = 0.05, or 5%)
- cryptoWatchApiKey: API key for Cryptowatch price feeds
- defipulseApiKey: API key for Defi Pulse price feeds
- tradermadeApiKey: API key for TraderMade price feeds
- cmcApiKey: API key for CoinMarketCap price feeds

## Test Data

To run all the tests for this agent, use the following command: `npm run test`

