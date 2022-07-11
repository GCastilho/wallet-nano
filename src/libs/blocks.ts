import { PrismaClient } from '@prisma/client'
import { HttpError } from '../errors'
import { receiveBlock } from './wallet'
import { addEventListener } from '../rpc'
import type { WebSocket } from '../rpc'

const prisma = new PrismaClient()

// TODO: Atualizar rep da wallet a cada bloco?
async function handleMessage(data: WebSocket.Message) {
	console.log('handleMessage', data)
	const { time } = data
	const { hash, amount } = data.message
	const { account, subtype, link, link_as_account } = data.message.block

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
						time: new Date(+time), // time is a timestamp string => Invalid Date
					}
				}
			},
			where: { account }
		})
	} else if (subtype == 'send') {
		await receiveBlock({
			account: link_as_account,
			amount,
			hash,
		}).catch(err => {
			if (!(err instanceof HttpError && err.code == 404)) throw err
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
