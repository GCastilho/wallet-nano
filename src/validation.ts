import { validate } from 'json-schema'
import { HttpError } from './errors'
import type { JSONSchema7 } from 'json-schema'

export interface Schema<
	P extends Record<string, any>,
> extends JSONSchema7 {
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

export default function<T = any>(
	schema: Schema<T>,
	input: Record<string, unknown>,
): T {
	const { valid, errors } = validate(input, schema)
	if (valid) return input as T
	throw new HttpError(
		'BAD_REQUEST',
		errors.map(v => `${v.property} ${v.message}.`).join(' '),
		'Validation Error',
	)
}
