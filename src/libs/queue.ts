import EventEmitter from 'events'

async function processQueue<P extends [...unknown[]]>(
	queue: EventEmitter,
	callback: (...args: [...P]) => void,
) {
	try {
		for await (const item of EventEmitter.on(queue, 'call')) {
			callback(...item)
		}
	} catch (err) {
		console.error('Error observed while processing queue:', err)
	}
}

/**
 * Create a queue, where the calls to the callback are queued and executed in
 * order, preventing it from being called while the previous call is still
 * executing
 * @param ack The value to return from the invocation to signal acknowledgement
 * @param callback The fn to be executed in queue
 */
function createQueue<R, P extends [...unknown[]]>(
	ack: R | ((...args: [...P]) => R|Promise<R>),
	callback: (...args: [...P]) => void,
) {
	const queue = new EventEmitter()

	processQueue(queue, callback)

	return async function handler(...args: [...P]): Promise<R> {
		const response = ack instanceof Function ? await ack(...args) : ack
		queue.emit('call', ...args)
		return response
	}
}

export default createQueue
