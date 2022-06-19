import express from 'express'
import { AssertionError } from 'assert'
import { getReasonPhrase } from 'http-status-codes'
import { open } from './rpc'
import { HttpError } from './errors'
import * as actions from './actions'
import type { Request, Response, NextFunction } from 'express'

const {
	PORT = '3000',
} = process.env

const app = express()

app.use(express.json())

app.post('/', async (req, res, next) => {
	try {
		const { action, ...body } = req.body
		type JSON = Record<string, unknown>
		let handler: undefined|((body: JSON) => JSON|Promise<JSON>) = undefined

		switch (action) {
			case 'account_create': handler = actions.accountCreate; break
			case 'wallet_create': handler = actions.walletCreate; break
			case 'wallet_destroy': handler = actions.walletDestroy; break
		}

		if (handler) {
			const data = await handler(body)
			res.status(200).send(data)
		} else {
			res.status(404).send({ error: 'Method not found' })
		}
	} catch (err) {
		next(err)
	}
})

type ApiErrors = HttpError|AssertionError|unknown
app.use((
	err: ApiErrors,
	_req: Request,
	res: Response,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_next: NextFunction,
) => {
	if (err instanceof HttpError) {
		res.status(err.code).send({
			error: err.reason,
			message: err.message
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

app.listen(PORT, () => {
	console.log('Server is up on port', +PORT)
	open()
})
