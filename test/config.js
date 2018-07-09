module.exports = {
	redis: {
		host: process.env.REDIS_HOST || "localhost",
		port: process.env.REDIS_PORT || 6379,
		auth_pass: process.env.REDIS_PASS || "",
		db: process.env.REDIS_DB || 0,
		ttl: process.env.REDIS_TTL || 60
	}
};
