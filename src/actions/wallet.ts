import validate from '../validation'
import { randomBytes } from 'crypto'
import { wallet } from 'nanocurrency-web'
import { PrismaClient } from '@prisma/client'
import type { Schema } from '../validation'

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

const walletSchema: Schema<{ wallet: string }> = {
	type: 'object',
	properties: {
		wallet: {
			type: 'string',
			minLength: 36,
			maxLength: 36,
		}
	}
}

export async function walletDestroy(input: Record<string, unknown>) {
	const { wallet } = validate(walletSchema, input)

	const destroyed = await prisma.wallet.delete({
		select: null,
		where: {
			id: wallet,
		}
	}).then(() => '1')
		.catch(() => '0')

	return { destroyed }
}
