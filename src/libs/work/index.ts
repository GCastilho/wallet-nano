import { join } from 'path'
import { Worker } from 'worker_threads'
import { prisma } from '../../../prisma/client'
import * as nanocurrency from 'nanocurrency'
import { addEventListener } from '../../rpc'
import { workerWorkSchema } from '../../models'

const worker = new Worker(join(__dirname, './worker.js'))

const workPromises = new Map<string, Promise<string>>()

function generateWork(account: string, hash: string|null) {
	return new Promise<string>((resolve, reject) => {
		worker.postMessage(hash || nanocurrency.derivePublicKey(account))
		const handler = (message: unknown) => {
			// @ts-expect-error A classe é definida no .js do worker
			if (message instanceof Error && message['blockHash'] == hash) {
				worker.off('message', handler)
				return reject(message)
			}
			try {
				const { blockHash, work } = workerWorkSchema.validate(message)
				if (blockHash != hash) return // Not the message we sent
				resolve(work)
			} catch (err) {
				reject(err)
			}
			worker.off('message', handler)
		}
		worker.on('message', handler)
	})
}

async function computeWork(account: string, hash: string|null) {
	const workPromise = generateWork(account, hash)
	workPromises.set(account, workPromise)
	try {
		return await workPromise
	} finally {
		workPromises.delete(account)
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

	const computingWork = workPromises.get(account)
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