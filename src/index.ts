import express from 'express'
import * as actions from './actions'

const {
	PORT = '3000',
} = process.env

const app = express()

app.use(express.json())

app.post('/', async (req, res) => {
	const { action, ...body } = req.body
	let handler: undefined|((body: unknown) => unknown|Promise<unknown>) = undefined

	switch (action) {
		case 'wallet_create': handler = actions.createWallet; break
	}

	if (handler) {
		res.status(200).send(await handler(body))
	} else {
		res.status(404).send('Method not found')
	}
})

app.listen(PORT, () => {
	console.log('Server is up on port', +PORT)
})
