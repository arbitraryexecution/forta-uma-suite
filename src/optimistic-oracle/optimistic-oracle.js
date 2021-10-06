const ethers = require('ethers');
const BigNumber = require('bignumber.js');
const Web3 = require('web3');
const {
  Finding, FindingSeverity, FindingType, getJsonRpcUrl,
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
const config = require('../../agent-config.json');

const CHAIN_ID = 1; // mainnet

// stores the optimistic oracle contract address
let optimisticOracleAddress;

logger.silent = true;

// initialize global constants, web3 gets populated on initialization
const getTime = () => Math.round(new Date().getTime() / 1000);
const web3 = new Web3(new Web3.providers.HttpProvider(getJsonRpcUrl()));

// create ethers interface object
const optimisticOracleAbi = getAbi('OptimisticOracle');
const iface = new ethers.utils.Interface(optimisticOracleAbi);

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

// Taken from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function replaceAll(str, match, replacement) {
  return str.replace(new RegExp(escapeRegExp(match), 'g'), () => replacement);
}

// decodes a bytes32 value to an ascii string
function bytes32ToString(identifier) {
  let idString = Buffer.from(identifier.slice(2), 'hex').toString();

  // strip off trailing zeros after conversion
  idString = replaceAll(idString, '\u0000', '');
  return idString;
}

// Get the price of an asset based on the UMA identifier string.
// Example identifiers: "BTC-BASIS-3M/USDC", "STABLESPREAD/USDC_18DEC"
// This identifier will be used as a lookup in DefaultPriceFeedConfigs.ts in the UMA lib
async function getPrice(identifier) {
  const priceFeed = await createReferencePriceFeedForFinancialContract(
    logger,
    web3,
    new Networker(logger),
    getTime,
    undefined, // no address needed since we're passing identifier explicitly
    { lookback: 0 }, // config
    identifier,
  );

  if (priceFeed === null) {
    throw Error(`Unable to create price feed for identifier '${identifier}'`);
  }

  await priceFeed.update();
  const price = (await priceFeed.getCurrentPrice()).toString();

  return price;
}

function provideHandleTransaction(getPriceFunc = getPrice) {
  return async function handleTransaction(txEvent) {
    const findings = [];

    if (optimisticOracleAddress === undefined) {
      // get the Optimistic Oracle contract address for mainnet
      // the address returned by the promise will be lowercase
      optimisticOracleAddress = await getAddress('OptimisticOracle', CHAIN_ID);
    }

    // filter only logs that match the optimistic oracle address
    // test transaction for ProposePrice event:
    // npx forta-agent run --tx 0x76ff352b2665886a2a3d3b16fe0fa41f61e4ffc0824b3a6734383d397187f53f
    const oracleLogs = txEvent.logs.filter((log) => log.address === optimisticOracleAddress);

    if (oracleLogs === []) return findings;

    // parse oracle logs for our target events:  RequestPrice and ProposePrice
    const parse = (log) => iface.parseLog(log);
    const filter = (log) => eventNames.indexOf(log.name) !== -1;
    const parsedLogs = oracleLogs.map(parse).filter(filter);

    // process the target events
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < parsedLogs.length; i++) {
      const log = parsedLogs[i];
      if (log.name === 'RequestPrice') {
        const { identifier, requester } = log.args;

        // decode the identifer to determine which price feed to use
        const idString = bytes32ToString(identifier);

        // lookup the price
        let price;
        try {
          price = await getPriceFunc(idString);
        } catch (err) {
          console.error(err);
          continue;
        }

        // report the price obtained as a finding
        findings.push(Finding.fromObject({
          name: 'UMA Price Request',
          description: `Price requested from Optimistic Oracle.  Identifier=${idString}, Price=${price}`,
          alertId: 'AE-UMA-OO-REQUESTPRICE',
          severity: FindingSeverity.Low,
          type: FindingType.Unknown,
          protocol: 'uma',
          everestId: config.umaEverestId,
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
        const idString = bytes32ToString(identifier);

        // lookup the price
        let price;
        try {
          price = await getPriceFunc(idString);
        } catch (err) {
          console.error(err);
          continue;
        }

        const proposedPrice = new BigNumber(proposedPriceRaw.toString());

        // generate a finding if the price difference threshold (defined in agent-config.json) has
        // been exceeded
        const percentError = calculatePercentError(proposedPrice, price);
        const { disputePriceErrorPercent } = config.optimisticOracle;

        if (percentError.isGreaterThan(disputePriceErrorPercent * 100)) {
          findings.push(Finding.fromObject({
            name: 'UMA Price Proposal',
            description: `Price proposed to Optimistic Oracle is disputable. Identifier=${idString}, ProposedPrice=${proposedPrice}, Price=${price}`,
            alertId: 'AE-UMA-OO-PROPOSEPRICE',
            severity: FindingSeverity.Low,
            type: FindingType.Unknown,
            protocol: 'uma',
            everestId: config.umaEverestId,
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
      }
    }

    return findings;
  };
}

module.exports = {
  provideHandleTransaction,
  handleTransaction: provideHandleTransaction(),
};
