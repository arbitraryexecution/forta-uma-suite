const web3 = require('web3');
const toBN = web3.utils.toBN;

const contractData = require('./liquidator-contract-data.json');

const {
  Finding, FindingSeverity, FindingType,
} = require('forta-agent');

const {
  umaEverestId,
} = require('./../../agent-config.json');

const { 
  initializeContracts, checkIsExpiredOrShutdown,
} = require('./initialization');

function provideHandleBlock(contracts) {
  return async function handleBlock(blockEvent) {
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
      const underCollateralizedPositions =
        await financialContractClient.getUnderCollateralizedPositions(price);

      underCollateralizedPositions.forEach((position) => {
        findings.push(createAlert(financialContractClient, position));
      })
    });
    return findings;
  }
}

function createAlert(financialContractClient, position) {
  return Finding.fromObject({
    name: `Liquidatable UMA position on contract ${financialContractClient.address}`,
    description: `Position is under collateralized and can be liquidated`,
    alertId: 'AE-UMA-LIQUIDATABLE-POSITION',
    severity: FindingSeverity.Medium,
    type: FindingType.Degraded,
    everestId: umaEverestId,
    metadata: position,
  }); 
}


module.exports = {
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeContracts(contractData)),
};
