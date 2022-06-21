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

export namespace RPC {
	export type BlockInfo = {
		block_account: string
		amount: string
		balance: string
		height: string
		local_timestamp: string
		confirmed: string
		contents: {
			type: string
			account: string
			previous: string
			representative: string
			balance: string
			link: string
			link_as_account: string
			signature: string
			work: string
		}
		subtype: 'send'|'receive'|'change'|'epoch'
	}

	export type AccountInfo = {
		frontier: string
		open_block: string
		representative_block: string
		balance: string
		modified_timestamp: string
		block_count: string
		confirmation_height : string
		confirmation_height_frontier : string
		account_version: string
	}

	export type Pending = {
		blocks: string[]
	}
}
