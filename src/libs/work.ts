import os from 'os'
import { PrismaClient } from '@prisma/client'
import { StaticPool } from 'node-worker-threads-pool'
import config from '../config'
import * as nanocurrency from 'nanocurrency'

const prisma = new PrismaClient()

const workPromises = new Map<string, Promise<string>>()

const pool = new class Pool {
	private pool: StaticPool<typeof nanocurrency.computeWork>

	private reservedPool?: typeof this.pool

	constructor() {
		function task(account: string) {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const { computeWork } = require('nanocurrency')
			return computeWork(account)
		}

		this.pool = new StaticPool({
			size: config.workerPoolSize <= 0 ? os.cpus().length : config.workerPoolSize,
			task,
		})

		const reservedPoolSize = config.accountsWithReservedWorker.length
		if (reservedPoolSize > 0) {
			this.reservedPool = new StaticPool({
				size: reservedPoolSize,
				task,
			})
		}
	}

	getPool(account: string) {
		return !this.reservedPool || !config.accountsWithReservedWorker.includes(account)
			? this.pool
			: this.reservedPool
	}
}

async function generateWork(account: string, hash: string|null|undefined) {
	const hashMessage = hash || nanocurrency.derivePublicKey(account)
	const work = await pool.getPool(account).exec(hashMessage)
	if (!work) throw new Error('Work is null')
	return work
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
