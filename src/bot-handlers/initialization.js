// Helpers
const { SUPPORTED_CONTRACT_VERSIONS, PublicNetworks } = require('@uma/common');

// JS libs
const {
  FinancialContractClient,
  Networker,
  Logger: logger,
  createReferencePriceFeedForFinancialContract,
  multicallAddressMap,
} = require('@uma/financial-templates-lib');

const {
  getJsonRpcUrl,
} = require('forta-agent');

const Web3 = require('web3');

// Contract ABIs and network Addresses.
const { getAbi, findContractVersion } = require('@uma/core');

// initialize global constants TODO: ensure web3 is correct
const getTime = () => Math.round(new Date().getTime() / 1000);
const web3 = new Web3(new Web3.providers.HttpProvider(getJsonRpcUrl()));

// Returns whether the Financial Contract has expired yet
async function checkIsExpiredOrShutdown(financialContractClient) {
  const { financialContract, contractType } = financialContractClient;
  const [expirationOrShutdownTimestamp, contractTimestamp] = await Promise.all([
    contractType === 'ExpiringMultiParty'
      ? financialContract.methods.expirationTimestamp().call()
      : financialContract.methods.emergencyShutdownTimestamp().call(),
    financialContract.methods.getCurrentTime().call(),
  ]);
  // Check if Financial Contract is expired.
  if (
    Number(contractTimestamp) >= Number(expirationOrShutdownTimestamp)
    && Number(expirationOrShutdownTimestamp) > 0
  ) {
    return true;
  }
  return false;
}

async function processContractAndPriceFeed({ financialContractAddress, priceFeedConfig }) {
  // find contract version
  const detectedContract = await findContractVersion(financialContractAddress, web3);

  // Check that the version and type is supported.
  // Note if either is null this check will also catch it.
  if (
    SUPPORTED_CONTRACT_VERSIONS.filter(
      (vo) => vo.contractType === detectedContract.contractType
      && vo.contractVersion === detectedContract.contractVersion,
    ).length === 0
  ) {
    throw new Error(
      `Contract at ${financialContractAddress} has version specified or inferred is not supported by this bot.`,
    );
  }

  // Setup contract instances. This uses the contract version pulled in from previous step.
  const financialContract = new web3.eth.Contract(
    getAbi(detectedContract.contractType, detectedContract.contractVersion),
    financialContractAddress,
  );

  // Generate Financial Contract properties to inform bot of important on-chain
  // state values that we only want to query once.
  const [
    collateralTokenAddress,
    syntheticTokenAddress,
  ] = await Promise.all([
    financialContract.methods.collateralCurrency().call(),
    financialContract.methods.tokenCurrency().call(),
  ]);

  const collateralToken = new web3.eth.Contract(getAbi('ExpandedERC20'), collateralTokenAddress);
  const syntheticToken = new web3.eth.Contract(getAbi('ExpandedERC20'), syntheticTokenAddress);
  const [collateralDecimals, syntheticDecimals] = await Promise.all([
    collateralToken.methods.decimals().call(),
    syntheticToken.methods.decimals().call(),
  ]);

  // set up price feed.
  const priceFeed = await createReferencePriceFeedForFinancialContract(
    logger,
    web3,
    new Networker(logger),
    getTime,
    financialContractAddress,
    priceFeedConfig,
  );

  if (!priceFeed) {
    throw new Error('Price feed config is invalid');
  }

  // get network name
  const networkId = await web3.eth.net.getId();
  const networkName = PublicNetworks[Number(networkId)]
    ? PublicNetworks[Number(networkId)].name : null;

  // Create the financialContractClient to query on-chain information
  const financialContractClient = new FinancialContractClient(
    logger,
    getAbi(detectedContract.contractType, detectedContract.contractVersion),
    web3,
    financialContractAddress,
    networkName ? multicallAddressMap[networkName].multicall : null,
    collateralDecimals,
    syntheticDecimals,
    priceFeed.getPriceFeedDecimals(),
    detectedContract.contractType,
  );

  return { financialContractClient, priceFeed };
}

async function initializeContracts(financialContractData) {
  logger.silent = true;

  // process each financial contract in our config list
  return Promise.all(
    financialContractData.map((entry) => processContractAndPriceFeed(entry)),
  ).catch((error) => console.error(error))
  // filter out errored results TODO: needs to check for undefined
    .then((entries) => entries.filter((entry) => entry));
}

module.exports = {
  checkIsExpiredOrShutdown,
  initializeContracts,
};
