/* eslint-disable no-loop-func, max-len */
// Bulk of initialization code taken from UMA source file
// UMAprotocol/protocol/packages/disputer/test/Disputer.js
//
const { web3, getContract } = require('hardhat');

const {
  toWei, utf8ToHex, padRight, toBN,
} = web3.utils;

const winston = require('winston');
const sinon = require('sinon');
const {
  parseFixed,
  LiquidationStatesEnum,
  interfaceName,
  runTestForVersion,
  MAX_UINT_VAL,
  createConstructorParamsForContractVersion,
  getContractsNodePackageAliasForVerion,
  TESTED_CONTRACT_VERSIONS,
  TEST_DECIMAL_COMBOS,
} = require('@uma/common');

const { assert } = require('chai');

// helper clients and custom winston transport module to monitor winston log outputs
const {
  FinancialContractClient,
  PriceFeedMock,
  SpyTransport,
} = require('@uma/financial-templates-lib');

// forta handler
const {
  provideHandleBlock,
  createAlert,
} = require('../disputer');

let iterationTestVersion; // store the test version between tests that is currently being tested.
const startTime = '15798990420';
const unreachableDeadline = MAX_UINT_VAL;
const crThreshold = 0.02;

// common contract objects.
let store;
let optimisticOracle;
let finder;
let collateralToken;
let configStore;
let financialContract;
let syntheticToken;
let mockOracle;
let priceFeedMock;
let identifierWhitelist;
let collateralWhitelist;
let timer;
let fundingRateIdentifier;
let multicall;

// JS Objects, clients and helpers
let identifier;
let spy;
let spyLogger;
let financialContractClient;
let handleBlock;
let convertDecimals;

// If the current version being executed is part of the `supportedVersions` array then return `it` to run the test.
// Else, do nothing. Can be used exactly in place of a normal `it` to parameterize contract types and versions supported.
// For a given test.eg: versionedIt([{ contractType: "Perpetual", contractVersion: "latest" }])("test name", async function () { assert.isTrue(true) })
// Note that a second param can be provided to make the test an `it.only` thereby ONLY running that single test, on
// the provided version. This is very useful for debugging and writing single unit tests without having ro run all tests.
function versionedIt(supportedVersions, shouldBeItOnly = false) {
  if (shouldBeItOnly) {
    return runTestForVersion(supportedVersions, TESTED_CONTRACT_VERSIONS, iterationTestVersion)
      ? it.only : () => {};
  }
  return runTestForVersion(supportedVersions, TESTED_CONTRACT_VERSIONS, iterationTestVersion)
    ? it : () => {};
}

// allows this to be set to null without throwing.
const Convert = (decimals) => (number) => (number ? parseFixed(number.toString(), decimals).toString() : number);

