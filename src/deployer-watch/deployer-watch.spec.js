const {
  TransactionEvent,
  FindingType,
  FindingSeverity,
  Finding,
} = require('forta-agent');

const config = require('../../agent-config.json');
const { handleTransaction } = require('./deployer-watch');

// see deployer-watch.json for full whitelist
const deployerAddress = '0x2bAaA41d155ad8a4126184950B31F50A1513cE25'.toLowerCase();
const whitelistedAddress = '0x592349F7DeDB2b75f9d4F194d4b7C16D82E507Dc'.toLowerCase();

function createTxEvent(transaction) {
  const addresses = {};
  addresses[transaction.to] = true;
  addresses[transaction.from] = true;

  return new TransactionEvent(null, null, transaction, null, [], addresses, null);
}

describe('watch deployer EOA', () => {
  describe('handleTransaction', () => {
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
          name: 'UMA Deployer watch',
          description: 'UMA Deployer EOA involved in transaction',
          alertId: 'AE-UMA-DEPLOYER-TX',
          severity: FindingSeverity.Low,
          type: FindingType.Unknown,
          everestId: config.umaEverestId,
          metadata: {
            to: whitelistedAddress,
            from: deployerAddress,
          },
        }),
      ]);
    });

    it('Two findings if Deployer interacts with non-whitelist address', async () => {
      const txEvent = createTxEvent({
        from: deployerAddress,
        to: '0xFAKEADDRESS',
      });

      const findings = await handleTransaction(txEvent);
      expect(findings).toStrictEqual([
        Finding.fromObject({
          name: 'UMA Deployer watch',
          description: 'UMA Deployer EOA involved in transaction',
          alertId: 'AE-UMA-DEPLOYER-TX',
          severity: FindingSeverity.Low,
          type: FindingType.Unknown,
          everestId: config.umaEverestId,
          metadata: {
            to: '0xFAKEADDRESS',
            from: deployerAddress,
          },
        }),

        Finding.fromObject({
          name: 'UMA Deployer watch',
          description: 'UMA Deployer interacting with non-whitelist address',
          alertId: 'AE-UMA-DEPLOYER-WHITELIST',
          severity: FindingSeverity.High,
          type: FindingType.Suspicious,
          everestId: config.umaEverestId,
          metadata: {
            to: '0xFAKEADDRESS',
            from: deployerAddress,
          },
        }),
      ]);
    });
  });
});
