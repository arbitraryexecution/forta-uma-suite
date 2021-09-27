const ethers = require('ethers');

// Load Config files
const config = require('../../agent-config.json');
const contractAddresses = require('../../contract-addresses.json');
const votingContract = contractAddresses["Voting"].toLowerCase();
const governorContract = contractAddresses["Governor"].toLowerCase();

// ethers.utils.keccak256("VoteCommitted(datatype)")

const {
  TransactionEvent,
  FindingType,
  FindingSeverity,
  Finding,
} = require('forta-agent');

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
  // logs data for test case: address match + topic match (should trigger a finding)
  const logsMatchEvent = [
    {
      address: votingContract,
      logIndex: 0,
      blockNumber: 0,
      blockHash: ethers.constants.HashZero,
      transactionIndex: 0,
      transactionHash: ethers.constants.HashZero,
      removed: false,
      topics: [
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes("VoteCommitted(address,uint256,bytes32,uint256,bytes")),
        ethers.constants.HashZero,
        "0x00000000000000000000000000000000000000000000000000000000000024d2",
        "0x41646d696e203133300000000000000000000000000000000000000000000000",
      ],
      data: "0x00000000000000000000000000000000000000000000000000000000611570f900000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d14e20493887d3a11e8d8af227cea1382502a8ee7174d2db1980767f5ead53e0cd05525651ac7ca38dd22266f48a17d19d479538e8c3b676ff000f9739fda2f36e95e0c9e6e6b17cc1a0d78e6474b35832c670ec3f1cd3b23e2c7b6ab04ffbb318611822a51e8d87443030034a73c756ece9ba01db19e405cf2c8f8d6f4034e8f598ac2060f26f6c07b39a0d2a74a8e0bb998c4424fbec15fb27fdcaf98a2848c8546052a0bc70d887d6b2a3fb891f646e233c5e750720e73edcc0939237f86dcf602859d00e08fb9e1136b4c614ab8e766d000000000000000000000000000000",
    },
  ];

  // logs data for test case: address match + no topic match
  const logsNoMatchEvent = [
    {
      address: votingContract,
      logIndex: 0,
      blockNumber: 0,
      blockHash: ethers.constants.HashZero,
      transactionIndex: 0,
      transactionHash: ethers.constants.HashZero,
      removed: false,
      topics: [
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes("EncryptedVote(address,uint256,bytes32,uint256,bytes,bytes)")),
        ethers.constants.HashZero,
        "0x00000000000000000000000000000000000000000000000000000000000024d2",
        "0x41646d696e203133300000000000000000000000000000000000000000000000",
      ],
      data: "0x00000000000000000000000000000000000000000000000000000000611570f900000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d14e20493887d3a11e8d8af227cea1382502a8ee7174d2db1980767f5ead53e0cd05525651ac7ca38dd22266f48a17d19d479538e8c3b676ff000f9739fda2f36e95e0c9e6e6b17cc1a0d78e6474b35832c670ec3f1cd3b23e2c7b6ab04ffbb318611822a51e8d87443030034a73c756ece9ba01db19e405cf2c8f8d6f4034e8f598ac2060f26f6c07b39a0d2a74a8e0bb998c4424fbec15fb27fdcaf98a2848c8546052a0bc70d887d6b2a3fb891f646e233c5e750720e73edcc0939237f86dcf602859d00e08fb9e1136b4c614ab8e766d000000000000000000000000000000",
    },
  ];

  // logs data for test case:  no address match + no topic match
  const logsNoMatchAddress = [
    {
      address: ethers.constants.AddressZero,
      topics: [
        ethers.constants.HashZero,
      ],
    },
  ];

  describe('handleTransaction', () => {
    it('returns empty findings if contract address does not match', async () => {
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
      const eventName = 'VoteCommitted';
      const contractName = 'Voting';
      //const contractAddress = lendingPoolAddressProvider;

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
          type: FindingType.Suspicious,
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