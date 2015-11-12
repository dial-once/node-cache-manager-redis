
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

describe('set', function() {
  it('should store a value without ttl', function(done){
    redisCache.set('foo', 'bar', function(err) {
      expect(err).toBe(null);
      done();
    });
  });

  it('should store a value with a specific ttl', function(done){
    redisCache.set('foo', 'bar', config.redis.ttl, function(err) {
      expect(err).toBe(null);
      done();
    });
  });

  it('should store a value with a infinite ttl', function(done){
    redisCache.set('foo', 'bar', 0);
    done();
  });

  it('should store a value without callback', function(done){
    redisCache.set('foo', 'bar');
    done();
  }); 

  it('should not store an invalid value', function(done){
    redisCache.set('foo1', null);
    redisCache.set('foo2', undefined);
    done();
  });
});