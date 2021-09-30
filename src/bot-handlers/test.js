const {checkIsExpiredOrShutdown, initializeContracts} = require("./initialization.js");
const contracts = require("./liquidator-contract-data.json");

async function run() {
  const ret = await initializeContracts(contracts);
  const { financialContractClient, priceFeed } = ret[0];
  console.log("updating financial client");
  await financialContractClient.update();
  console.log("updated financial client");
  await priceFeed.update();
  console.log(financialContractClient);
  console.log(priceFeed);
  console.log(priceFeed.getCurrentPrice());
}

run();
