import { object, string } from 'yup'

export const walletSchema = object().shape({
	wallet: string().required().length(36)
})

const accountSchema = string().required().length(65)

export const sendSchema = object().shape({
	id: string(),
	wallet: walletSchema.fields.wallet,
	source: accountSchema,
	destination: accountSchema,
	amount: string().required(),
})

export const receiveSchema = object().shape({
	wallet: walletSchema.fields.wallet,
	account: accountSchema,
	block: string().required().length(64),
})

export const workerWorkSchema = object().shape({
	blockHash: string().required().length(64),
	work: string().required()
})

export const receiveMinimumSchema = object().shape({
	amount: string().required(),
})

export const passwordSchema = object().shape({
	wallet: walletSchema.fields.wallet,
	password: string().required(),
})
