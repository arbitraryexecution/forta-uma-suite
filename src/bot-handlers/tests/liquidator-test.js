/* eslint-disable no-loop-func, max-len */
// most of this code is taken from UMA's repository
// protocol/packages/liquidator/test/Liquidator.js
const { web3, getContract } = require('hardhat');

const {
  toWei, utf8ToHex, padRight,
} = web3.utils;
const winston = require('winston');
const sinon = require('sinon');
const {
  parseFixed,
  interfaceName,
  runTestForVersion,
  createConstructorParamsForContractVersion,
  getContractsNodePackageAliasForVerion,
  TESTED_CONTRACT_VERSIONS,
  TEST_DECIMAL_COMBOS,
} = require('@uma/common');

const { assert } = require('chai');

// Helper clients and custom winston transport module to monitor winston log outputs
const {
  FinancialContractClient,
  PriceFeedMock,
  SpyTransport,
} = require('@uma/financial-templates-lib');

// forta handler
const {
  provideHandleBlock,
  createAlert,
} = require('../liquidator');

let iterationTestVersion; // store the test version between tests that is currently being tested.
const startTime = '15798990420';

// Common contract objects.
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

// js Objects, clients and helpers
let identifier;
let spy;
let spyLogger;
let financialContractClient;
let handleBlock;
let convertDecimals;

// Set the funding rate and advances time by 10k seconds.
const setFundingRateAndAdvanceTime = async (fundingRate, from) => {
  const currentTime = Number(await financialContract.methods.getCurrentTime().call());

  await financialContract.methods.proposeFundingRate(
    { rawValue: fundingRate }, currentTime,
  ).send({ from });
  await financialContract.methods.setCurrentTime(currentTime + 10000).send({ from });
};

// If the current version being executed is part of the `supportedVersions` array then return `it` to run the test.
// Else, do nothing. Can be used exactly in place of a normal `it` to parameterize contract types and versions supported.
// for a given test.eg: versionedIt([{ contractType: "Perpetual", contractVersion: "latest" }])("test name", async function () { assert.isTrue(true) })
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

