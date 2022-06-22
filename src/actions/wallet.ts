import * as nano from 'nanocurrency-web'
import * as nanocurrency from 'nanocurrency'
import { randomBytes } from 'crypto'
import { wallet } from 'nanocurrency-web'
import { PrismaClient } from '@prisma/client'
import createQueue from '../libs/queue'
import { walletSchema } from '../models'
import { send, wsSend } from '../rpc'
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

export const searchPending = createQueue({ started: '1' }, async (input: Record<string, unknown>) => {
	const { wallet } = walletSchema.validate(input)
	if (searching.has(wallet)) return
	searching.add(wallet)

	const accounts = await prisma.wallet.findUnique({
		where: {
			id: wallet
		}
	}).accounts({
		select: {
			account: true
		}
	})

	for (const { account } of accounts) {
		// Procurar blocos nossos mas não processados (missed)
		const { frontier } = await send<RPC.AccountInfo>({
			action: 'account_info',
			account,
		})

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
			} = await send<RPC.BlockInfo>({
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

		// Procurar pending de send (blocos não processados)
		const { blocks } = await send<RPC.Pending>({
			action: 'pending',
			account,
		})
		console.log('blocks', blocks)
		for (const hash of blocks) {
			const {
				amount,
				contents: {
					link_as_account: account,
				}
			} = await send<RPC.BlockInfo>({
				action: 'block_info',
				json_block: 'true',
				hash,
			})

			receive({ hash, account, amount })
		}
	}

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

	const { frontier, balance } = await send<RPC.AccountInfo>({
		action: 'account_info',
		account,
	})

	const work = await nanocurrency.computeWork(
		frontier || nano.tools.addressToPublicKey(account)
	) || ''

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

	const res = await send({
		action: 'process',
		json_block: 'true',
		subtype: 'receive',
		block,
	})
	console.log('process response', res)
})
