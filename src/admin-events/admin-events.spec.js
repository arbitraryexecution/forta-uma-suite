const ethers = require('ethers');
const { getAddress } = require('@uma/contracts-node');

// Load Config files
const {
  TransactionEvent,
  FindingType,
  FindingSeverity,
  Finding,
} = require('forta-agent');

const config = require('../../agent-config.json');

const chainId = 1;
const votingAddressPromise = getAddress('Voting', chainId);

const { handleTransaction } = require('./admin-events');

/**
 * TransactionEvent(type, network, transaction, receipt, traces, addresses, block)
 */

// Can this be imported from Forta Library?
function createTxEvent({ logs, addresses }) {
  return new TransactionEvent(null, null, null, { logs }, [], addresses, null);
}

// tests
describe('admin event monitoring', () => {
  describe('handleTransaction', () => {
    it('returns empty findings if contract address does not match', async () => {
      // logs data for test case:  no address match + no topic match
      const logsNoMatchAddress = [
        {
          address: ethers.constants.AddressZero,
          topics: [
            ethers.constants.HashZero,
          ],
        },
      ];

      // build txEvent
      const txEvent = createTxEvent({
        logs: logsNoMatchAddress,
        addresses: { [ethers.constants.AddressZero]: true },
      });

      // run agent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if contract address matches but not event', async () => {
      const votingContract = (await votingAddressPromise).toLowerCase();

      // logs data for test case: address match + no topic match
      const logsNoMatchEvent = [
        {
          address: votingContract,
          topics: [
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes('EncryptedVote(address,uint256,bytes32,uint256,bytes,bytes)')),
            ethers.constants.HashZero,
            ethers.constants.HashZero,
            ethers.constants.HashZero,
          ],
          data: `0x${'0'.repeat(1000)}`,
        },
      ];

      // build tx event
      const txEvent = createTxEvent({
        logs: logsNoMatchEvent,
        addresses: { [votingContract]: true },
      });

      // run agent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns a finding if a target contract emits an event from its watchlist', async () => {
      const votingContract = (await votingAddressPromise).toLowerCase();
      const eventName = 'VoteCommitted';
      const contractName = 'Voting';
      const contractAddress = votingContract;

      // logs data for test case: address match + topic match (should trigger a finding)
      const logsMatchEvent = [
        {
          address: votingContract,
          topics: [
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes('VoteCommitted(address,uint256,bytes32,uint256,bytes)')),
            ethers.constants.HashZero,
            ethers.constants.HashZero,
            ethers.constants.HashZero,
          ],
          data: `0x${'0'.repeat(1000)}`,
        },
      ];

      // build txEvent
      const txEvent = createTxEvent({
        logs: logsMatchEvent,
        addresses: { [votingContract]: true },
      });

      // run agent
      const findings = await handleTransaction(txEvent);

      // assertions
      expect(findings).toStrictEqual([
        Finding.fromObject({
          name: 'UMA Admin Event',
          description: `The ${eventName} event was emitted by the ${contractName} contract`,
          alertId: 'AE-UMA-ADMIN-EVENT',
          type: FindingType.Unknown,
          severity: FindingSeverity.Low,
          metadata: {
            contractName,
            contractAddress,
            eventName,
          },
          everestId: config.umaEverestId,
        }),
      ]);
    });
  });
});
