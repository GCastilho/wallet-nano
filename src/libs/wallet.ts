import * as nano from 'nanocurrency-web'
import { PrismaClient } from '@prisma/client'
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto'

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
