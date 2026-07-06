import type { Env } from './interface/env.interface';
import type { RateLimitData } from './interface/ratelimit.interface';
import type { CreateLeadInput } from './interface/lead.interface';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const statuses = ['new', 'contacted', 'closed'];

async function clearCache(env: Env) {
	const listOfKeys = await env.LEADS_KV.list({ prefix: 'leads:list:' });
	for (const key of listOfKeys.keys) {
		await env.LEADS_KV.delete(key.name);
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		const method = request.method;
		const statusParam = url.searchParams.get('status');

		let results;

		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		};

		const sendJson = (data: unknown, status = 200) => {
			return Response.json(data, { status, headers: corsHeaders });
		};

		if (method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		try {
			const publishRoute = method === 'POST' && path === '/leads';

			if (!publishRoute) {
				const auth = request.headers.get('Authorization');

				if (!auth || auth !== `Bearer ${env.AUTH_TOKEN}`) {
					return sendJson({ error: 'Неавторизовано' }, 401);
				}
			}
			if (method === 'POST' && path === '/leads') {
				const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
				const kvKey = `rate_limit:${ip}`;

				const currentRequests = await env.LEADS_KV.get(kvKey);
				const nowInSeconds = Math.floor(Date.now() / 1000);

				if (currentRequests === null) {
					const expiresAt = nowInSeconds + 60;
					const limitData: RateLimitData = { count: 1, expiresAt };

					await env.LEADS_KV.put(kvKey, JSON.stringify(limitData), { expirationTtl: 60 });
				} else {
					const limitData = JSON.parse(currentRequests) as RateLimitData;

					if (limitData.count >= 3) {
						return sendJson({ error: 'Перевищено ліміт запитів. Спробуйте пізніше' }, 429);
					}

					const updatedData: RateLimitData = {
						count: limitData.count + 1,
						expiresAt: limitData.expiresAt,
					};

					await env.LEADS_KV.put(kvKey, JSON.stringify(updatedData), { expirationTtl: 60 });
				}

				let body: CreateLeadInput;

				try {
					body = (await request.json()) as CreateLeadInput;
				} catch (err) {
					return sendJson({ error: 'Некоректний формат JSON' }, 400);
				}

				const { name, email, company = null, message = null } = body;

				if (!name || !email) return sendJson({ error: "Ім'я та email є обов'язковими" }, 400);

				if (!EMAIL_REGEX.test(email)) return sendJson({ error: 'Некоректний формат email' }, 400);

				const createdAt = new Date().toISOString();

				const createdLead = await env.mini_lead_tracker_db
					.prepare('INSERT INTO leads (name, email, company, message, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *')
					.bind(name, email, company, message, createdAt)
					.first();

				if (!createdLead) return sendJson({ error: 'Не вдалося створити запис у базі даних' }, 500);

				await clearCache(env);

				const emailEnabled = await env.LEADS_KV.get('settings:lead_email_enabled');

				if (emailEnabled === 'true') {
					console.log('Email notification sent for lead:', email);
				}

				return sendJson(createdLead, 201);
			}

			if (method === 'GET' && path === '/leads') {
				const pageParam = url.searchParams.get('page') || '1';

				let page = parseInt(pageParam, 10);

				if (isNaN(page) || page < 1) {
					page = 1;
				}

				const limit = 10;
				const offset = (page - 1) * limit;

				if (statusParam && !statuses.includes(statusParam))
					return sendJson({ error: 'Некоректний статус. Статус має бути new, contacted або closed.' }, 400);

				const cacheKey = statusParam ? `leads:list:status:${statusParam}:page:${page}` : `leads:list:page:${page}`;

				const cahedLeads = await env.LEADS_KV.get(cacheKey);

				if (cahedLeads !== null) return sendJson(JSON.parse(cahedLeads), 200);

				if (statusParam) {
					const query = await env.mini_lead_tracker_db
						.prepare('SELECT * FROM leads WHERE status = ? ORDER BY id ASC LIMIT ? OFFSET ?')
						.bind(statusParam, limit, offset)
						.all();
					results = query.results;
				} else {
					const query = await env.mini_lead_tracker_db
						.prepare('SELECT * FROM leads ORDER BY id ASC LIMIT ? OFFSET ?')
						.bind(limit, offset)
						.all();
					results = query.results;
				}

				await env.LEADS_KV.put(cacheKey, JSON.stringify(results), { expirationTtl: 300 });

				return sendJson(results, 200);
			}

			if (method === 'GET' && path === '/stats') {
				const leadStatsCount = await env.mini_lead_tracker_db
					.prepare(
						`
					SELECT
						COUNT(*) as total,
						SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new,
						SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) as contacted,
						SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
					FROM leads
				`,
					)
					.first();

				if (!leadStatsCount) return sendJson({ error: 'Статистика не знайдена' }, 404);

				return sendJson(leadStatsCount, 200);
			}

			if (path.startsWith('/leads/')) {
				const parts = path.split('/');
				const leadId = parts[2];

				if (isNaN(Number(leadId))) return sendJson({ error: 'Невірний формат ID ліда' }, 400);

				if (method === 'GET') {
					const lead = await env.mini_lead_tracker_db.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first();

					if (!lead) return sendJson({ error: 'Лід не знайдений' }, 404);

					return sendJson(lead, 200);
				}

				if (method === 'PATCH' && parts[3] === 'status') {
					let body: { status?: string };

					try {
						body = (await request.json()) as { status?: string };
					} catch (err) {
						return sendJson({ error: 'Некоректний формат JSON' }, 400);
					}

					const { status } = body;

					if (!status) return sendJson({ error: "Поле 'status' є обов'язковим" }, 400);

					if (!statuses.includes(status)) return sendJson({ error: "Некоректний статус. Дозволені: 'new', 'contacted', 'closed'" }, 400);

					const result = await env.mini_lead_tracker_db
						.prepare('UPDATE leads SET status = ? WHERE id = ? RETURNING *')
						.bind(status, leadId)
						.first();

					if (!result) return sendJson({ error: 'Лід не знайдений' }, 404);

					await clearCache(env);

					return sendJson(result, 200);
				}

				if (method === 'DELETE') {
					const result = await env.mini_lead_tracker_db.prepare('DELETE FROM leads WHERE id = ? RETURNING id').bind(leadId).first();

					if (!result) return sendJson({ error: 'Лід не знайдений для видалення' }, 404);

					await clearCache(env);

					return sendJson({ message: `Лід з ID ${leadId} успішно видалено` }, 200);
				}
			}

			return sendJson({ error: 'Маршрут не знайдено' }, 404);
		} catch (error: unknown) {
			console.error('Глобальна помилка сервера:', error);
			return sendJson(
				{
					error: 'Внутрішня помилка сервера',
					details: error instanceof Error ? error.message : 'Невідома помилка',
				},
				500,
			);
		}
	},
} satisfies ExportedHandler<Env>;
