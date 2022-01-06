# Forta UMA Suite

## Description

This agent monitors for specific events admitted by the UMA Optimistic Oracle contract.

## Supported Chains

- Ethereum

## Alerts

<!-- -->
- AE-UMA-OO-REQUESTPRICE
  - Fired when the RequestPrice event is emitted by the Optimistic Oracle contract
  - Severity is always set to "low"
  - Type is always set to "info"
  - Metadata field contains requester, identifier, and price (obtained from external price feed)

<!-- -->
- AE-UMA-OO-PROPOSEPRICE
  - Fired when the ProposePrice event is emitted by the Optimistic Oracle contract
  - Severity is set to:
    - "low" for a price that is within the threshold of the price feed data
    - "high" for a price that exceeds the threshold
  - Type is always set to "info"
  - Metadata field contains requester, proposer, identifier, proposed price, price, and the threshold
    percentage that triggered the event

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
