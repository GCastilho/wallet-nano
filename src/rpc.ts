import WS from 'ws'
import axios, { AxiosError } from 'axios'
import { StatusCodes } from 'http-status-codes'
import ReconnectingWebSocket from 'reconnecting-websocket'
import { HttpError } from './errors'
import type { WebSocket } from './rpc.d'
import type { WebSocketEventListenerMap } from 'reconnecting-websocket/dist/events'

const nanoRpcUrl = process.env.NANO_RPC_URL || 'http://127.0.0.1:55000'
const nanoSocketUrl = process.env.NANO_SOCKET_URL || 'ws://127.0.0.1:57000'

const ws = new ReconnectingWebSocket(nanoSocketUrl, [], {
	WebSocket: WS,
	startClosed: true,
	connectionTimeout: 10000,
	maxRetries: 100000,
	maxReconnectionDelay: 2000, // Wait max of 2 seconds before retrying
})

ws.addEventListener('open', () => {
	console.log('Websocket connection open')
})

ws.addEventListener('close', () => {
	console.log('Websocket connection closed')
})

/** Open websocket connection */
export function open() {
	if (ws.readyState == ws.CLOSED) ws.reconnect()
}

/** Close websocket connection */
export const close = ws.close

type Events = WebSocketEventListenerMap & {
	message: (listener: WebSocket.MessageEvent) => void
}

/** Register an event handler of a specific event type */
export function addEventListener<T extends keyof Events>(event: T, handler: Events[T]) {
	return ws.addEventListener(event, handler)
}

/** Send message do webscoekt */
export function wsSend(data: Record<string, unknown>) {
	ws.send(JSON.stringify(data))
}

type JSON = Record<string, unknown>
export async function send<T = JSON>(data: JSON): Promise<T> {
	try {
		const res = await axios.post(nanoRpcUrl, data)
		if (res.data.error) throw res.data.error
		return res.data
	} catch (err) {
		if (err instanceof AxiosError) {
			const reason = StatusCodes[err.response?.status as number] || 'INTERNAL_SERVER_ERROR'
			throw new HttpError(reason as keyof typeof StatusCodes, err.message, err.name)
		} else {
			throw err
		}
	}
}
