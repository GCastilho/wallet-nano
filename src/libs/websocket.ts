import { WebSocket } from 'ws'
import { randomBytes } from 'crypto'
import { addEventListener, wsSend, isOpen } from '../rpc'

/** Connected sockets */
const sockets = new Set<WebSocket>()

/** Messages waiting for acknowledgement */
const messages = new class {
	private map: Map<string, [WebSocket, string]> = new Map()
	private timers: Map<string, NodeJS.Timer> = new Map()

	public add(socket: WebSocket, receivedId: string): string {
		let id = ''
		do {
			id = randomBytes(16).toString('base64')
		} while (this.map.has(id))
		this.map.set(id, [socket, receivedId])

		/** Drop ack from the message queue after a timer */
		const addDropTimeout = () => {
			this.timers.set(id, setTimeout(() => {
				this.map.delete(id)
				this.timers.delete(id)
			}, 10 * 60 * 60 * 1000))
		}
		if (isOpen()) {
			addDropTimeout()
		} else {
			addEventListener('open', () => {
				if (this.map.has(id)) addDropTimeout()
			})
		}

		return id
	}

	public get(id: string, callback: (socket: WebSocket, receivedId: string) => void): void {
		const stored = this.map.get(id)
		clearTimeout(this.timers.get(id))
		this.timers.delete(id)
		this.map.delete(id)
		if (stored) callback(...stored)
	}
}

export default function onConnection(socket: WebSocket) {
	sockets.add(socket)
	socket.on('close', () => sockets.delete(socket))

	socket.on('message', rawData => {
		const data: Record<string, unknown> = JSON.parse(rawData.toString('utf8'))
		const receivedId = typeof data.id == 'string' ? data.id : ''

		if (data.action === 'update' && data.topic === 'confirmation') {
			// @ts-expect-error Needed for NanoRPCProxy support
			data.options.accounts = data.options.accounts_add
		}

		const id = messages.add(socket, receivedId)

		wsSend({ ...data, id })
	})
}

addEventListener('message', event => {
	const { data } = event
	if ('ack' in data) {
		messages.get(data.id, (socket, id) => {
			socket.send(JSON.stringify({ ...data, id }))
		})
	} else {
		sockets.forEach(socket => socket.send(JSON.stringify(data)))
	}
})
