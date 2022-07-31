import { PrismaClient } from '@prisma/client'
import { precomputeWork } from '../libs/work'
import { WalletError, workPrecomputeSchema } from '../models'

const prisma = new PrismaClient()

export async function workPrecompute(input: Record<string, unknown>) {
	const { account } = await workPrecomputeSchema.validate(input)
	const { hash } = await prisma.block.findFirst({
		where: {
			account_id: account
		},
		select: {
			hash: true,
		},
		orderBy: {
			created_at: 'desc'
		}
	}) || {}
	if (!hash) throw new WalletError('Hash not found', 'NOT_FOUND', 'Account has no blocks')

	precomputeWork(account, hash)

	return {
		success: '1'
	}
}

export async function workPrecomputeAll() {
	const accounts = await prisma.account.findMany({
		select: {
			blocks: {
				select: {
					hash: true,
				},
				take: 1,
			},
			account: true,
		},
		where: {
			blocks: {
				some: {}
			}
		},
	})

	for (const { account, blocks } of accounts) {
		const { hash } = blocks[0] || {}
		if (!hash) continue
		precomputeWork(account, hash)
	}

	return {
		started: '1'
	}
}
