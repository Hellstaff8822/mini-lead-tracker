import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";

export default defineWorkersConfig(async () => {
	const migrationsPath = path.join(__dirname, "migrations");
	const migrations = await readD1Migrations(migrationsPath);

	return {
		define: {
			__MIGRATIONS__: JSON.stringify(migrations),
		},
		test: {
			poolOptions: {
				workers: {
					wrangler: { configPath: "./wrangler.jsonc" },
				},
			},
			setupFiles: ["test/setup.ts"],
		},
	};
});
