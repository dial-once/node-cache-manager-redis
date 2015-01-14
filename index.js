'use strict';

var RedisPool = require('sol-redis-pool');

function RedisStore(args) {
	args = args || {};

	var store = {
		name: 'redis'
	};

	// Configure the generic-pool settings.
	var poolSettings = {
		max: args.max || 10,
		min: args.min || 2
	};

	var pool = new RedisPool(args, poolSettings);

	function connect(callback) {
		pool.acquire(function (err, conn) {
			if (err) {
				pool.release(conn);
				return callback(err);
			}

			if (args.db || args.db === 0) {
				conn.select(args.db);
			}

			callback(null, conn);
		});
	}

	store.get = function (key, callback) {
		connect(function (err, conn) {
			if (err) {
				return callback(err);
			}

			conn.get(key, function (err, result) {
				pool.release(conn);
				if (err) {
					return callback(err);
				}
				callback(null, JSON.parse(result));
			});
		});
	};

	store.set = function (key, value, ttl, callback) {
		var ttlToUse = ttl || args.ttl;
		connect(function (err, conn) {
			if (err) {
				return callback(err);
			}

			if (ttlToUse) {
				conn.setex(key, ttlToUse, JSON.stringify(value), function (err, result) {
					pool.release(conn);
					callback(err, result);
				});
			} else {
				conn.set(key, JSON.stringify(value), function (err, result) {
					pool.release(conn);
					callback(err, result);
				});
			}
		});
	};

	store.del = function (key, callback) {
		connect(function (err, conn) {
			if (err) {
				return callback(err);
			}

			conn.del(key, function (err, result) {
				pool.release(conn);
				callback(err, result);
			});
		});
	};

	store.keys = function (pattern, callback) {
		if (typeof pattern === 'function') {
			callback = pattern;
			pattern = '*';
		}

		connect(function (err, conn) {
			if (err) {
				return callback(err);
			}

			conn.keys(pattern, function (err, result) {
				pool.release(conn);
				callback(err, result);
			});
		});
	};

	return store;
}

module.exports = {
	create: function (args) {
		return new RedisStore(args);
	}
};
