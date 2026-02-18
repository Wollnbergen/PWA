/**
 * Sultan RPC API Client
 * 
 * Connects to the Sultan L1 blockchain REST API.
 * 
 * SECURITY FEATURES:
 * - HTTPS endpoint (MITM protection)
 * - Request timeout with AbortController (DoS protection)
 * - Retry with exponential backoff (transient error handling)
 * - Zod response validation (type safety)
 * - User-Agent tracking
 */

import { z } from 'zod';

// Production RPC endpoint (HTTPS via nginx)
const RPC_URL = 'https://rpc.sltn.io';

// Wallet version for User-Agent header
const WALLET_VERSION = 'Sultan-Wallet/1.0';

export interface AccountBalance {
  address: string;
  available: string; // Base units - matches what screens expect
  balance: string; // Alias
  nonce: number;
}

export interface StakingInfo {
  address: string;
  staked: string; // Base units
  pendingRewards: string;
  validator?: string;
  stakingAPY: number;
}

export interface Validator {
  address: string;
  name: string; // Added for screen compatibility
  moniker: string;
  totalStaked: string;
  commission: number;
  uptime: number;
  status: 'active' | 'inactive' | 'jailed';
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  amount: string;
  displayAmount: string;
  memo?: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  blockHeight?: number;
}

export interface NetworkStatus {
  chainId: string;
  blockHeight: number;
  blockTime: number;
  validatorCount: number;
  totalStaked: string;
  stakingAPY: number;
}

// ============================================================================
// Governance Types
// ============================================================================

export type ProposalType = 'ParameterChange' | 'SoftwareUpgrade' | 'CommunityPool' | 'TextProposal';
export type ProposalStatus = 'DepositPeriod' | 'VotingPeriod' | 'Passed' | 'Rejected' | 'Failed' | 'Executed';
export type VoteOption = 'Yes' | 'No' | 'Abstain' | 'NoWithVeto';

export interface Proposal {
  id: number;
  proposer: string;
  title: string;
  description: string;
  proposalType: ProposalType;
  status: ProposalStatus;
  submitHeight: number;
  submitTime: number;
  votingEndHeight: number;
  totalDeposit: string;
  finalTally?: TallyResult;
}

export interface TallyResult {
  yes: string;
  no: string;
  abstain: string;
  noWithVeto: string;
  totalVotingPower: string;
  quorumReached: boolean;
  passed: boolean;
  vetoed: boolean;
}

export interface UserVote {
  proposalId: number;
  voter: string;
  option: VoteOption;
  votingPower: string;
}

// Default timeout for API requests (30 seconds)
const API_TIMEOUT_MS = 30000;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

// ============================================================================
// Zod Response Schemas (Runtime Type Validation)
// ============================================================================

const BalanceResponseSchema = z.object({
  address: z.string(),
  balance: z.number(),
  nonce: z.number(),
});

const DelegationSchema = z.object({
  delegator_address: z.string(),
  validator_address: z.string(),
  amount: z.number(),
  rewards_accumulated: z.number(),
});

const ValidatorSchema = z.object({
  validator_address: z.string(),
  self_stake: z.number().optional().default(0),
  delegated_stake: z.number().optional().default(0),
  total_stake: z.number(),
  commission_rate: z.number(),
  jailed: z.boolean(),
  blocks_signed: z.number().optional().default(0),
  blocks_missed: z.number().optional().default(0),
  moniker: z.string().optional().default(''),
});

const TransactionResponseSchema = z.object({
  address: z.string(),
  transactions: z.array(z.object({
    hash: z.string(),
    from: z.string(),
    to: z.string(),
    amount: z.number(),
    memo: z.string().optional(),
    nonce: z.number(),
    timestamp: z.number(),
    block_height: z.number(),
    status: z.string(),
  })),
  count: z.number(),
});

const StatusResponseSchema = z.object({
  height: z.number(),
  validator_count: z.number(),
  shard_count: z.number().optional().default(1),
  validator_apy: z.number(),
  sharding_enabled: z.boolean().optional().default(false),
});

