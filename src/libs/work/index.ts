import { join } from 'path'
import { Worker } from 'worker_threads'
import { PrismaClient } from '@prisma/client'
import { workerWorkSchema } from '../../models'
import * as nanocurrency from 'nanocurrency'

const prisma = new PrismaClient()

const worker = new Worker(join(__dirname, './worker.js'))

const workPromises = new Map<string, Promise<string>>()

function generateWork(account: string, hash: string|null|undefined) {
	return new Promise<string>((resolve, reject) => {
		const hashMessage = hash || nanocurrency.derivePublicKey(account)
		worker.postMessage(hashMessage)
		const handler = (message: unknown) => {
			// @ts-expect-error A classe é definida no .js do worker
			if (message instanceof Error && message['blockHash'] == hash) {
				worker.off('message', handler)
				return reject(message)
			}
			try {
				const { blockHash, work } = workerWorkSchema.validate(message)
				if (blockHash != hashMessage) return // Not the message we sent
				resolve(work)
			} catch (err) {
				reject(err)
			}
			worker.off('message', handler)
		}
		worker.on('message', handler)
	})
}

async function computeWork(account: string, hash: string|null|undefined) {
	const workPromise = generateWork(account, hash)
	workPromises.set(account, workPromise)
	try {
		return await workPromise
	} finally {
		workPromises.delete(account)
	}
}

export async function getWork(account: string, frontier: string|null|undefined) {
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
