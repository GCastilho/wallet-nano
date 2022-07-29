import express from 'express'
import { WebSocketServer } from 'ws'
import { AssertionError } from 'assert'
import { getReasonPhrase } from 'http-status-codes'
import { open, rpcSend } from './rpc'
import { WalletError } from './models'
import * as actions from './actions'
import onConnection from './libs/websocket'
import type { Request, Response, NextFunction } from 'express'

const {
	RPC_PORT = '45000',
	WEBSOCKET_PORT = '47000',
} = process.env

const app = express()

app.use(express.json())

app.post('/', async (req, res, next) => {
	try {
		const { action, ...body } = req.body
		type JSON = Record<string, unknown>
		let handler: undefined|((body: JSON) => JSON|Promise<JSON>) = undefined

		switch (action) {
			case 'send': handler = actions.send; break
			case 'account_create': handler = actions.accountCreate; break
			case 'search_pending': handler = actions.searchPending; break
			case 'wallet_create': handler = actions.walletCreate; break
			case 'wallet_destroy': handler = actions.walletDestroy; break
			case 'search_missing': handler = actions.searchMissing; break
			case 'receive': handler = actions.receive; break
			case 'receive_all': handler = actions.searchPending; break
			case 'wallet_lock': handler = actions.walletLock; break
			case 'password_enter': handler = actions.passwordEnter; break
			case 'password_change': handler = actions.passwordChanged; break
			case 'wallet_locked': handler = actions.walletLocked; break
			case 'receive_minimum': handler = actions.receiveMinimum; break
			case 'receive_minimum_set': handler = actions.receiveMinimumSet; break
			default: handler = () => rpcSend({ action, ...body }); break
		}

		if (handler) {
			const data = await handler(body)
			res.status(200).send(data)
		} else {
			throw new WalletError('Method not found', 'NOT_FOUND')
		}
	} catch (err) {
		next(err)
	}
})

type ApiErrors = AssertionError|unknown;
app.use((
	err: ApiErrors,
	_req: Request,
	res: Response,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_next: NextFunction,
) => {
	if (err instanceof WalletError) {
		res.status(err.code).send({
			error: err.reason,
			message: err.message,
		})
	} else if (err instanceof Error && err.name == 'RpcError') {
		// 200 is send to keep compatibility with NANO Node wallet
		res.status(200).send({
			error: err.message,
		})
	} else if (err instanceof AssertionError) {
		res.status(400).send({
			error: err.name,
			message: err.message
		})
	} else if (err instanceof Error && err.name == 'NotFoundError') {
		res.status(404).send({
			error: getReasonPhrase(404),
			message: err.message
		})
	} else {
		res.status(500).send({
			error: getReasonPhrase(500),
			message: err instanceof Error ? err.message : getReasonPhrase(500)
		})
		console.error('Internal Server Error:', err)
	}
})

app.listen(RPC_PORT, () => {
	console.log('Server is up on port', +RPC_PORT)
	open()
})

const wss = new WebSocketServer({
	port: +WEBSOCKET_PORT,
})

wss.on('listening', () => {
	console.log('Websocket is listening on port', +WEBSOCKET_PORT)
})

wss.on('error', err => {
	console.error('Websocket server error:', err)
})

wss.on('connection', onConnection)
