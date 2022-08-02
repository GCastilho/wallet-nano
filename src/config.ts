import fs from 'fs'
import path from 'path'

const defaultConfig = {
	receiveMinimum: '1000000000000000000000000',
	customHeaders: {} as Record<string, string | number | boolean>,
	workerPoolSize: -1,
	accountsWithReservedWorker: [] as string[],
}

let customConfig: typeof defaultConfig|undefined = undefined
const filePath = path.join(__dirname, '../config.json')
if (fs.existsSync(filePath)) {
	customConfig = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
} else {
	fs.writeFileSync(filePath, JSON.stringify(defaultConfig, null, 2))
}

const config: typeof defaultConfig = Object.assign({}, defaultConfig, customConfig)

export default config
