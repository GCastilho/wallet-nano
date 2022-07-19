import config from '../config'
import { receiveMinimumSchema } from '../models'

export function receiveMinimum() {
	return {
		amount: config.receiveMinimum
	}
}

export async function receiveMinimumSet(input: Record<string, unknown>) {
	const { amount } = await receiveMinimumSchema.validate(input)
	config.receiveMinimum = amount
	return {
		success: ''
	}
}
