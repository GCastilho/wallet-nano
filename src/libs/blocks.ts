import { PrismaClient } from '@prisma/client'
import { addEventListener } from '../rpc'
import { receive } from '../actions/wallet'
import type { WebSocket } from '../rpc'

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
	} else if (subtype == 'send') {
		await receive({
			account: link_as_account,
			amount,
			hash,
		})
	}
}

/** enfileirar os handlers para prevenir race condition */
addEventListener('message', ({ data }) => {
	if ('ack' in data) return console.log('Websocket ack received:', data)
	if ('error' in data) return console.error('WebSocket error message', data)
	if ('message' in data) handleMessage(data).catch(err => {
		console.error('Error handling socket message', err)
	})
})
