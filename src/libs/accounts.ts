import { rpcSend } from '../rpc'
import type { RPC } from '../rpc'

export async function accountInfo(account: string) {
	try {
		return await rpcSend<RPC.AccountInfo>({
			action: 'account_info',
			account,
		})
	} catch (err) {
		if (err instanceof Error && err.message == 'Account not found') return {
			frontier: null,
			balance: '0'
		}
		else throw err
	}
}
