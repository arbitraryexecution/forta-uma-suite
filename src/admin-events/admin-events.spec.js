const ethers = require('ethers');
const { getAddress } = require('@uma/contracts-node');
const { Finding, createTransactionEvent } = require('forta-agent');

const { handleTransaction, initialize } = require('./admin-events');

const CHAIN_ID = 1;
const votingAddressPromise = getAddress('Voting', CHAIN_ID);

// Tests
describe('admin event monitoring', () => {
  describe('handleTransaction', () => {
    it('returns empty findings if contract address does not match', async () => {
      // Initialize the Handler
      await initialize();

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
      // Initialize the Handler
      await initialize();

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
      // Initialize the Handler
      await initialize();

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
        type: 4,
        severity: 2,
        everestId: '0x9ed51155fa709f1bc3b26b8fec03df7010177362',
        protocol: 'uma',
        metadata: {
          contractAddress: '0x8b1631ab830d11531ae83725fda4d86012eccd77',
          contractName: 'Voting',
          eventName: 'VoteCommitted',
          strippedArgs: {
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
