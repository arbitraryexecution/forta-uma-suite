# Forta UMA Disputor Bot

## Description

This agent runs the UMA disputor bot.

## Supported Chains

- Ethereum

## Alerts

<!-- -->
- AE-UMA-DISPUTE
  - Fired when a liquidation can be disputed
  - Severity is always "medium"
  - Type is always set to "info"
  - Metadata field contains position price, scaled price, and liquidation data

## Test Data

To run all the tests for this agent, use the following command: `npm run test`
