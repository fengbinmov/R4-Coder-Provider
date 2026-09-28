/**
 * R4 Coder account card — browser half.
 *
 * Renders a `settings.section` page (Settings → R4 Coder) showing the account's
 * plan balance, wallet, concurrency, today's spend and the trailing 7-day usage
 * series. All figures come from the node half's `GET /r4-coder/account`, which
 * holds the API key; nothing here talks to r4.codes directly and no credential
 * ever reaches the browser.
 *
 * Packaged in the dsh client module format (`window.__ModuleLoader__.load`) so
 * the web app can load it without a build step of its own.
 */
window.__ModuleLoader__.load({
	// Must equal the package name: the client module system resolves this id in
	// its manifest and throws when a bundle loads without registering it. A
	// mismatched id fails the whole client bundle, not just this plugin.
	id: 'dsh-r4-coder-account',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		const react = require('react');
		const h = react.createElement;

		//#region copy

		const COPY = {
			zh: {
				nav: 'R4 Coder',
				title: 'R4 Coder 账户',
				subtitle: '套餐余额、钱包与用量（数据来自 r4.codes 账户接口）',
				refresh: '刷新',
				refreshing: '刷新中…',
				updated: '更新于',
				balance: '余额',
				package: '套餐',
				remaining: '剩余',
				of: '/',
				wallet: '钱包',
				concurrency: '并发上限',
				expires: '到期',
				key: '密钥',
				grants: '套餐明细',
				today: '今日',
				charged: '消费',
				requests: '请求',
				tokensIn: '输入',
				tokensOut: '输出',
				cacheRead: '缓存读取',
				last7: '最近 7 天',
				byModel: '按模型',
				modelName: '模型',
				noData: '暂无用量数据',
				loading: '正在读取账户信息…',
				empty: '没有可显示的数据。',
				errorTitle: '读取失败',
				missingKey: '未找到 API 密钥',
				hint: '在「设置 → Models」或 $DSH_HOME/.credentials.yaml 中保存 R4_CODES_API_KEY。',
				unlimited: '无上限',
				noPackage: '无生效套餐',
				autoNote: '每 5 分钟自动刷新',
			},
			en: {
				nav: 'R4 Coder',
				title: 'R4 Coder account',
				subtitle: 'Plan balance, wallet and usage from the r4.codes account API',
				refresh: 'Refresh',
				refreshing: 'Refreshing…',
				updated: 'Updated',
				balance: 'Balance',
				package: 'Package',
				remaining: 'Remaining',
				of: '/',
				wallet: 'Wallet',
				concurrency: 'Concurrency',
				expires: 'Expires',
				key: 'Key',
				grants: 'Grants',
				today: 'Today',
				charged: 'Charged',
				requests: 'Requests',
				tokensIn: 'Tokens in',
				tokensOut: 'Tokens out',
				cacheRead: 'Cache read',
				last7: 'Last 7 days',
				byModel: 'By model',
				modelName: 'Model',
				noData: 'No usage recorded yet',
				loading: 'Reading account…',
				empty: 'Nothing to show.',
				errorTitle: 'Lookup failed',
				missingKey: 'No API key found',
				hint: 'Store R4_CODES_API_KEY in Settings → Models or $DSH_HOME/.credentials.yaml.',
				unlimited: 'unlimited',
				noPackage: 'No active package',
				autoNote: 'Auto-refreshes every 5 minutes',
			},
		};

		function languageTag() {
			try {
				const lang = document.documentElement.lang || navigator.language || '';
				return String(lang).toLowerCase().startsWith('zh') ? 'zh' : 'en';
			} catch {
				return 'zh';
			}
		}

		//#endregion

		//#region formatting

		function num(value) {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : undefined;
		}

		function usd(value, digits = 2) {
			const parsed = num(value);
			if (parsed === undefined) return '—';
			return `$${parsed.toFixed(digits)}`;
		}

		function compact(value) {
			const parsed = num(value);
			if (parsed === undefined) return '—';
			const abs = Math.abs(parsed);
			if (abs >= 1e9) return `${(parsed / 1e9).toFixed(1)}B`;
			if (abs >= 1e6) return `${(parsed / 1e6).toFixed(1)}M`;
			if (abs >= 1e3) return `${(parsed / 1e3).toFixed(1)}k`;
			return String(Math.round(parsed));
		}

		function count(value) {
			const parsed = num(value);
			return parsed === undefined ? '—' : parsed.toLocaleString();
		}

		function day(iso) {
			if (typeof iso !== 'string' || iso.length === 0) return '—';
			const at = Date.parse(iso);
			if (!Number.isFinite(at)) return iso;
			const d = new Date(at);
			const pad = (n) => String(n).padStart(2, '0');
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		}

		function clock(iso) {
			if (typeof iso !== 'string') return '—';
			const at = Date.parse(iso);
			if (!Number.isFinite(at)) return iso;
			const d = new Date(at);
			const pad = (n) => String(n).padStart(2, '0');
			return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
		}

		function shortDay(bucket) {
			const parts = String(bucket).split('-');
			return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : String(bucket);
		}

		//#endregion

		//#region styles

		const ACCENT = '#4D6BFE';
		const LINE = '1px solid rgba(127,127,127,0.22)';
		const CARD_BG = 'rgba(127,127,127,0.06)';
		const MUTED = 'opacity:0.62';

		const S = {
			root: { display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 2px 18px' },
			header: {
				display: 'flex',
				alignItems: 'flex-start',
				justifyContent: 'space-between',
				gap: '12px',
			},
			title: { fontSize: '15px', fontWeight: 600, lineHeight: '1.35' },
			subtitle: { fontSize: '12px', opacity: 0.62, marginTop: '3px' },
			headerRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' },
			button: {
				border: LINE,
				background: 'transparent',
				borderRadius: '7px',
				padding: '5px 12px',
				fontSize: '12px',
				cursor: 'pointer',
				color: 'inherit',
			},
			buttonBusy: { opacity: 0.55, cursor: 'default' },
			stamp: { fontSize: '11px', opacity: 0.5, whiteSpace: 'nowrap' },
			card: {
				border: LINE,
				borderRadius: '10px',
				background: CARD_BG,
				padding: '12px 14px',
				display: 'flex',
				flexDirection: 'column',
				gap: '10px',
			},
			cardTitle: {
				fontSize: '11px',
				letterSpacing: '0.06em',
				textTransform: 'uppercase',
				opacity: 0.55,
			},
			bigRow: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' },
			big: { fontSize: '24px', fontWeight: 650, letterSpacing: '-0.01em' },
			bigSub: { fontSize: '13px', opacity: 0.6 },
			bar: {
				height: '7px',
				borderRadius: '999px',
				background: 'rgba(127,127,127,0.22)',
				overflow: 'hidden',
			},
			barFill: { height: '100%', background: ACCENT, borderRadius: '999px' },
			facts: { display: 'flex', flexWrap: 'wrap', gap: '10px 22px' },
			fact: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '84px' },
			factLabel: { fontSize: '11px', opacity: 0.55 },
			factValue: { fontSize: '13px', fontWeight: 550 },
			grid: {
				display: 'grid',
				gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
				gap: '10px 18px',
			},
			chart: {
				display: 'flex',
				alignItems: 'flex-end',
				gap: '6px',
				height: '86px',
				paddingTop: '4px',
			},
			chartCol: {
				flex: '1 1 0',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: '4px',
				height: '100%',
				justifyContent: 'flex-end',
			},
			chartBar: {
				width: '100%',
				minHeight: '2px',
				borderRadius: '3px 3px 0 0',
				background: ACCENT,
				opacity: 0.85,
			},
			chartBarZero: { background: 'rgba(127,127,127,0.3)', opacity: 1 },
			chartLabel: { fontSize: '10px', opacity: 0.5, whiteSpace: 'nowrap' },
			chartValue: { fontSize: '10px', opacity: 0.75, whiteSpace: 'nowrap' },
			table: { display: 'flex', flexDirection: 'column', gap: '6px' },
			tr: {
				display: 'grid',
				gridTemplateColumns: '1fr auto auto',
				gap: '10px',
				fontSize: '12.5px',
				alignItems: 'baseline',
			},
			trHead: { opacity: 0.5, fontSize: '11px' },
			trName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
			right: { textAlign: 'right', whiteSpace: 'nowrap' },
			notice: {
				border: LINE,
				borderRadius: '10px',
				padding: '12px 14px',
				fontSize: '12.5px',
				lineHeight: '1.55',
			},
			noticeTitle: { fontWeight: 600, marginBottom: '4px' },
			code: {
				fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
				fontSize: '11.5px',
				opacity: 0.85,
			},
			muted: { fontSize: '11px', opacity: 0.55 },
			grants: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' },
			grantRow: { display: 'flex', justifyContent: 'space-between', gap: '12px' },
		};

		//#endregion

		//#region data

		const REFRESH_MS = 5 * 60 * 1000;

		function useAccount() {
			const [state, setState] = react.useState({ status: 'loading', data: undefined, error: undefined });
			const load = react.useCallback(async () => {
				setState((prev) => ({ ...prev, status: prev.data ? 'refreshing' : 'loading' }));
				try {
					const res = await fetch('/r4-coder/account', {
						headers: { accept: 'application/json' },
						cache: 'no-store',
					});
					const body = await res.json();
					setState({ status: 'ready', data: body, error: undefined });
				} catch (error) {
					setState((prev) => ({
						...prev,
						status: 'error',
						error: error && error.message ? error.message : String(error),
					}));
				}
			}, []);
			react.useEffect(() => {
				void load();
			}, [load]);
			react.useEffect(() => {
				const id = window.setInterval(() => {
					void load();
				}, REFRESH_MS);
				return () => {
					window.clearInterval(id);
				};
			}, [load]);
			return { ...state, reload: load };
		}

		//#endregion

		//#region components

		function Card(title, children) {
			return h(
				'section',
				{ style: S.card },
				title ? h('div', { style: S.cardTitle }, title) : null,
				...children,
			);
		}

		function Fact(label, value) {
			return h(
				'div',
				{ style: S.fact },
				h('div', { style: S.factLabel }, label),
				h('div', { style: S.factValue }, value),
			);
		}

		function Notice(props) {
			return h(
				'div',
				{ style: S.notice },
				h('div', { style: S.noticeTitle }, props.title),
				props.lines.map((line, index) => h('div', { key: index }, line)),
				props.extra ?? null,
			);
		}

		function BalanceCard(props) {
			const { copy, meta } = props;
			const plan = meta && meta.plan ? meta.plan : {};
			const wallet = meta && meta.wallet ? meta.wallet : {};
			const remaining = num(plan.remaining_usd);
			const total = num(plan.total_usd);
			const ratio =
				remaining !== undefined && total !== undefined && total > 0
					? Math.max(0, Math.min(1, remaining / total))
					: undefined;
			const grants = Array.isArray(plan.grants) ? plan.grants : [];
			const key = meta && meta.key ? meta.key : undefined;

			return Card(copy.balance, [
				h(
					'div',
					{ key: 'pkg', style: S.bigRow },
					h('span', { style: S.big }, plan.package_name || copy.noPackage),
					total !== undefined && total > 0
						? h('span', { style: S.bigSub }, `${usd(remaining)} / ${usd(total)}`)
						: null,
				),
				ratio === undefined
					? null
					: h('div', { key: 'bar', style: S.bar }, h('div', { style: { ...S.barFill, width: `${ratio * 100}%` } })),
				h(
					'div',
					{ key: 'facts', style: S.facts },
					Fact(copy.remaining, usd(remaining)),
					Fact(copy.wallet, usd(wallet.balance_usd)),
					Fact(copy.concurrency, plan.max_concurrency === undefined ? '—' : String(plan.max_concurrency)),
					Fact(copy.expires, day(plan.expires_at)),
					key ? Fact(copy.key, `${key.name ?? '—'} (${key.start ?? '—'}…)`) : null,
				),
				grants.length > 1
					? h(
							'div',
							{ key: 'grants', style: S.grants },
							h('div', { style: S.factLabel }, copy.grants),
							...grants.map((grant, index) =>
								h(
									'div',
									{ key: index, style: S.grantRow },
									h('span', { style: S.trName }, grant.package_name ?? '—'),
									h(
										'span',
										{ style: S.right },
										`${usd(grant.remaining_usd)} / ${usd(grant.total_usd)} · ${day(grant.expires_at)}`,
									),
								),
							),
						)
					: null,
			]);
		}

		function TodayCard(props) {
			const { copy, usage } = props;
			const today = usage && usage.today ? usage.today : {};
			return Card(copy.today, [
				h(
					'div',
					{ key: 'grid', style: S.grid },
					Fact(copy.charged, usd(today.charged_usd_total, 4)),
					Fact(copy.requests, count(today.request_count)),
					Fact(copy.tokensIn, compact(today.prompt_tokens_total)),
					Fact(copy.tokensOut, compact(today.completion_tokens_total)),
					Fact(copy.cacheRead, compact(today.cache_read_tokens_total)),
				),
			]);
		}

		function SeriesCard(props) {
			const { copy, usage } = props;
			const series = usage && Array.isArray(usage.series) ? usage.series : [];
			if (series.length === 0) {
				return Card(copy.last7, [h('div', { key: 'none', style: S.muted }, copy.noData)]);
			}
			const values = series.map((point) => num(point.charged_usd_total) ?? 0);
			const peak = Math.max(...values, 0);
			return Card(copy.last7, [
				h(
					'div',
					{ key: 'chart', style: S.chart },
					...series.map((point, index) => {
						const value = values[index];
						const height = peak > 0 ? Math.max(2, Math.round((value / peak) * 58)) : 2;
						return h(
							'div',
							{ key: point.bucket ?? index, style: S.chartCol, title: `${point.bucket} · ${usd(value, 4)} · ${count(point.request_count)} req` },
							h('div', { style: S.chartValue }, value > 0 ? usd(value) : ''),
							h('div', {
								style: { ...S.chartBar, ...(value > 0 ? {} : S.chartBarZero), height: `${height}px` },
							}),
							h('div', { style: S.chartLabel }, shortDay(point.bucket)),
						);
					}),
				),
			]);
		}

		function ModelCard(props) {
			const { copy, usage } = props;
			const models = usage && Array.isArray(usage.models) ? usage.models : [];
			if (models.length === 0) return null;
			const rows = models
				.map((model) => {
					const points = Array.isArray(model.points) ? model.points : [];
					// Match the series' own day key rather than assuming the last
					// point is today: a model idle today has no point for it.
					const dayKey = usage && usage.day;
					const todayPoint =
						points.find((point) => point.bucket === dayKey) ??
						(points.length > 0 ? points[points.length - 1] : undefined);
					const week = points.reduce((sum, point) => sum + (num(point.charged_usd_total) ?? 0), 0);
					return {
						name: model.model_display_name || model.model_slug,
						today: num(todayPoint && todayPoint.charged_usd_total) ?? 0,
						week,
					};
				})
				.filter((row) => row.week > 0 || row.today > 0)
				.sort((a, b) => b.week - a.week);

			if (rows.length === 0) {
				return Card(copy.byModel, [h('div', { key: 'none', style: S.muted }, copy.noData)]);
			}
			return Card(copy.byModel, [
				h(
					'div',
					{ key: 'head', style: { ...S.tr, ...S.trHead } },
					h('span', null, copy.modelName),
					h('span', { style: S.right }, copy.today),
					h('span', { style: S.right }, '7d'),
				),
				h(
					'div',
					{ key: 'rows', style: S.table },
					...rows.map((row) =>
						h(
							'div',
							{ key: row.name, style: S.tr },
							h('span', { style: S.trName, title: row.name }, row.name),
							h('span', { style: S.right }, usd(row.today, 4)),
							h('span', { style: S.right }, usd(row.week, 4)),
						),
					),
				),
			]);
		}

		function R4AccountPage() {
			const copy = COPY[languageTag()];
			const account = useAccount();
			const data = account.data;
			const ok = Boolean(data && data.ok);
			const busy = account.status === 'loading' || account.status === 'refreshing';

			const body = [];
			if (account.status === 'loading' && !data) {
				body.push(h('div', { key: 'loading', style: S.muted }, copy.loading));
			} else if (data && !ok) {
				const missing = data.code === 'MISSING_CREDENTIAL';
				body.push(
					h(Notice, {
						key: 'notice',
						title: missing ? copy.missingKey : copy.errorTitle,
						lines: [data.error ?? copy.empty],
						extra: h(
							'div',
							{ style: { marginTop: '8px' } },
							h('div', { style: S.muted }, missing ? copy.hint : `${data.baseURL ?? ''}`),
							data.apiKeyEnv
								? h('div', { style: { ...S.code, marginTop: '4px' } }, `apiKeyEnv: ${data.apiKeyEnv}`)
								: null,
						),
					}),
				);
			} else if (data && ok) {
				body.push(h(BalanceCard, { key: 'balance', copy, meta: data.meta }));
				body.push(h(TodayCard, { key: 'today', copy, usage: data.usage }));
				body.push(h(SeriesCard, { key: 'series', copy, usage: data.usage }));
				const models = h(ModelCard, { key: 'models', copy, usage: data.usage });
				if (models) body.push(models);
			} else if (account.error) {
				body.push(h(Notice, { key: 'err', title: copy.errorTitle, lines: [account.error] }));
			}

			return h(
				'div',
				{ style: S.root, 'data-r4-coder-account': 'page' },
				h(
					'div',
					{ style: S.header },
					h(
						'div',
						null,
						h('div', { style: S.title }, copy.title),
						h('div', { style: S.subtitle }, copy.subtitle),
					),
					h(
						'div',
						{ style: S.headerRight },
						h(
							'button',
							{
								type: 'button',
								style: busy ? { ...S.button, ...S.buttonBusy } : S.button,
								disabled: busy,
								onClick: () => {
									void account.reload();
								},
							},
							busy ? copy.refreshing : copy.refresh,
						),
						data && data.fetchedAt
							? h('div', { style: S.stamp }, `${copy.updated} ${clock(data.fetchedAt)}`)
							: null,
						h('div', { style: S.stamp }, copy.autoNote),
					),
				),
				...body,
			);
		}

		//#endregion

		function apply(ctx) {
			if (ctx === undefined || ctx.slots === undefined || typeof ctx.slots.inject !== 'function') return;
			ctx.slots.inject('settings.section', () =>
				ctx.slots.register(
					{
						name: 'settings.section',
						id: 'r4-coder-account',
						order: 14,
						label: () => COPY[languageTag()].nav,
						inject: () => ({}),
					},
					R4AccountPage,
				),
			);
		}

		const inject = ['slots'];

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
