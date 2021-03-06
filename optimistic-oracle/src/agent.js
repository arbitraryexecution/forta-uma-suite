const BigNumber = require('bignumber.js');
const Web3 = require('web3');
const {
  ethers, Finding, FindingSeverity, FindingType, getJsonRpcUrl,
} = require('forta-agent');

// contract ABIs and network addresses
const { getAbi, getAddress } = require('@uma/contracts-node');

// UMA library functions
const {
  Networker,
  Logger: logger,
  createReferencePriceFeedForFinancialContract,
} = require('@uma/financial-templates-lib');

// load agent configuration
const {
  umaEverestId,
  optimisticOracle: optimisticOracleConfig,
} = require('../agent-config.json');

const {
  disputePriceErrorPercent,
  cryptowatchApiKey: CRYPTOWATCH_API_KEY,
  defipulseApiKey: DEFIPULSE_API_KEY,
  tradermadeApiKey: TRADERMADE_API_KEY,
  cmcApiKey: CMC_API_KEY,
} = optimisticOracleConfig;

const CHAIN_ID = 1; // mainnet

const initializeData = {};

logger.silent = true;

// initialize global constants, web3 gets populated on initialization
const getTime = () => Math.round(new Date().getTime() / 1000);
const web3 = new Web3(new Web3.providers.HttpProvider(getJsonRpcUrl()));

/*
Events we are interested in:

    event RequestPrice(
        address indexed requester,
        bytes32 identifier,
        uint256 timestamp,
        bytes ancillaryData,
        address currency,
        uint256 reward,
        uint256 finalFee
    );

    event ProposePrice(
        address indexed requester,
        address indexed proposer,
        bytes32 identifier,
        uint256 timestamp,
        bytes ancillaryData,
        int256 proposedPrice,
        uint256 expirationTimestamp,
        address currency
    );
*/
const eventNames = ['RequestPrice', 'ProposePrice'];

// calculate the % difference between 2 BigNumber values
function calculatePercentError(first, second) {
  const delta = first.minus(second).absoluteValue();
  return delta.div(first).multipliedBy(100);
}

// creates a price feed using the UMA library
async function createPriceFeed({ identifier, config }) {
  // try to create a price feed
  // this typically fails if the target asset requires a specific API key,
  // or the lookback value has not been set
  let priceFeed = await createReferencePriceFeedForFinancialContract(
    logger,
    web3,
    new Networker(),
    getTime,
    undefined, // no address needed since we're passing identifier explicitly
    config,
    identifier,
  ).catch();

  // if the first attempt failed, set a lookback value and try again
  if (!priceFeed) {
    priceFeed = await createReferencePriceFeedForFinancialContract(
      logger,
      web3,
      new Networker(),
      getTime,
      undefined, // no address needed since we're passing identifier explicitly
      { lookback: 0, ...config },
      identifier,
    ).catch();
  }

  if (!priceFeed) {
    throw new Error(`Unable to create price feed for identifier '${identifier}'`);
  }

  return priceFeed;
}

// get the price of an asset based on the UMA identifier string
//
// example identifiers: "BTC-BASIS-3M/USDC", "STABLESPREAD/USDC_18DEC"
// this identifier will be used as a lookup in DefaultPriceFeedConfigs.ts in the UMA lib
async function getPrice(identifier) {
  // if the user has not set a specific API key in the admin-events.json file, set it to undefined
  // many assets prices can be obtained using cryptowatch w/o any API key at all (rate limited)
  const args = {
    identifier,
    config: {
      cryptowatchApiKey: CRYPTOWATCH_API_KEY || undefined,
      defipulseApiKey: DEFIPULSE_API_KEY || undefined,
      tradermadeApiKey: TRADERMADE_API_KEY || undefined,
      cmcApiKey: CMC_API_KEY || undefined,
    },
  };

  // attempt to obtain a UMA price feed object
  const priceFeed = await createPriceFeed(args);

  // make an external request to get the price value
  await priceFeed.update();
  const price = (await priceFeed.getCurrentPrice()).toString();

  return price;
}

