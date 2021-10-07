const ethers = require('ethers');
const { getAbi, getAddress } = require('@uma/contracts-node');
const {
  Finding, FindingSeverity, FindingType, createTransactionEvent,
} = require('forta-agent');
const { provideHandleTransaction, createPriceFeed } = require('./optimistic-oracle');

// load functions from event manipulation library
const { createLog, createReceipt } = require('../event-utils');

// load agent configuration
const {
  umaEverestId,
  optimisticOracle: optimisticOracleConfig,
} = require('../../agent-config.json');

const {
  disputePriceErrorPercent,
  cryptowatchApiKey: CRYPTOWATCH_API_KEY,
  defipulseApiKey: DEFIPULSE_API_KEY,
  tradermadeApiKey: TRADERMADE_API_KEY,
  cmcApiKey: CMC_API_KEY,
} = optimisticOracleConfig;

// constant values
const CHAIN_ID = 1; // mainnet
const ZERO_ADDRESS = ethers.constants.AddressZero;

// "BTC-BASIC-3M/USDC" identifier encoded as a Bytes32 value
const BTC_IDENTIFIER_STRING = 'BTC-BASIS-3M/USDC';
const BTC_IDENTIFIER_DATA = '0x4254432d42415349532d334d2f55534443000000000000000000000000000000';

// "BAD" identifier encoded as a Bytes32 value
const BAD_IDENTIFIER_DATA = '0x4241440000000000000000000000000000000000000000000000000000000000';

const MOCK_PRICE = '99999999999999999999';

const optimisticOracleAbi = getAbi('OptimisticOracle');

// create interface
const iface = new ethers.utils.Interface(optimisticOracleAbi);

// mock the getPrice() function from optimistic-oracle.js
async function mockGetPrice(identifier) {
  if (identifier === BTC_IDENTIFIER_STRING) {
    return MOCK_PRICE;
  }

  throw new Error(`Unknown identifier ${identifier}`);
}

async function mockGetPriceBadResponse(identifier) {
  throw new Error(`Timeout or bad response to price feed request for identifier ${identifier}`);
}

