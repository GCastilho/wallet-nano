import config from '../config'
import { receiveMinimumSchema } from '../models'

export function receiveMinimum() {
	return {
		amount: config.receiveMinimum
	}
}

export function receiveMinimumSet(input: Record<string, unknown>) {
	const { amount } = receiveMinimumSchema.validate(input)
	config.receiveMinimum = amount
	return {
		success: ''
	}
}
