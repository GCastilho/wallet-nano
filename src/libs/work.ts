import { prisma } from '../../prisma/client'
import * as nanocurrency from 'nanocurrency'
import { addEventListener } from '../rpc'
import type { WebSocket } from '../rpc'

export async function getWork(account: string, frontier: string|null) {
	const { work } = await prisma.work.findFirst({
		select: {
			work: true
		},
		where: {
			address: account,
			hash: frontier || '',
		}
	}) || {}
	if (work) return work
	return generateWork(account, frontier)
}

async function generateWork(account: string, frontier: string|null) {
	const work = await nanocurrency.computeWork(
		frontier || nanocurrency.derivePublicKey(account)
	)
	if (!work) throw new Error('Generated work is null')
	return work
}

async function precomputeWork({ message: { account, hash }}: WebSocket.Message) {
	const work = await generateWork(account, hash)
	await prisma.work.upsert({
		select: null,
		where: {
			address: account
		},
		create: {
			address: account,
			hash: hash,
			work,
		},
		update: {
			hash: hash,
			work,
		}
	})
	console.log('Pre-computed work for', account, 'with hash', hash)
}

addEventListener('message', ({ data }) => {
	if ('message' in data) {
		precomputeWork(data).catch(err => console.error('Error precomputing work', err))
	}
})
