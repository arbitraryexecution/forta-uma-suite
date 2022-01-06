const {
    TransactionEvent,
    FindingType,
    FindingSeverity,
    Finding,
  } = require('forta-agent');
  
  const addresses = require('./deployer-watch.json');
  const config = require('../agent-config.json');
  const { provideInitialize, provideHandleTransaction } = require('./agent');
  
  const initializeData = {};
  
  const deployerAddress = addresses.Deployer.toLowerCase();
  const whitelistedAddress = addresses.Whitelist[0].toLowerCase();
  
  function createTxEvent(transaction) {
    const txAddresses = {};
    txAddresses[transaction.to] = true;
    txAddresses[transaction.from] = true;
  
    return new TransactionEvent(null, null, transaction, null, [], txAddresses, null);
  }
  
  describe('watch deployer EOA', () => {
    describe('handleTransaction', () => {
      let handleTransaction;
      beforeEach(async () => {
        await (provideInitialize(initializeData))();
        handleTransaction = provideHandleTransaction(initializeData);
      });
  
      it('returns empty findings if Deployer not involved', async () => {
        // build txEvent
        const txEvent = createTxEvent({
          from: '0xFAKEADDRESS0',
          to: '0xFAKEADDRESS1',
        });
  
        const findings = await handleTransaction(txEvent);
        expect(findings).toStrictEqual([]);
      });
  
      // Real-world transaction hash:
      // 0xb0291e39d411f90b4f231aaab9d49aa7ba6ffc60a3547625b8fc74af45db3c7d
      it('returns low severity findings if Deployer interacts with whitelist address', async () => {
        const txEvent = createTxEvent({
          from: deployerAddress,
          to: whitelistedAddress,
        });
  
        const findings = await handleTransaction(txEvent);
        expect(findings).toStrictEqual([
          Finding.fromObject({
            name: 'UMA Deployer Watch',
            description: 'UMA Deployer EOA involved in transaction',
            alertId: 'AE-UMA-DEPLOYER-TX',
            severity: FindingSeverity.Low,
            type: FindingType.Unknown,
            everestId: config.umaEverestId,
            protocol: 'uma',
            metadata: {
              to: whitelistedAddress,
              from: deployerAddress,
            },
          }),
        ]);
      });
  
      it('returns 2 findings if Deployer interacts with non-whitelist address', async () => {
        const txEvent = createTxEvent({
          from: deployerAddress,
          to: '0xFAKEADDRESS',
        });
  
        const findings = await handleTransaction(txEvent);
        expect(findings).toStrictEqual([
          Finding.fromObject({
            name: 'UMA Deployer Watch',
            description: 'UMA Deployer EOA involved in transaction',
            alertId: 'AE-UMA-DEPLOYER-TX',
            severity: FindingSeverity.Low,
            type: FindingType.Unknown,
            everestId: config.umaEverestId,
            protocol: 'uma',
            metadata: {
              to: '0xFAKEADDRESS',
              from: deployerAddress,
            },
          }),
  
          Finding.fromObject({
            name: 'UMA Deployer Watch - Unexpected Transaction',
            description: 'UMA Deployer transaction with non-whitelist address',
            alertId: 'AE-UMA-DEPLOYER-WHITELIST',
            severity: FindingSeverity.High,
            type: FindingType.Suspicious,
            everestId: config.umaEverestId,
            protocol: 'uma',
            metadata: {
              to: '0xFAKEADDRESS',
              from: deployerAddress,
            },
          }),
        ]);
      });
    });
  });
  