import { PrismaClient } from '@prisma/client'
import { walletSchema } from '../models'
import { addEventListener, wsSend } from '../rpc'
import { deriveAccount, fetchSeed } from '../libs/wallet'

const prisma = new PrismaClient()

export async function accountCreate(input: Record<string, unknown>) {
	const { wallet } = walletSchema.validate(input)
	const seed = await fetchSeed(wallet)

	const {
		accounts,
	} = await prisma.wallet.findUnique({
		where: {
			id: wallet
		},
		select: {
			accounts: {
				orderBy: {
					account_index: 'desc'
				},
				take: 1
			},
		},
		rejectOnNotFound: true,
	})

	const account_idx = (accounts[0]?.account_index ?? -1) + 1
	const { accountIndex, address } = deriveAccount(seed, account_idx)

	await prisma.account.create({
		select: null,
		data: {
			account: address,
			account_index: accountIndex,
			wallet_id: wallet
		}
	})

	wsSend({
		action: 'update',
		topic: 'confirmation',
		options: {
			accounts: [address]
		},
	})

	return {
		account: address
	}
}

addEventListener('open', () => {
	prisma.account.findMany({
		select: {
			account: true,
		}
	}).then(accounts => {
		wsSend({
			action: 'subscribe',
			topic: 'confirmation',
			options: {
				accounts: accounts.map(v => v.account)
			}
		})
	}).catch(err => console.error('Error listening to accounts', err))
})
