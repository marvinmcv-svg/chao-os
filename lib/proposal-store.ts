/**
 * Persistent proposal store using Prisma (PostgreSQL).
 * Replaces the in-memory Map to work correctly in serverless environments
 * (Vercel, Railway) where each cold start is a new process.
 */

import { prisma } from '@/lib/prisma'

export interface StoredProposal {
  proposalId: string
  leadId: string
  content: string
  generatedAt: string
}

export const proposalStore = {
  set(leadId: string, proposal: StoredProposal): void {
    // upsert — replace any existing draft for this leadId
    prisma.proposalDraft.upsert({
      where: { leadId },
      update: {
        content: proposal.content,
        generatedAt: new Date(proposal.generatedAt),
      },
      create: {
        leadId,
        content: proposal.content,
        generatedAt: new Date(proposal.generatedAt),
      },
    }).catch((err) => {
      console.error('[proposalStore] upsert error:', err)
    })
  },

  get(leadId: string): Promise<StoredProposal | undefined> {
    return prisma.proposalDraft
      .findUnique({ where: { leadId } })
      .then((row) =>
        row
          ? {
              proposalId: row.id,
              leadId: row.leadId,
              content: row.content,
              generatedAt: row.generatedAt.toISOString(),
            }
          : undefined
      )
  },

  findByProposalId(proposalId: string): Promise<StoredProposal | undefined> {
    return prisma.proposalDraft
      .findUnique({ where: { id: proposalId } })
      .then((row) =>
        row
          ? {
              proposalId: row.id,
              leadId: row.leadId,
              content: row.content,
              generatedAt: row.generatedAt.toISOString(),
            }
          : undefined
      )
  },

  findById(id: string): Promise<StoredProposal | undefined> {
    // Try as leadId first (unique), then as proposalId (id)
    return prisma.proposalDraft
      .findUnique({ where: { leadId: id } })
      .then((row) =>
        row
          ? {
              proposalId: row.id,
              leadId: row.leadId,
              content: row.content,
              generatedAt: row.generatedAt.toISOString(),
            }
          : undefined
      )
      .then((result) => {
        if (result) return result
        // Fallback: scan by proposalId
        return this.findByProposalId(id)
      })
  },
}