import express from 'express'
import { AssertionError } from 'assert'
import * as actions from './actions'
import { HttpError } from './errors'
import { getReasonPhrase } from 'http-status-codes'
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
			case 'wallet_create': handler = actions.walletCreate; break
			case 'wallet_destroy': handler = actions.walletDestroy; break
		}

		if (handler) {
			res.status(200).send(await handler(body))
		} else {
			res.status(404).send('Method not found')
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
})
