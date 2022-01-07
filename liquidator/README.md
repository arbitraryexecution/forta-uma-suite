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

## Test Data

To run all the tests for this agent, use the following command: `npm run test`
