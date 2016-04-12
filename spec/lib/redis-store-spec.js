var redis = require('redis');
var Promise = require('bluebird');
var sinon = require('sinon');

var config = require('../config.json');
var redisStore = require('../../index');

var redisCache;

beforeAll(function () {
  redisCache = require('cache-manager').caching({
    store: redisStore,
    host: config.redis.host,
    port: config.redis.port,
    db: config.redis.db,
    ttl: config.redis.ttl
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
});

describe('redisErrorEvent', function () {
  it('should return an error when the redis server is unavailable', function (done) {
    redisCache.store.events.on('redisError', function (err) {
      expect(err).not.toBe(null);
      done();
    });
    redisCache.store.getClient(function (err, result) {
      result.client.emit('error', 'Something unexpected');
      // result.done();
    });
  });
});

describe('overridable isCacheableValue function', function () {
  var redisCache2;

  beforeAll(function () {
    redisCache2 = require('cache-manager').caching({
      store: redisStore,
      isCacheableValue: function () {
        return 'I was overridden';
      }
    });
  });

  it('should return its return value instead of the built-in function', function (done) {
    expect(redisCache2.store.isCacheableValue(0)).toBe('I was overridden');
    done();
  });
});

describe('multi get', function () {
  it('should merge redis request', function (done) {
    var redis = require('redis');
    // spy
    var _mget = redis.RedisClient.prototype.mget;
    var callCount = 0;
    redis.RedisClient.prototype.mget = function () {
      expect(++callCount).toEqual(1);
      expect(arguments[0]).toEqual(['foo', 'foo1']);
      _mget.apply(this, arguments);
    };

    Promise.map(['foo', 'foo1'], function (key) {
      return new Promise(function (resolve, reject) {
        redisCache.get(key, function (err, value) {
          if (err) {
            reject(err);
          } else {
            resolve(value);
          }
        });
      });
    }).then(function (values) {
      expect(values.length).toBe(2);
      expect(values).toContain('bar');
      expect(values).toContain(null);
    }).then(function () {
      // restore
      redis.RedisClient.prototype.mget = _mget;
      done();
    }, done);
  });
});


