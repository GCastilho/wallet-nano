import { addEventListener, send } from '../rpc'
import { PrismaClient } from '@prisma/client'
import * as nano from 'nanocurrency-web'
import type { WebSocket } from '../rpc.d'

const prisma = new PrismaClient()

// Atualizar rep da wallet a cada bloco?
async function handleMessage(data: WebSocket.Message) {
	const { time } = data
	const { hash, amount } = data.message
	const { account, subtype, link } = data.message.block

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
					create: {
						hash,
						amount,
						link,
						subtype,
						time,
					}
				}
			},
			where: { account }
		})
	} else if (subtype == 'send') {
		const result = await prisma.account.findUnique({
			select: {
				private_key: true,
				balance: true,
				wallet: {
					select: {
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
			where: { account: link }
		})
		if (!result) return

		const block = nano.block.receive({
			amountRaw: amount,
			toAddress: link,
			transactionHash: link,
			walletBalanceRaw: `${BigInt(amount) + BigInt(result.balance)}`,
			frontier: result.blocks[0]?.hash || '0'.repeat(64),
			representativeAddress: result.wallet.representative,
		}, result.private_key)

		await send({
			action: 'process',
			json_block: 'true',
			subtype: 'send',
			block,
		})
	}

	/**
	 * Se for receive, tem q salvar e atualizar o nosso websocket q ainda n existe
	 * Se for send, tem q criar um bloco de receive, SALVAR ELE, daí publicar
	 * Blocos poderiam ter um status 'não publicado' para poder lidar com isso
	 */
}

addEventListener('message', msg => {
	if ('ack' in msg) return console.log('Websocket ack received:', msg)
	if ('error' in msg) return console.error('WebSocket error message', msg)
	if ('message' in msg) handleMessage(msg).catch(err => {
		console.error('Error handling socket message', err)
	})
})