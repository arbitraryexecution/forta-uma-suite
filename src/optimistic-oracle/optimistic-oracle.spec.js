const ethers = require('ethers');
const axios = require('axios');
const { getAbi, getAddress } = require('@uma/contracts-node');
const {
  Finding, FindingSeverity, FindingType, createTransactionEvent,
} = require('forta-agent');
const { provideHandleTransaction } = require('./optimistic-oracle');

// load functions from event manipulation library
const { createLog, createReceipt } = require('../event-utils');

// load agent configuration
const config = require('../../agent-config.json');

// constant values
const CHAIN_ID = 1; // mainnet
const ZERO_ADDRESS = ethers.constants.AddressZero;
const ZERO_HASH = ethers.constants.HashZero;
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const optimisticOracleAbi = getAbi('OptimisticOracle');

// create interface
const iface = new ethers.utils.Interface(optimisticOracleAbi);

// mock the web requests to CoinGecko
jest.mock('axios');

// token address must be lowercase
const mockPrice = 1;
const mockCoinGeckoResponseUSDC = {
  status: 200,
  statusText: 'OK',
  data: {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
      usd: mockPrice,
    },
  },
};

const mockCoinGeckoResponseBadToken = {
  status: 200,
  statusText: 'OK',
  data: {},
};

const mockCoinGeckoResponse404 = {
  status: 404,
  statusText: 'Not Found',
};

// mock the call to <ERC20Contract>.decimals()
const mockDecimals = 6; // USDC = 6 decimals
const mockErc20Contract = {
  decimals: jest.fn(() => Promise.resolve(
    mockDecimals,
  )),
};

