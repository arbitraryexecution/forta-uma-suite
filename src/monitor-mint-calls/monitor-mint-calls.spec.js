const ethers = require('ethers');
const { createBlockEvent } = require('forta-agent');

// override the timeout from the agent configuration JSON file before the handler is imported
jest.mock('../../agent-config.json', () => ({
  monitorMintCalls: { rpcTimeoutMilliseconds: 1000 },
}));

const { provideHandleBlock, createAlert } = require('./monitor-mint-calls');

// load required contract addresses
const {
  VotingToken: votingTokenAddress,
  Voting: votingAddress,
} = require('../../contract-addresses.json');

// get the abi for the VotingToken contract
const { abi: votingTokenAbi } = require('../../abi/VotingToken.json');

// create interface
const votingTokenInterface = new ethers.utils.Interface(votingTokenAbi);

// mock a JSON-RPC provider object with a .send() method for retrieving trace data
// this allows us to specify the trace data that we want the mocked method to return
function getMockJsonRpcProvider(traceData) {
  const mockJsonRpcProvider = {
    send: jest.fn(async (methodName, params) => {
      if (methodName === 'trace_block') {
        if (params.length === 1) {
          const blockNumberHexString = params[0];
          const blockNumber = Number.parseInt(blockNumberHexString, 16);
          if (blockNumber === traceData[0].blockNumber) {
            return traceData;
          }
        }
      }
      return null;
    }),
  };
  return mockJsonRpcProvider;
}

describe('UMA Token mint() call agent', () => {
  let handleBlock;

  describe('UMA mint() method call monitoring', () => {
    it('returns empty if trace data is not available after timeout', async () => {
      // minimally populate a blockEvent object
      const blockEvent = createBlockEvent({ blockNumber: 1 });

      // intentionally set the block number in the trace data to NOT match the current blockNumber
      // this will cause the handler to timeout on waiting for a non-null response from the
      // JSON-RPC provider
      const mockBlockNumber = 0;

      // minimally populate the trace data
      // the handler will timeout before it ever attempts to use any other attributes within the
      // trace data object
      const mockTraceData = [{ blockNumber: mockBlockNumber }];

      // create our mock JSON-RPC provider object with .send() method
      const mockJsonRpcProvider = getMockJsonRpcProvider(mockTraceData);

      // create the handler
      handleBlock = provideHandleBlock(mockJsonRpcProvider);

      // wait for the handler promise to settle
      // the promise will be fulfilled with an empty Array returned
      const findings = await handleBlock(blockEvent);

      expect(findings).toStrictEqual([]);
    });

    it('returns empty if Voting contract is calling VotingToken.mint()', async () => {
      // minimally populate a blockEvent object
      const mockBlockNumber = 1;
      const blockEvent = createBlockEvent({ blockNumber: mockBlockNumber });

      // use the ethers Interface created from the VotingToken ABI to create the function call data
      const value = 0;
      const values = [
        '0x0123456789ABCDEF0123456789ABCDEF01234567',
        value,
      ];
      const data = votingTokenInterface.encodeFunctionData('mint', values);

      // create a fake transaction hash
      const mockTransactionHash = '0xFAKETRANSACTIONHASH';

      // load all of the relevant values into the mocked trace data object
      const mockTraceData = [
        {
          action: {
            from: votingAddress.toLowerCase(),
            to: votingTokenAddress.toLowerCase(),
            input: data,
            value,
          },
          blockNumber: mockBlockNumber,
          transactionHash: mockTransactionHash,
        },
      ];

      // create the mock JSON-RPC provider object with .send() method
      const mockJsonRpcProvider = getMockJsonRpcProvider(mockTraceData);

      // create the handler
      handleBlock = provideHandleBlock(mockJsonRpcProvider);

      // wait for the handler promise to settle
      // the promise will be fulfilled with an empty Array returned
      const findings = await handleBlock(blockEvent);

      expect(findings).toStrictEqual([]);
    });

    it('returns finding if contract other than Voting is calling VotingToken.mint()', async () => {
      // minimally populate a blockEvent object
      const mockBlockNumber = 1;
      const blockEvent = createBlockEvent({ blockNumber: mockBlockNumber });

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

      // load all of the relevant values into the mocked trace data
      const mockTraceData = [
        {
          action: {
            from: disallowedContract.toLowerCase(),
            to: votingTokenAddress.toLowerCase(),
            input: data,
            value,
          },
          blockNumber: mockBlockNumber,
          transactionHash: mockTransactionHash,
        },
      ];

      // create the mock JSON-RPC provider object with .send() method
      const mockJsonRpcProvider = getMockJsonRpcProvider(mockTraceData);

      // create the handler
      handleBlock = provideHandleBlock(mockJsonRpcProvider);

      // wait for the handler promise to settle
      // the promise will be fulfilled with an Array with a single finding
      const findings = await handleBlock(blockEvent);

      // create the expected finding from our test parameters
      const expectedFinding = createAlert(disallowedContract.toLowerCase(), mockTransactionHash);

      expect(findings).toStrictEqual([expectedFinding]);
    });
  });
});
