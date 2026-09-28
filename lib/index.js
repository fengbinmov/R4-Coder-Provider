/**
 * R4 Coder account card — node half.
 *
 * Deliberately import-free. The dsh plugin flow materializes local packages
 * through pnpm, which links a `file:` dependency back to its source directory,
 * so any node_modules import here would have to resolve from wherever this
 * checkout lives. Staying dependency-free keeps every install mode (dsh plugin
 * add, direct copy into profiles/web/node_modules) working identically.
 *
 * The half owns one job: answer `GET /r4-coder/account` for the browser card.
 * The API key never reaches the browser — the host resolves the credential
 * reference, calls R4 Coder's account endpoints, and returns the JSON.
 *
 * R4 Coder's account surface (the same one its own CLI uses):
 *   GET {baseURL}/v1/cli/meta              plan, grants, wallet, concurrency
 *   GET {baseURL}/v1/cli/usage?tz=<zone>   today's spend + 7-day series
 * Both authenticate with `Authorization: Bearer <coder_…>`.
 */

/** Credential reference used when the entry config names none. */
export const DEFAULT_API_KEY_ENV = 'R4_CODES_API_KEY';

/** Environment variable the R4 CLI itself honours, used as a second fallback. */
const CLI_KEY_ENV = 'R4_API_KEY';

/** R4 Coder API root. */
export const DEFAULT_BASE_URL = 'https://api.r4.codes';

/** Per-request timeout for the two account lookups. */
const DEFAULT_TIMEOUT_MS = 15000;

/** Lenient config normalization; junk degrades to defaults instead of failing. */
export function normalizeConfig(value) {
	const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
	const timeout = Number(source.timeoutMs);
	return {
		apiKeyEnv:
			typeof source.apiKeyEnv === 'string' && source.apiKeyEnv.length > 0
				? source.apiKeyEnv
				: DEFAULT_API_KEY_ENV,
		baseURL:
			typeof source.baseURL === 'string' && source.baseURL.length > 0
				? source.baseURL.replace(/\/+$/, '')
				: DEFAULT_BASE_URL,
		timeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.min(120000, timeout) : DEFAULT_TIMEOUT_MS,
	};
}

/**
 * Schema node descriptors matching what dsh-settings' serialization reads, so
 * the served section stays editable and `apiKeyEnv` is treated as a reference
 * name rather than a secret. No schemastery import on purpose.
 */
export const Config = Object.assign(
	(value) => normalizeConfig(value),
	{
		type: 'object',
		dict: {
			apiKeyEnv: { type: 'string' },
			baseURL: { type: 'string' },
			timeoutMs: { type: 'number' },
		},
		toJSON() {
			return { type: this.type, dict: this.dict };
		},
		['~standard']: {
			version: 1,
			vendor: 'dsh-r4-coder-account',
			validate(value) {
				return { value: normalizeConfig(value) };
			},
		},
	},
);

export const name = 'r4-coder-account';
export const inject = [];

function writeJson(res, status, body) {
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.setHeader('Cache-Control', 'no-store');
	res.statusCode = status;
	res.end(JSON.stringify(body));
}

/**
 * Resolve the API key: harness credentials service first (so the key stored in
 * `.credentials.yaml` is found), then the process environment.
 * @returns the key and where it came from, or undefined when unset.
 */
async function resolveApiKey(ctx, refName) {
	const credentials = ctx.get?.('credentials') ?? ctx.credentials;
	if (credentials !== undefined && typeof credentials.resolve === 'function') {
		try {
			// `credentialRef` is the identity function at runtime (brandString),
			// so the plain reference name is accepted here without importing it.
			const resolved = await credentials.resolve(refName);
			const value = resolved?.value;
			if (typeof value === 'string' && value.length > 0) {
				return { value, source: `credential:${refName}` };
			}
		} catch {
			// A missing/unusable reference falls through to the environment.
		}
	}
	const fromNamedEnv = process.env[refName];
	if (typeof fromNamedEnv === 'string' && fromNamedEnv.length > 0) {
		return { value: fromNamedEnv, source: `env:${refName}` };
	}
	const fromCliEnv = process.env[CLI_KEY_ENV];
	if (typeof fromCliEnv === 'string' && fromCliEnv.length > 0) {
		return { value: fromCliEnv, source: `env:${CLI_KEY_ENV}` };
	}
	return undefined;
}

/** One authenticated GET against the R4 Coder API, with a bounded timeout. */
async function r4Get(settings, path, apiKey) {
	const res = await fetch(`${settings.baseURL}${path}`, {
		headers: {
			authorization: `Bearer ${apiKey}`,
			accept: 'application/json',
		},
		signal: AbortSignal.timeout(settings.timeoutMs),
	});
	const text = await res.text();
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		body = { raw: text.slice(0, 400) };
	}
	if (!res.ok) {
		const detail =
			body?.error?.message ?? body?.message ?? (typeof body?.raw === 'string' ? body.raw : '');
		throw new Error(`${path} → HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
	}
	return body;
}

/** Time zone used to slice the usage series into natural days. */
function zoneOf(url) {
	const asked = url.searchParams.get('tz');
	if (typeof asked === 'string' && asked.length > 0) return asked;
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	} catch {
		return 'UTC';
	}
}

async function handleAccount(ctx, settings, req, res) {
	if (req.method !== 'GET') {
		writeJson(res, 405, { ok: false, error: 'Method not allowed' });
		return;
	}
	let url;
	try {
		url = new URL(req.url ?? '/', 'http://127.0.0.1');
	} catch {
		writeJson(res, 400, { ok: false, error: 'Malformed request URL' });
		return;
	}

	const key = await resolveApiKey(ctx, settings.apiKeyEnv);
	if (key === undefined) {
		writeJson(res, 200, {
			ok: false,
			code: 'MISSING_CREDENTIAL',
			error:
				`No R4 Coder API key found. Store ${settings.apiKeyEnv} in the harness credentials ` +
				`(Settings → Models, or $DSH_HOME/.credentials.yaml) or export ${CLI_KEY_ENV}.`,
			apiKeyEnv: settings.apiKeyEnv,
			baseURL: settings.baseURL,
		});
		return;
	}

	const zone = zoneOf(url);
	try {
		const [meta, usage] = await Promise.all([
			r4Get(settings, '/v1/cli/meta', key.value),
			r4Get(settings, `/v1/cli/usage?tz=${encodeURIComponent(zone)}`, key.value),
		]);
		writeJson(res, 200, {
			ok: true,
			fetchedAt: new Date().toISOString(),
			keySource: key.source,
			baseURL: settings.baseURL,
			zone,
			meta,
			usage,
		});
	} catch (error) {
		writeJson(res, 200, {
			ok: false,
			code: 'UPSTREAM_ERROR',
			error: error instanceof Error ? error.message : String(error),
			apiKeyEnv: settings.apiKeyEnv,
			baseURL: settings.baseURL,
			zone,
		});
	}
}

export function apply(ctx, config) {
	const settings = normalizeConfig(config);
	// Deferred: composition order does not matter, and a profile without a web
	// server simply skips the route instead of failing plugin activation.
	ctx.inject(['webServer'], (serverCtx) => {
		const server = serverCtx.webServer;
		if (server === undefined || typeof server.register !== 'function') return;
		serverCtx.effect(() => {
			const disposeAccount = server.register({
				kind: 'exact',
				path: '/r4-coder/account',
				handler: (req, res) => handleAccount(serverCtx, settings, req, res),
			});
			return () => {
				disposeAccount();
			};
		}, 'r4-coder-account: account route');
	});
}
