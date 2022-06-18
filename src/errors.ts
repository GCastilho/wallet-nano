import { StatusCodes, getReasonPhrase } from 'http-status-codes'

type HttpStatus = keyof typeof StatusCodes

export class HttpError extends Error {
	/** Código HTTP do erro */
	public readonly code: number

	/** Razão desse erro ter ocorrido */
	public readonly reason: string

	constructor(code: HttpStatus, message: string, reason?: string) {
		super(message)
		this.name = 'HTTPError'
		this.code = StatusCodes[code]
		this.reason = reason || getReasonPhrase(this.code)
	}
}