describe('UMA optimistic oracle validation agent', () => {
  let handleTransaction = null;
  let optimisticOracleAddress = null;

  // reset function call count after each test
  afterEach(() => {
    axios.get.mockClear();
  });

  it('returns an empty finding if contract address does not match', async () => {
    // get the optimistic oracle address (this will be used in all tests)
    // this needs to be done within an async function
    const optimisticOracleAddressPromise = getAddress('OptimisticOracle', CHAIN_ID);
    optimisticOracleAddress = await optimisticOracleAddressPromise;

    const txEvent = createTransactionEvent({
      receipt: {
        logs: [
          {
            address: ZERO_ADDRESS,
          },
        ],
      },
    });

    handleTransaction = provideHandleTransaction(mockErc20Contract);
    const findings = await handleTransaction(txEvent);

    expect(axios.get).toHaveBeenCalledTimes(0);
    expect(findings).toStrictEqual([]);
  });

  it('returns no finding if a price was requested for an unknown currency', async () => {
    const requester = ZERO_ADDRESS;
    const currency = '0xBAD0000000000000000000000000000000000000';

    axios.get.mockResolvedValue(mockCoinGeckoResponseBadToken);

    // build a log that encodes the data for a RequestPrice event
    // the agent will decode 'requester' and 'currency' from the data
    const log = createLog(
      iface.getEvent('RequestPrice'),
      {
        requester,
        identifier: ZERO_HASH,
        timestamp: 0,
        ancillaryData: '0x00',
        currency,
        reward: 0,
        finalFee: 0,
      },
      { address: optimisticOracleAddress },
    );

    // build a receipt
    const receipt = createReceipt([log], ZERO_ADDRESS);

    const txEvent = createTransactionEvent({ receipt });

    handleTransaction = provideHandleTransaction(mockErc20Contract);
    const findings = await handleTransaction(txEvent);

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(findings).toStrictEqual([]);
  });

  it('returns no finding if CoinGecko fails to respond to a price request', async () => {
    const requester = ZERO_ADDRESS;
    const currency = USDC_ADDRESS;

    // mock a 404 response to GET request
    axios.get.mockResolvedValue(mockCoinGeckoResponse404);

    // build a log that encodes the data for a RequestPrice event
    // the agent will decode 'requester' and 'currency' from the data
    const log = createLog(
      iface.getEvent('RequestPrice'),
      {
        requester,
        identifier: ZERO_HASH,
        timestamp: 0,
        ancillaryData: '0x00',
        currency,
        reward: 0,
        finalFee: 0,
      },
      { address: optimisticOracleAddress },
    );

    // build a receipt
    const receipt = createReceipt([log], ZERO_ADDRESS);

    const txEvent = createTransactionEvent({ receipt });

    handleTransaction = provideHandleTransaction(mockErc20Contract);
    const findings = await handleTransaction(txEvent);

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(findings).toStrictEqual([]);
  });

  it('returns a finding if a price was requested from the oracle', async () => {
    const requester = ZERO_ADDRESS;
    const currency = USDC_ADDRESS;
    const price = mockPrice;

    axios.get.mockResolvedValue(mockCoinGeckoResponseUSDC);

    // build a log that encodes the data for a RequestPrice event
    // the agent will decode 'requester' and 'currency' from the data
    const log = createLog(
      iface.getEvent('RequestPrice'),
      {
        requester,
        identifier: ZERO_HASH,
        timestamp: 0,
        ancillaryData: '0x00',
        currency,
        reward: 0,
        finalFee: 0,
      },
      { address: optimisticOracleAddress },
    );

    // build a receipt
    const receipt = createReceipt([log], ZERO_ADDRESS);

    const txEvent = createTransactionEvent({ receipt });

    handleTransaction = provideHandleTransaction(mockErc20Contract);
    const findings = await handleTransaction(txEvent);

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(findings).toStrictEqual([
      Finding.fromObject({
        name: 'UMA Price Request',
        description: `Price requested from Optimistic Oracle.  Currency=${currency}, Price=${price}`,
        alertId: 'AE-UMA-OO-REQUESTPRICE',
        severity: FindingSeverity.Low,
        type: FindingType.Unknown,
        protocol: 'uma',
        everestId: config.umaEverestId,
        metadata: {
          requester,
          currency,
          price,
        },
      }),
    ]);
  });

  it('returns an empty finding if proposed price difference is below threshold', async () => {
    const requester = ZERO_ADDRESS;
    const proposer = ZERO_ADDRESS;
    const currency = USDC_ADDRESS;
    const proposedPrice = 1; // 1 USDC

    axios.get.mockResolvedValue(mockCoinGeckoResponseUSDC);

    // build a log that encodes the data for a ProposePrice event
    // the agent will decode 'requester', 'proposer', 'proposedPrice', and 'currency' from the data
    const log = createLog(
      iface.getEvent('ProposePrice'),
      {
        requester,
        proposer,
        identifier: ZERO_HASH,
        timestamp: 0,
        ancillaryData: '0x00',
        proposedPrice: parseInt(proposedPrice * (10 ** mockDecimals), 10),
        expirationTimestamp: 0,
        currency,
      },
      { address: optimisticOracleAddress },
    );

    // build a receipt
    const receipt = createReceipt([log], ZERO_ADDRESS);

    const txEvent = createTransactionEvent({ receipt });

    handleTransaction = provideHandleTransaction(mockErc20Contract);
    const findings = await handleTransaction(txEvent);

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(findings).toStrictEqual([]);
  });

  it('returns a finding if proposed price difference exceeds threshold', async () => {
    const requester = ZERO_ADDRESS;
    const proposer = ZERO_ADDRESS;
    const currency = USDC_ADDRESS;
    const proposedPrice = 1.5; // 1.5 USDC
    const price = mockPrice;
    const { priceThresholdPct } = config.optimisticOracle;

    axios.get.mockResolvedValue(mockCoinGeckoResponseUSDC);

    // build a log that encodes the data for a ProposePrice event
    // the agent will decode 'requester', 'proposer', 'proposedPrice', and 'currency' from the data
    const log = createLog(
      iface.getEvent('ProposePrice'),
      {
        requester,
        proposer,
        identifier: ZERO_HASH,
        timestamp: 0,
        ancillaryData: '0x00',
        proposedPrice: parseInt(proposedPrice * (10 ** mockDecimals), 10),
        expirationTimestamp: 0,
        currency,
      },
      { address: optimisticOracleAddress },
    );

    // build a receipt
    const receipt = createReceipt([log], ZERO_ADDRESS);

    const txEvent = createTransactionEvent({ receipt });

    handleTransaction = provideHandleTransaction(mockErc20Contract);
    const findings = await handleTransaction(txEvent);

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(findings).toStrictEqual([
      Finding.fromObject({
        name: 'UMA Price Proposal',
        description: `Price proposed to Optimistic Oracle is disputable. Currency=${currency}, ProposedPrice=${proposedPrice}, Price=${price}`,
        alertId: 'AE-UMA-OO-PROPOSEPRICE',
        severity: FindingSeverity.Low,
        type: FindingType.Unknown,
        protocol: 'uma',
        everestId: config.umaEverestId,
        metadata: {
          requester,
          proposer,
          currency,
          proposedPrice,
          price,
          priceThresholdPct,
        },
      }),
    ]);
  });
});
