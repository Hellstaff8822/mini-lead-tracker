export async function isRateLimited(db: D1Database, ip: string, limit = 3, periodSeconds = 60): Promise<boolean> {
	const now = Math.floor(Date.now() / 1000);
	const resetAt = now + periodSeconds;

	const limitResult = await db
		.prepare(
			`
			INSERT INTO rate_limits (ip, requests_count, reset_at)
			VALUES (?, 1, ?)
			ON CONFLICT(ip) DO UPDATE SET
				requests_count = CASE
					WHEN reset_at <= ? THEN 1
					ELSE requests_count + 1
				END,
				reset_at = CASE
					WHEN reset_at <= ? THEN ?
					ELSE reset_at
				END
			RETURNING requests_count;
		`,
		)
		.bind(ip, resetAt, now, now, resetAt)
		.first<{ requests_count: number }>();

	return !!(limitResult && limitResult.requests_count > limit);
}
