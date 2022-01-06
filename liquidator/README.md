# Forta UMA Liquidator Bot

## Description

This agent runs the UMA liquidator bot.

## Supported Chains

- Ethereum

## Alerts

<!-- -->
- AE-UMA-LIQUIDATABLE-POSITION
  - Fired when a monitored contract has a liquidatable position due to price changes or invalid withdrawals
  - Severity is always set to "medium"
  - Type is always set to "info"
  - Metadata field contains position details and the returned price from the price feed

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
