/* eslint-disable @typescript-eslint/no-var-requires */

const { computeWork } = require('nanocurrency')
const { parentPort } = require('worker_threads')

class WorkerError extends Error {
	/**
	 * @param {string} message Error message
	 * @param {string} blockHash Blockhash being processed
	 */
	constructor(message, blockHash) {
		super(message)
		this.name = 'WorkerError'
		this.blockHash = blockHash
	}
}

parentPort?.on('message', async blockHash => {
	try {
		const work = await computeWork(blockHash)
		if (!work) return parentPort?.postMessage(new WorkerError('Work is null', blockHash))
		parentPort?.postMessage({
			blockHash,
			work,
		})
	} catch (err) {
		parentPort?.postMessage(
			Object.assign(new WorkerError(), err, { blockHash })
		)
	}
})
