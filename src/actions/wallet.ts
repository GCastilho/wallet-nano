import { randomBytes } from 'crypto'
import { wallet } from 'nanocurrency-web'
import { PrismaClient } from '@prisma/client'
import { HttpError } from '../errors'
import { rpcSend, wsSend } from '../rpc'
import { receiveBlock } from '../libs/blocks'
import { accountInfo } from '../libs/accounts'
import { getWork, precomputeWork } from '../libs/work'
import { createQueue, createAckQueue } from '../libs/queue'
import { walletSchema, sendSchema, receiveSchema } from '../models'
import { deriveAccount, fetchSeed } from '../libs/wallet'
import * as nano from 'nanocurrency-web'
import type { RPC } from '../rpc'

const prisma = new PrismaClient()

export async function walletCreate() {
	const entropy = randomBytes(32)
	const { seed } = wallet.generate(entropy.toString('hex'))

	const { id } = await prisma.wallet.create({
		select: {
			id: true,
		},
		data: { seed }
	})

	return {
		wallet: id
	}
}

export async function walletDestroy(input: Record<string, unknown>) {
	const { wallet } = walletSchema.validate(input)

	const destroyed = await prisma.wallet.delete({
		select: {
			accounts: {
				select: {
					account: true
				}
			}
		},
		where: {
			id: wallet,
		}
	}).catch(() => null)

	if (destroyed) {
		const accounts = destroyed.accounts.map(v => v.account)
		wsSend({
			action: 'update',
			topic: 'confirmation',
			options: { accounts },
		})
	}

	return {
		destroyed: destroyed ? '1' : '0'
	}
}

type Started = {
	started: '0'|'1'
}
function searchAck(input: Record<string, unknown>): Started {
	try {
		const { wallet } = walletSchema.validate(input)
		if (searching.has(wallet)) return {
			started: '1'
		}
		searching.add(wallet)
		return {
			started: '1'
		}
	} catch (err) {
		return {
			started: '0'
		}
	}
}

const searching = new Set<string>()

export const searchPending = createAckQueue(searchAck, async (input: Record<string, unknown>) => {
	const { wallet } = walletSchema.validate(input)
	const accounts = await prisma.account.findMany({
		select: {
			account: true,
		},
		where: {
			wallet_id: wallet
		}
	})

	console.log('Started search_pending for', wallet, accounts)
	for (const { account } of accounts) {
		console.log('Searching pending blocks for', account)

		const { blocks } = await rpcSend<RPC.Pending>({
			action: 'pending',
			account,
		})
		console.log('Pending blocks for', account, blocks)
		for (const hash of blocks) {
			const {
				amount,
				contents: {
					link_as_account: account,
				}
			} = await rpcSend<RPC.BlockInfo>({
				action: 'block_info',
				json_block: 'true',
				hash,
			})

			await receiveBlock({ hash, account, amount })
		}

		// Atualiza o saldo
		const { balance } = await accountInfo(account)
		await prisma.account.update({
			select: null,
			where: { account },
			data: { balance },
		})
	}

	console.log('search_pending done for', wallet)
	searching.delete(wallet)
})

/** Procura por blocos nossos não processados */
export const searchMissing = createAckQueue(searchAck, async (input: Record<string, unknown>) => {
	const { wallet } = walletSchema.validate(input)
	const accounts = await prisma.account.findMany({
		select: {
			account: true,
		},
		where: {
			wallet_id: wallet,
		}
	})

	for (const { account } of accounts) {
		console.log('Searching missed receive blocks for', account)

		const { frontier } = await accountInfo(account)
		if (!frontier) continue

		const zeroBlock = '0'.repeat(64)
		let hash = frontier
		while (hash != zeroBlock) {
			const {
				amount,
				block_account,
				subtype,
				local_timestamp,
				contents: {
					link,
					previous,
				}
			} = await rpcSend<RPC.BlockInfo>({
				action: 'block_info',
				json_block: 'true',
				hash,
			})
			await prisma.block.upsert({
				select: null,
				where: { hash },
				create: {
					hash,
					amount,
					link,
					subtype,
					time: new Date(+(local_timestamp + '000')),
					account_id: block_account,
				},
				update: {},
			})
			hash = previous
		}
	}
})

export const receive = createQueue(async (input: Record<string, unknown>) => {
	const {
		block,
		account,
		wallet,
	} = receiveSchema.validate(input)

	const result = await prisma.account.findFirst({
		select: null,
		where: {
			account,
			wallet_id: wallet,
		},
	})
	if (!result) throw new HttpError('NOT_FOUND', 'Wallet or account not found')

	const { amount } = await rpcSend<RPC.BlockInfo>({
		action: 'block_info',
		json_block: 'true',
		hash: block,
	})

	return receiveBlock({
		hash: block,
		account,
		amount,
	})
})

export async function send(input: Record<string, unknown>) {
	const {
		amount,
		destination,
		source,
		wallet,
	} = sendSchema.validate(input)
	console.log('send request received', input)

	const result = await prisma.account.findFirst({
		select: {
			balance: true,
			account_index: true,
			blocks: {
				select: {
					hash: true,
				},
				take: 1,
				orderBy: {
					time: 'desc'
				},
			},
			wallet: {
				select: {
					representative: true,
				}
			}
		},
		where: {
			wallet_id: wallet,
			account: source,
		},
	})
	if (!result) throw new HttpError('NOT_FOUND', 'Wallet not found')

	const seed = await fetchSeed(wallet)
	const { privateKey } = deriveAccount(seed, result.account_index)

	const frontier = result.blocks[0]?.hash
	if (!frontier) {
		throw new HttpError('NOT_FOUND', `Frontier not found for '${source}'`)
	}
	if (BigInt(amount) > BigInt(result.balance)) {
		throw new HttpError('PRECONDITION_FAILED', 'Not enough balance')
	}

	const block = nano.block.send({
		amountRaw: amount,
		fromAddress: source,
		frontier,
		representativeAddress: result.wallet.representative,
		toAddress: destination,
		walletBalanceRaw: result.balance,
		work: await getWork(source, frontier),
	}, privateKey)
	console.log('send block', block)

	const res = await rpcSend<{ hash: string }>({
		action: 'process',
		json_block: 'true',
		subtype: 'send',
		block,
	})
	console.log('send process response', res)

	// source é a nossa account
	precomputeWork(source, res.hash)

	await prisma.account.update({
		select: null,
		where: { account: source },
		data: {
			balance: block.balance,
			blocks: {
				create: {
					hash: res.hash,
					amount,
					link: destination,
					subtype: 'send',
					time: new Date(),
				}
			}
		}
	})

	return {
		block: res.hash
	}
}
