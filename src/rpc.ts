import WS from 'ws'
import axios, { AxiosError } from 'axios'
import { StatusCodes } from 'http-status-codes'
import ReconnectingWebSocket from 'reconnecting-websocket'
import { HttpError } from './errors'
import type { WebSocket } from './rpc.d'
import type { WebSocketEventListenerMap, WebSocketEventMap } from 'reconnecting-websocket/dist/events'
export type { RPC, WebSocket } from './rpc.d'

const nanoRpcUrl = process.env.NANO_RPC_URL || 'http://127.0.0.1:55000'
const nanoSocketUrl = process.env.NANO_SOCKET_URL || 'ws://127.0.0.1:57000'

const ws = new ReconnectingWebSocket(nanoSocketUrl, [], {
	WebSocket: WS,
	startClosed: true,
	connectionTimeout: 10000,
	maxRetries: 100000,
	maxReconnectionDelay: 2000, // Wait max of 2 seconds before retrying
})

/** If ws connection is already closed */
let wasClosed = true

ws.addEventListener('open', () => {
	wasClosed = false
	console.log('Websocket connection open')
})

ws.addEventListener('close', () => {
	if (wasClosed) return
	wasClosed = true
	console.log('Websocket connection closed')
})

/** Open websocket connection */
export function open() {
	if (ws.readyState == ws.CLOSED) ws.reconnect()
}

/** Close websocket connection */
export const close = ws.close

interface Events extends WebSocketEventListenerMap {
	message: (event: MessageEvent<WebSocket.MessageEvent>) => void
}

/** Return JSON if valid JSON. Otherwise returns the original string */
function parseJsonOrReturn(input: string): Record<string, unknown>|string {
	try {
		return JSON.parse(input)
	} catch (e) {
		return input
	}
}

/**
 * Register an event handler of a specific event type
 * @returns Function to remove the listeners
 */
export function addEventListener<T extends keyof Events>(event: T, handler: Events[T]) {
	type Msg = WebSocketEventMap[keyof WebSocketEventMap]
	const eventHandler = (msg: Msg) => {
		if ('data' in msg) {
			const data = parseJsonOrReturn(msg.data)
			try {
				Object.defineProperty(msg, 'data', {
					get: () => data
				})
			// eslint-disable-next-line no-empty
			} catch (e) {}
		}
		// @ts-expect-error Probably an error with reconnecting-websocket types :(
		handler(msg)
	}

	const onOpen = () => ws.addEventListener(event, eventHandler)

	if (ws.readyState == ws.CLOSED && event == 'message' || event == 'error') {
		ws.addEventListener('open', onOpen)
	} else {
		ws.addEventListener(event, eventHandler)
	}

	return () => {
		ws.removeEventListener('open', onOpen)
		ws.removeEventListener(event, eventHandler)
	}
}

/** Send message do webscoekt */
export function wsSend(data: Record<string, unknown>) {
	console.log('wsSend', data)
	ws.send(JSON.stringify(data))
}

type Action = {
	action: string
	[key: string]: unknown
}
type JSON = Record<string, unknown>
export async function rpcSend<T = JSON, Input extends Action = Action>(data: Input): Promise<T> {
	try {
		const res = await axios.post(nanoRpcUrl, data)
		if (res.data.error) {
			const error = new Error(res.data.error)
			error.name = 'RpcError'
			throw error
		}
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
