import assert from 'assert'
import { HttpError } from '../errors'
import { walletSchema } from '../models'
import { PrismaClient } from '@prisma/client'
import * as nano from 'nanocurrency-web'
import { addEventListener, wsSend } from '../rpc'

const prisma = new PrismaClient()

export async function accountCreate(input: Record<string, unknown>) {
	const { wallet } = walletSchema.validate(input)

	const {
		seed,
		accounts,
	} = await prisma.wallet.findUnique({
		where: {
			id: wallet
		},
		select: {
			seed: true,
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
	const [account] = nano.wallet.accounts(seed, account_idx, account_idx)
	assert(
		typeof account == 'object',
		new HttpError('INTERNAL_SERVER_ERROR', 'An account created was missing')
	)
	const { accountIndex, address, privateKey } = account

	await prisma.account.create({
		select: null,
		data: {
			account: address,
			account_index: accountIndex,
			private_key: privateKey,
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