describe('UMA optimistic oracle validation agent', () => {
  let handleTransaction;
  let optimisticOracleAddress = null;

  it('should create price feeds for supported assets w/o throwing any exceptions', async () => {
    // supported list of assets
    const idList = [
      'ETH/BTC',
      'COMP/USD',
      'COMPUSD',
      'USDETH',
      'ETHUSD',
      'USDBTC',
      'BTCUSD',
      'USDPERL',
      'BCHNBTC',
      'STABLESPREAD',
      'STABLESPREAD/USDC',
      'STABLESPREAD/BTC',
      'ELASTIC_STABLESPREAD/USDC',
      'GASETH-TWAP-1Mx1M',
      'GASETH-FEB21',
      'GASETH-MAR21',
      'COMPUSDC-APR-MAR28/USDC',
      'BTCDOM',
      'ALTDOM',
      'AMPLUSD',
      'DEFI_PULSE_TOTAL_TVL',
      'DEFI_PULSE_SUSHI_TVL',
      'DEFI_PULSE_UNISWAP_TVL',
      'SUSHIUNI',
      'CNYUSD',
      'EURUSD',
      'PHPDAI',
      'ETH-BASIS-6M/USDC',
      'ETH-BASIS-3M/USDC',
      'BTC-BASIS-6M/USDC',
      'BTC-BASIS-3M/USDC',
      'USD/bBadger',
      'USD-[bwBTC/ETH SLP]',
      'XAUPERL',
      'XAUUSD',
      'uSTONKS_APR21',
      'DIGGBTC',
      'DIGGETH',
      'DIGGUSD',
      'USDAAVE',
      'AAVEUSD',
      'USDLINK',
      'LINKUSD',
      'USDSNX',
      'SNXUSD',
      'USDUMA',
      'UMAUSD',
      'USDUNI',
      'UNIUSD',
      'USDOCEAN',
      'OCEANUSD',
      'USDBTC_18DEC',
      'STABLESPREAD/USDC_18DEC',
      'BCHNBTC_18DEC',
      'ETHBTC_FR',
      'BALUSD',
      'XSUSHIUSD',
      'uSTONKS_JUN21',
      'PUNKETH_TWAP',
      'USDXIO',
      'iFARMUSD',
      'USDiFARM',
      'USDDEXTF',
      'DEXTFUSD',
      'uSTONKS_0921',
      // ibBTC currently not supported - requires NODE_URL_137 env variable to be set
      // 'ibBTC/BTC',
      // 'BTC/ibBTC',
      // 'ibBTC/USD',
      // 'USD/ibBTC',
      'GASETH-0921',
    ];

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < idList.length; i++) {
      const identifier = idList[i];
      const args = {
        identifier,
        config: {
          cryptowatchApiKey: CRYPTOWATCH_API_KEY,
          defipulseApiKey: DEFIPULSE_API_KEY,
          tradermadeApiKey: TRADERMADE_API_KEY,
          cmcApiKey: CMC_API_KEY,
        },
      };

      const priceFeed = await createPriceFeed(args);
      expect(priceFeed).toBeDefined();
    }
    /* eslint-enable no-await-in-loop */
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

    handleTransaction = provideHandleTransaction(mockGetPrice);
    const findings = await handleTransaction(txEvent);

    expect(findings).toStrictEqual([]);
  });

  it('returns no finding if a price was requested for an unknown identifier', async () => {
    const requester = ZERO_ADDRESS;

    // build a log that encodes the data for a RequestPrice event
    // the agent will decode 'requester' and 'currency' from the data
    const log = createLog(
      iface.getEvent('RequestPrice'),
      {
        requester,
        identifier: BAD_IDENTIFIER_DATA,
        timestamp: 0,
        ancillaryData: '0x00',
        currency: ZERO_ADDRESS,
        reward: 0,
        finalFee: 0,
      },
      { address: optimisticOracleAddress },
    );

    // build a receipt
    const receipt = createReceipt([log], ZERO_ADDRESS);

    const txEvent = createTransactionEvent({ receipt });

    handleTransaction = provideHandleTransaction(mockGetPrice);
    const findings = await handleTransaction(txEvent);

    expect(findings).toStrictEqual([]);
  });

  it('returns no finding if the price feed fails to respond to a price request', async () => {
    const requester = ZERO_ADDRESS;

    // build a log that encodes the data for a RequestPrice event
    // the agent will decode 'identifier' and 'requester' from the data
    const log = createLog(
      iface.getEvent('RequestPrice'),
      {
        requester,
        identifier: BTC_IDENTIFIER_DATA,
        timestamp: 0,
        ancillaryData: '0x00',
        currency: ZERO_ADDRESS,
        reward: 0,
        finalFee: 0,
      },
      { address: optimisticOracleAddress },
    );

    // build a receipt
    const receipt = createReceipt([log], ZERO_ADDRESS);

    const txEvent = createTransactionEvent({ receipt });

    handleTransaction = provideHandleTransaction(mockGetPriceBadResponse);
    const findings = await handleTransaction(txEvent);

    expect(findings).toStrictEqual([]);
  });

  it('returns a finding if a price was requested from the oracle', async () => {
    const requester = ZERO_ADDRESS;
    const idString = 'BTC-BASIS-3M/USDC';
    const price = MOCK_PRICE;

    // build a log that encodes the data for a RequestPrice event
    // the agent will decode 'identifier' and 'requester' from the data
    const log = createLog(
      iface.getEvent('RequestPrice'),
      {
        requester,
        identifier: BTC_IDENTIFIER_DATA,
        timestamp: 0,
        ancillaryData: '0x00',
        currency: ZERO_ADDRESS,
        reward: 0,
        finalFee: 0,
      },
      { address: optimisticOracleAddress },
    );

    // build a receipt
    const receipt = createReceipt([log], ZERO_ADDRESS);

    const txEvent = createTransactionEvent({ receipt });

    handleTransaction = provideHandleTransaction(mockGetPrice);
    const findings = await handleTransaction(txEvent);

    expect(findings).toStrictEqual([
      Finding.fromObject({
        name: 'UMA Price Request',
        description: `Price requested from Optimistic Oracle.  Identifier=${idString}, Price=${price}`,
        alertId: 'AE-UMA-OO-REQUESTPRICE',
        severity: FindingSeverity.Low,
        type: FindingType.Info,
        protocol: 'uma',
        everestId: umaEverestId,
        metadata: {
          requester,
          identifier: idString,
          price: price.toString(),
        },
      }),
    ]);
  });

  it('returns a low-severity finding if proposed price difference is below threshold', async () => {
    const requester = ZERO_ADDRESS;
    const proposer = ZERO_ADDRESS;
    const idString = 'BTC-BASIS-3M/USDC';
    const proposedPrice = '100000000000000000000';
    const price = MOCK_PRICE;

    // build a log that encodes the data for a ProposePrice event
    // the agent will decode 'identifier', 'requester', 'proposer', 'proposedPrice'
    const log = createLog(
      iface.getEvent('ProposePrice'),
      {
        requester,
        proposer,
        identifier: BTC_IDENTIFIER_DATA,
        timestamp: 0,
        ancillaryData: '0x00',
        proposedPrice,
        expirationTimestamp: 0,
        currency: ZERO_ADDRESS,
      },
      { address: optimisticOracleAddress },
    );

    // build a receipt
    const receipt = createReceipt([log], ZERO_ADDRESS);

    const txEvent = createTransactionEvent({ receipt });

    handleTransaction = provideHandleTransaction(mockGetPrice);
    const findings = await handleTransaction(txEvent);

    expect(findings).toStrictEqual([
      Finding.fromObject({
        name: 'UMA Price Proposal',
        description: `Price proposed to Optimistic Oracle is acceptable. Identifier=${idString}, ProposedPrice=${proposedPrice}, Price=${price}`,
        alertId: 'AE-UMA-OO-PROPOSEPRICE',
        severity: FindingSeverity.Low,
        type: FindingType.Info,
        protocol: 'uma',
        everestId: umaEverestId,
        metadata: {
          requester,
          proposer,
          identifier: idString,
          proposedPrice: proposedPrice.toString(),
          price: price.toString(),
          disputePriceErrorPercent,
        },
      }),
    ]);
  });

  it('returns a high-severity finding if proposed price difference exceeds threshold', async () => {
    const requester = ZERO_ADDRESS;
    const proposer = ZERO_ADDRESS;
    const idString = 'BTC-BASIS-3M/USDC';
    const proposedPrice = '110000000000000000000';
    const price = MOCK_PRICE;

    // build a log that encodes the data for a ProposePrice event
    // the agent will decode 'identifier', 'requester', 'proposer', 'proposedPrice' from the data
    const log = createLog(
      iface.getEvent('ProposePrice'),
      {
        requester,
        proposer,
        identifier: BTC_IDENTIFIER_DATA,
        timestamp: 0,
        ancillaryData: '0x00',
        proposedPrice,
        expirationTimestamp: 0,
        currency: ZERO_ADDRESS,
      },
      { address: optimisticOracleAddress },
    );

    // build a receipt
    const receipt = createReceipt([log], ZERO_ADDRESS);

    const txEvent = createTransactionEvent({ receipt });

    handleTransaction = provideHandleTransaction(mockGetPrice);
    const findings = await handleTransaction(txEvent);

    expect(findings).toStrictEqual([
      Finding.fromObject({
        name: 'UMA Price Proposal',
        description: `Price proposed to Optimistic Oracle is disputable. Identifier=${idString}, ProposedPrice=${proposedPrice}, Price=${price}`,
        alertId: 'AE-UMA-OO-PROPOSEPRICE',
        severity: FindingSeverity.High,
        type: FindingType.Info,
        protocol: 'uma',
        everestId: umaEverestId,
        metadata: {
          requester,
          proposer,
          identifier: idString,
          proposedPrice: proposedPrice.toString(),
          price: price.toString(),
          disputePriceErrorPercent,
        },
      }),
    ]);
  });
});