const TxHashResponseSchema = z.object({
  hash: z.string(),
});

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable (network/transient)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // Network errors (fetch failed)
    return true;
  }
  return false;
}

/**
 * Make REST API request with timeout and retry
 * SECURITY: Uses AbortController to prevent hanging requests (DoS protection)
 * RELIABILITY: Exponential backoff retry for transient errors
 */
async function restApi<T>(
  endpoint: string, 
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown>,
  timeoutMs: number = API_TIMEOUT_MS,
  schema?: z.ZodType<T>
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': WALLET_VERSION,
        },
        signal: controller.signal,
      };

      if (body && method === 'POST') {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(`${RPC_URL}${endpoint}`, options);

      // Check for retryable status codes
      if (!response.ok) {
        if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt < MAX_RETRIES - 1) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          console.warn(`API error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          clearTimeout(timeoutId);
          await sleep(delay);
          continue;
        }
        // Try to get detailed error message from response body
        let errorMessage = `API error: ${response.status}`;
        try {
          const errorJson = await response.json();
          if (errorJson && errorJson.error) {
            errorMessage = errorJson.error;
          }
        } catch {
          // If we can't parse the error body, use the status code
        }
        throw new Error(errorMessage);
      }

      const json = await response.json();
      
      // Check if response contains an error (node returns 200 with error in body)
      if (json && typeof json === 'object' && 'error' in json) {
        throw new Error(json.error as string);
      }
      
      // Validate response with Zod schema if provided
      if (schema) {
        const result = schema.safeParse(json);
        if (!result.success) {
          console.error('Response validation failed:', result.error.issues);
          throw new Error(`Invalid API response: ${result.error.issues[0]?.message || 'validation failed'}`);
        }
        return result.data;
      }
      
      return json as T;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      
      // Retry on network errors
      if (isRetryableError(error) && attempt < MAX_RETRIES - 1) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        lastError = error instanceof Error ? error : new Error(String(error));
        await sleep(delay);
        continue;
      }
      
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Get account balance
 */
export async function getBalance(address: string): Promise<AccountBalance> {
  try {
    // Use REST API: GET /balance/{address} with Zod validation
    const result = await restApi(
      `/balance/${address}`,
      'GET',
      undefined,
      API_TIMEOUT_MS,
      BalanceResponseSchema
    );
    
    return {
      address: result.address,
      available: result.balance.toString(),
      balance: result.balance.toString(),
      nonce: result.nonce,
    };
  } catch {
    // Return zero balance if account doesn't exist
    return {
      address,
      available: '0',
      balance: '0',
      nonce: 0,
    };
  }
}

/**
 * Get staking information for an address
 */
export async function getStakingInfo(address: string): Promise<StakingInfo> {
  try {
    // Use REST API: GET /staking/delegations/{address} with Zod validation
    const result = await restApi(
      `/staking/delegations/${address}`,
      'GET',
      undefined,
      API_TIMEOUT_MS,
      z.array(DelegationSchema)
    );

    // Sum up all delegations for this address
    const totalStaked = result.reduce((sum, d) => sum + (d.amount || 0), 0);
    const totalRewards = result.reduce((sum, d) => sum + (d.rewards_accumulated || 0), 0);
    const firstValidator = result.length > 0 ? result[0].validator_address : undefined;

    return {
      address,
      staked: totalStaked.toString(),
      pendingRewards: totalRewards.toString(),
      validator: firstValidator,
      stakingAPY: 13.33,
    };
  } catch {
    return { address, staked: '0', pendingRewards: '0', stakingAPY: 13.33 };
  }
}

/**
 * Get list of validators
 */
export async function getValidators(): Promise<Validator[]> {
  try {
    // Use REST API: GET /staking/validators with Zod validation
    const result = await restApi(
      '/staking/validators',
      'GET',
      undefined,
      API_TIMEOUT_MS,
      z.array(ValidatorSchema)
    );
    
    // If empty array, return empty (no fallback to mocks)
    if (!result || result.length === 0) {
      return [];
    }
    
    return result.map(v => {
      // Calculate uptime from blocks signed/missed
      const totalBlocks = v.blocks_signed + v.blocks_missed;
      const uptime = totalBlocks > 0 ? (v.blocks_signed / totalBlocks) * 100 : 99.9;
      
      return {
        address: v.validator_address,
        name: v.moniker || v.validator_address,
        moniker: v.moniker || v.validator_address,
        totalStaked: v.total_stake.toString(),
        commission: v.commission_rate,
        uptime: Math.round(uptime * 10) / 10,
        status: v.jailed ? 'jailed' as const : 'active' as const,
      };
    });
  } catch (error) {
    console.error('Failed to fetch validators:', error);
    // Return empty array on error - no fake validators
    return [];
  }
}

/**
 * Get transaction history for an address
 * Fetches from the node's /transactions/{address} endpoint
 */
export async function getTransactions(
  address: string,
  limit = 20,
  _offset = 0
): Promise<Transaction[]> {
  try {
    // Use Zod validation for response
    const result = await restApi(
      `/transactions/${address}?limit=${limit}`,
      'GET',
      undefined,
      API_TIMEOUT_MS,
      TransactionResponseSchema
    );
    
    // Convert to Transaction format
    // Import the formatSLTN function for display amounts
    const formatAmount = (atomic: string): string => {
      const sltn = Number(atomic) / 1e9;
      return sltn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 9 });
    };
    
    return result.transactions.map(tx => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      amount: tx.amount.toString(),
      displayAmount: formatAmount(tx.amount.toString()),
      memo: tx.memo || '',
      timestamp: tx.timestamp < 4102444800 ? tx.timestamp * 1000 : tx.timestamp,
      blockHeight: tx.block_height,
      status: tx.status as 'pending' | 'confirmed' | 'failed',
    }));
  } catch (error) {
    console.warn('Failed to fetch transactions:', error);
    return [];
  }
}

/**
 * Get network status
 */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  try {
    // Use REST API: GET /status with Zod validation
    const result = await restApi(
      '/status',
      'GET',
      undefined,
      API_TIMEOUT_MS,
      StatusResponseSchema
    );
    
    return {
      chainId: 'sultan-mainnet-1',
      blockHeight: result.height,
      blockTime: 2,
      validatorCount: result.validator_count,
      totalStaked: '0', // Not provided by /status
      stakingAPY: result.validator_apy * 100, // Convert to percentage
    };
  } catch {
    // Fallback values - should match actual network state
    console.warn('Failed to fetch network status, using fallback values');
    return {
      chainId: 'sultan-mainnet-1',
      blockHeight: 0,
      blockTime: 2,
      validatorCount: 5, // Match actual network
      totalStaked: '0',
      stakingAPY: 13.33,
    };
  }
}

/**
 * Get current nonce for an address
 */
export async function getNonce(address: string): Promise<number> {
  try {
    const balance = await getBalance(address);
    return balance.nonce;
  } catch {
    return 0;
  }
}

/**
 * Type for broadcast transaction request
 */
export interface BroadcastTxRequest {
  transaction: {
    from: string;
    to: string;
    amount: string;
    memo?: string;
    nonce: number;
    timestamp: number;
  };
  signature: string;
  publicKey: string;
}

/**
 * Broadcast a signed transaction
 */
export async function broadcastTransaction(
  signedTx: BroadcastTxRequest
): Promise<{ hash: string }> {
  // Use REST API: POST /tx with Zod validation
  const result = await restApi(
    '/tx',
    'POST',
    {
      tx: signedTx.transaction,
      signature: signedTx.signature,
      public_key: signedTx.publicKey,
    },
    API_TIMEOUT_MS,
    TxHashResponseSchema
  );

  return result;
}

/**
 * Stake tokens to a validator
 */
export async function stakeTokens(
  signedTx: {
    transaction: {
      from: string;
      to: string; // Validator address
      amount: string;
      memo?: string;
      nonce: number;
      timestamp: number;
    };
    signature: string;
    publicKey: string;
  }
): Promise<{ hash: string }> {
  // Use REST API: POST /staking/delegate with Zod validation
  const result = await restApi(
    '/staking/delegate',
    'POST',
    {
      tx: signedTx.transaction,
      signature: signedTx.signature,
      public_key: signedTx.publicKey,
    },
    API_TIMEOUT_MS,
    TxHashResponseSchema
  );

  return result;
}

/**
 * Unstake tokens
 */
export async function unstakeTokens(
  signedTx: {
    transaction: {
      from: string;
      to: string;
      amount: string;
      memo?: string;
      nonce: number;
      timestamp: number;
    };
    signature: string;
    publicKey: string;
  }
): Promise<{ hash: string }> {
  // Use REST API: POST /staking/undelegate with Zod validation
  const result = await restApi(
    '/staking/undelegate',
    'POST',
    {
      tx: signedTx.transaction,
      signature: signedTx.signature,
      public_key: signedTx.publicKey,
    },
    API_TIMEOUT_MS,
    TxHashResponseSchema
  );

  return result;
}

/**
 * Claim staking rewards
 */
export async function claimRewards(
  signedTx: {
    transaction: {
      from: string;
      to: string;
      amount: string;
      memo?: string;
      nonce: number;
      timestamp: number;
    };
    signature: string;
    publicKey: string;
  }
): Promise<{ hash: string }> {
  // Use REST API: POST /staking/withdraw_rewards with Zod validation
  const result = await restApi(
    '/staking/withdraw_rewards',
    'POST',
    {
      tx: signedTx.transaction,
      signature: signedTx.signature,
      public_key: signedTx.publicKey,
    },
    API_TIMEOUT_MS,
    TxHashResponseSchema
  );

  return result;
}

// ============================================================================
// Simplified API for Screens
// ============================================================================

interface StakeRequest {
  delegatorAddress: string;
  validatorAddress: string;
  amount: string;
  signature: string;
  publicKey: string;
}

interface UnstakeRequest {
  delegatorAddress: string;
  amount: string;
  signature: string;
  publicKey: string;
}

export interface CreateValidatorRequest {
  validatorAddress: string;
  moniker: string;
  initialStake: string;
  commissionRate: number;
  signature: string;
  publicKey: string;
}

// ============================================================================
// Governance Type Mappers (snake_case from blockchain -> camelCase for UI)
// ============================================================================

export function mapProposalType(type: string): ProposalType {
  const map: Record<string, ProposalType> = {
    'ParameterChange': 'ParameterChange',
    'parameter_change': 'ParameterChange',
    'SoftwareUpgrade': 'SoftwareUpgrade',
    'software_upgrade': 'SoftwareUpgrade',
    'CommunityPool': 'CommunityPool',
    'community_pool': 'CommunityPool',
    'TextProposal': 'TextProposal',
    'text': 'TextProposal',
  };
  return map[type] || 'TextProposal';
}

export function mapProposalStatus(status: string): ProposalStatus {
  const map: Record<string, ProposalStatus> = {
    'DepositPeriod': 'DepositPeriod',
    'deposit_period': 'DepositPeriod',
    'VotingPeriod': 'VotingPeriod',
    'voting_period': 'VotingPeriod',
    'Passed': 'Passed',
    'passed': 'Passed',
    'Rejected': 'Rejected',
    'rejected': 'Rejected',
    'Failed': 'Failed',
    'failed': 'Failed',
    'Executed': 'Executed',
    'executed': 'Executed',
  };
  return map[status] || 'VotingPeriod';
}

export function mapVoteOption(option: string): VoteOption {
  const map: Record<string, VoteOption> = {
    'Yes': 'Yes',
    'yes': 'Yes',
    'No': 'No',
    'no': 'No',
    'Abstain': 'Abstain',
    'abstain': 'Abstain',
    'NoWithVeto': 'NoWithVeto',
    'no_with_veto': 'NoWithVeto',
  };
  return map[option] || 'Abstain';
}


// ============================================================================
// NFT Types
// ============================================================================

export interface NFT {
  collection: string;
  tokenId: string;
  name: string;
  image: string;
  owner: string;
  description?: string;
}

const NFTResponseSchema = z.object({
  nfts: z.array(z.object({
    collection: z.string(),
    token_id: z.string(),
    name: z.string(),
    image_uri: z.string(),
    owner: z.string(),
    description: z.string().optional(),
  })),
});

const ProposalResponseSchema = z.object({
  proposals: z.array(z.object({
    id: z.number(),
    proposer: z.string(),
    title: z.string(),
    description: z.string(),
    proposal_type: z.string(),
    status: z.string(),
    submit_height: z.number(),
    submit_time: z.number(),
    voting_end_height: z.number(),
    total_deposit: z.string(),
    final_tally: z.object({
      yes: z.string(),
      no: z.string(),
      abstain: z.string(),
      no_with_veto: z.string(),
      total_voting_power: z.string(),
      quorum_reached: z.boolean(),
      passed: z.boolean(),
      vetoed: z.boolean(),
    }).optional(),
  })),
});

/**
 * Get NFTs owned by an address
 */
export async function queryNFTs(address: string): Promise<NFT[]> {
  try {
    const result = await restApi(
      `/nfts/${address}`,
      'GET',
      undefined,
      API_TIMEOUT_MS,
      NFTResponseSchema
    );

    return result.nfts.map(nft => ({
      collection: nft.collection,
      tokenId: nft.token_id,
      name: nft.name,
      image: nft.image_uri, // Map snake_case to camelCase
      owner: nft.owner,
      description: nft.description,
    }));
  } catch (error) {
    console.warn('Failed to fetch NFTs:', error);
    return [];
  }
}

/**
 * Get governance proposals
 */
export async function getProposals(): Promise<Proposal[]> {
  try {
    const result = await restApi(
      '/governance/proposals',
      'GET',
      undefined,
      API_TIMEOUT_MS,
      ProposalResponseSchema
    );

    return result.proposals.map(p => ({
      id: p.id,
      proposer: p.proposer,
      title: p.title,
      description: p.description,
      proposalType: mapProposalType(p.proposal_type),
      status: mapProposalStatus(p.status),
      submitHeight: p.submit_height,
      submitTime: p.submit_time * 1000, // Convert to ms
      votingEndHeight: p.voting_end_height,
      totalDeposit: p.total_deposit,
      finalTally: p.final_tally ? {
        yes: p.final_tally.yes,
        no: p.final_tally.no,
        abstain: p.final_tally.abstain,
        noWithVeto: p.final_tally.no_with_veto,
        totalVotingPower: p.final_tally.total_voting_power,
        quorumReached: p.final_tally.quorum_reached,
        passed: p.final_tally.passed,
        vetoed: p.final_tally.vetoed,
      } : undefined,
    }));
  } catch (error) {
    console.warn('Failed to fetch proposals:', error);
    return [];
  }
}

/**
 * Submit a governance proposal
 */
export async function submitProposal(params: {
  title: string;
  description: string;
  type: ProposalType;
  deposit: string;
  signature: string;
  publicKey: string;
  address: string;
}): Promise<{ hash: string }> {
  // Map UI type to snake_case for API
  const typeMap: Record<string, string> = {
    'ParameterChange': 'parameter_change',
    'SoftwareUpgrade': 'software_upgrade',
    'CommunityPool': 'community_pool',
    'TextProposal': 'text',
  };
  
  const proposalType = typeMap[params.type] || 'text';
  const nonce = await getNonce(params.address);

  return restApi<{ hash: string }>(
    '/governance/proposals',
    'POST',
    {
      type: 'submit_proposal',
      proposal_type: proposalType,
      title: params.title,
      description: params.description,
      initial_deposit: params.deposit,
      proposer: params.address,
      nonce,
      timestamp: Date.now(),
      signature: params.signature,
      public_key: params.publicKey,
    },
    API_TIMEOUT_MS,
    TxHashResponseSchema
  );
}

/**
 * Vote on a proposal
 */
export async function vote(params: {
  proposalId: number;
  option: VoteOption;
  signature: string;
  publicKey: string;
  address: string;
}): Promise<{ hash: string }> {
  // Map UI option to snake_case for API
  const optionMap: Record<string, string> = {
    'Yes': 'yes',
    'No': 'no',
    'Abstain': 'abstain',
    'NoWithVeto': 'no_with_veto',
  };
  
  const voteOption = optionMap[params.option] || 'abstain';
  const nonce = await getNonce(params.address);

  return restApi<{ hash: string }>(
    '/governance/vote',
    'POST',
    {
      type: 'vote',
      proposal_id: params.proposalId,
      option: voteOption,
      voter: params.address,
      nonce,
      timestamp: Date.now(),
      signature: params.signature,
      public_key: params.publicKey,
    },
    API_TIMEOUT_MS,
    TxHashResponseSchema
  );
}

/**
 * Create a new validator
 * In v0.2.7: Registering current user as a validator
 */
export async function createValidator(params: {
  validatorAddress: string;
  moniker: string;
  initialStake: string;
  commissionRate: number;
  signature: string;
  publicKey: string;
}): Promise<{ hash: string }> {
  const txData = {
    type: 'create_validator',
    validator_address: params.validatorAddress,
    moniker: params.moniker,
    initial_stake: params.initialStake,
    commission_rate: params.commissionRate,
    signature: params.signature,
    public_key: params.publicKey,
    nonce: await getNonce(params.validatorAddress),
    timestamp: Date.now(),
  };

  return restApi<{ hash: string }>(
    '/staking/create_validator',
    'POST',
    txData,
    API_TIMEOUT_MS,
    TxHashResponseSchema
  );
}

/**
 * Exit as a validator and unbond stake
 */
export async function exitValidator(params: {
  validatorAddress: string;
  signature: string;
  publicKey: string;
}): Promise<{ hash: string }> {
  const txData = {
    type: 'exit_validator',
    validator_address: params.validatorAddress,
    signature: params.signature,
    public_key: params.publicKey,
    nonce: await getNonce(params.validatorAddress),
    timestamp: Date.now(),
  };

  return restApi<{ hash: string }>(
    '/staking/exit_validator',
    'POST',
    txData,
    API_TIMEOUT_MS,
    TxHashResponseSchema
  );
}

/**
 * Unified API object for screens
 */
export const sultanAPI = {
  getBalance,
  getStakingInfo,
  getValidators,
  getTransactions,
  getNetworkStatus,
  stakeTokens,
  unstakeTokens,
  claimRewards,
  queryNFTs,
  getProposals,
  submitProposal,
  vote,
  getNonce,
  broadcastTransaction,
  stake: async (req: StakeRequest): Promise<{ hash: string }> => {
    // Fetch current nonce for proper transaction ordering
    const balance = await getBalance(req.delegatorAddress);
    return stakeTokens({
      transaction: {
        from: req.delegatorAddress,
        to: req.validatorAddress,
        amount: req.amount,
        nonce: balance.nonce,
        timestamp: Date.now(),
      },
      signature: req.signature,
      publicKey: req.publicKey || '',
    });
  },

  unstake: async (req: UnstakeRequest): Promise<{ hash: string }> => {
    // Fetch current nonce for proper transaction ordering
    const balance = await getBalance(req.delegatorAddress);
    return unstakeTokens({
      transaction: {
        from: req.delegatorAddress,
        to: '', // Self-unbond
        amount: req.amount,
        nonce: balance.nonce,
        timestamp: Date.now(),
      },
      signature: req.signature,
      publicKey: req.publicKey || '',
    });
  },
  createValidator,
  exitValidator,
};
