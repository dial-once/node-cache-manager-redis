var config = require('../config.json');
var redisStore = require('../../index');
var sinon = require('sinon');

var redisCache;
var customRedisCache;

beforeAll(function () {
  redisCache = require('cache-manager').caching({
    store: redisStore,
    host: config.redis.host,
    port: config.redis.port,
    auth_pass: config.redis.auth_pass,
    db: config.redis.db,
    ttl: config.redis.ttl
  });

  customRedisCache = require('cache-manager').caching({
    store: redisStore,
    host: config.redis.host,
    port: config.redis.port,
    db: config.redis.db,
    ttl: config.redis.ttl,
    isCacheableValue: function (val) {
      // allow undefined
      if (val === undefined) return true;
      return redisCache.store.isCacheableValue(val);
    }
  });
});

describe('set', function () {
  it('should store a value without ttl', function (done) {
    redisCache.set('foo', 'bar', function (err) {
      expect(err).toBe(null);
      done();
    });
  });

  it('should store a value with a specific ttl', function (done) {
    redisCache.set('foo', 'bar', config.redis.ttl, function (err) {
      expect(err).toBe(null);
      done();
    });
  });

  it('should store a value with a infinite ttl', function (done) {
    redisCache.set('foo', 'bar', {ttl: 0}, function (err) {
      expect(err).toBe(null);
      redisCache.ttl('foo', function (err, ttl) {
        expect(err).toBe(null);
        expect(ttl).toBe(-1);
        done();
      });
    });
  });

  it('should store a value without callback', function (done) {
    redisCache.set('foo', 'baz');
    redisCache.get('foo', function (err, value) {
      expect(err).toBe(null);
      expect(value).toBe('baz');
      done();
    });
  });

  it('should not store an invalid value', function (done) {
    redisCache.set('foo1', undefined, function (err) {
      try {
        expect(err).notToBe(null);
        expect(err.message).toEqual('value cannot be undefined');
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('should  store an undefined value if permitted by isCacheableValue', function (done) {
    expect(customRedisCache.store.isCacheableValue(undefined)).toBe(true);
    customRedisCache.set('foo3', undefined, function (err) {
      try {
        expect(err).toBe(null);
        customRedisCache.get('foo3', function (err, data) {
          try {
            expect(err).toBe(null);
            // redis stored undefined as 'undefined'
            expect(data).toBe('undefined');
            done();
          } catch (e) {
            done(e);
          }
        });
      } catch (e) {
        done(e);
      }
    });
  });

});

it('should  store a null value without error', function (done) {
  redisCache.set('foo2', null, function (err) {
    try {
      expect(err).toBe(null);
      redisCache.get('foo2', function (err, value) {
        expect(err).toBe(null);
        expect(value).toBe(null);
        done();
      });
    } catch (e) {
      done(e);
    }
  });
});

describe('get', function () {
  it('should retrieve a value for a given key', function (done) {
    var value = 'bar';
    redisCache.set('foo', value, function () {
      redisCache.get('foo', function (err, result) {
        expect(err).toBe(null);
        expect(result).toBe(value);
        done();
      });
    });
  });

  it('should retrieve a value for a given key if options provided', function (done) {
    var value = 'bar';
    redisCache.set('foo', value, function () {
      redisCache.get('foo', {}, function (err, result) {
        expect(err).toBe(null);
        expect(result).toBe(value);
        done();
      });
    });
  });

  it('should return null when the key is invalid', function (done) {
    redisCache.get('invalidKey', function (err, result) {
      expect(err).toBe(null);
      expect(result).toBe(null);
      done();
    });
  });

  it('should return an error if there is an error acquiring a connection', function (done) {
    var pool = redisCache.store._pool;
    sinon.stub(pool, 'acquire').yieldsAsync('Something unexpected');
    sinon.stub(pool, 'release');
    redisCache.get('foo', function (err) {
      pool.acquire.restore();
      pool.release.restore();
      expect(err).not.toBe(null);
      done();
    });
  });
});

describe('del', function () {
  it('should delete a value for a given key', function (done) {
    redisCache.set('foo', 'bar', function () {
      redisCache.del('foo', function (err) {
        expect(err).toBe(null);
        done();
      });
    });
  });

  it('should delete a value for a given key without callback', function (done) {
    redisCache.set('foo', 'bar', function () {
      redisCache.del('foo');
      done();
    });
  });

  it('should return an error if there is an error acquiring a connection', function (done) {
    var pool = redisCache.store._pool;
    sinon.stub(pool, 'acquire').yieldsAsync('Something unexpected');
    sinon.stub(pool, 'release');
    redisCache.set('foo', 'bar', function () {
      redisCache.del('foo', function (err) {
        pool.acquire.restore();
        pool.release.restore();
        expect(err).not.toBe(null);
        done();
      });
    });
  });
});

describe('reset', function () {
  it('should flush underlying db', function (done) {
    redisCache.reset(function (err) {
      expect(err).toBe(null);
      done();
    });
  });

  it('should flush underlying db without callback', function (done) {
    redisCache.reset();
    done();
  });

  it('should return an error if there is an error acquiring a connection', function (done) {
    var pool = redisCache.store._pool;
    sinon.stub(pool, 'acquire').yieldsAsync('Something unexpected');
    sinon.stub(pool, 'release');
    redisCache.reset(function (err) {
      pool.acquire.restore();
      pool.release.restore();
      expect(err).not.toBe(null);
      done();
    });
  });
});

describe('ttl', function () {
  it('should retrieve ttl for a given key', function (done) {
    redisCache.set('foo', 'bar', function () {
      redisCache.ttl('foo', function (err, ttl) {
        expect(err).toBe(null);
        expect(ttl).toBe(config.redis.ttl);
        done();
      });
    });
  });

  it('should retrieve ttl for an invalid key', function (done) {
    redisCache.ttl('invalidKey', function (err, ttl) {
      expect(err).toBe(null);
      expect(ttl).not.toBe(null);
      done();
    });
  });

  it('should return an error if there is an error acquiring a connection', function (done) {
    var pool = redisCache.store._pool;
    sinon.stub(pool, 'acquire').yieldsAsync('Something unexpected');
    sinon.stub(pool, 'release');
    redisCache.set('foo', 'bar', function () {
      redisCache.ttl('foo', function (err) {
        pool.acquire.restore();
        pool.release.restore();
        expect(err).not.toBe(null);
        done();
      });
    });
  });
});

describe('keys', function () {
  it('should return an array of keys for the given pattern', function (done) {
    redisCache.set('foo', 'bar', function () {
      redisCache.keys('f*', function (err, arrayOfKeys) {
        expect(err).toBe(null);
        expect(arrayOfKeys).not.toBe(null);
        expect(arrayOfKeys.indexOf('foo')).not.toBe(-1);
        done();
      });
    });
  });

  it('should return an array of keys without pattern', function (done) {
    redisCache.set('foo', 'bar', function () {
      redisCache.keys(function (err, arrayOfKeys) {
        expect(err).toBe(null);
        expect(arrayOfKeys).not.toBe(null);
        expect(arrayOfKeys.indexOf('foo')).not.toBe(-1);
        done();
      });
    });
  });

  it('should return an error if there is an error acquiring a connection', function (done) {
    var pool = redisCache.store._pool;
    sinon.stub(pool, 'acquire').yieldsAsync('Something unexpected');
    sinon.stub(pool, 'release');
    redisCache.set('foo', 'bar', function () {
      redisCache.keys('f*', function (err) {
        pool.acquire.restore();
        pool.release.restore();
        expect(err).not.toBe(null);
        done();
      });
    });
  });
});

describe('isCacheableValue', function () {
  it('should return true when the value is not null or undefined', function (done) {
    expect(redisCache.store.isCacheableValue(0)).toBe(true);
    expect(redisCache.store.isCacheableValue(100)).toBe(true);
    expect(redisCache.store.isCacheableValue('')).toBe(true);
    expect(redisCache.store.isCacheableValue('test')).toBe(true);
    done();
  });

  it('should return false when the value is null or undefined', function (done) {
    expect(redisCache.store.isCacheableValue(null)).toBe(false);
    expect(redisCache.store.isCacheableValue(undefined)).toBe(false);
    done();
  });
});

describe('getClient', function () {
  it('should return redis client', function (done) {
    redisCache.store.getClient(function (err, redis) {
      expect(err).toBe(null);
      expect(redis).not.toBe(null);
      expect(redis.client).not.toBe(null);
      redis.done(done);
    });
  });

  it('should handle no done callback without an error', function (done) {
    redisCache.store.getClient(function (err, redis) {
      expect(err).toBe(null);
      expect(redis).not.toBe(null);
      expect(redis.client).not.toBe(null);
      redis.done();
      done();
    });
  });

  it('should return an error if there is an error acquiring a connection', function (done) {
    var pool = redisCache.store._pool;
    sinon.stub(pool, 'acquire').yieldsAsync('Something unexpected');
    sinon.stub(pool, 'release');
    redisCache.store.getClient(function (err) {
      pool.acquire.restore();
      pool.release.restore();
      expect(err).not.toBe(null);
      done();
    });
  });
});

describe('redisErrorEvent', function () {
  it('should return an error when the redis server is unavailable', function (done) {
    redisCache.store.events.on('redisError', function (err) {
      expect(err).not.toBe(null);
      done();
    });
    redisCache.store._pool.emit('error', 'Something unexpected');
  });
});

describe('uses url to override redis options', function () {
  var redisCacheByUrl;

  beforeAll(function () {
    redisCacheByUrl = require('cache-manager').caching({
      store: redisStore,
      // redis://[:password@]host[:port][/db-number][?option=value]
      url: 'redis://:' + config.redis.auth_pass +'@' + config.redis.host + ':' + config.redis.port + '/' + config.redis.db +'?ttl=' + config.redis.ttl,
      // some fakes to see that url overrides them
      host: 'test-host',
      port: -78,
      db: -7,
      auth_pass: 'test_pass',
      ttl: -6
    });
  });

  it('should ignore other options if set in url', function() {
    expect(redisCacheByUrl.store._pool._redis_options.host).toBe(config.redis.host);
    expect(redisCacheByUrl.store._pool._redis_options.port).toBe(config.redis.port);
    expect(redisCacheByUrl.store._pool._redis_default_db).toBe(config.redis.db);
    expect(redisCacheByUrl.store._pool._redis_options.auth_pass).toBe(config.redis.auth_pass);
  });

  it('should get and set values without error', function (done) {
    var key = 'byUrlKey';
    var value = 'test';
    redisCacheByUrl.set(key, value, function (err) {
      expect(err).toBe(null);
      redisCacheByUrl.get(key, function(getErr, val){
        expect(getErr).toBe(null);
        expect(val).toEqual(value);
        done();
      });
    });
  });
});

describe('overridable isCacheableValue function', function () {
  var redisCache2;

  beforeAll(function () {
    redisCache2 = require('cache-manager').caching({
      store: redisStore,
      isCacheableValue: function () {return 'I was overridden';}
    });
  });

  it('should return its return value instead of the built-in function', function (done) {
    expect(redisCache2.store.isCacheableValue(0)).toBe('I was overridden');
    done();
  });
});

describe('defaults', function () {
  var redisCache2;

  beforeAll(function () {
    redisCache2 = require('cache-manager').caching({
      store: redisStore
    });
  });

  it('should default the host to `127.0.0.1`', function () {
    expect(redisCache2.store._pool._redis_options.host).toBe('127.0.0.1');
  });

  it('should default the port to 6379', function () {
    expect(redisCache2.store._pool._redis_options.port).toBe(6379);
  });
});
