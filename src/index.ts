import express from 'express'

const {
	PORT = '3000',
} = process.env

const app = express()

app.get('/', (_, res) => {
	res.send({ hello: 'world' })
})

app.listen(PORT, () => {
	console.log('Server is up on port', +PORT)
})
