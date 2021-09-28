const web3 = require('web3');
const { SUPPORTED_CONTRACT_VERSIONS } = require('@uma/common');
const { getAbi, findContractVersion } = require('@uma/core');

const addresses = require('addresses.json');

// This code heavily follows UMAs liquidation bot 

async function filterContracts(contractData) {
  if (
    SUPPORTED_CONTRACT_VERSIONS.filter(
      (c) =>
      c.contractType == contractData.contractType && c.contractVersion == contractData.contractVersion
    ).length === 0
  ) throw new Error (
    `Contract at address ${address} is not supported by the liquidator bot, skipping`
  );
  return contractData;
}

async function initializeContract([ address, contractData ]) {
  return [
    new web3.eth.Contract(
      getAbi(contractData.contractType, contractData.contractVersion),
      address
    ),
    contractData
  ];
}

async function filterExpiredOrShutdown(contract, contractData) {
  const [expirationOrShutdownTimestamp, contractTimestamp] = await Promise.all([
    contractData.contractType === "ExpiringMultiParty"
    ? contract.methods.expirationTimestamp().call()
    : contract.methods.emergencyShutdownTimestamp().call(),
    contract.methods.getCurrentTime().call(),
  ]);
  // Check if Financial Contract is expired.
  if (
    Number(contractTimestamp) >= Number(expirationOrShutdownTimestamp) &&
    Number(expirationOrShutdownTimestamp) > 0
  ) throw ne Error (
    `Contract at ${contract.address} is expired, skipping`
  );
  return contract;
}

async function initializeFinancialContracts() {
  const financialContracts = {};
  // preliminary checks and initialization of the addresses provided
  const promises = addresses.map((address) => {
    // get the contract version
    return findContractVersion(address, web3)
    // then filter out contracts that aren't supported
      .then(filterContracts)
    // fix up arguments for initializer
      .then((contractData) => [ address, contractData ])
    // initialize contracts
      .then(initializeContract)
    // catch and log errors
      .catch((error) => {
        console.error(error);
      })
  });


  // assign all supported contracts into our financial contracts object
  return (await Promise.all(promises)).filter((ele) => !!ele);
}



// Helper functions from web3.
BN = web3.utils.BN;
toBN = web3.utils.toBN;
toWei = web3.utils.toWei;
fromWei = web3.utils.fromWei;
utf8ToHex = web3.utils.utf8ToHex;
