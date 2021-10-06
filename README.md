# Forta UMA Suite

## Description

This agent monitors various aspects of UMA. The UMA suite currently contains
the following handlers:

- deployer-watch
- admin-events
- monitor-mint-calls
- optimistic-oracle

## Supported Chains

- Ethereum

## Alerts

<!-- -->
- AE-UMA-DEPLOYER-TX
  - Fired when the UMA Deployer contract is part of a transaction
  - Severity is always set to "low"
  - Type is always set to "unknown"
  - Metadata field contains to and from addresses

<!-- -->
- AE-UMA-DEPLOYER-WHITELIST
  - Fired when the UMA Deployer interacts with a non-whitelisted address
  - Severity is always set to "high"
  - Type is always set to "suspicious"
  - Metadata field contains to and from addresses

<!-- -->
- AE-UMA-ADMIN-EVENT
  - Fired on any event in admin-events.json
  - Severity is set to value in admin-events.json
  - Type is set to value in admin-events.json
  - Metadata field contains contract name, contract address and event name

<!-- -->
- AE-UMA-UNAUTHORIZED-MINT
  - Fired when the UMA VotingToken.mint() method is called by any address other than the UMA Voting contract
  - Severity is always "critical"
  - Type is always set to "exploit"
  - Metadata field contains VotingToken contract address, caller address, and transaction hash
  - Must have traces enabled for this to operate correctly

<!-- -->
- AE-UMA-OO-REQUESTPRICE
  - Fired when the RequestPrice event is emitted by the Optimistic Oracle contract
  - Severity is always set to "low"
  - Type is always set to "unknown"
  - Metadata field contains requester, identifier, and price
    - Requester is an EOA decoded from the event
    - Identifier is the string representation of the asset
    - Price is obtained for the token address from an external price feed (CoinGecko)

<!-- -->
- AE-UMA-OO-PROPOSEPRICE
  - Fired when the ProposePrice event is emitted by the Optimistic Oracle contract
  - Severity is always set to "low"
  - Type is always set to "unknown"
  - Metadata field contains requester, proposer, identifier, proposed price, price, and the threshold
    percentage that triggered the event
    - Requester and proposer are EOAs decoded from the event
    - Identifier is the string representation of the asset
    - Proposed price is decoded from the event, then adjusted to be denominated in USD
    - Price is obtained for the token address from an external price feed (CoinGecko)
    - Threshold is obtained from agent-config.json

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

AE-UMA-OO-PROPOSEPRICE can be tested against a mainnet transaction with the following command:

`npx forta-agent run --tx 0x76ff352b2665886a2a3d3b16fe0fa41f61e4ffc0824b3a6734383d397187f53f`
