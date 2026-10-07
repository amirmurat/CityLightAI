use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
declare_id!("AbgBg2HV8yVGUmtuZKUpifxitbhWwQ1qgrH4m158LSUx");

#[program]
pub mod citylight_audit {
    use super::*;
    pub fn register_run(ctx: Context<RegisterRun>, run_id: [u8;16], intersection_hash: [u8;32], policy_hash: [u8;32], publisher: Pubkey) -> Result<()> {
        require!(publisher != Pubkey::default(), AuditError::InvalidPublisher);
        let r = &mut ctx.accounts.registry;
        r.authority = ctx.accounts.authority.key();
        r.publisher = publisher;
        r.run_id = run_id;
        r.intersection_hash = intersection_hash;
        r.policy_hash = policy_hash;
        r.next_sequence = 0;
        r.last_commitment = [0;32];
        Ok(())
    }
    pub fn record_decision(ctx: Context<RecordDecision>, sequence: u64, evidence_hash: [u8;32], previous: [u8;32]) -> Result<()> {
        let r = &mut ctx.accounts.registry;
        require!(sequence == r.next_sequence, AuditError::InvalidSequence);
        require!(previous == r.last_commitment, AuditError::BrokenChain);
        require!(evidence_hash != [0;32], AuditError::EmptyEvidence);
        let registry_key = r.key();
        let commitment = hashv(&[registry_key.as_ref(), &sequence.to_le_bytes(), &evidence_hash, &previous]).to_bytes();
        let receipt = &mut ctx.accounts.receipt;
        receipt.registry = registry_key;
        receipt.publisher = ctx.accounts.publisher.key();
        receipt.sequence = sequence;
        receipt.evidence_hash = evidence_hash;
        receipt.previous = previous;
        receipt.commitment = commitment;
        receipt.slot = Clock::get()?.slot;
        r.next_sequence = sequence.checked_add(1).ok_or(AuditError::Overflow)?;
        r.last_commitment = commitment;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(run_id: [u8;16])]
pub struct RegisterRun<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer=authority, space=8+32+32+16+32+32+8+32,
        seeds=[b"run", authority.key().as_ref(), run_id.as_ref()], bump)]
    pub registry: Account<'info, RunRegistry>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(sequence: u64)]
pub struct RecordDecision<'info> {
    #[account(mut)]
    pub publisher: Signer<'info>,
    #[account(mut, has_one=publisher)]
    pub registry: Account<'info, RunRegistry>,
    #[account(init, payer=publisher, space=8+32+32+8+32+32+32+8,
        seeds=[b"receipt", registry.key().as_ref(), &sequence.to_le_bytes()], bump)]
    pub receipt: Account<'info, DecisionReceipt>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct RunRegistry {
    pub authority: Pubkey,
    pub publisher: Pubkey,
    pub run_id: [u8;16],
    pub intersection_hash: [u8;32],
    pub policy_hash: [u8;32],
    pub next_sequence: u64,
    pub last_commitment: [u8;32],
}

#[account]
pub struct DecisionReceipt {
    pub registry: Pubkey,
    pub publisher: Pubkey,
    pub sequence: u64,
    pub evidence_hash: [u8;32],
    pub previous: [u8;32],
    pub commitment: [u8;32],
    pub slot: u64,
}

#[error_code]
pub enum AuditError {
    #[msg("Publisher must be a nonzero public key")]
    InvalidPublisher,
    #[msg("Decision sequence must be the next number")]
    InvalidSequence,
    #[msg("Previous commitment does not match the registry")]
    BrokenChain,
    #[msg("Evidence commitment must be nonzero")]
    EmptyEvidence,
    #[msg("Sequence overflow")]
    Overflow,
}

