/**
 * Sultan RPC API Client
 * 
 * Connects to the Sultan L1 blockchain REST API.
 */

// Production RPC endpoint (HTTPS via nginx)
const RPC_URL = 'https://rpc.sltn.io';

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

/**
 * Make REST API request
 */
async function restApi<T>(
  endpoint: string, 
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown>
): Promise<T> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${RPC_URL}${endpoint}`, options);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get account balance
 */
export async function getBalance(address: string): Promise<AccountBalance> {
  try {
    // Use REST API: GET /balance/{address}
    const result = await restApi<{ address: string; balance: number; nonce: number }>(`/balance/${address}`);
    
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
    // Use REST API: GET /staking/delegations/{address}
    const result = await restApi<{
      staked: number;
      rewards: number;
      validator?: string;
    }>(`/staking/delegations/${address}`);

    return {
      address,
      staked: (result.staked || 0).toString(),
      pendingRewards: (result.rewards || 0).toString(),
      validator: result.validator,
      stakingAPY: 13.33, // Fixed APY
    };
  } catch {
    return {
      address,
      staked: '0',
      pendingRewards: '0',
      stakingAPY: 13.33, // Default APY
    };
  }
}

/**
 * Get list of validators
 */
export async function getValidators(): Promise<Validator[]> {
  try {
    // Use REST API: GET /staking/validators
    // Node returns: validator_address, total_stake, commission_rate, jailed
    const result = await restApi<Array<{ 
      validator_address: string; 
      self_stake: number;
      delegated_stake: number;
      total_stake: number; 
      commission_rate: number; 
      jailed: boolean;
      blocks_signed: number;
      blocks_missed: number;
    }>>('/staking/validators');
    
    // If empty array, return empty (no fallback to mocks)
    if (!result || result.length === 0) {
      return [];
    }
    
    // Map real validator data to Validator interface
    // Use friendly names based on validator address
    const validatorNames: Record<string, string> = {
      'sultanval1london': 'London Validator',
      'sultanval2singapore': 'Singapore Validator', 
      'sultanval3amsterdam': 'Amsterdam Validator',
      'sultanval6newyork': 'New York Validator',
    };
    
    return result.map(v => {
      const name = validatorNames[v.validator_address] || v.validator_address;
      // Calculate uptime from blocks signed/missed
      const totalBlocks = v.blocks_signed + v.blocks_missed;
      const uptime = totalBlocks > 0 ? (v.blocks_signed / totalBlocks) * 100 : 99.9;
      
      return {
        address: v.validator_address,
        name: name,
        moniker: name,
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
    const result = await restApi<{
      address: string;
      transactions: Array<{
        hash: string;
        from: string;
        to: string;
        amount: number;
        memo?: string;
        nonce: number;
        timestamp: number;
        block_height: number;
        status: string;
      }>;
      count: number;
    }>(`/transactions/${address}?limit=${limit}`);
    
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
      timestamp: tx.timestamp,
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
    // Use REST API: GET /status
    const result = await restApi<{
      height: number;
      validator_count: number;
      shard_count: number;
      validator_apy: number;
      sharding_enabled: boolean;
    }>('/status');
    
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
 * Broadcast a signed transaction
 */
export async function broadcastTransaction(
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
  // Use REST API: POST /tx
  const result = await restApi<{ hash: string }>('/tx', 'POST', {
    tx: signedTx.transaction,
    signature: signedTx.signature,
    public_key: signedTx.publicKey,
  });

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
  // Use REST API: POST /staking/delegate
  const result = await restApi<{ hash: string }>('/staking/delegate', 'POST', {
    tx: signedTx.transaction,
    signature: signedTx.signature,
    public_key: signedTx.publicKey,
  });

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
      nonce: number;
      timestamp: number;
    };
    signature: string;
    publicKey: string;
  }
): Promise<{ hash: string }> {
  // Use REST API: POST /staking/undelegate (if available)
  const result = await restApi<{ hash: string }>('/staking/undelegate', 'POST', {
    tx: signedTx.transaction,
    signature: signedTx.signature,
    public_key: signedTx.publicKey,
  });

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
      nonce: number;
      timestamp: number;
    };
    signature: string;
    publicKey: string;
  }
): Promise<{ hash: string }> {
  // Use REST API: POST /staking/withdraw_rewards
  const result = await restApi<{ hash: string }>('/staking/withdraw_rewards', 'POST', {
    tx: signedTx.transaction,
    signature: signedTx.signature,
    public_key: signedTx.publicKey,
  });

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

interface ClaimRewardsRequest {
  delegatorAddress: string;
  signature: string;
  publicKey: string;
}

interface CreateValidatorRequest {
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

function mapProposalType(type: string): ProposalType {
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

function mapProposalStatus(status: string): ProposalStatus {
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

function mapVoteOption(option: string): VoteOption {
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

/**
 * Unified API object for screens
 */
export const sultanAPI = {
  getBalance,
  getStakingInfo,
  getValidators,
  getTransactions,
  getNetworkStatus,
  
  /**
   * Get the current nonce for an address
   * The nonce is fetched from the balance endpoint
   */
  getNonce: async (address: string): Promise<number> => {
    const balance = await getBalance(address);
    return balance.nonce;
  },
  
  broadcastTransaction: async (tx: {
    from: string;
    to: string;
    amount: string;
    memo?: string;
    nonce: number;
    timestamp: number;
    signature: string;
    publicKey: string;
  }): Promise<{ hash: string }> => {
    return broadcastTransaction({
      transaction: {
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        memo: tx.memo,
        nonce: tx.nonce,
        timestamp: tx.timestamp,
      },
      signature: tx.signature,
      publicKey: tx.publicKey,
    });
  },

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

  claimRewards: async (req: ClaimRewardsRequest): Promise<{ hash: string }> => {
    // Fetch current nonce for proper transaction ordering
    const balance = await getBalance(req.delegatorAddress);
    return claimRewards({
      transaction: {
        from: req.delegatorAddress,
        to: '',
        amount: '0',
        nonce: balance.nonce,
        timestamp: Date.now(),
      },
      signature: req.signature,
      publicKey: req.publicKey || '',
    });
  },

  /**
   * Create a new validator (become a validator)
   * Requires minimum 10,000 SLTN stake
   * Endpoint: POST /staking/create_validator
   */
  createValidator: async (req: CreateValidatorRequest): Promise<{ 
    validatorAddress: string; 
    stake: string; 
    commission: number;
    status: string;
  }> => {
    return restApi<{ 
      validatorAddress: string; 
      stake: string; 
      commission: number;
      status: string;
    }>('/staking/create_validator', 'POST', {
      validator_address: req.validatorAddress,
      moniker: req.moniker,
      initial_stake: parseInt(req.initialStake, 10),
      commission_rate: req.commissionRate,
      signature: req.signature,
      public_key: req.publicKey,
    });
  },

  // =========================================================================
  // Governance API (uses REST endpoints from sultan-core)
  // =========================================================================

  /**
   * Get all governance proposals
   * Endpoint: GET /governance/proposals
   */
  getProposals: async (): Promise<Proposal[]> => {
    try {
      // The blockchain returns snake_case, we need to map to camelCase
      const result = await restApi<Array<{
        id: number;
        proposer: string;
        title: string;
        description: string;
        proposal_type: string;
        status: string;
        submit_height: number;
        submit_time: number;
        voting_end_height: number;
        total_deposit: number;
        final_tally?: {
          yes: number;
          no: number;
          abstain: number;
          no_with_veto: number;
          total_voting_power: number;
          quorum_reached: boolean;
          passed: boolean;
          vetoed: boolean;
        };
      }>>('/governance/proposals');
      
      return result.map(p => ({
        id: p.id,
        proposer: p.proposer,
        title: p.title,
        description: p.description,
        proposalType: mapProposalType(p.proposal_type),
        status: mapProposalStatus(p.status),
        submitHeight: p.submit_height,
        submitTime: p.submit_time,
        votingEndHeight: p.voting_end_height,
        totalDeposit: String(p.total_deposit),
        finalTally: p.final_tally ? {
          yes: String(p.final_tally.yes),
          no: String(p.final_tally.no),
          abstain: String(p.final_tally.abstain),
          noWithVeto: String(p.final_tally.no_with_veto),
          totalVotingPower: String(p.final_tally.total_voting_power),
          quorumReached: p.final_tally.quorum_reached,
          passed: p.final_tally.passed,
          vetoed: p.final_tally.vetoed,
        } : undefined,
      }));
    } catch {
      // Return empty array if governance not available
      return [];
    }
  },

  /**
   * Get a specific proposal by ID
   * Endpoint: GET /governance/proposal/:id
   */
  getProposal: async (proposalId: number): Promise<Proposal | null> => {
    try {
      const p = await restApi<{
        id: number;
        proposer: string;
        title: string;
        description: string;
        proposal_type: string;
        status: string;
        submit_height: number;
        submit_time: number;
        voting_end_height: number;
        total_deposit: number;
        final_tally?: {
          yes: number;
          no: number;
          abstain: number;
          no_with_veto: number;
          total_voting_power: number;
          quorum_reached: boolean;
          passed: boolean;
          vetoed: boolean;
        };
      }>(`/governance/proposal/${proposalId}`);
      
      return {
        id: p.id,
        proposer: p.proposer,
        title: p.title,
        description: p.description,
        proposalType: mapProposalType(p.proposal_type),
        status: mapProposalStatus(p.status),
        submitHeight: p.submit_height,
        submitTime: p.submit_time,
        votingEndHeight: p.voting_end_height,
        totalDeposit: String(p.total_deposit),
        finalTally: p.final_tally ? {
          yes: String(p.final_tally.yes),
          no: String(p.final_tally.no),
          abstain: String(p.final_tally.abstain),
          noWithVeto: String(p.final_tally.no_with_veto),
          totalVotingPower: String(p.final_tally.total_voting_power),
          quorumReached: p.final_tally.quorum_reached,
          passed: p.final_tally.passed,
          vetoed: p.final_tally.vetoed,
        } : undefined,
      };
    } catch {
      return null;
    }
  },

  /**
   * Get user's vote on a proposal
   * Note: The blockchain tracks votes internally - this queries for a specific voter
   */
  getUserVote: async (proposalId: number, voterAddress: string): Promise<UserVote | null> => {
    try {
      // Try to get vote from proposal's vote list
      const result = await restApi<{
        voter: string;
        option: string;
        voting_power: number;
      } | null>(`/governance/proposal/${proposalId}/vote/${voterAddress}`);
      
      if (!result) return null;
      
      return {
        proposalId,
        voter: result.voter,
        option: mapVoteOption(result.option),
        votingPower: String(result.voting_power),
      };
    } catch {
      return null;
    }
  },

  /**
   * Vote on a proposal
   * Endpoint: POST /governance/vote
   */
  vote: async (req: {
    proposalId: number;
    voter: string;
    option: VoteOption;
    votingPower: string;
    signature: string;
    publicKey: string;
  }): Promise<{ success: boolean }> => {
    const result = await restApi<{ proposal_id: number; voter: string; status: string }>(
      '/governance/vote',
      'POST',
      {
        proposal_id: req.proposalId,
        voter: req.voter,
        option: req.option.toLowerCase().replace('withveto', '_with_veto'),
        voting_power: parseInt(req.votingPower, 10),
        // The blockchain verifies voting power from staking state
        // signature/publicKey would be used for tx signing in production
      }
    );
    return { success: result.status === 'voted' };
  },

  /**
   * Submit a new proposal
   * Endpoint: POST /governance/propose
   */
  submitProposal: async (req: {
    proposer: string;
    title: string;
    description: string;
    proposalType: ProposalType;
    deposit: string;
    signature: string;
    publicKey: string;
    telegramDiscussionUrl?: string;
    discordDiscussionUrl?: string;
  }): Promise<{ proposalId: number }> => {
    const typeMap: Record<ProposalType, string> = {
      'ParameterChange': 'parameter_change',
      'SoftwareUpgrade': 'software_upgrade',
      'CommunityPool': 'community_pool',
      'TextProposal': 'text',
    };
    
    const result = await restApi<{ proposal_id: number; status: string }>(
      '/governance/propose',
      'POST',
      {
        proposer: req.proposer,
        title: req.title,
        description: req.description,
        proposal_type: typeMap[req.proposalType],
        initial_deposit: parseInt(req.deposit, 10),
        telegram_discussion_url: req.telegramDiscussionUrl,
        discord_discussion_url: req.discordDiscussionUrl,
      }
    );
    return { proposalId: result.proposal_id };
  },

  /**
   * Query native NFTs owned by an address (Sultan Token Factory)
   * Endpoint: GET /nft/tokens?owner={address}
   */
  queryNFTs: async (ownerAddress: string): Promise<{
    collections: Array<{
      address: string;
      name: string;
      symbol: string;
      nfts: Array<{
        tokenId: string;
        contractAddress: string;
        name: string;
        description?: string;
        image?: string;
        attributes?: Array<{ trait_type: string; value: string }>;
        collection?: string;
      }>;
    }>;
  }> => {
    try {
      const result = await restApi<{
        collections: Array<{
          address: string;
          name: string;
          symbol: string;
          tokens: Array<{
            token_id: string;
            token_uri?: string;
            extension?: {
              name?: string;
              description?: string;
              image?: string;
              attributes?: Array<{ trait_type: string; value: string }>;
            };
          }>;
        }>;
      }>(`/nft/tokens?owner=${ownerAddress}`, 'GET');
      
      // Transform response to frontend format
      return {
        collections: result.collections.map(col => ({
          address: col.address,
          name: col.name,
          symbol: col.symbol,
          nfts: col.tokens.map(token => ({
            tokenId: token.token_id,
            contractAddress: col.address,
            name: token.extension?.name || `${col.name} #${token.token_id}`,
            description: token.extension?.description,
            image: token.extension?.image,
            attributes: token.extension?.attributes,
            collection: col.name,
          })),
        })),
      };
    } catch {
      // Return empty collections if NFT endpoint not available
      return { collections: [] };
    }
  },

  /**
   * Transfer a native NFT (Sultan Token Factory)
   * Endpoint: POST /nft/transfer
   */
  transferNFT: async (req: {
    contractAddress: string;
    tokenId: string;
    from: string;
    to: string;
    signature: string;
    publicKey: string;
  }): Promise<{ hash: string }> => {
    return restApi<{ hash: string }>('/nft/transfer', 'POST', {
      contract_address: req.contractAddress,
      token_id: req.tokenId,
      from: req.from,
      to: req.to,
      signature: req.signature,
      public_key: req.publicKey,
    });
  },
};
