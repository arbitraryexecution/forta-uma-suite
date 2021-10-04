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

// formats provided data into a Forta alert
function createAlert(financialContractClient, position, price) {
  return Finding.fromObject({
    name: `Liquidatable UMA position on contract ${financialContractClient.address}`,
    description: 'Position is under collateralized and can be liquidated',
    alertId: 'AE-UMA-LIQUIDATABLE-POSITION',
    severity: FindingSeverity.Medium,
    type: FindingType.Degraded,
    everestId: umaEverestId,
    metadata: { 
      ...position,
      tokenPrice: price.toString(),
    }
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
    console.error(`contract ${financialContractClient.address} is expired/shut down`);
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

function provideHandleBlock(contracts) {
  return async function handleBlock() {
    // iterate through each financial contract and check if it is liquidatable
    // awaiting contracts promise is a no op after it resolves the first time
    const promises = (await contracts).map((contract) => checkIfLiquidatable(contract));

    return (await Promise.all(promises)).flat();
  };
}

module.exports = {
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeContracts(contractData)),
  createAlert,
};
