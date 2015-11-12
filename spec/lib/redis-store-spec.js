
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