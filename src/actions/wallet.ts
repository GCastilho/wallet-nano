import * as nano from 'nanocurrency-web'
import { randomBytes } from 'crypto'
import { wallet } from 'nanocurrency-web'
import { PrismaClient } from '@prisma/client'
import createQueue from '../libs/queue'
import { walletSchema, sendSchema } from '../models'
import { rpcSend, wsSend } from '../rpc'
import { getWork } from '../libs/work'
import type { RPC } from '../rpc'

const prisma = new PrismaClient()

export async function walletCreate() {
	const entropy = randomBytes(32)
	const { seed, mnemonic } = wallet.generate(entropy.toString('hex'))

	const { id } = await prisma.wallet.create({
		select: {
			id: true,
		},
		data: { seed, mnemonic }
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
		const accounts_del = destroyed.accounts.map(v => v.account)
		wsSend({
			action: 'update',
			topic: 'confirmation',
			options: { accounts_del },
		})
	}

	return {
		destroyed: destroyed ? '1' : '0'
	}
}

const searching = new Set<string>()

type Started = {
	started: '0'|'1'
}
export const searchPending = createQueue((input: Record<string, unknown>): Started => {
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
}, async (input: Record<string, unknown>) => {
	const { wallet } = walletSchema.validate(input)

	const accounts = await prisma.wallet.findUnique({
		where: {
			id: wallet
		}
	}).accounts({
		select: {
			account: true
		}
	})

	console.log('Started search_pending for', wallet, accounts)
	for (const { account } of accounts) {
		console.log('Searching pending blocks for', account)

		// Procura pending de send (blocos não processados)
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

			await receive({ hash, account, amount })
		}

		console.log('Searching missed receive blocks for', account)
		// Procura por blocos nossos mas não processados (missed)
		const { frontier } = await rpcSend<RPC.AccountInfo>({
			action: 'account_info',
			account,
		}).catch(err => {
			if (err == 'Account not found') return { frontier: null }
			throw err
		})
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
					time: new Date(+local_timestamp),
					account_id: block_account,
				},
				update: {},
			})
			hash = previous
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

type Receive = {
	hash: string
	amount: string
	account: string
}
export const receive = createQueue(null, async ({ hash, account, amount }: Receive) => {
	const result = await prisma.account.findUnique({
		select: {
			private_key: true,
			wallet: {
				select: {
					representative: true,
				}
			},
		},
		where: { account }
	})
	console.log('result', result)
	if (!result) return // Not ours

	const { frontier, balance } = await accountInfo(account)

	const work = await getWork(account, frontier)

	console.log({ frontier, balance, work })

	const block = nano.block.receive({
		amountRaw: amount,
		toAddress: account,
		transactionHash: hash,
		walletBalanceRaw: balance,
		frontier: frontier || '0'.repeat(64),
		representativeAddress: result.wallet.representative,
		work,
	}, result.private_key)
	console.log('block', block)

	const res = await rpcSend({
		action: 'process',
		json_block: 'true',
		subtype: 'receive',
		block,
	})
	console.log('receive process response', res)
})

/**
 * TODO: Tentar usar o balance da wallet primeiro e se falhar usar o account_info
 */
export async function send(input: Record<string, unknown>) {
	const {
		amount,
		destination,
		source,
		wallet,
	} = sendSchema.validate(input)

	const result = await prisma.account.findFirst({
		select: {
			balance: true,
			private_key: true,
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
	console.log('send result', result)
	if (!result) return {
		error: 'Wallet not found'
	}

	const {
		frontier,
		balance,
	} = await rpcSend<RPC.AccountInfo>({
		action: 'account_info',
		account: source,
	})
	console.log('frontier', frontier, 'balance', balance)
	if (BigInt(amount) > BigInt(balance)) return {
		error: 'Not enough balance'
	}

	const block = nano.block.send({
		amountRaw: amount,
		fromAddress: source,
		frontier,
		representativeAddress: result.wallet.representative,
		toAddress: destination,
		walletBalanceRaw: balance,
		work: await getWork(source, frontier),
	}, result.private_key)
	console.log('send block', block)

	const res = await rpcSend<{ hash: string }>({
		action: 'process',
		json_block: 'true',
		subtype: 'send',
		block,
	})
	console.log('send process response', res)

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

async function accountInfo(account: string) {
	try {
		return await rpcSend<RPC.AccountInfo>({
			action: 'account_info',
			account,
		})
	} catch (err) {
		if (err == 'Account not found') return {
			frontier: null,
			balance: '0'
		}
		else throw err
	}
}
