/* eslint-disable no-underscore-dangle */
const { Finding, FindingSeverity, FindingType } = require('forta-agent');
const web3 = require('web3');
const contractData = require('./disputer-contract-data.json');

const {
  umaEverestId,
} = require('../../agent-config.json');
const {
  initializeContracts,
} = require('./initialization');

// web3 helpers
const { toWei, toBN } = web3.utils;

function createAlert(financialContract, price, scaledPrice, liquidation) {
  return Finding.fromObject({
    name: 'UMA Dispute Opportunity',
    description: `Dispute opportunity identified for contract ${financialContract._address}`,
    alertId: 'AE-UMA-DISPUTE',
    protocol: 'uma',
    severity: FindingSeverity.Medium,
    type: FindingType.Info,
    everestId: umaEverestId,
    metadata: {
      financialContract: financialContract._address,
      price: price.toString(),
      scaledPrice: scaledPrice.toString(),
      liquidation: JSON.stringify(liquidation),
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
    value: 9000000, // can see recent averages here: https://etherscan.io/chart/gaslimit
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
  // eslint-disable-next-line no-unused-vars
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
      // eslint-disable-next-line no-unused-vars
      const disputableLiquidationsWithPrices = (
        await Promise.all(
          undisputedLiquidations.map(async (liquidation) => {
            const liquidationTime = parseInt(liquidation.liquidationTime.toString(), 10);
            const lookback = priceFeed.getLookback();
            const historicalLookbackWindow = priceFeed.getLastUpdateTime() - lookback;

            if (liquidationTime < historicalLookbackWindow) {
              // Liquidation time before earliest price feed historical timestamp
              return null;
            }
            // get the historic price at the liquidation time.
            let price;
            try {
              price = await priceFeed.getHistoricalPrice(liquidationTime);
            } catch (error) {
              console.error('Could not get historical price');
            }
            if (!price) return null;
            // price is available, use it to determine if the liquidation is disputable

            const scaledPrice = price
              .mul(toBN(toWei('1')).add(toBN(toWei(defaultConfig.crThreshold.value.toString()))))
              .div(toBN(toWei('1')));

            const timeAndDelay = liquidationTime + defaultConfig.disputeDelay.value;
            if (
              scaledPrice
              && financialContractClient.isDisputable(liquidation, scaledPrice)
              && financialContractClient.getLastUpdateTime() >= timeAndDelay
            ) {
              // here is where the finding should be
              findings.push(createAlert(financialContractClient.financialContract,
                price, scaledPrice, liquidation));
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
