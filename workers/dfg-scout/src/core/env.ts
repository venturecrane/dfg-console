export interface Env {
	ENVIRONMENT: 'production' | 'preview' | 'development';
	SIERRA_API_URL: string;
	SIERRA_API_KEY: string;

	// Databases
	DFG_DB: D1Database;
	DFG_EVIDENCE: R2Bucket;

	// Security
	RESET_TOKEN: string;
	OPS_TOKEN: string;

	// Business Logic Config
	MAX_BID_LIMIT: string;
	STEAL_THRESHOLD: string;

	// R2 Configuration
	// Public URL for serving images from R2 bucket
	R2_PUBLIC_URL?: string;
}

export const getConfig = (env: Env) => {
	const maxBid = parseFloat(env.MAX_BID_LIMIT || '6000');
	const stealThreshold = parseFloat(env.STEAL_THRESHOLD || '2000');

	if (isNaN(maxBid) || maxBid <= 0) {
		throw new Error(`Invalid MAX_BID_LIMIT: ${env.MAX_BID_LIMIT}. Must be a positive number.`);
	}
	if (isNaN(stealThreshold) || stealThreshold <= 0) {
		throw new Error(`Invalid STEAL_THRESHOLD: ${env.STEAL_THRESHOLD}. Must be a positive number.`);
	}

	return {
		isProd: env.ENVIRONMENT === 'production',
		isPreview: env.ENVIRONMENT === 'preview',
		maxBid,
		stealThreshold,
	};
};
