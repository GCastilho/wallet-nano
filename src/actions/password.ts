import { isLocked, lock, unlock, updatePassword } from '../libs/wallet'
import { passwordSchema, walletSchema } from '../models'

/**
 * TODO: Colocar um 'message' com o motivo de o valid/change ter sido 0
 * TODO: Ao receber, não dar erro por causa da wallet estar locked
 */

type Changed = {
	changed: '0'|'1'
}
export async function passwordChanged(input: Record<string, unknown>): Promise<Changed> {
	const { wallet, password } = passwordSchema.validate(input)
	try {
		await updatePassword(wallet, password)
		return { changed: '1' }
	} catch (err) {
		return { changed: '0' }
	}
}

type Valid = {
	valid: '0'|'1'
}
export async function passwordEnter(input: Record<string, unknown>): Promise<Valid> {
	const { wallet, password } = passwordSchema.validate(input)
	try {
		await unlock(wallet, password)
		return { valid: '1' }
	} catch (err) {
		return { valid: '0' }
	}
}

type Locked = {
	locked: '0'|'1'
}
export async function walletLock(input: Record<string, unknown>): Promise<Locked> {
	const { wallet } = walletSchema.validate(input)
	try {
		await lock(wallet)
		return { locked: '1' }
	} catch (err) {
		return { locked: '0' }
	}
}

export async function walletLocked(input: Record<string, unknown>): Promise<Locked> {
	const { wallet } = walletSchema.validate(input)
	return await isLocked(wallet) ? {
		locked: '1'
	} : {
		locked: '0'
	}
}