describe('disputer-test.js', () => {
  let accounts;
  // Roles
  let sponsor1;
  let sponsor2;
  let sponsor3;
  let liquidator;
  let contractCreator;

  TESTED_CONTRACT_VERSIONS.forEach((contractVersion) => {
    // store the contractVersion.contractVersion, type and version being tested
    iterationTestVersion = contractVersion;

    // eslint-disable-next-line import/no-dynamic-require, global-require
    const { getAbi, getBytecode } = require(getContractsNodePackageAliasForVerion(contractVersion.contractVersion));

    const createContract = (name) => {
      const abi = getAbi(name);
      const bytecode = getBytecode(name);
      return getContract(name, { abi, bytecode });
    };

    // import the tested versions of contracts. note that financialContract is either an ExpiringMultiParty or a
    // perpetual depending on the current iteration version.
    const FinancialContract = createContract(contractVersion.contractType);
    const Finder = createContract('Finder');
    const IdentifierWhitelist = createContract('IdentifierWhitelist');
    const AddressWhitelist = createContract('AddressWhitelist');
    const MockOracle = createContract('MockOracle');
    const Token = createContract('ExpandedERC20');
    const SyntheticToken = createContract('SyntheticToken');
    const Timer = createContract('Timer');
    const Store = createContract('Store');
    const ConfigStore = createContract('ConfigStore');
    const OptimisticOracle = createContract('OptimisticOracle');
    const MulticallMock = createContract('MulticallMock');

    TEST_DECIMAL_COMBOS.forEach((testConfig) => {
      describe(`${testConfig.collateralDecimals} collateral, ${testConfig.syntheticDecimals} synthetic & ${testConfig.priceFeedDecimals} pricefeed decimals, for smart contract version ${contractVersion.contractType} @ ${contractVersion.contractVersion}`, () => {
        before(async () => {
          accounts = await web3.eth.getAccounts();
          [sponsor1, sponsor2, sponsor3, liquidator, contractCreator] = accounts;

          identifier = `${testConfig.tokenName}TEST`;
          fundingRateIdentifier = `${testConfig.tokenName}_FUNDING`;
          convertDecimals = Convert(testConfig.collateralDecimals);
          collateralToken = await Token.new(
            `${testConfig.tokenSymbol} Token`, // Construct the token name.
            testConfig.tokenSymbol,
            testConfig.collateralDecimals,
          ).send({ from: contractCreator });
          await collateralToken.methods.addMember(1, contractCreator).send({ from: contractCreator });

          // seed the sponsors accounts.
          await collateralToken.methods.mint(sponsor1, convertDecimals('100000')).send({ from: contractCreator });
          await collateralToken.methods.mint(sponsor2, convertDecimals('100000')).send({ from: contractCreator });
          await collateralToken.methods.mint(sponsor3, convertDecimals('100000')).send({ from: contractCreator });
          await collateralToken.methods.mint(liquidator, convertDecimals('100000')).send({ from: contractCreator });

          // create identifier whitelist and register the price tracking ticker with it.
          identifierWhitelist = await IdentifierWhitelist.new().send({ from: contractCreator });
          await identifierWhitelist.methods
            .addSupportedIdentifier(utf8ToHex(identifier))
            .send({ from: contractCreator });

          finder = await Finder.new().send({ from: contractCreator });
          timer = await Timer.new().send({ from: contractCreator });
          store = await Store.new({ rawValue: '0' }, { rawValue: '0' }, timer.options.address).send({
            from: contractCreator,
          });
          await finder.methods
            .changeImplementationAddress(utf8ToHex(interfaceName.Store), store.options.address)
            .send({ from: contractCreator });

          await finder.methods
            .changeImplementationAddress(
              utf8ToHex(interfaceName.IdentifierWhitelist),
              identifierWhitelist.options.address,
            )
            .send({ from: contractCreator });

          collateralWhitelist = await AddressWhitelist.new().send({ from: contractCreator });
          await finder.methods
            .changeImplementationAddress(
              utf8ToHex(interfaceName.CollateralWhitelist),
              collateralWhitelist.options.address,
            )
            .send({ from: contractCreator });
          await collateralWhitelist.methods
            .addToWhitelist(collateralToken.options.address)
            .send({ from: contractCreator });

          multicall = await MulticallMock.new().send({ from: contractCreator });
        });

        beforeEach(async () => {
          await timer.methods.setCurrentTime(startTime - 1).send({ from: contractCreator });
          mockOracle = await MockOracle.new(finder.options.address, timer.options.address).send({
            from: contractCreator,
          });
          await finder.methods
            .changeImplementationAddress(utf8ToHex(interfaceName.Oracle), mockOracle.options.address)
            .send({ from: contractCreator });

          // create a new synthetic token
          syntheticToken = await SyntheticToken.new(
            'Test Synthetic Token',
            'SYNTH',
            testConfig.syntheticDecimals,
          ).send({ from: contractCreator });

          // if we are testing a perpetual then we need to also deploy a config store, an optimistic oracle and set the funding rate identifier.
          if (contractVersion.contractType === 'Perpetual') {
            configStore = await ConfigStore.new(
              {
                timelockLiveness: 86400, // 1 day
                rewardRatePerSecond: { rawValue: '0' },
                proposerBondPercentage: { rawValue: '0' },
                maxFundingRate: { rawValue: toWei('0.00001') },
                minFundingRate: { rawValue: toWei('-0.00001') },
                proposalTimePastLimit: 0,
              },
              timer.options.address,
            ).send({ from: contractCreator });

            await identifierWhitelist.methods
              .addSupportedIdentifier(padRight(utf8ToHex(fundingRateIdentifier)))
              .send({ from: contractCreator });
            optimisticOracle = await OptimisticOracle.new(7200, finder.options.address, timer.options.address).send({
              from: contractCreator,
            });
            await finder.methods
              .changeImplementationAddress(utf8ToHex(interfaceName.OptimisticOracle), optimisticOracle.options.address)
              .send({ from: contractCreator });
          }

          const constructorParams = await createConstructorParamsForContractVersion(contractVersion, {
            convertDecimals,
            finder,
            collateralToken,
            syntheticToken,
            identifier,
            fundingRateIdentifier,
            timer,
            store,
            configStore: configStore || {}, // if the contract type is not a perp this will be null.
          },
          // these tests assume a minimum sponsor size of 1, not 5 as default
          { minSponsorTokens: { rawValue: convertDecimals('1') } });

          // deploy a new expiring multi party OR perpetual, depending on the test version.
          financialContract = await FinancialContract.new(constructorParams).send({ from: contractCreator });
          await syntheticToken.methods.addMinter(financialContract.options.address).send({ from: contractCreator });
          await syntheticToken.methods.addBurner(financialContract.options.address).send({ from: contractCreator });

          await collateralToken.methods
            .approve(financialContract.options.address, convertDecimals('100000000'))
            .send({ from: sponsor1 });
          await collateralToken.methods
            .approve(financialContract.options.address, convertDecimals('100000000'))
            .send({ from: sponsor2 });
          await collateralToken.methods
            .approve(financialContract.options.address, convertDecimals('100000000'))
            .send({ from: sponsor3 });
          await collateralToken.methods
            .approve(financialContract.options.address, convertDecimals('100000000'))
            .send({ from: liquidator });

          syntheticToken = await Token.at(await financialContract.methods.tokenCurrency().call());
          await syntheticToken.methods
            .approve(financialContract.options.address, convertDecimals('100000000'))
            .send({ from: sponsor1 });
          await syntheticToken.methods
            .approve(financialContract.options.address, convertDecimals('100000000'))
            .send({ from: sponsor2 });
          await syntheticToken.methods
            .approve(financialContract.options.address, convertDecimals('100000000'))
            .send({ from: sponsor3 });
          await syntheticToken.methods
            .approve(financialContract.options.address, convertDecimals('100000000'))
            .send({ from: liquidator });

          // if we are testing a perpetual then we need to apply the initial funding rate to start the timer.
          await financialContract.methods.setCurrentTime(startTime).send({ from: contractCreator });

          spy = sinon.spy();

          spyLogger = winston.createLogger({
            level: 'info',
            transports: [new SpyTransport({ level: 'info' }, { spy })],
          });

          // create a new instance of the FinancialContractClient
          financialContractClient = new FinancialContractClient(
            spyLogger,
            FinancialContract.abi,
            web3,
            financialContract.options.address,
            multicall.options.address,
            testConfig.collateralDecimals,
            testConfig.syntheticDecimals,
            testConfig.priceFeedDecimals,
            contractVersion.contractType,
          );

          // create a new instance of the price feed mock.
          priceFeedMock = new PriceFeedMock(undefined, undefined, undefined, testConfig.priceFeedDecimals);

          // initialize handler
          handleBlock = provideHandleBlock({
            contracts: [{
              financialContractClient,
              priceFeed: priceFeedMock,
            }],
          });
        });

        versionedIt([{ contractType: 'any', contractVersion: 'any' }])(
          'Detect disputable positions',
          async () => {
            // sponsor1 creates a position with 125 units of collateral, creating 100 synthetic tokens.
            await financialContract.methods
              .create({ rawValue: convertDecimals('125') }, { rawValue: convertDecimals('100') })
              .send({ from: sponsor1 });

            // sponsor2 creates a position with 150 units of collateral, creating 100 synthetic tokens.
            await financialContract.methods
              .create({ rawValue: convertDecimals('150') }, { rawValue: convertDecimals('100') })
              .send({ from: sponsor2 });

            // sponsor3 creates a position with 175 units of collateral, creating 100 synthetic tokens.
            await financialContract.methods
              .create({ rawValue: convertDecimals('175') }, { rawValue: convertDecimals('100') })
              .send({ from: sponsor3 });

            // the liquidator creates a position to have synthetic tokens.
            await financialContract.methods
              .create({ rawValue: convertDecimals('1000') }, { rawValue: convertDecimals('500') })
              .send({ from: liquidator });

            // submit the liquidations
            await financialContract.methods
              .createLiquidation(
                sponsor1,
                { rawValue: '0' },
                { rawValue: toWei('1.75') },
                { rawValue: convertDecimals('100') },
                unreachableDeadline,
              )
              .send({ from: liquidator });
            await financialContract.methods
              .createLiquidation(
                sponsor2,
                { rawValue: '0' },
                { rawValue: toWei('1.75') },
                { rawValue: convertDecimals('100') },
                unreachableDeadline,
              )
              .send({ from: liquidator });
            await financialContract.methods
              .createLiquidation(
                sponsor3,
                { rawValue: '0' },
                { rawValue: toWei('1.75') },
                { rawValue: convertDecimals('100') },
                unreachableDeadline,
              )
              .send({ from: liquidator });

            // try disputing before any mocked prices are set, simulating a situation where the pricefeed
            // fails to return a price.
            await financialContractClient.update();
            const earliestLiquidationTime = Number(
              financialContractClient.getUndisputedLiquidations()[0].liquidationTime,
            );
            priceFeedMock.setLastUpdateTime(earliestLiquidationTime);

            await priceFeedMock.update();

            // no disputes yet
            assert.deepEqual(await handleBlock(), []);

            // start with a mocked price of 1.75 usd per token.
            // this makes all sponsors undercollateralized, meaning no disputes are issued.
            priceFeedMock.setHistoricalPrice(toWei('1.75'));

            await priceFeedMock.update();
            assert.deepEqual(await handleBlock(), []);

            // there should be no liquidations created from any sponsor account
            assert.equal(
              (await financialContract.methods.getLiquidations(sponsor1).call())[0].state,
              LiquidationStatesEnum.PRE_DISPUTE,
            );
            assert.equal(
              (await financialContract.methods.getLiquidations(sponsor2).call())[0].state,
              LiquidationStatesEnum.PRE_DISPUTE,
            );
            assert.equal(
              (await financialContract.methods.getLiquidations(sponsor3).call())[0].state,
              LiquidationStatesEnum.PRE_DISPUTE,
            );

            // with a price of 1.1, two sponsors should be correctly collateralized, so disputes should be issued against sponsor2 and sponsor3's liquidations.
            priceFeedMock.setHistoricalPrice(toWei('1.1'));
            await financialContractClient.update();
            await priceFeedMock.update();

            // disputing a timestamp that is before the pricefeed's lookback window will do nothing and print no warnings:
            // set earliest timestamp to AFTER the liquidation:
            priceFeedMock.setLastUpdateTime(earliestLiquidationTime + 2);
            priceFeedMock.setLookback(1);
            await priceFeedMock.update();

            // there should be no liquidations created from any sponsor account
            assert.equal(
              (await financialContract.methods.getLiquidations(sponsor1).call())[0].state,
              LiquidationStatesEnum.PRE_DISPUTE,
            );
            assert.equal(
              (await financialContract.methods.getLiquidations(sponsor2).call())[0].state,
              LiquidationStatesEnum.PRE_DISPUTE,
            );
            assert.equal(
              (await financialContract.methods.getLiquidations(sponsor3).call())[0].state,
              LiquidationStatesEnum.PRE_DISPUTE,
            );

            assert.deepEqual(await handleBlock(), []);

            // now, set lookback such that the liquidation timestamp is captured and the dispute should go through.
            priceFeedMock.setLookback(2);
            await priceFeedMock.update();

            const testFindings = [];
            const liquidations = financialContractClient.getUndisputedLiquidations();

            // we skip sponsor1's liquidation, since it is not disputable
            const price = toBN(toWei('1.1'));
            const scaledPrice = price
              .mul(toBN(toWei('1')).add(toBN(toWei(crThreshold.toString()))))
              .div(toBN(toWei('1')));
            testFindings.push(createAlert(financialContractClient.financialContract, price, scaledPrice, liquidations[1])); // sponsor 2
            testFindings.push(createAlert(financialContractClient.financialContract, price, scaledPrice, liquidations[2])); // sponsor 3
            assert.deepEqual(await handleBlock(), testFindings);
          },
        );

        versionedIt([{ contractType: 'any', contractVersion: 'any' }])(
          "Don't get tricked by almost disputable withdraws",
          async () => {
            // sponsor1 creates a position with 125 units of collateral, creating 100 synthetic tokens.
            await financialContract.methods
              .create({ rawValue: convertDecimals('125') }, { rawValue: convertDecimals('100') })
              .send({ from: sponsor1 });

            // the liquidator creates a position to have synthetic tokens.
            await financialContract.methods
              .create({ rawValue: convertDecimals('1000') }, { rawValue: convertDecimals('500') })
              .send({ from: liquidator });

            // the sponsor1 submits a valid withdrawal request of withdrawing exactly 5e18 collateral. This places their
            // position at collateral of 120 and debt of 100. At a price of 1 unit per token they are exactly collateralized.

            await financialContract.methods
              .requestWithdrawal({ rawValue: convertDecimals('5') })
              .send({ from: sponsor1 });

            await financialContractClient.update();

            await financialContract.methods
              .createLiquidation(
                sponsor1,
                { rawValue: '0' },
                { rawValue: toWei('1.75') }, // Price high enough to initiate the liquidation
                { rawValue: convertDecimals('100') },
                unreachableDeadline,
              )
              .send({ from: liquidator });
            // with a price of 1 usd per token this withdrawal was actually valid, even though it's very close to liquidation.
            // this makes all sponsors undercollateralized, meaning no disputes are issued.
            priceFeedMock.setHistoricalPrice(toWei('1'));
            await priceFeedMock.update();
            await financialContractClient.update();
            assert.deepEqual(await handleBlock(), []);
          },
        );

        versionedIt([{ contractType: 'any', contractVersion: 'any' }])('Too little collateral', async () => {
          // sponsor1 creates a position with 150 units of collateral, creating 100 synthetic tokens.
          await financialContract.methods
            .create({ rawValue: convertDecimals('150') }, { rawValue: convertDecimals('100') })
            .send({ from: sponsor1 });
          // sponsor2 creates a position with 1.75 units of collateral, creating 1 synthetic tokens.
          await financialContract.methods
            .create({ rawValue: convertDecimals('1.75') }, { rawValue: convertDecimals('1') })
            .send({ from: sponsor2 });

          // the liquidator creates a position to have synthetic tokens.
          await financialContract.methods
            .create({ rawValue: convertDecimals('1000') }, { rawValue: convertDecimals('500') })
            .send({ from: liquidator });

          await financialContractClient.update();
          await financialContract.methods
            .createLiquidation(
              sponsor1,
              { rawValue: '0' },
              { rawValue: toWei('1.75') },
              { rawValue: convertDecimals('100') },
              unreachableDeadline,
            )
            .send({ from: liquidator });

          await financialContract.methods
            .createLiquidation(
              sponsor2,
              { rawValue: '0' },
              { rawValue: toWei('1.75') },
              { rawValue: convertDecimals('1') },
              unreachableDeadline,
            )
            .send({ from: liquidator });

          priceFeedMock.setHistoricalPrice(toWei('1.1'));

          await financialContractClient.update();
          await priceFeedMock.update();

          const testFindings = [];
          const liquidations = financialContractClient.getUndisputedLiquidations();

          const price = toBN(toWei('1.1'));
          const scaledPrice = price
            .mul(toBN(toWei('1')).add(toBN(toWei(crThreshold.toString()))))
            .div(toBN(toWei('1')));
          testFindings.push(createAlert(financialContractClient.financialContract, price, scaledPrice, liquidations[0])); // sponsor 1
          testFindings.push(createAlert(financialContractClient.financialContract, price, scaledPrice, liquidations[1])); // sponsor 2

          assert.deepEqual(await handleBlock(), testFindings);
        });
      });
    });
  });
});
