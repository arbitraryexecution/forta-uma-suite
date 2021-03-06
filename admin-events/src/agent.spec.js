const { getAddress } = require('@uma/contracts-node');
const {
  ethers, Finding, FindingType, FindingSeverity, createTransactionEvent,
} = require('forta-agent');

const { provideHandleTransaction, provideInitialize } = require('./agent');

const CHAIN_ID = 1;
const votingAddressPromise = getAddress('Voting', CHAIN_ID);

// Tests
describe('admin event monitoring', () => {
  describe('handleTransaction', () => {
    let initializeData;
    let handleTransaction;

    beforeEach(async () => {
      initializeData = {};

      // Initialize the Handler
      await (provideInitialize(initializeData))();
      handleTransaction = provideHandleTransaction(initializeData);
    });

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

      // Build Transaction Event
      const txEvent = createTransactionEvent({
        receipt: { logs: logsNoMatchAddress },
        addresses: { [ethers.constants.AddressZero]: true },
      });

      // Run agent
      const findings = await handleTransaction(txEvent);

      // Assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns empty findings if contract address matches but not event', async () => {
      const votingContract = (await votingAddressPromise).toLowerCase();

      // Logs data for test case: address match + no topic match
      const logsNoMatchEvent = [
        {
          address: votingContract,
          topics: [
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes('EncryptedVote(address,uint256,bytes32,uint256,bytes,bytes)')),
            ethers.constants.HashZero, // voter
            ethers.constants.HashZero, // roundid
            ethers.constants.HashZero, // identifier
          ],
          // Create a large dummy array to give ethers.parseLog() something to decode
          data: `0x${'0'.repeat(1000)}`,
        },
      ];

      // Build Transaction Event
      const txEvent = createTransactionEvent({
        receipt: { logs: logsNoMatchEvent },
        addresses: { [votingContract]: true },
      });

      // Run agent
      const findings = await handleTransaction(txEvent);

      // Assertions
      expect(findings).toStrictEqual([]);
    });

    it('returns a finding if a target contract emits an event from its watchlist', async () => {
      const votingContract = (await votingAddressPromise).toLowerCase();

      // Logs data for test case: address match + topic match (should trigger a finding)
      const logsMatchEvent = [
        {
          address: votingContract,
          topics: [
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes('VoteCommitted(address,uint256,bytes32,uint256,bytes)')),
            ethers.constants.HashZero, // voter
            ethers.constants.HashZero, // roundid
            ethers.constants.HashZero, // identifier
          ],
          // Create a large dummy array to give ethers.parseLog() something to decode
          data: `0x${'0'.repeat(1000)}`,
        },
      ];

      // Build Transaction Event
      const txEvent = createTransactionEvent({
        receipt: { logs: logsMatchEvent },
        addresses: { [votingContract]: true },
      });

      // Run agent
      const findings = await handleTransaction(txEvent);
      const testFindings = [Finding.fromObject({
        name: 'UMA Admin Event',
        description: 'The VoteCommitted event was emitted by the Voting contract',
        alertId: 'AE-UMA-ADMIN-EVENT',
        type: FindingType.Info,
        severity: FindingSeverity.Low,
        protocol: 'uma',
        metadata: {
          contractAddress: '0x8b1631ab830d11531ae83725fda4d86012eccd77',
          contractName: 'Voting',
          eventName: 'VoteCommitted',
          eventArgs: {
            ancillaryData: '0x',
            identifier: '0x0000000000000000000000000000000000000000000000000000000000000000',
            roundId: '0',
            time: '0',
            voter: '0x0000000000000000000000000000000000000000',
          },
        },
      })];

      expect(findings).toStrictEqual(testFindings);
    });
  });
});
