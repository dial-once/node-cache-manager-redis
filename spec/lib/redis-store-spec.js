
var config = require('../config.json');
var redisStore = require('../../index');

var redisCache;

beforeAll(function() {
  redisCache = require('cache-manager').caching({
    store: redisStore,
    host: config.redis.host,
    port: config.redis.port, 
    db: config.redis.db,
    ttl: config.redis.ttl
  });
});