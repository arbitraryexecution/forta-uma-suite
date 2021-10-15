const { createTransactionEvent } = require('forta-agent');

const { provideInitialize, provideHandleTransaction, createAlert } = require('./monitor-mint-calls');

const data = {};

describe('UMA Token mint() call agent', () => {
  describe('UMA mint() method call monitoring', () => {
    let handleTransaction;
    let iface;
    let votingAddress;
    let votingTokenAddress;

    beforeEach(async () => {
      await (provideInitialize(data))();
      handleTransaction = provideHandleTransaction(data);
      ({ iface, votingAddress, votingTokenAddress } = data);
    });

    it('returns empty if trace data is not available', async () => {
      // create empty traces within transaction event
      const txEvent = { traces: [] };

      // wait for the handler promise to settle
      // the promise will be fulfilled with an empty Array returned
      const findings = await handleTransaction(txEvent);

      expect(findings).toStrictEqual([]);
    });

    it('returns empty if Voting contract is calling VotingToken.mint()', async () => {
      // use the ethers Interface created from the VotingToken ABI to create the function call data
      const value = 0;
      const values = [
        '0x0123456789ABCDEF0123456789ABCDEF01234567',
        value,
      ];
      const encoded = iface.encodeFunctionData('mint', values);

      // create a fake transaction hash
      const mockTransactionHash = '0xFAKETRANSACTIONHASH';

      // load all of the relevant values into the mocked trace data object
      const mockTraces = [
        {
          action: {
            from: votingAddress.toLowerCase(),
            to: votingTokenAddress.toLowerCase(),
            input: encoded,
            value,
          },
          transactionHash: mockTransactionHash,
        },
      ];
      const txEvent = createTransactionEvent({ traces: mockTraces });

      // wait for the handler promise to settle
      // the promise will be fulfilled with an empty Array returned
      const findings = await handleTransaction(txEvent);

      expect(findings).toStrictEqual([]);
    });

    it('returns finding if contract other than Voting is calling VotingToken.mint()', async () => {
      // use the ethers Interface created from the VotingToken ABI to create the function call data
      const value = 0;
      const values = [
        '0x0123456789ABCDEF0123456789ABCDEF01234567',
        value,
      ];
      const encoded = iface.encodeFunctionData('mint', values);

      // create a fake "from" address that is not allowed to call the VotingToken.mint() method
      const disallowedContract = '0x0123456789abcdef0123456789ABCDEF01234567';

      // create a fake transaction hash
      const mockTransactionHash = '0xFAKETRANSACTIONHASH';

      // load all of the relevant values into the mocked trace data
      const mockTraces = [
        {
          action: {
            from: disallowedContract.toLowerCase(),
            to: votingTokenAddress.toLowerCase(),
            input: encoded,
            value,
          },
          transactionHash: mockTransactionHash,
        },
      ];
      const txEvent = createTransactionEvent({ traces: mockTraces });

      // wait for the handler promise to settle
      // the promise will be fulfilled with an Array with a single finding
      const findings = await handleTransaction(txEvent);

      // create the expected finding from our test parameters
      const expectedFinding = createAlert(
        disallowedContract.toLowerCase(),
        votingTokenAddress,
        mockTransactionHash,
      );

      expect(findings).toStrictEqual([expectedFinding]);
    });
  });
});
