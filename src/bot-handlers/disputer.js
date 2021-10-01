const { Finding, FindingSeverity, FindingType } = require('forta-agent');
const web3 = require('web3');
const contractData = require('./disputer-contract-data.json');

const { 
  umaEverestId,
} = require('../../agent-config.json');

const {
  initializeContracts,
} = require('./initialization');

// Helpers we may or may not need
const {
  fromWei,
  toWei,
  toBN,
  utf8ToHex
} = web3.utils;

function createAlert(price, scaledPrice, liquidation) {
  return Finding.fromObject({
    name: 'Dispute Opportunity',
    description: 'Dispute opportunity identified',
    alertId: 'AE-UMA-DISPUTE',
    protocol: 'uma',
    severity: FindingSeverity.Medium,
    type: FindingType.Suspicious, // TODO: Probably change to info if they added that in
    everestId: umaEverestId,
    metadata: {
      price: price.toString(),
      scaledPrice: scaledPrice.toString(),
      liquidation,
    },
  });
}

// See disputer bot source for config comments
const defaultConfig = {
  crThreshold: {
    value: 0.02,
    isValid: (x) => x < 1 && x >= 0,
  },
  disputeDelay: {
    value: 60,
    isValid: (x) => x >= 0,
  },
  txnGasLimit: {
    value: 9000000, // Can see recent averages here: https://etherscan.io/chart/gaslimit
    isValid: (x) => x >= 6000000 && x < 15000000,
  },
  contractType: {
    value: undefined,
    isValid: (x) => x === 'ExpiringMultiParty' || x === 'Perpetual',
  },
  contractVersion: {
    value: undefined,
    isValid: (x) => x === '2.0.1',
  },
};

function provideHandleBlock(contracts) {
  return async function handleBlock(blockEvent) {
    const findings = [];
    const financialContracts = await contracts;
    
    async function generateFindings(financialObject) {
      // Grab things out of our financialObject
      const { financialContractClient } = financialObject;
      const { priceFeed } = financialObject;
      
      // update client and price feed
      await Promise.all([financialContractClient.update(), priceFeed.update()]);
      
      console.log("updated contracts and priced feeds");
      // Get the latest disputable liquidations from the client.
      const undisputedLiquidations = financialContractClient.getUndisputedLiquidations();
      console.log(undisputedLiquidations);
      const disputableLiquidationsWithPrices = (
        await Promise.all(
          undisputedLiquidations.map(async (liquidation) => {
            // If liquidation time is before the price feed's lookback window, then we can skip this liquidation
            // because we will not be able to get a historical price. If a dispute override price is provided then
            // we can ignore this check.
            const liquidationTime = parseInt(liquidation.liquidationTime.toString());
            const historicalLookbackWindow = Number(priceFeed.getLastUpdateTime()) - Number(priceFeed.getLookback());
            // TODO: see if this is necessary to keep 
            if (liquidationTime < historicalLookbackWindow) {
              console.error("Cannot dispute: liquidation time before earliest price feed historical timestamp"); 
              //logger.debug({
              //  at: 'Disputer',
              //  message: 'Cannot dispute: liquidation time before earliest price feed historical timestamp',
              //  liquidationTime,
              //  historicalLookbackWindow,
              //});
              return null;
            }
            console.log("getting the price");
            // Get the historic price at the liquidation time.
            let price;
            try {
              price = await priceFeed.getHistoricalPrice(liquidationTime); // This is the important one
            } catch (error) {
                console.log("error getting historical price"); 
              }
            if (!price) return null;

            // The `price` is a BN that is used to determine if a position is correctly collateralized. The higher the
            // `price` value, the more collateral that the position is required to have to be correctly collateralized.
            // Therefore, if the price is lower than the liquidation price, then the liquidation is disputable
            // because the position was correctly collateralized.
            // We add a buffer by deriving scaledPrice = price * (1 + crThreshold)
            const scaledPrice = price
              .mul(toBN(toWei('1')).add(toBN(toWei(crThreshold.toString()))))
              .div(toBN(toWei('1')));

            // Price is available, use it to determine if the liquidation is disputable
            if (
              scaledPrice
          && financialContractClient.isDisputable(liquidation, scaledPrice)
          && financialContractClient.getLastUpdateTime() >= Number(liquidationTime) + defaultConfig.disputeDelay
            ) {
              // Here is where the finding should be
              console.log('Finding for a dispute!');
              findings.push(createAlert(price, scaledPrice, liquidation));
            }
            return null;
          }),
        )
      ).filter((liquidation) => liquidation !== null);
    }
    
    // generate findings for each contract and catch exceptions so Promise.all does not bail early
    await Promise.all(financialContracts.map(
      (contract) => generateFindings(contract).catch((e) => console.error(e)),
    ));

    return findings;
  };
}

module.exports = {
  provideHandleBlock,
  handleBlock: provideHandleBlock(initializeContracts(contractData)),
};
