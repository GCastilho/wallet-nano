import * as nano from 'nanocurrency-web'
import { PrismaClient } from '@prisma/client'
import config from '../config'
import { rpcSend } from '../rpc'
import { HttpError } from '../errors'
import { getWork } from '../libs/work'
import { createQueue } from '../libs/queue'
import { accountInfo } from '../libs/accounts'

const prisma = new PrismaClient()

type Receive = (params: {
	hash: string
	amount: string
	account: string
}, options?: {
	frontier?: string|null
	balance?: string
}) => Promise<{ hash: string }>

// TODO: Aceitar ID no receive e usar isso para idempotencia (no send tbm)
export const receiveBlock: Receive = createQueue(async ({ hash, account, amount }, options) => {
	console.log('received block', { hash, account, amount })

	if (BigInt(amount || 0) < BigInt(config.receiveMinimum)) return {
		hash: ''
	}

	const result = await prisma.account.findUnique({
		select: {
			balance: true,
			private_key: true,
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
			},
		},
		where: { account }
	})
	if (!result) throw new HttpError('NOT_FOUND', 'Account not found')

	const frontier = options?.frontier || result.blocks[0]?.hash
	const balance = options?.balance || result.balance
	const work = await getWork(account, frontier)

	const block = nano.block.receive({
		amountRaw: amount,
		toAddress: account,
		transactionHash: hash,
		walletBalanceRaw: balance,
		frontier: frontier || '0'.repeat(64),
		representativeAddress: result.wallet.representative,
		work,
	}, result.private_key)
	console.log('receive block created', block)

	try {
		const res = await rpcSend<{ hash: string }>({
			action: 'process',
			json_block: 'true',
			subtype: 'receive',
			block,
		})
		console.log('receive process response', res)

		return {
			hash: res.hash
		}
	} catch (err) {
		if (err instanceof Error && err.message == 'Fork') {
			console.log(`RPC returned 'Fork' for ${hash}, this usually means the wallet is not synchronized with the network. Trying again using account_info to fetch the frontier...`)
			const { frontier, balance } = await accountInfo(account)
			return receiveBlock({ hash, account, amount }, { frontier, balance })
		} else throw err
	}
})
