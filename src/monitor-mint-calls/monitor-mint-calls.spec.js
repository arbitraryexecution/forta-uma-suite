const ethers = require('ethers');
const { getAbi, getAddress } = require('@uma/contracts-node');
const { createTransactionEvent } = require('forta-agent');

const { handleTransaction, createAlert } = require('./monitor-mint-calls');

// get the addresses for the voting contract and voting token contract for chain id 1 (eth mainnet)
const CHAIN_ID = 1;
const votingAddressPromise = getAddress('Voting', CHAIN_ID);
const votingTokenAddressPromise = getAddress('VotingToken', CHAIN_ID);

// get the abi for the voting token contract
const votingTokenAbi = getAbi('VotingToken');

// create interface
const votingTokenInterface = new ethers.utils.Interface(votingTokenAbi);

describe('UMA Token mint() call agent', () => {
  describe('UMA mint() method call monitoring', () => {
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
      const data = votingTokenInterface.encodeFunctionData('mint', values);

      // create a fake transaction hash
      const mockTransactionHash = '0xFAKETRANSACTIONHASH';

      // get the addresses from the fulfilled promises
      const votingTokenAddress = await votingTokenAddressPromise;
      const votingAddress = await votingAddressPromise;

      // load all of the relevant values into the mocked trace data object
      const mockTraces = [
        {
          action: {
            from: votingAddress.toLowerCase(),
            to: votingTokenAddress.toLowerCase(),
            input: data,
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
      const data = votingTokenInterface.encodeFunctionData('mint', values);

      // create a fake "from" address that is not allowed to call the VotingToken.mint() method
      const disallowedContract = '0x0123456789abcdef0123456789ABCDEF01234567';

      // create a fake transaction hash
      const mockTransactionHash = '0xFAKETRANSACTIONHASH';

      // get the address from the fulfilled promises
      const votingTokenAddress = await votingTokenAddressPromise;

      // load all of the relevant values into the mocked trace data
      const mockTraces = [
        {
          action: {
            from: disallowedContract.toLowerCase(),
            to: votingTokenAddress.toLowerCase(),
            input: data,
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
