/**
 * Governance Screen
 * 
 * View and vote on network proposals.
 * Voting power = staked SLTN tokens.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useTheme } from '../hooks/useTheme';
import { useStakingInfo, useBalance } from '../hooks/useBalance';
import { sultanAPI, Proposal, VoteOption, ProposalType } from '../api/sultanAPI';
import { SultanWallet } from '../core/wallet';
import './Governance.css';

// Minimum deposit required (1,000 SLTN in base units)
const MIN_DEPOSIT = 1000;

// Premium SVG Icons
const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const SunIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const VoteIcon = () => (
  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);



type Tab = 'active' | 'passed' | 'all';
type View = 'list' | 'detail' | 'submit';

export default function Governance() {
  const navigate = useNavigate();
  const { wallet, currentAccount } = useWallet();
  const { theme, setTheme } = useTheme();
  const { data: stakingData } = useStakingInfo(currentAccount?.address);
  const { data: balanceData } = useBalance(currentAccount?.address);
  
  const [tab, setTab] = useState<Tab>('active');
  const [view, setView] = useState<View>('list');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [voteSuccess, setVoteSuccess] = useState('');
  const [error, setError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Submit proposal form state
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [proposalType, setProposalType] = useState<ProposalType>('TextProposal');
  const [depositAmount, setDepositAmount] = useState(MIN_DEPOSIT.toString());
  const [discordUrl, setDiscordUrl] = useState('https://discord.com/channels/1375878827460395142/1453111965428875537');
  const [telegramUrl, setTelegramUrl] = useState('');

  const votingPower = SultanWallet.formatSLTN(stakingData?.staked || '0');
  const availableBalance = Number(SultanWallet.formatSLTN(balanceData?.available || '0'));

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    loadProposals();
  }, []);

  const loadProposals = async () => {
    setIsLoading(true);
    try {
      const result = await sultanAPI.getProposals();
      setProposals(result);
    } catch (err) {
      console.error('Failed to load proposals:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProposals = proposals.filter(p => {
    if (tab === 'active') return p.status === 'VotingPeriod';
    if (tab === 'passed') return p.status === 'Passed' || p.status === 'Executed';
    return true;
  });

  const handleVote = async (option: VoteOption) => {
    if (!wallet || !currentAccount || !selectedProposal) return;
    if (Number(votingPower) === 0) {
      setError('You need staked SLTN to vote');
      return;
    }

    setIsVoting(true);
    setError('');
    setVoteSuccess('');

    try {
      const txData = {
        type: 'vote' as const,
        proposalId: selectedProposal.id,
        voter: currentAccount.address,
        option,
        timestamp: Date.now(),
      };

      const signature = await wallet.signTransaction(txData, currentAccount.index);
      
      await sultanAPI.vote({
        proposalId: selectedProposal.id,
        voter: currentAccount.address,
        option,
        votingPower: stakingData?.staked || '0',
        signature,
        publicKey: currentAccount.publicKey,
      });

      setVoteSuccess(`Vote "${option}" submitted successfully!`);
      setSelectedProposal(null);
      setView('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vote failed');
    } finally {
      setIsVoting(false);
    }
  };

  const handleSubmitProposal = async () => {
    if (!wallet || !currentAccount) return;

    // Validation
    if (!proposalTitle.trim()) {
      setError('Title is required');
      return;
    }
    if (proposalTitle.length > 140) {
      setError('Title must be 140 characters or less');
      return;
    }
    if (!proposalDescription.trim()) {
      setError('Description is required');
      return;
    }
    if (proposalDescription.length > 10000) {
      setError('Description must be 10,000 characters or less');
      return;
    }
    // At least one discussion link is required
    if (!discordUrl.trim() && !telegramUrl.trim()) {
      setError('A Discord discussion link is required. Post in the Proposals channel first.');
      return;
    }
    // Validate Discord URL if provided
    if (discordUrl.trim() && !discordUrl.startsWith('https://discord')) {
      setError('Discord URL must start with https://discord');
      return;
    }
    // Validate Telegram URL if provided
    if (telegramUrl.trim() && !telegramUrl.startsWith('https://t.me/')) {
      setError('Telegram URL must start with https://t.me/');
      return;
    }
    const deposit = Number(depositAmount);
    if (isNaN(deposit) || deposit < MIN_DEPOSIT) {
      setError(`Minimum deposit is ${MIN_DEPOSIT} SLTN`);
      return;
    }
    if (deposit > availableBalance) {
      setError(`Insufficient balance. You have ${availableBalance.toFixed(2)} SLTN`);
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSubmitSuccess('');

    try {
      const txData = {
        type: 'submit_proposal' as const,
        proposer: currentAccount.address,
        title: proposalTitle,
        description: proposalDescription,
        proposalType,
        deposit: SultanWallet.parseSLTN(deposit.toString()),
        telegramUrl: telegramUrl.trim() || undefined,
        discordUrl: discordUrl.trim() || undefined,
        timestamp: Date.now(),
      };

      const signature = await wallet.signTransaction(txData, currentAccount.index);
      
      const result = await sultanAPI.submitProposal({
        proposer: currentAccount.address,
        title: proposalTitle,
        description: proposalDescription,
        proposalType,
        deposit: SultanWallet.parseSLTN(deposit.toString()),
        signature,
        publicKey: currentAccount.publicKey,
        telegramDiscussionUrl: telegramUrl.trim() || undefined,
        discordDiscussionUrl: discordUrl.trim() || undefined,
      });

      setSubmitSuccess(`Proposal #${result.proposalId} submitted successfully! 2-day discussion period started.`);
      
      // Reset form
      setProposalTitle('');
      setProposalDescription('');
      setProposalType('TextProposal');
      setDepositAmount(MIN_DEPOSIT.toString());
      setDiscordUrl('https://discord.com/channels/1375878827460395142/1453111965428875537');
      setTelegramUrl('');
      
      // Reload proposals and go back to list
      await loadProposals();
      setTimeout(() => {
        setView('list');
        setSubmitSuccess('');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit proposal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openProposal = (proposal: Proposal) => {
    setSelectedProposal(proposal);
    setView('detail');
    setError('');
    setVoteSuccess('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'VotingPeriod': return 'voting';
      case 'Passed':
      case 'Executed': return 'passed';
      case 'Rejected':
      case 'Failed': return 'rejected';
      default: return '';
    }
  };

  const formatProposalType = (type: string) => {
    switch (type) {
      case 'ParameterChange': return 'Parameter';
      case 'SoftwareUpgrade': return 'Upgrade';
      case 'CommunityPool': return 'Community';
      case 'TextProposal': return 'Text';
      default: return type;
    }
  };

  // Submit proposal view
  if (view === 'submit') {
    return (
      <div className="governance-screen">
        <header className="screen-header">
          <button className="btn-back" onClick={() => { setView('list'); setError(''); }}>
            <BackIcon />
          </button>
          <h2>New Proposal</h2>
          <button className="btn-icon theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </header>

        <div className="governance-content fade-in">
          <div className="submit-proposal-form">
            <div className="form-group">
              <label htmlFor="title">Title *</label>
              <input
                id="title"
                type="text"
                value={proposalTitle}
                onChange={(e) => setProposalTitle(e.target.value)}
                placeholder="Brief, descriptive title"
                maxLength={140}
                disabled={isSubmitting}
              />
              <span className="char-count">{proposalTitle.length}/140</span>
            </div>

            <div className="form-group">
              <label htmlFor="type">Proposal Type</label>
              <select
                id="type"
                value={proposalType}
                onChange={(e) => setProposalType(e.target.value as ProposalType)}
                disabled={isSubmitting}
              >
                <option value="TextProposal">Text Proposal</option>
                <option value="ParameterChange">Parameter Change</option>
                <option value="SoftwareUpgrade">Software Upgrade</option>
                <option value="CommunityPool">Community Pool Spend</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="description">Description *</label>
              <textarea
                id="description"
                value={proposalDescription}
                onChange={(e) => setProposalDescription(e.target.value)}
                placeholder="Detailed description of your proposal..."
                rows={6}
                maxLength={10000}
                disabled={isSubmitting}
              />
              <span className="char-count">{proposalDescription.length}/10,000</span>
            </div>

            <div className="form-group">
              <label htmlFor="deposit">Deposit (SLTN) *</label>
              <input
                id="deposit"
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                min={MIN_DEPOSIT}
                step="1"
                disabled={isSubmitting}
              />
              <span className="field-hint">
                Minimum: {MIN_DEPOSIT} SLTN • Available: {availableBalance.toFixed(2)} SLTN
              </span>
            </div>

            <div className="discussion-links">
              <h4>📢 Discussion Links (at least one required)</h4>
              <p className="field-hint">
                Proposals require a 2-day community discussion period before voting begins.
              </p>
              
              <div className="form-group">
                <label htmlFor="discord">Discord Discussion URL</label>
                <input
                  id="discord"
                  type="url"
                  value={discordUrl}
                  onChange={(e) => setDiscordUrl(e.target.value)}
                  placeholder="https://discord.com/channels/..."
                  disabled={isSubmitting}
                />
                <span className="field-hint">
                  Post your proposal in the <a href="https://discord.com/channels/1375878827460395142/1453111965428875537" target="_blank" rel="noopener noreferrer">Sultan Proposals channel</a>
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="telegram">Telegram Discussion URL (optional)</label>
                <input
                  id="telegram"
                  type="url"
                  value={telegramUrl}
                  onChange={(e) => setTelegramUrl(e.target.value)}
                  placeholder="https://t.me/SultanChain/..."
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="deposit-info">
              <p>
                <strong>Note:</strong> Your deposit will be returned if the proposal 
                passes or reaches voting period. Deposits are burned only if the 
                proposal is vetoed ({'>'}33.4% NoWithVeto votes).
              </p>
            </div>

            {error && <p className="text-error">{error}</p>}
            {submitSuccess && <p className="text-success">{submitSuccess}</p>}

            <button
              className="btn-primary btn-submit-proposal"
              onClick={handleSubmitProposal}
              disabled={isSubmitting || !proposalTitle || !proposalDescription}
            >
              {isSubmitting ? 'Submitting...' : `Submit Proposal (${depositAmount} SLTN)`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Proposal detail view
  if (view === 'detail' && selectedProposal) {
    return (
      <div className="governance-screen">
        <header className="screen-header">
          <button className="btn-back" onClick={() => { setView('list'); setSelectedProposal(null); }}>
            <BackIcon />
          </button>
          <h2>Proposal #{selectedProposal.id}</h2>
          <button className="btn-icon theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </header>

        <div className="governance-content fade-in">
          <div className="proposal-detail">
            <div className="proposal-header">
              <span className={`proposal-status ${getStatusColor(selectedProposal.status)}`}>
                {selectedProposal.status === 'VotingPeriod' ? 'Voting' : selectedProposal.status}
              </span>
              <span className="proposal-type">{formatProposalType(selectedProposal.proposalType)}</span>
            </div>

            <h3 className="proposal-title">{selectedProposal.title}</h3>
            <p className="proposal-description">{selectedProposal.description}</p>

            <div className="proposal-meta">
              <div className="meta-item">
                <span className="meta-label">Proposer</span>
                <span className="meta-value">{selectedProposal.proposer.slice(0, 12)}...</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Deposit</span>
                <span className="meta-value">{SultanWallet.formatSLTN(selectedProposal.totalDeposit)} SLTN</span>
              </div>
            </div>

            {selectedProposal.finalTally && (
              <div className="tally-results">
                <h4>Current Tally</h4>
                <div className="tally-bars">
                  <div className="tally-bar yes" style={{ width: `${Number(selectedProposal.finalTally.yes) / Number(selectedProposal.finalTally.totalVotingPower) * 100}%` }}>
                    Yes
                  </div>
                  <div className="tally-bar no" style={{ width: `${Number(selectedProposal.finalTally.no) / Number(selectedProposal.finalTally.totalVotingPower) * 100}%` }}>
                    No
                  </div>
                </div>
              </div>
            )}

            {selectedProposal.status === 'VotingPeriod' && (
              <div className="voting-section">
                <div className="voting-power-display">
                  <span>Your Voting Power</span>
                  <strong>{votingPower} SLTN</strong>
                </div>

                {Number(votingPower) === 0 ? (
                  <p className="no-power-warning">
                    You need to stake SLTN to participate in governance.
                  </p>
                ) : (
                  <div className="vote-options">
                    <button 
                      className="vote-btn yes"
                      onClick={() => handleVote('Yes')}
                      disabled={isVoting}
                    >
                      <CheckIcon /> Yes
                    </button>
                    <button 
                      className="vote-btn no"
                      onClick={() => handleVote('No')}
                      disabled={isVoting}
                    >
                      No
                    </button>
                    <button 
                      className="vote-btn abstain"
                      onClick={() => handleVote('Abstain')}
                      disabled={isVoting}
                    >
                      Abstain
                    </button>
                    <button 
                      className="vote-btn veto"
                      onClick={() => handleVote('NoWithVeto')}
                      disabled={isVoting}
                    >
                      Veto
                    </button>
                  </div>
                )}

                {error && <p className="text-error mt-md">{error}</p>}
                {voteSuccess && <p className="text-success mt-md">{voteSuccess}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="governance-screen">
      <header className="screen-header">
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          <BackIcon />
        </button>
        <h2>Governance</h2>
        <button className="btn-icon theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <div className="governance-content fade-in">
        <div className="voting-power-card">
          <div className="power-info">
            <span className="power-label">Your Voting Power</span>
            <span className="power-value">{votingPower} SLTN</span>
          </div>
          <button 
            className="btn-new-proposal"
            onClick={() => { setView('submit'); setError(''); setSubmitSuccess(''); }}
          >
            <PlusIcon /> New Proposal
          </button>
        </div>

        <div className="tab-bar">
          <button 
            className={`tab ${tab === 'active' ? 'active' : ''}`}
            onClick={() => setTab('active')}
          >
            Active
          </button>
          <button 
            className={`tab ${tab === 'passed' ? 'active' : ''}`}
            onClick={() => setTab('passed')}
          >
            Passed
          </button>
          <button 
            className={`tab ${tab === 'all' ? 'active' : ''}`}
            onClick={() => setTab('all')}
          >
            All
          </button>
        </div>

        <div className="proposals-list">
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Loading proposals...</p>
            </div>
          ) : filteredProposals.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><VoteIcon /></div>
              <p>No {tab === 'active' ? 'active' : tab === 'passed' ? 'passed' : ''} proposals</p>
              <p className="text-muted">
                {tab === 'active' 
                  ? 'Be the first to submit a proposal!'
                  : 'Proposals will appear here once submitted'}
              </p>
              <button 
                className="btn-primary mt-lg"
                onClick={() => { setView('submit'); setError(''); }}
              >
                <PlusIcon /> Submit Proposal
              </button>
            </div>
          ) : (
            filteredProposals.map(proposal => (
              <div 
                key={proposal.id} 
                className="proposal-card"
                onClick={() => openProposal(proposal)}
              >
                <div className="proposal-card-header">
                  <span className="proposal-id">#{proposal.id}</span>
                  <span className={`proposal-status ${getStatusColor(proposal.status)}`}>
                    {proposal.status === 'VotingPeriod' ? (
                      <><ClockIcon /> Voting</>
                    ) : proposal.status}
                  </span>
                </div>
                <h4 className="proposal-card-title">{proposal.title}</h4>
                <div className="proposal-card-footer">
                  <span className="proposal-type-badge">
                    {formatProposalType(proposal.proposalType)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="governance-info">
          <h4>How Governance Works</h4>
          <ul>
            <li><strong>1,000 SLTN</strong> deposit to submit a proposal</li>
            <li><strong>7 days</strong> voting period</li>
            <li><strong>33.4%</strong> quorum required</li>
            <li><strong>50%</strong> yes votes to pass</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
