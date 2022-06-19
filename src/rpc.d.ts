export namespace WebSocket {
	type Ack = {
		ack: string
		time: string
		id: string
	}

	type ErrorMessage = {
		error: string
	}

	type Message = {
		topic: string
		time: string
		message: {
			account: string
			amount: string
			hash: string
			confirmation_type: string
			election_info: {
				duration: string
				time: string
				tally: string
				request_count: string
				blocks: string
				voters : string
			}
			block: {
				type: string
				account: string
				previous: string
				representative: string
				balance: string
				link: string
				link_as_account: string
				signature: string
				work: string
				subtype: string
			}
		}
	}

	export type MessageEvent = Ack | ErrorMessage | Message
}
