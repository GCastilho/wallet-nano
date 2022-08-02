import { isLocked, lock, unlock, updatePassword } from '../libs/wallet'
import { passwordSchema, walletSchema } from '../models'

type Changed = {
	changed: '0'|'1'
	message?: unknown
}
export async function passwordChange(input: Record<string, unknown>): Promise<Changed> {
	const { wallet, password } = await passwordSchema.validate(input)
	try {
		await updatePassword(wallet, password)
		return { changed: '1' }
	} catch (err) {
		return { changed: '0', message: err instanceof Error ? err.message : err }
	}
}

type Valid = {
	valid: '0'|'1'
	message?: unknown
}
export async function passwordEnter(input: Record<string, unknown>): Promise<Valid> {
	const { wallet, password } = await passwordSchema.validate(input)
	try {
		await unlock(wallet, password)
		return { valid: '1' }
	} catch (err) {
		return { valid: '0', message: err instanceof Error ? err.message : err }
	}
}

type Locked = {
	locked: '0'|'1'
}
export async function walletLock(input: Record<string, unknown>): Promise<Locked> {
	const { wallet } = await walletSchema.validate(input)
	try {
		await lock(wallet)
		return { locked: '1' }
	} catch (err) {
		return { locked: '0' }
	}
}

export async function walletLocked(input: Record<string, unknown>): Promise<Locked> {
	const { wallet } = await walletSchema.validate(input)
	return await isLocked(wallet) ? {
		locked: '1'
	} : {
		locked: '0'
	}
}
