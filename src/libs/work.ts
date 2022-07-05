import { prisma } from '../../prisma/client'
import * as nanocurrency from 'nanocurrency'
import { addEventListener } from '../rpc'

const works = new Map<string, Promise<string>>()

async function generateWork(account: string, hash: string|null) {
	const work = await nanocurrency.computeWork(
		hash || nanocurrency.derivePublicKey(account)
	)
	if (!work) throw new Error('Generated work is null')
	return work
}

async function computeWork(account: string, hash: string|null) {
	const workPromise = generateWork(account, hash)
	works.set(account, workPromise)
	try {
		return await workPromise
	} finally {
		works.delete(account)
	}
}

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

	const computingWork = works.get(account)
	if (computingWork) return computingWork

	return computeWork(account, frontier)
}

export function precomputeWork(account: string, hash: string) {
	console.log('precomputeWork requested', account, hash)
	const workRequest = computeWork(account, hash)
	workRequest.then(work => {
		console.log('work precomputed', account, hash, work)
		return prisma.work.upsert({
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
	}).catch(err => console.error('Error processing requested work', err))
}

addEventListener('message', ({ data }) => {
	if ('message' in data && data.message.block.subtype == 'receive') {
		const { account, hash } = data.message
		precomputeWork(account, hash)
	}
})