// initialize() performs one-time configuration at startup
// provideInitialize() returns initialize which will update a specified object
function provideInitialize(data) {
  return async function initialize() {
    const optimisticOracle = {
      // get the Optimistic Oracle contract address for mainnet
      // the address returned by the promise will be lowercase
      address: await getAddress('OptimisticOracle', CHAIN_ID),
      // create ethers interface object
      abi: getAbi('OptimisticOracle'),
    };
    // create and add the interface
    optimisticOracle.iface = new ethers.utils.Interface(optimisticOracle.abi);

    /* eslint-disable no-param-reassign */
    data.optimisticOracle = optimisticOracle;
    data.createPriceFeed = createPriceFeed;
    data.getPrice = getPrice;
    /* eslint-enable no-param-reassign */
  };
}

function provideHandleTransaction(data) {
  return async function handleTransaction(txEvent) {
    const { optimisticOracle, getPrice: getPriceFunc } = data;
    if (!optimisticOracle || !getPriceFunc) {
      throw new Error('handleTransaction was called before initialization');
    }

    const findings = [];

    // filter only logs that match the optimistic oracle address
    // test transaction for ProposePrice event:
    // npx forta-agent run --tx 0x76ff352b2665886a2a3d3b16fe0fa41f61e4ffc0824b3a6734383d397187f53f
    const oracleLogs = txEvent.logs.filter((log) => log.address === optimisticOracle.address);

    if (oracleLogs === []) return findings;

    // parse oracle logs for our target events:  RequestPrice and ProposePrice
    const parse = (log) => optimisticOracle.iface.parseLog(log);
    const filter = (log) => eventNames.indexOf(log.name) !== -1;
    const parsedLogs = oracleLogs.map(parse).filter(filter);

    // process the target events
    await Promise.all(parsedLogs.map(async (log) => {
      if (log.name === 'RequestPrice') {
        const { identifier, requester } = log.args;

        // decode the identifer to determine which price feed to use
        const idString = ethers.utils.parseBytes32String(identifier);

        // lookup the price
        let price;
        try {
          price = await getPriceFunc(idString);
        } catch (err) {
          console.error(err);
          return;
        }

        // report the price obtained as a finding
        findings.push(Finding.fromObject({
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
        }));
      }

      if (log.name === 'ProposePrice') {
        const {
          identifier, requester, proposer, proposedPrice: proposedPriceRaw,
        } = log.args;

        // decode the identifer to determine which price feed to use
        const idString = ethers.utils.parseBytes32String(identifier);

        // lookup the price
        let price;
        try {
          price = await getPriceFunc(idString);
        } catch (err) {
          console.error(err);
          return;
        }

        const proposedPrice = new BigNumber(proposedPriceRaw.toString());

        // generate a low-serverity finding if the price difference is below the threshold
        // (defined in agent-config.json) and high-severity if it has been exceeded
        let severity;
        let descriptionPrefix;
        const percentError = calculatePercentError(proposedPrice, price);

        if (percentError.isGreaterThan(disputePriceErrorPercent * 100)) {
          severity = FindingSeverity.High;
          descriptionPrefix = 'Price proposed to Optimistic Oracle is disputable.';
        } else {
          severity = FindingSeverity.Low;
          descriptionPrefix = 'Price proposed to Optimistic Oracle is acceptable.';
        }

        findings.push(Finding.fromObject({
          name: 'UMA Price Proposal',
          description: `${descriptionPrefix} Identifier=${idString}, ProposedPrice=${proposedPrice}, Price=${price}`,
          alertId: 'AE-UMA-OO-PROPOSEPRICE',
          severity,
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
        }));
      }
    }));

    return findings;
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(initializeData),
};
