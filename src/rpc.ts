import WS from 'ws'
import ReconnectingWebSocket from 'reconnecting-websocket'

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
export const open = ws.reconnect

/** Close websocket connection */
export const close = ws.close

/** Register an event handler of a specific event type */
export const addEventListener = ws.addEventListener

/** Send message do webscoekt */
export function send(data: Record<string, unknown>) {
	ws.send(JSON.stringify(data))
}
