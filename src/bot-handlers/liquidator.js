const {
  Finding, FindingSeverity, FindingType,
} = require('forta-agent');
const contractData = require('./liquidator-contract-data.json');

const {
  umaEverestId,
} = require('../../agent-config.json');

const {
  initializeContracts, checkIsExpiredOrShutdown,
} = require('./initialization');

function createAlert(financialContractClient, position) {
  return Finding.fromObject({
    name: `Liquidatable UMA position on contract ${financialContractClient.address}`,
    description: 'Position is under collateralized and can be liquidated',
    alertId: 'AE-UMA-LIQUIDATABLE-POSITION',
    severity: FindingSeverity.Medium,
    type: FindingType.Degraded,
    everestId: umaEverestId,
    metadata: position,
  });
}

function provideHandleBlock(contracts) {
  return async function handleBlock() {
    const findings = [];

    // iterate through each financial contract and check if it is liquidatable
    // awaiting contracts promise is a no op after it resolves the first time
    (await contracts).forEach(async ({ financialContractClient, priceFeed }) => {
      // check if contract is expired
      console.log('iterating');
      if (await checkIsExpiredOrShutdown(financialContractClient)) {
        console.log('contract is expired/shut down');
        return;
      }

      // update price feed and financial contract
      await Promise.all([
        priceFeed.update(),
        financialContractClient.update(),
      ]);

      // grab current price
      const price = await priceFeed.getCurrentPrice();

      // get liquidatable positions
      const getLiquidatablePositions = financialContractClient.getUnderCollateralizedPositions;
      const liquidatablePositions = await getLiquidatablePositions(price);

      liquidatablePositions.forEach((position) => {
        findings.push(createAlert(financialContractClient, position));
      });
    });
    return findings;
  };
}

module.exports = {
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeContracts(contractData)),
};
