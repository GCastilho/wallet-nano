import { randomBytes } from 'crypto'
import { wallet } from 'nanocurrency-web'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function createWallet() {
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
