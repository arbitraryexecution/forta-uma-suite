const ethers = require('ethers');
const axios = require('axios');
const BigNumber = require('bignumber.js');
const { getAbi, getAddress } = require('@uma/contracts-node');
const {
  Finding, FindingSeverity, FindingType, getJsonRpcUrl,
} = require('forta-agent');

// load agent configuration
const config = require('../agent-config.json');

// provide ABI for ERC-20 decimals() function
const erc20Abi = [
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [
      {
        name: '',
        type: 'uint8',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
];

const CHAIN_ID = 1; // mainnet

// stores the optimistic oracle contract address
let optimisticOracleAddress;

// create ethers interface object
const optimisticOracleAbi = getAbi('OptimisticOracle');
const iface = new ethers.utils.Interface(optimisticOracleAbi);

// set up provider for read-only contract queries
const provider = new ethers.providers.JsonRpcProvider(getJsonRpcUrl());

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

// calculate the % difference between 2 values
function calculatePercentError(first, second) {
  const delta = first.minus(second).absoluteValue();
  return delta.div(first).multipliedBy(100);
}

// get an ERC-20 token price using the CoinGecko API
// free tier is limited to 50 calls/minute
// see https://coingecko.com/en/api/documentation for more information
async function getPrice(contractAddress) {
  const baseUrl = 'https://api.coingecko.com/api/v3/simple/token_price/';
  const id = 'ethereum';
  const vsCurrency = 'usd';
  const requestUrl = `${baseUrl + id}?contract_addresses=${contractAddress}&vs_currencies=${vsCurrency}`;

  const response = await axios.get(requestUrl);
  if (response.status !== 200) {
    throw `Error getting response from server (status=${response.status})`;
  }

  const price = response.data[contractAddress.toLowerCase()][vsCurrency];

  return price;
}

function provideHandleTransaction(erc20Contract) {
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
    for (let i = 0; i < parsedLogs.length; i++) {
      const log = parsedLogs[i];
      if (log.name === 'RequestPrice') {
        // get token address (this will be checksum encoded)
        const { currency, requester } = log.args;

        // make a request to the price feed API
        let price;
        try {
          price = await getPrice(currency);
        } catch (error) {
          console.error(error);
          continue;
        }

        // report the price obtained as a finding
        findings.push(Finding.fromObject({
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
        }));
      }

      if (log.name === 'ProposePrice') {
        const { currency } = log.args;
        const { requester } = log.args;
        const { proposer } = log.args;

        // set up ERC-20 contract to get decimals value
        // in production, erc20Contract will always be undefined
        // in testing, erc20Contract will be assigned to a mock contract
        // (this is an unfortunate case of modifying the implementation to support testing)
        if (erc20Contract === undefined) {
          erc20Contract = new ethers.Contract(currency, erc20Abi, provider);
        }

        const decimals = await erc20Contract.decimals();

        // convert proposedPrice to a human-readable decimal value
        let proposedPrice = ethers.utils.formatUnits(log.args.proposedPrice, decimals);

        // convert the proposedPrice to a BigNumber type for difference calculations later
        proposedPrice = new BigNumber(proposedPrice.toString());

        // make a request to the price feed API
        // CoinGecko will return decimal values
        let price;
        try {
          price = await getPrice(currency);
        } catch (error) {
          console.error(error);
          continue;
        }

        // convert the price obtained to a BigNumber type
        price = new BigNumber(price);

        // generate a finding if the price difference threshold (defined in agent-config.json) has
        // been exceeded
        const percentError = calculatePercentError(proposedPrice, price);

        if (percentError.isGreaterThan(config.optimisticOracle.priceThresholdPct)) {
          findings.push(Finding.fromObject({
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
  handleTransaction: provideHandleTransaction(undefined),
};
