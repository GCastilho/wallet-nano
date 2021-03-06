import EventEmitter from 'events'

async function processQueue(queue: EventEmitter) {
	for await (const [callback] of EventEmitter.on(queue, 'call')) {
		callback()
	}
}

/**
 * Creates a queue, where the calls to the handler are queued and executed in
 * order, preventing it from being called while the previous call is still
 * executing
 * @param handler The fn to be executed in queue
 * @returns A function that will call 'handler' in a queue
 */
export function createQueue<T extends [...unknown[]], R>(
	handler: (...args: [...T]) => Promise<R>
): (...args: [...T]) => Promise<R> {
	const queue = new EventEmitter()

	processQueue(queue)

	return function(...value) {
		return new Promise<R>((resolve, reject) => {
			queue.emit('call', () => {
				handler(...value).then(resolve).catch(reject)
			})
		})
	}
}

/**
 * Creates an 'ack' queue, that differs from a normal queue by resolving
 * immediately with the 'ack' value (or it's return) instead of awaiting for the
 * handler's return
 * @param ack The value to return from the invocation to signal acknowledgement
 * @param handler The fn to be executed in queue
 */
export function createAckQueue<R, P extends [...unknown[]]>(
	ack: R | ((...args: [...P]) => R|Promise<R>),
	handler: (...args: [...P]) => Promise<void>
): (...value: P) => Promise<R> {
	const queue = createQueue(handler)

	return async function(...value) {
		const response = ack instanceof Function ? await ack(...value) : ack
		queue(...value).catch(err => console.error('Error on createAckQueue', err))
		return response
	}
}
