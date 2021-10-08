/* eslint-disable no-underscore-dangle */
const {
  Finding, FindingSeverity, FindingType,
} = require('forta-agent');

// data to initialize contracts we are monitoring
const contractData = require('./liquidator-contract-data.json');

const {
  umaEverestId,
} = require('../../agent-config.json');

const {
  initializeContracts, checkIsExpiredOrShutdown,
} = require('./initialization');

// initialized data
const initializeData = {};

// formats provided data into a Forta alert
function createAlert(financialContractClient, position, price) {
  return Finding.fromObject({
    name: 'Liquidator alert',
    description: `Position is under-collateralized and can be liquidated on contract \
    ${financialContractClient._address}`,
    protocol: 'uma',
    alertId: 'AE-UMA-LIQUIDATABLE-POSITION',
    severity: FindingSeverity.Medium,
    type: FindingType.Info,
    everestId: umaEverestId,
    metadata: {
      financialContract: financialContractClient._address,
      ...position,
      tokenPrice: price.toString(),
    },
  });
}

// checks financialContractClient for liquidatable positions
async function checkIfLiquidatable({ financialContractClient, priceFeed }) {
  // update price feed and financial contract
  await Promise.all([
    priceFeed.update(),
    financialContractClient.update(),
  ]);

  // check if contract is expired
  if (await checkIsExpiredOrShutdown(financialContractClient)) {
    console.error(`contract ${financialContractClient._address} is expired/shut down`);
    return [];
  }

  // grab current price
  const price = await priceFeed.getCurrentPrice();

  // get liquidatable positions
  // eslint-disable-next-line max-len
  const liquidatablePositions = await financialContractClient.getUnderCollateralizedPositions(price);

  return liquidatablePositions.map(
    (position) => createAlert(financialContractClient, position, price),
  );
}

function provideHandleBlock(data) {
  return async function handleBlock() {
    // ensure initialization worked
    if (!data?.contracts) throw new Error('Running handler without initializing first');

    // iterate through each financial contract and check if it is liquidatable
    // awaiting contracts promise is a no op after it resolves the first time
    const promises = (await data.contracts).map((contract) => checkIfLiquidatable(contract));

    return (await Promise.all(promises)).flat();
  };
}

function provideInitialize(data) {
  return async function initialize() {
    // eslint-disable-next-line no-param-reassign
    data.contracts = initializeContracts(contractData);
  };
}

module.exports = {
  provideInitialize,
  initialize: provideInitialize(initializeData),
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeData),
  createAlert,
};
