import * as nano from 'nanocurrency-web'
import { PrismaClient } from '@prisma/client'
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto'
import config from '../config'
import { rpcSend } from '../rpc'
import { HttpError } from '../errors'
import { createQueue } from '../libs/queue'
import { accountInfo } from '../libs/accounts'
import { getWork, precomputeWork } from '../libs/work'

const prisma = new PrismaClient()

const unlockedWallets = new Map<string, string>()

export async function fetchSeed(wallet: string) {
	const unlockedSeed = unlockedWallets.get(wallet)
	if (unlockedSeed) return unlockedSeed

	const { seed, seed_iv } = await prisma.wallet.findUnique({
		select: {
			seed: true,
			seed_iv: true,
		},
		where: {
			id: wallet
		},
		rejectOnNotFound() {
			return new Error('Wallet not found')
		},
	})
	// If seed_iv is present it means the seed is actually the encrypted seed
	if (seed_iv) throw new Error('Wallet is encrypted')

	return seed
}

export async function updatePassword(wallet: string, password: string) {
	const seed = await fetchSeed(wallet)
	if (password == '') {
		await prisma.wallet.update({
			select: null,
			where: { id: wallet },
			data: {
				seed_iv: null,
				seed,
			}
		})
		return
	}

	const iv = randomBytes(16)
	const key = createHash('sha256').update(password).digest()
	const cipher = createCipheriv('aes256', key, iv)
	const encryptedSeed = cipher.update(seed, 'hex', 'base64') + cipher.final('base64')

	await prisma.wallet.update({
		select: null,
		where: { id: wallet },
		data: {
			seed_iv: iv.toString('base64'),
			seed: encryptedSeed,
		}
	})
}

export async function unlock(wallet: string, password: string) {
	const { seed, seed_iv } = await prisma.wallet.findUnique({
		select: {
			seed: true,
			seed_iv: true,
		},
		where: { id: wallet },
		rejectOnNotFound() {
			return new Error('Wallet not found')
		},
	})
	if (!seed_iv) throw new Error('Invalid password')

	const iv = Buffer.from(seed_iv, 'base64')
	const key = createHash('sha256').update(password).digest()
	const decipher = createDecipheriv('aes256', key, iv)

	const decryptedSeed = decipher.update(seed, 'base64', 'hex') + decipher.final('hex')
	unlockedWallets.set(wallet, decryptedSeed)
}

export async function lock(wallet: string) {
	if (!unlockedWallets.has(wallet)) throw new Error('Wallet is not locked')
	unlockedWallets.delete(wallet)
}

export async function isLocked(wallet: string): Promise<boolean> {
	if (unlockedWallets.has(wallet)) return true
	const { seed_iv } = await prisma.wallet.findUnique({
		select: {
			seed_iv: true,
		},
		where: {
			id: wallet,
		},
		rejectOnNotFound() {
			return new Error('Wallet not found')
		},
	})
	return !!seed_iv
}

export function deriveAccount(seed: string, index: number) {
	const [account] = nano.wallet.accounts(seed, index, index)
	if (!account) throw new Error('Account derivation returned null')
	return account
}

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

	if (BigInt(amount || 0) < BigInt(config.receiveMinimum))
		throw new Error(`Amount '${amount}' is less than received minumum '${config.receiveMinimum}' for ${hash}'`)

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
	if (!result) throw new HttpError('NOT_FOUND', 'Account not found')

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
		if (err instanceof Error && err.message == 'Fork') {
			console.log(`RPC returned 'Fork' for ${hash}, this usually means the wallet is not synchronized with the network. Trying again using account_info to fetch the frontier...`)
			const { frontier, balance } = await accountInfo(account)
			return receiveBlock({ hash, account, amount }, { frontier, balance })
		} else throw err
	}
})
