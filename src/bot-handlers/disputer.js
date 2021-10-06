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
  utf8ToHex,
} = web3.utils;

function createAlert(price, scaledPrice, liquidation) {
  return Finding.fromObject({
    name: 'Dispute Opportunity',
    description: 'Dispute opportunity identified',
    alertId: 'AE-UMA-DISPUTE',
    protocol: 'uma',
    severity: FindingSeverity.Medium,
    type: FindingType.Suspicious, // TODO: Change to info when we update forta-agent
    everestId: umaEverestId,
    metadata: {
      price: price.toString(),
      scaledPrice: scaledPrice.toString(),
      liquidation,
    },
  });
}

const defaultConfig = {
  crThreshold: {
    value: 0.02,
    isValid: (x) => x < 1 && x >= 0,
  },
  disputeDelay: {
    value: 0,
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
      // grab things out of our financialObject
      const { financialContractClient } = financialObject;
      const { priceFeed } = financialObject;
      // update client and price feed
      await Promise.all([financialContractClient.update(), priceFeed.update()]);

      // get the latest disputable liquidations from the client.
      const undisputedLiquidations = financialContractClient.getUndisputedLiquidations();
      const disputableLiquidationsWithPrices = (
        await Promise.all(
          undisputedLiquidations.map(async (liquidation) => {
            const liquidationTime = parseInt(liquidation.liquidationTime.toString());
            const historicalLookbackWindow = Number(priceFeed.getLastUpdateTime()) - Number(priceFeed.getLookback());

            if (liquidationTime < historicalLookbackWindow) {
              //console.error('Cannot dispute: liquidation time before earliest price feed historical timestamp');
              return null;
            }
            // Get the historic price at the liquidation time.
            let price;
            try {
              price = await priceFeed.getHistoricalPrice(liquidationTime);
            } catch (error) {
              //console.error('could not get historical price');
            }
            if (!price) return null;
            // Price is available, use it to determine if the liquidation is disputable

            const scaledPrice = price
              .mul(toBN(toWei("1")).add(toBN(toWei(defaultConfig.crThreshold.value.toString()))))
              .div(toBN(toWei("1")));
            if (
              scaledPrice &&
              financialContractClient.isDisputable(liquidation, scaledPrice) &&
              financialContractClient.getLastUpdateTime() >= Number(liquidationTime) + defaultConfig.disputeDelay.value
            ) {
              // Here is where the finding should be
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
  createAlert,
};
