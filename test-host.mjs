// Offline harness for the R4 Coder account host half: register the route with a
// fake cordis context, then call it and print what the browser card would get.
import { pathToFileURL } from 'node:url'

const mod = await import(pathToFileURL('F:/Code/Ai/temp/R4 Coder Provider/lib/index.js').href)

const KEY = 'coder_eXJBiRHc91h1t5JOrTmffCsvT-GWrL80is2_Vi930yUbrZ2WfaR9DRP8ulpsMJf-'
const routes = []

const fakeCtx = {
  get(name) {
    if (name === 'credentials') {
      return { resolve: async (ref) => (ref === 'R4_CODES_API_KEY' ? { value: KEY } : undefined) }
    }
    return undefined
  },
  credentials: undefined,
}

const serverCtx = {
  ...fakeCtx,
  webServer: {
    register(route) {
      routes.push(route)
      return () => {}
    },
  },
  effect(fn) {
    return fn()
  },
}

fakeCtx.inject = (deps, cb) => {
  console.log('inject requested:', deps.join(','))
  cb(serverCtx)
}

mod.apply(fakeCtx, { apiKeyEnv: 'R4_CODES_API_KEY', baseURL: 'https://api.r4.codes', timeoutMs: 20000 })
console.log('registered routes:', routes.map((r) => `${r.kind} ${r.path}`).join(', '))

function call(route, url, method = 'GET') {
  return new Promise((resolve) => {
    const chunks = []
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v
      },
      end(body) {
        resolve({ status: this.statusCode, body })
      },
    }
    Promise.resolve(route.handler({ method, url }, res)).then(() => {
      void chunks
    })
  })
}

const route = routes.find((r) => r.path === '/r4-coder/account')
const result = await call(route, '/r4-coder/account?tz=Asia/Shanghai')
console.log('\nstatus:', result.status)
const parsed = JSON.parse(result.body)
console.log('ok:', parsed.ok, '| keySource:', parsed.keySource, '| zone:', parsed.zone)
if (parsed.ok) {
  console.log('plan:', JSON.stringify(parsed.meta.plan.package_name), parsed.meta.plan.remaining_usd, '/', parsed.meta.plan.total_usd)
  console.log('wallet:', parsed.meta.wallet.balance_usd, '| concurrency:', parsed.meta.plan.max_concurrency)
  console.log('key:', JSON.stringify(parsed.meta.key))
  console.log('today:', JSON.stringify(parsed.usage.today))
  console.log('series days:', parsed.usage.series.length, '| models:', parsed.usage.models.length)
} else {
  console.log('error:', parsed.error)
}

// Missing-credential path
const noKeyCtx = {
  get: () => undefined,
  inject: (deps, cb) => cb({ ...serverCtx, get: () => undefined, webServer: serverCtx.webServer, effect: serverCtx.effect }),
}
const routes2 = []
noKeyCtx.inject = (deps, cb) => {
  cb({
    get: () => undefined,
    webServer: { register: (r) => { routes2.push(r); return () => {} } },
    effect: (fn) => fn(),
  })
}
mod.apply(noKeyCtx, {})
const r2 = await call(routes2[0], '/r4-coder/account')
console.log('\n[no-key] status:', r2.status, 'body:', JSON.parse(r2.body).code)
