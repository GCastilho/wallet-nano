import { PrismaClient } from '@prisma/client'
import config from '../config'
import { rpcSend } from '../rpc'
import { WalletError } from '../models'
import { addEventListener } from '../rpc'
import { createQueue } from '../libs/queue'
import { accountInfo } from '../libs/accounts'
import { deriveAccount, fetchSeed } from './wallet'
import { getWork, precomputeWork } from '../libs/work'
import * as nano from 'nanocurrency-web'
import type { WebSocket } from '../rpc'

const prisma = new PrismaClient()

/**
 * Handle socket message
 * This queue can be optimized by individual queues for each account
 */
const handleMessage = createQueue(async function handler(data: WebSocket.Message) {
	console.log('handleMessage', data)
	const { time } = data
	const { hash, amount } = data.message
	const { account, subtype, link, link_as_account } = data.message.block

	if (subtype == 'receive') {
		const { balance } = await prisma.account.findUnique({
			select: {
				balance: true,
			},
			where: { account }
		}) || {}
		if (!balance) return // account not ours

		await prisma.account.update({
			select: null,
			data: {
				balance: `${BigInt(balance) + BigInt(amount)}`,
				blocks: {
					connectOrCreate: {
						create: {
							hash,
							amount,
							link,
							subtype,
							time: new Date(+time), // time is a timestamp string => Invalid Date
						},
						where: {
							hash,
						}
					}
				}
			},
			where: { account }
		})
	} else if (subtype == 'send') {
		await receiveBlock({
			account: link_as_account,
			amount,
			hash,
		}).catch(err => {
			if (!(err instanceof WalletError && err.code == 404)) throw err
		})
	}
})

addEventListener('message', ({ data }) => {
	if ('ack' in data) return console.log('Websocket ack received:', data)
	if ('error' in data) return console.error('WebSocket error message', data)
	if ('message' in data) handleMessage(data).catch(err => {
		console.error('Error handling socket message', err)
	})
})

type Receive = (params: {
	hash: string
	amount: string
	account: string
}, options?: {
	frontier?: string|null
	balance?: string
}) => Promise<{ hash: string }>

export const receiveBlock: Receive = createQueue(async ({ hash, account, amount }, options) => {
	console.log('received block', { hash, account, amount })

	if (BigInt(amount || 0) < BigInt(config.receiveMinimum))
		throw new WalletError(
			`Amount '${amount}' is less than received minumum '${config.receiveMinimum}' for ${hash}'`,
			'FORBIDDEN'
		)

	const result = await prisma.account.findUnique({
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
					id: true,
					representative: true,
				}
			},
		},
		where: { account }
	})
	if (!result) throw new WalletError('Account not found', 'NOT_FOUND')

	const seed = await fetchSeed(result.wallet.id)
	const { privateKey } = deriveAccount(seed, result.account_index)
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
	}, privateKey)
	console.log('receive block created', block)

	try {
		const res = await rpcSend<{ hash: string }>({
			action: 'process',
			json_block: 'true',
			subtype: 'receive',
			block,
		})
		console.log('receive process response', res)

		precomputeWork(account, res.hash)

		await prisma.block.upsert({
			select: null,
			where: { hash: res.hash },
			create: {
				hash: res.hash,
				amount,
				link: hash,
				subtype: 'receive',
				time: new Date(),
				account_id: account,
			},
			update: {},
		})

		return {
			hash: res.hash
		}
	} catch (err) {
		if (err instanceof Error && (
			err.message == 'Fork' ||
			err.message == 'Old block' ||
			err.message == 'Balance and amount delta do not match'
		)) {
			console.log(`RPC returned ${err.message} for ${hash}, this usually means the wallet is not synchronized with the network. Trying again using account_info to fetch the frontier...`)
			const { frontier, balance } = await accountInfo(account)
			return receiveBlock({ hash, account, amount }, { frontier, balance })
		} else throw err
	}
})
