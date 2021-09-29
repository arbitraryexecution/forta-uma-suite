const ethers = require('ethers');
const axios = require('axios');
const { getAddress } = require('@uma/contracts-node');
const {
  Finding, FindingSeverity, FindingType, createTransactionEvent,
} = require('forta-agent');
const { provideHandleTransaction } = require('./optimistic-oracle');

// load agent configuration
const config = require('../agent-config.json');

// constant values
const CHAIN_ID = 1; // mainnet
const ZERO_ADDRESS = ethers.constants.AddressZero;
const ZERO_HASH = ethers.constants.HashZero;

const requestPriceEvent = 'RequestPrice(address,bytes32,uint256,bytes,address,uint256,uint256)';
const proposePriceEvent = 'ProposePrice(address,address,bytes32,uint256,bytes,int256,uint256,address)';

const requestPriceEventTopic = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(requestPriceEvent));
const proposePriceEventTopic = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(proposePriceEvent));

describe('UMA optimistic oracle validation agent', () => {
  let handleTransaction = null;
  let optimisticOracleAddress = null;

  // mock the web request to CoinGecko
  let mockPrice = 0;
  const mockCoinGeckoResponse = {
    status: 200,
    statusText: 'OK',
    data: {
      '0x0000000000000000000000000000000000000000': {
        usd: mockPrice,
      },
    },
  };

  jest.mock('axios');
  axios.get.mockResolvedValue(mockCoinGeckoResponse);

  // mock the call to <ERC20Contract>.decimals()
  const mockDecimals = 0;
  const mockErc20Contract = {
    decimals: jest.fn(() => Promise.resolve(
      mockDecimals,
    )),
  };

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

  it('returns a finding if a price was requested from the oracle', async () => {
    const requester = ZERO_ADDRESS;
    const currency = ZERO_ADDRESS;

    mockPrice = 1;
    const price = mockPrice;

    const txEvent = createTransactionEvent({
      receipt: {
        logs: [
          {
            address: optimisticOracleAddress,
            topics: [
              requestPriceEventTopic,
              ZERO_HASH, // requester
            ],
            data: '0x'.padEnd('1000', '0'), // TODO: build a proper data string for decoding
          },
        ],
      },
    });

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
    mockPrice = 1;

    const txEvent = createTransactionEvent({
      receipt: {
        logs: [
          {
            address: optimisticOracleAddress,
            topics: [
              proposePriceEventTopic,
              ZERO_HASH, // requester
              ZERO_HASH, // proposer
            ],
            data: '0x'.padEnd('1000', '0'), // TODO: build a proper data string for decoding
          },
        ],
      },
    });

    handleTransaction = provideHandleTransaction(mockErc20Contract);
    const findings = await handleTransaction(txEvent);

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(findings).toStrictEqual([]);
  });

  it('returns a finding if proposed price difference exceeds threshold', async () => {
    const requester = ZERO_ADDRESS;
    const proposer = ZERO_ADDRESS;
    const currency = ZERO_ADDRESS;
    const proposedPrice = 1;

    mockPrice = 10;
    const price = mockPrice;

    const txEvent = createTransactionEvent({
      receipt: {
        logs: [
          {
            address: optimisticOracleAddress,
            topics: [
              proposePriceEventTopic,
              ZERO_HASH, // requester
              ZERO_HASH, // proposer
            ],
            data: '0x'.padEnd('1000', '0'), // TODO: build a proper data string for decoding
          },
        ],
      },
    });

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
        everestId: config.umaEverestId,
        metadata: {
          requester,
          proposer,
          currency,
          proposedPrice,
          price,
        },
      }),
    ]);
  });
});
