// Offline render harness for the browser half: load it through a fake
// __ModuleLoader__, register into a fake slots context, then walk the element
// tree the page component returns.
import { readFileSync } from 'node:fs'

let captured
globalThis.window = {
	__ModuleLoader__: { load: (spec) => { captured = spec } },
	setInterval: () => 0,
	clearInterval: () => {},
}
globalThis.document = { documentElement: { lang: 'zh-CN' } }

const src = readFileSync('F:/Code/Ai/temp/R4 Coder Provider/lib/client.js', 'utf8')
eval(src)
console.log('module id:', captured.id)

const readyData = {
	ok: true,
	fetchedAt: '2026-09-28T09:30:15.000Z',
	keySource: 'credential:R4_CODES_API_KEY',
	baseURL: 'https://api.r4.codes',
	zone: 'Asia/Shanghai',
	meta: {
		key: { name: '冯彬', start: 'coder_eXJBiRHc' },
		plan: {
			package_name: 'Code Pro +1',
			remaining_usd: '68.789160',
			total_usd: '120.000000',
			max_concurrency: 6,
			expires_at: '2026-10-15T18:02:54.403Z',
			grant_count: 2,
			grants: [
				{ package_name: 'Code Pro', remaining_usd: '68.789160', total_usd: '120.000000', expires_at: '2026-10-15T18:02:54.403Z' },
				{ package_name: 'Free', remaining_usd: '0.000000', total_usd: '0.000000', expires_at: '2093-03-29T07:43:43.028Z' },
			],
		},
		wallet: { balance_usd: '5.000000', max_concurrency: 5 },
	},
	usage: {
		day: '2026-09-28',
		today: {
			request_count: 1052,
			charged_usd_total: '3.359661',
			prompt_tokens_total: 147917420,
			completion_tokens_total: 1053376,
			cache_read_tokens_total: 143934336,
		},
		series: [
			{ bucket: '2026-09-22', request_count: 2579, charged_usd_total: '5.693934' },
			{ bucket: '2026-09-23', request_count: 2463, charged_usd_total: '9.609849' },
			{ bucket: '2026-09-24', request_count: 925, charged_usd_total: '3.636378' },
			{ bucket: '2026-09-25', request_count: 498, charged_usd_total: '1.059885' },
			{ bucket: '2026-09-26', request_count: 367, charged_usd_total: '0.770065' },
			{ bucket: '2026-09-27', request_count: 0, charged_usd_total: '0' },
			{ bucket: '2026-09-28', request_count: 1052, charged_usd_total: '3.359661' },
		],
		models: [
			{ model_slug: 'deepseek-v4.1-flash', model_display_name: 'DeepSeek V4.1 Flash', points: [{ bucket: '2026-09-27', charged_usd_total: '1.1' }, { bucket: '2026-09-28', charged_usd_total: '3.0' }] },
			{ model_slug: 'glm-5.3-flash', model_display_name: 'GLM 5.3 Flash', points: [{ bucket: '2026-09-27', charged_usd_total: '0.2' }, { bucket: '2026-09-28', charged_usd_total: '0.3' }] },
		],
	},
}

let stateIndex = 0
let presetStates = [{ status: 'ready', data: readyData, error: undefined }]

const reactStub = {
	createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
	useState: () => {
		const value = presetStates[stateIndex++]
		return [value, () => {}]
	},
	useEffect: () => {},
	useCallback: (fn) => fn,
	useMemo: (fn) => fn(),
	useRef: (initial) => ({ current: initial }),
}

const mod = captured.factory((name) => {
	if (name === 'react') return reactStub
	throw new Error('unexpected require: ' + name)
})
console.log('exports:', Object.keys(mod).join(','), '| inject:', JSON.stringify(mod.inject))

let registration
const ctx = {
	slots: {
		inject: (slot, factory) => {
			console.log('slots.inject:', slot)
			factory()
		},
		register: (spec, component) => {
			registration = { spec, component }
			return () => {}
		},
	},
}
mod.apply(ctx)
console.log('registered slot:', registration.spec.name, '| id:', registration.spec.id, '| label:', registration.spec.label(), '| order:', registration.spec.order)

function flatten(node, out = []) {
	if (node === null || node === undefined || node === false || node === true) return out
	if (typeof node === 'string' || typeof node === 'number') {
		out.push(String(node))
		return out
	}
	if (Array.isArray(node)) {
		for (const child of node) flatten(child, out)
		return out
	}
	if (typeof node === 'object') {
		// A function component: render it, then walk what it returned.
		if (typeof node.type === 'function') {
			const props = { ...node.props }
			if (node.children && node.children.length > 0) props.children = node.children.length === 1 ? node.children[0] : node.children
			return flatten(node.type(props), out)
		}
		for (const child of node.children ?? []) flatten(child, out)
	}
	return out
}

function render(label, states) {
	stateIndex = 0
	presetStates = states
	const tree = registration.component()
	const text = flatten(tree).filter((s) => s.trim().length > 0)
	console.log(`\n########## ${label} ##########`)
	console.log(text.join(' | '))
}

render('ready (with data)', [{ status: 'ready', data: readyData, error: undefined }])
render('loading', [{ status: 'loading', data: undefined, error: undefined }])
render('missing credential', [{ status: 'ready', data: { ok: false, code: 'MISSING_CREDENTIAL', error: 'No R4 Coder API key found.', apiKeyEnv: 'R4_CODES_API_KEY' }, error: undefined }])
render('upstream error', [{ status: 'ready', data: { ok: false, code: 'UPSTREAM_ERROR', error: '/v1/cli/meta → HTTP 401: Invalid or missing API key', apiKeyEnv: 'R4_CODES_API_KEY' }, error: undefined }])