describe('liquidator-test.js', () => {
  let accounts;
  // Roles
  let sponsor1;
  let sponsor2;
  let sponsor3;
  let contractCreator;

  TESTED_CONTRACT_VERSIONS.forEach((contractVersion) => {
    // Store the contractVersion.contractVersion, type and version being tested
    iterationTestVersion = contractVersion;

    // eslint-disable-next-line import/no-dynamic-require, global-require
    const { getAbi, getBytecode } = require(getContractsNodePackageAliasForVerion(contractVersion.contractVersion));

    const createContract = (name) => {
      const abi = getAbi(name);
      const bytecode = getBytecode(name);
      return getContract(name, { abi, bytecode });
    };

    // Import the tested versions of contracts. Note that financialContract is either an ExpiringMultiParty or a
    // Perpetual depending on the current iteration version.
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
          [sponsor1, sponsor2, sponsor3, contractCreator] = accounts;

          identifier = `${testConfig.tokenName}TEST`;
          fundingRateIdentifier = `${testConfig.tokenName}_FUNDING`;
          convertDecimals = Convert(testConfig.collateralDecimals);
          collateralToken = await Token.new(
            `${testConfig.tokenSymbol} Token`, // Construct the token name.
            testConfig.tokenSymbol,
            testConfig.collateralDecimals,
          ).send({ from: contractCreator });
          await collateralToken.methods.addMember(1, contractCreator).send({ from: contractCreator });

          // Seed the sponsors accounts.
          await collateralToken.methods.mint(sponsor1, convertDecimals('100000')).send({ from: contractCreator });
          await collateralToken.methods.mint(sponsor2, convertDecimals('100000')).send({ from: contractCreator });
          await collateralToken.methods.mint(sponsor3, convertDecimals('100000')).send({ from: contractCreator });

          // Create identifier whitelist and register the price tracking ticker with it.
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

          // Create a new synthetic token
          syntheticToken = await SyntheticToken.new(
            'Test Synthetic Token',
            'SYNTH',
            testConfig.syntheticDecimals,
          ).send({ from: contractCreator });

          // If we are testing a perpetual then we need to also deploy a config store, an optimistic oracle and set the funding rate identifier.
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
          });

          // Deploy a new expiring multi party OR perpetual, depending on the test version.
          financialContract = await FinancialContract.new(constructorParams).send({ from: contractCreator });
          await syntheticToken.methods.addMinter(financialContract.options.address).send({ from: contractCreator });
          await syntheticToken.methods.addBurner(financialContract.options.address).send({ from: contractCreator });

          await collateralToken.methods
            .approve(financialContract.options.address, convertDecimals('10000000'))
            .send({ from: sponsor1 });
          await collateralToken.methods
            .approve(financialContract.options.address, convertDecimals('10000000'))
            .send({ from: sponsor2 });
          await collateralToken.methods
            .approve(financialContract.options.address, convertDecimals('10000000'))
            .send({ from: sponsor3 });

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

          // If we are testing a perpetual then we need to apply the initial funding rate to start the timer.
          await financialContract.methods.setCurrentTime(startTime).send({ from: contractCreator });

          spy = sinon.spy();

          spyLogger = winston.createLogger({
            level: 'info',
            transports: [new SpyTransport({ level: 'info' }, { spy })],
          });

          // Create a new instance of the FinancialContractClient
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

          // Create a new instance of the price feed mock.
          priceFeedMock = new PriceFeedMock(undefined, undefined, undefined, testConfig.priceFeedDecimals);

          // initialize handler
          handleBlock = provideHandleBlock([{
            financialContractClient,
            priceFeed: priceFeedMock,
          }]);
        });

        versionedIt([{ contractType: 'any', contractVersion: 'any' }])(
          'Can correctly detect undercollateralized positions',
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

            // All three token sponsors should still have their positions with full collateral.
            assert.equal(
              (await financialContract.methods.getCollateral(sponsor1).call()).rawValue,
              convertDecimals('125'),
            );
            assert.equal(
              (await financialContract.methods.getCollateral(sponsor2).call()).rawValue,
              convertDecimals('150'),
            );
            assert.equal(
              (await financialContract.methods.getCollateral(sponsor3).call()).rawValue,
              convertDecimals('175'),
            );

            // Start with a mocked price of 1 usd per token.
            // This puts both sponsors over collateralized so no liquidations should occur.
            priceFeedMock.setCurrentPrice(toWei('1'));

            // Run the handler, expect no liquidations available
            assert.deepEqual(await handleBlock(), []);

            // Next, assume the price feed has moved such that two of the three sponsors
            // are now undercollateralized.
            // A price of 1.3 USD per token puts sponsor1 and sponsor2 at undercollateralized while sponsor3 remains
            // collateralized. Numerically debt * price * coltReq > debt for collateralized position.
            // Sponsor1: 100 * 1.3 * 1.2 > 125 [undercollateralized]
            // Sponsor2: 100 * 1.3 * 1.2 > 150 [undercollateralized]
            // Sponsor3: 100 * 1.3 * 1.2 < 175 [sufficiently collateralized]

            priceFeedMock.setCurrentPrice(toWei('1.3'));

            // Run the handler, expect liquidation on the sponsor 1 and 2
            const expectedAlerts = [];
            financialContractClient.getAllPositions().filter(
              // both sponsor 1 and sponsor 2 should be liquidatable
              (position) => position.sponsor === sponsor1 || position.sponsor === sponsor2,
            ).forEach((position) => {
              expectedAlerts.push(createAlert(financialContractClient, position, toWei('1.3')));
            });

            assert.deepEqual(await handleBlock(), expectedAlerts);
          },
        );
        versionedIt([{ contractType: 'any', contractVersion: 'any' }])(
          'Can correctly detect invalid withdrawals',
          async () => {
            // sponsor1 creates a position with 125 units of collateral, creating 100 synthetic tokens.
            await financialContract.methods
              .create({ rawValue: convertDecimals('125') }, { rawValue: convertDecimals('100') })
              .send({ from: sponsor1 });

            // sponsor2 creates a position with 150 units of collateral, creating 100 synthetic tokens.
            await financialContract.methods
              .create({ rawValue: convertDecimals('150') }, { rawValue: convertDecimals('100') })
              .send({ from: sponsor2 });

            // Both three token sponsors should still have their positions with full collateral.
            assert.equal(
              (await financialContract.methods.getCollateral(sponsor1).call()).rawValue,
              convertDecimals('125'),
            );
            assert.equal(
              (await financialContract.methods.getCollateral(sponsor2).call()).rawValue,
              convertDecimals('150'),
            );

            // Start with a mocked price of 1 usd per token.
            // This puts both sponsors over collateralized so no liquidations should occur.
            priceFeedMock.setCurrentPrice(toWei('1'));

            // ensure no findings are reported initially
            assert.deepEqual(await handleBlock(), []);

            // If sponsor1 requests a withdrawal of any amount of collateral above 5 units at the given price of 1 usd per token
            // their remaining position becomes undercollateralized. Say they request to withdraw 10 units of collateral.
            // This places their position with a CR of: 115 / (100 * 1) * 100 = 115%. This is below the CR threshold.
            await financialContract.methods
              .requestWithdrawal({ rawValue: convertDecimals('10') })
              .send({ from: sponsor1 });
            await financialContractClient.update();

            priceFeedMock.setCurrentPrice(toWei('1'));

            // There should be exactly one liquidation in sponsor1's account. The liquidated collateral should be the original
            // amount of collateral minus the collateral withdrawn. 125 - 10 = 115
            const expectedAlerts = [];
            financialContractClient.getAllPositions().filter(
              // only sponsor1 should be liquidatable
              (position) => position.sponsor === sponsor1,
            ).forEach((position) => {
              expectedAlerts.push(createAlert(financialContractClient, position, toWei('1')));
            });

            assert.deepEqual(await handleBlock(), expectedAlerts);
          },
        );

        describe('Agent correctly identifies liquidatable funding rates from perpetual contract', () => {
          versionedIt([{ contractType: 'Perpetual', contractVersion: '2.0.1' }])(
            'Can correctly detect invalid positions',
            async () => {
              // sponsor1 creates a position with 125 units of collateral, creating 100 synthetic tokens.
              await financialContract.methods
                .create({ rawValue: convertDecimals('125') }, { rawValue: convertDecimals('100') })
                .send({ from: sponsor1 });

              // sponsor2 creates a position with 150 units of collateral, creating 100 synthetic tokens.
              await financialContract.methods
                .create({ rawValue: convertDecimals('150') }, { rawValue: convertDecimals('100') })
                .send({ from: sponsor2 });

              // Both token sponsors should still have their positions with full collateral.
              assert.equal(
                (await financialContract.methods.getCollateral(sponsor1).call()).rawValue,
                convertDecimals('125'),
              );
              assert.equal(
                (await financialContract.methods.getCollateral(sponsor2).call()).rawValue,
                convertDecimals('150'),
              );

              // Start with a mocked price of 1 usd per token.
              // This puts both sponsors over collateralized so no liquidations should occur.
              priceFeedMock.setCurrentPrice(toWei('1'));

              // ensure no findings are reported initially
              assert.deepEqual(await handleBlock(), []);

              // Next, introduce some funding rate. Setting the funding rate multiplier to 1.04, results in modifying
              // sponsor's debt. This becomes 100*1.04 = 104. All this debt, with a price of 1, both sponsors are
              // still correctly capatalized with sponsor1 @ 125 / (104 * 1) = 1.202 & sponsor2 @ 150 / (104 * 1) = 1.44.
              // So, if there is 150 collateral backing 105 token debt, with a collateral requirement of 1.2, then
              // the price must be <= 150 / 1.2 / 105 = 1.19. Any price above 1.19 will cause the dispute to fail.
              await setFundingRateAndAdvanceTime(toWei('0.000004'), contractCreator);
              priceFeedMock.setCurrentPrice(toWei('1'));
              await financialContractClient.update();

              // Note: no need to call `applyFundingRate()` on Perpetual contract because client should be able to use
              // Multicall contract to simulate calling that and anticipating what the effective funding rate charge will be.
              assert.equal(
                financialContractClient.getLatestCumulativeFundingRateMultiplier().toString(),
                toWei('1.04'),
              );
              assert.deepEqual(await handleBlock(), []);

              // If either the price increase, funding rate multiplier increase or the sponsors collateral decrease they
              // will be at risk of being liquidated. Say that the funding rate has another 0.01 added to it. The cumulative
              // funding rate will then be 1.04 * (1 + 0.000001 * 10000) = 1.0504. This will place sponsor1 underwater with
              // a CR of 125 / (100 * 1.0504 * 1) = 1.19 (which is less than 1.2) and they should get liquidated by the bot.
              await setFundingRateAndAdvanceTime(toWei('0.000001'), contractCreator);
              await financialContractClient.update();

              assert.equal(
                financialContractClient.getLatestCumulativeFundingRateMultiplier().toString(),
                toWei('1.0504'),
              );

              const expectedAlerts = [];
              financialContractClient.getAllPositions().filter(
                // only sponsor1 should be liquadatable
                (position) => position.sponsor === sponsor1,
              ).forEach((position) => {
                expectedAlerts.push(createAlert(financialContractClient, position, toWei('1')));
              });

              assert.deepEqual(await handleBlock(), expectedAlerts);

              // Next, we can increase the price per token to force sponsor2 to become undercollateralized. At a price of 1.2
              // sponsor2 will become just undercollateralized with the current cumulative funding rate multipler. Their
              // CR can be found by: 150 / (100 * 1.0504 * 1.2) = 1.19  (which is less than 1.2). Sponsor 3 is still safe.
              priceFeedMock.setCurrentPrice(toWei('1.2'));
              expectedAlerts.pop();
              financialContractClient.getAllPositions().filter(
                // Both sponsor1 and sponsor2 should be liquidatable
                (position) => position.sponsor === sponsor1 || position.sponsor === sponsor2,
              ).forEach((position) => {
                expectedAlerts.push(createAlert(financialContractClient, position, toWei('1.2')));
              });

              assert.deepEqual(await handleBlock(), expectedAlerts);
            },
          );
        });
      });
    });
  });
});
