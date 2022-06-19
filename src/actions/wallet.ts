import { randomBytes } from 'crypto'
import { wallet } from 'nanocurrency-web'
import { PrismaClient } from '@prisma/client'
import { walletSchema } from '../models'
import { wsSend } from '../rpc'

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
