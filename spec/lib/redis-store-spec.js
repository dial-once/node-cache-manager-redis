
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

describe('get', function() {
  it('should retrieve a value for a given key', function(done){
    var value = 'bar';
    redisCache.set('foo', value, function() {
      redisCache.get('foo', function(err, result) {
        expect(err).toBe(null);
        expect(result).toBe(value);
        done();
      });
    });
  });

  it('should return null when the key is invalid', function(done){
    redisCache.get('invalidKey', function(err, result) {
      expect(err).toBe(null);
      expect(result).toBe(null);
      done();
    });
  });
});

describe('del', function() {
  it('should delete a value for a given key', function(done){
    redisCache.set('foo', 'bar', function() {
      redisCache.del('foo', function(err) {
        expect(err).toBe(null);
        done();
      });
    });
  });

  it('should delete a value for a given key without callback', function(done){
    redisCache.set('foo', 'bar', function() {
      redisCache.del('foo');
      done();
    });
  });
});

describe('reset', function() {
  it('should flush underlying db', function(done){
    redisCache.reset(function(err) {
      expect(err).toBe(null);
      done();
    });
  });

  it('should flush underlying db without callback', function(done){
    redisCache.reset();
    done();
  });
});

describe('ttl', function() {
  it('should retrieve ttl for a given key', function(done){
    redisCache.set('foo', 'bar', function() {
      redisCache.ttl('foo', function(err, ttl) {
        expect(err).toBe(null);
        expect(ttl).toBe(config.redis.ttl);
        done();
      });
    });
  });

  it('should retrieve ttl for an invalid key', function(done){
    redisCache.ttl('invalidKey', function(err, ttl){
      expect(err).toBe(null);
      expect(ttl).not.toBe(null);
      done(); 
    });
  });
});

describe('keys', function() {
  it('should return an array of keys for the given pattern', function(done){
    redisCache.set('foo', 'bar', function() {
      redisCache.keys('f*', function(err, arrayOfKeys) {
        expect(err).toBe(null);
        expect(arrayOfKeys).not.toBe(null);
        expect(arrayOfKeys.indexOf('foo')).not.toBe(-1);
        done();
      });
    });
  });

  it('should return an array of keys without pattern', function(done){
    redisCache.set('foo', 'bar', function() {
      redisCache.keys(function(err, arrayOfKeys) {
        expect(err).toBe(null);
        expect(arrayOfKeys).not.toBe(null);
        expect(arrayOfKeys.indexOf('foo')).not.toBe(-1);
        done();
      });
    });
  });
});

describe('isCacheableValue', function() {
  it('should return true when the value is not null or undefined', function(done){
    expect(redisCache.store.isCacheableValue(0)).toBe(true);
    expect(redisCache.store.isCacheableValue(100)).toBe(true);
    expect(redisCache.store.isCacheableValue('')).toBe(true);
    expect(redisCache.store.isCacheableValue('test')).toBe(true);
    done();
  });

  it('should return false when the value is null or undefined', function(done){
    expect(redisCache.store.isCacheableValue(null)).toBe(false);
    expect(redisCache.store.isCacheableValue(undefined)).toBe(false);
    done();
  });
});

describe('getClient', function() {
  it('should return redis client', function(done) {
    redisCache.store.getClient(function(err, redis) {
      expect(err).toBe(null);
      expect(redis).not.toBe(null);
      expect(redis.client).not.toBe(null);
      redis.done(done);
    });
  });
});

describe('redisErrorEventEmitter', function(){
  it('should return an error when the redis server is unavailable', function(done){
    // Change redisCache host to receive an error
    redisCache = require('cache-manager').caching({
      store: redisStore,
      host: '127.0.0.10',
      port: config.redis.port, 
      db: config.redis.db,
      connect_timeout: 1
    });

    redisCache.set('foo', 'bar', function(err) {
      expect(err).not.toBe(null);
      done();
    });
  });
});