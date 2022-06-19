import { validate } from 'json-schema'
import { HttpError } from './errors'
import type { JSONSchema7, JSONSchema7Definition } from 'json-schema'

export interface Schema<P> extends JSONSchema7 {
	type:
		P extends string ? 'string' :
			P extends number ? ('number'|'integer') :
				P extends boolean ? 'boolean' :
					P extends Array<unknown> ? 'array' :
						P extends null ? 'null' :
							'object'
	properties?: {
		[K in keyof P]: Schema<P[K]>
	}
}

type InferType<P extends JSONSchema7Definition> =
	P extends JSONSchema7 ?
		P['type'] extends 'string' ? string :
			P['type'] extends ('number'|'integer') ? number :
				P['type'] extends 'boolean' ? boolean :
					P['type'] extends 'null' ? null :
						{
							[K in keyof NonNullable<P['properties']>]:
								InferType<NonNullable<P['properties']>[K]>
						}
	: boolean

class Validator<T extends Schema<any>> {
	constructor(private schema: T) {}

	validate(data: any): InferType<T> {
		const { valid, errors } = validate(this.schema, data)
		if (valid) return data
		throw new HttpError(
			'BAD_REQUEST',
			errors.map(v => `${v.property} ${v.message}.`).join(' '),
			'Validation Error',
		)
	}
}

export const walletSchema = new Validator({
	type: 'object',
	properties: {
		wallet: {
			type: 'string',
			minLength: 36,
			maxLength: 36,
		},
	}
})