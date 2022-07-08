import * as nano from 'nanocurrency-web'
import { PrismaClient } from '@prisma/client'
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
}) => Promise<{ hash: string }>

export const receiveBlock: Receive = createQueue(async ({ hash, account, amount }) => {
	console.log('received block', { hash, account, amount })

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
	if (!result) throw new HttpError('UNPROCESSABLE_ENTITY', 'Account not found')

	const { frontier, balance } = await accountInfo(account)
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

	// TODO: Se falhar com o code certo, usar o account_info p/ pegar balance e frontier e tentar de novo
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
})
