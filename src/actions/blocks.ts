import { addEventListener, send } from '../rpc'
import { PrismaClient } from '@prisma/client'
import * as nano from 'nanocurrency-web'
import type { WebSocket } from '../rpc.d'

const prisma = new PrismaClient()

// Atualizar rep da wallet a cada bloco?
async function handleMessage(data: WebSocket.Message) {
	const { time } = data
	const { hash, amount } = data.message
	const { account, subtype, link, link_as_account } = data.message.block
	console.log('handleMessage', data)

	if (subtype == 'receive') {
		const { balance } = await prisma.account.findUnique({
			select: {
				balance: true,
			},
			where: { account }
		}) || {}
		console.log('receive', balance)
		if (!balance) return // account not ours

		await prisma.account.update({
			select: null,
			data: {
				balance: `${BigInt(balance) + BigInt(amount)}`,
				blocks: {
					create: {
						hash,
						amount,
						link, // Talvez seja hash
						subtype,
						time: new Date(+time), // time is a timestamp string => Invalid Date
					}
				}
			},
			where: { account }
		})
		console.log('done')
	} else if (subtype == 'send') {
		const result = await prisma.account.findUnique({
			select: {
				private_key: true,
				balance: true,
				wallet: {
					select: {
						seed: true, // remove
						representative: true,
					}
				},
				blocks: {
					select: {
						hash: true
					},
					orderBy: {
						created_at: 'desc'
					},
					take: 1,
				},
			},
			where: { account: link_as_account }
		})
		console.log('send', result)
		if (!result) return

		const block = nano.block.receive({
			amountRaw: amount,
			toAddress: link_as_account,
			transactionHash: hash,
			walletBalanceRaw: result.balance,
			frontier: result.blocks[0]?.hash || '0'.repeat(64),
			representativeAddress: result.wallet.representative,
		}, result.private_key)

		/**
		 * if this is the first block (legacy open block), you don't generate a PoW
		 * against 0...0, but against the account's public key. And, for all
		 * subsequent blocks, against the previous block hash
		 */
		console.log('block', block)

		const res = await send({
			action: 'process',
			json_block: 'true',
			subtype: 'receive',
			block,
		})
		console.log('res', res)
	}

	/**
	 * Se for receive, tem q salvar e atualizar o nosso websocket q ainda n existe
	 * Se for send, tem q criar um bloco de receive, SALVAR ELE, daí publicar
	 * Blocos poderiam ter um status 'não publicado' para poder lidar com isso
	 */
}

addEventListener('message', ({ data }) => {
	if ('ack' in data) return console.log('Websocket ack received:', data)
	if ('error' in data) return console.error('WebSocket error message', data)
	if ('message' in data) handleMessage(data).catch(err => {
		console.error('Error handling socket message', err)
	})
})
