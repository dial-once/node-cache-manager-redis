var config = require('../config.json');
var redisStore = require('../../index');
var sinon = require('sinon');
var assert = require('assert');


var redisCache;
var customRedisCache;
var sandbox;
var injectError;

before(function () {
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
      if (val === undefined) {
        return true;
      } else if (val === 'FooBarString') {
        // disallow FooBarString
        return false;
      }
      return redisCache.store.isCacheableValue(val);
    }
  });

  sandbox = sinon.sandbox.create();

  injectError = () => {
    var pool = redisCache.store._pool;

    sandbox.stub(pool, 'acquireDb').yieldsAsync('Something unexpected');
    sandbox.stub(pool, 'release');
  };
});

beforeEach(function() {
  sandbox.restore();

  return redisCache.reset();
});

describe ('initialization', function () {

  it('should create a store with password instead of auth_pass (auth_pass is deprecated for redis > 2.5)', function (done) {
    var redisPwdCache = require('cache-manager').caching({
      store: redisStore,
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.auth_pass,
      db: config.redis.db,
      ttl: config.redis.ttl
    });

    assert.equal(redisPwdCache.store._pool._redis_options.password, config.redis.auth_pass);
    redisPwdCache.set('pwdfoo', 'pwdbar', function (err) {
      assert.equal(err, null);
      redisCache.del('pwdfoo', function (errDel) {
        assert.equal(errDel, null);
        done();
      });
    });
  });

});

describe('set', function () {
  it('should return a promise', function (done) {
    assert.ok(redisCache.set('foo', 'bar') instanceof Promise);
    done();
  });

  it('should resolve promise on success', function (done) {
    redisCache.set('foo', 'bar').then(result => {
      assert.equal(result, 'OK');
      done();
    });
  });

  it('should reject promise on error', function (done) {
    redisCache.set('foo', null)
      .then(() => done(new Error ('Should reject')))
      .catch(() => done());
  });

  it('should store a value without ttl', function (done) {
    redisCache.set('foo', 'bar', function (err) {
      assert.equal(err, null);
      done();
    });
  });

  it('should store a value with a specific ttl', function (done) {
    redisCache.set('foo', 'bar', config.redis.ttl, function (err) {
      assert.equal(err, null);
      done();
    });
  });

  it('should store a value with a infinite ttl', function (done) {
    redisCache.set('foo', 'bar', {ttl: 0}, function (err) {
      assert.equal(err, null);
      redisCache.ttl('foo', function (err, ttl) {
        assert.equal(err, null);
        assert.equal(ttl, -1);
        done();
      });
    });
  });

  it('should not be able to store a null value (not cacheable)', function (done) {
    redisCache.set('foo2', null, function (err) {
      if (err) {
        return done();
      }
      done(new Error('Null is not a valid value!'));
    });
  });

  it('should store a value without callback', function (done) {
    redisCache.set('foo', 'baz');
    redisCache.get('foo', function (err, value) {
      assert.equal(err, null);
      assert.equal(value, 'baz');
      done();
    });
  });

  it('should not store an invalid value', function (done) {
    redisCache.set('foo1', undefined, function (err) {
      try {
        assert.notEqual(err, null);
        assert.equal(err.message, 'value cannot be undefined');
        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('should store an undefined value if permitted by isCacheableValue', function (done) {
    assert(customRedisCache.store.isCacheableValue(undefined), true);
    customRedisCache.set('foo3', undefined, function (err) {
      try {
        assert.equal(err, null);
        customRedisCache.get('foo3', function (err, data) {
          try {
            assert.equal(err, null);
            // redis stored undefined as 'undefined'
            assert.equal(data, 'undefined');
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

  it('should not store a value disallowed by isCacheableValue', function (done) {
    assert.strictEqual(customRedisCache.store.isCacheableValue('FooBarString'), false);
    customRedisCache.set('foobar', 'FooBarString', function (err) {
      try {
        assert.notEqual(err, null);
        assert.equal(err.message, 'value cannot be FooBarString');
        done();
      } catch (e) {
        done(e);
      }
    });
  });

});

describe('get', function () {
  it('should return a promise', function (done) {
    assert.ok(redisCache.get('foo') instanceof Promise);
    done();
  });

  it('should resolve promise on success', function (done) {
    redisCache.set('foo', 'bar')
      .then(() => redisCache.get('foo'))
      .then(result => {
        assert.equal(result, 'bar');
        done();
      });
  });

  it('should reject promise on error', function (done) {
    injectError();
    redisCache.get('foo')
      .then(() => done(new Error ('Should reject')))
      .catch(() => done());
  });

  it('should retrieve a value for a given key', function (done) {
    var value = 'bar';
    redisCache.set('foo', value, function () {
      redisCache.get('foo', function (err, result) {
        assert.equal(err, null);
        assert.equal(result, value);
        done();
      });
    });
  });

  it('should retrieve a value for a given key if options provided', function (done) {
    var value = 'bar';
    redisCache.set('foo', value, function () {
      redisCache.get('foo', {}, function (err, result) {
        assert.equal(err, null);
        assert.equal(result, value);
        done();
      });
    });
  });

  it('should return null when the key is invalid', function (done) {
    redisCache.get('invalidKey', function (err, result) {
      assert.equal(err, null);
      assert.equal(result, null);
      done();
    });
  });

  it('should return an error if there is an error acquiring a connection', function (done) {
    injectError();
    redisCache.get('foo', function (err) {
      assert.notEqual(err, null);
      done();
    });
  });
});

describe('del', function () {
  it('should return a promise', function () {
    assert.ok(redisCache.del('foo', 'bar') instanceof Promise);
  });

  it('should resolve promise on success', function () {
    return redisCache.del('foo', 'bar').then(result => assert.equal(result, 'OK'));
  });

  it('should reject promise on error', function () {
    injectError();

    return redisCache.del('foo').then(res => assert.fail(res), err => assert.notEqual(err, null));
  });

  it('should delete a value for a given key', function (done) {
    redisCache.set('foo', 'bar', function () {
      redisCache.del('foo', function (err) {
        assert.equal(err, null);
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

  it('should delete multiple values for a given array of keys', function (done) {
    redisCache.set('foo', 'bar', function () {
      redisCache.set('bar', 'baz', function () {
        redisCache.set('baz', 'foo', function () {
          redisCache.del(['foo', 'bar', 'baz'], function (err) {
            assert.equal(err, null);
            done();
          });
        });
      });
    });
  });

  it('should delete multiple values for a given array of keys without callback', function (done) {
    redisCache.set('foo', 'bar', function () {
      redisCache.set('bar', 'baz', function () {
        redisCache.set('baz', 'foo', function () {
          redisCache.del(['foo', 'bar', 'baz']);
          done();
        });
      });
    });
  });

  it('should return an error if there is an error acquiring a connection', function (done) {
    injectError();
    redisCache.set('foo', 'bar', function () {
      redisCache.del('foo', function (err) {
        assert.notEqual(err, null);
        done();
      });
    });
  });
});

describe('reset', function () {
  it('should return a promise', function () {
    assert.ok(redisCache.reset() instanceof Promise);
  });

  it('should resolve promise on success', function () {
    return redisCache.reset().then(result => assert.equal(result, 'OK'));
  });

  it('should reject promise on error', function () {
    injectError();

    return redisCache.reset().then(res => assert.fail(res), err => assert.notEqual(err, null));
  });

  it('should flush underlying db', function (done) {
    redisCache.reset(function (err) {
      assert.equal(err, null);
      done();
    });
  });

  it('should flush underlying db without callback', function (done) {
    redisCache.reset();
    done();
  });

  it('should return an error if there is an error acquiring a connection', function (done) {
    injectError();
    redisCache.reset(function (err) {
      assert.notEqual(err, null);
      done();
    });
  });
});

describe('ttl', function () {
  it('should return a promise', function () {
    assert.ok(redisCache.ttl('foo') instanceof Promise);
  });

  it('should resolve promise on success', function () {
    return redisCache.ttl('foo').then(result => assert.ok(Number.isInteger(result)));
  });

  it('should reject promise on error', function () {
    injectError();

    return redisCache.ttl('foo').then(() => assert.fail(), err => assert.notEqual(err, null));
  });

  it('should retrieve ttl for a given key', function (done) {
    redisCache.set('foo', 'bar', function () {
      redisCache.ttl('foo', function (err, ttl) {
        assert.equal(err, null);
        assert.equal(ttl, config.redis.ttl);
        done();
      });
    });
  });

  it('should retrieve ttl for an invalid key', function (done) {
    redisCache.ttl('invalidKey', function (err, ttl) {
      assert.equal(err, null);
      assert.notEqual(ttl, null);
      done();
    });
  });

  it('should return an error if there is an error acquiring a connection', function (done) {
    injectError();
    redisCache.set('foo', 'bar', function () {
      redisCache.ttl('foo', function (err) {
        assert.notEqual(err, null);
        done();
      });
    });
  });
});

describe('keys', function () {
  it('should return a promise', function () {
    assert.ok(redisCache.keys('f*') instanceof Promise);
  });

  it('should resolve promise on success', function () {
    return redisCache.keys('f*').then(result => assert.ok(Array.isArray(result)));
  });

  it('should reject promise on error', function () {
    injectError();

    return redisCache.keys('f*').then(res => assert.fail(res), err => assert.notEqual(err, null));
  });

  it('should return an array of keys for the given pattern', function (done) {
    redisCache.set('foo', 'bar', function () {
      redisCache.set('far', 'boo', function () {
        redisCache.set('faz', 'bam', function () {
          redisCache.keys('f*', function (err, arrayOfKeys) {
            assert.equal(err, null);
            assert.notEqual(arrayOfKeys, null);
            assert.notEqual(arrayOfKeys.indexOf('foo'), -1);
            assert.equal(arrayOfKeys.length, 3);
            done();
          });
        });
      });
    });
  });

  it('should accept a scanCount option', function (done) {
    redisCache.set('foo', 'bar', function () {
      redisCache.set('far', 'boo', function () {
        redisCache.set('faz', 'bam', function () {
          redisCache.keys('f*', { scanCount: 10 }, function (err, arrayOfKeys) {
            assert.equal(err, null);
            assert.notEqual(arrayOfKeys, null);
            assert.notEqual(arrayOfKeys.indexOf('foo'), -1);
            assert.equal(arrayOfKeys.length, 3);
            done();
          });
        });
      });
    });
  });

  it('should return an array of keys without pattern', function (done) {
    redisCache.set('foo', 'bar', function () {
      redisCache.set('far', 'boo', function () {
        redisCache.set('faz', 'bam', function () {
          redisCache.keys(function (err, arrayOfKeys) {
            assert.equal(err, null);
            assert.notEqual(arrayOfKeys, null);
            assert.notEqual(arrayOfKeys.indexOf('foo'), -1);
            assert.equal(arrayOfKeys.length, 3);
            done();
          });
        });
      });
    });
  });

  it('should accept scanCount option without pattern', function (done) {
    redisCache.set('foo', 'bar', function () {
      redisCache.set('far', 'boo', function () {
        redisCache.set('faz', 'bam', function () {
          redisCache.keys({ scanCount: 10 }, function (err, arrayOfKeys) {
            assert.equal(err, null);
            assert.notEqual(arrayOfKeys, null);
            assert.notEqual(arrayOfKeys.indexOf('foo'), -1);
            assert.equal(arrayOfKeys.length, 3);
            done();
          });
        });
      });
    });
  });

  it('should return an error if there is an error acquiring a connection', function (done) {
    injectError();
    redisCache.set('foo', 'bar', function () {
      redisCache.keys('f*', function (err) {
        assert.notEqual(err, null);
        done();
      });
    });
  });
});

describe('isCacheableValue', function () {
  it('should return true when the value is not undefined', function (done) {
    assert.equal(redisCache.store.isCacheableValue(0), true);
    assert.equal(redisCache.store.isCacheableValue(100), true);
    assert.equal(redisCache.store.isCacheableValue(''), true);
    assert.equal(redisCache.store.isCacheableValue('test'), true);
    done();
  });

  it('should return false when the value is undefined', function (done) {
    assert.equal(redisCache.store.isCacheableValue(undefined), false);
    done();
  });

  it('should return false when the value is null', function (done) {
    assert.equal(redisCache.store.isCacheableValue(null), false);
    done();
  });
});

describe('getClient', function () {
  it('should return a promise', function () {
    assert.ok(redisCache.store.getClient().then(redis => redis.done()) instanceof Promise);
  });

  it('should resolve promise on success', function () {
    return redisCache.store.getClient().then(redis => {
      assert.notEqual(redis, null);
      redis.done();
    });
  });

  it('should reject promise on error', function () {
    injectError();

    return redisCache.store.getClient().then(res => assert.fail(res), err => assert.notEqual(err, null));
  });

  it('should return redis client', function (done) {
    redisCache.store.getClient(function (err, redis) {
      assert.equal(err, null);
      assert.notEqual(redis, null);
      assert.notEqual(redis.client, null);
      redis.done(done);
    });
  });

  it('should handle no done callback without an error', function (done) {
    redisCache.store.getClient(function (err, redis) {
      assert.equal(err, null);
      assert.notEqual(redis, null);
      assert.notEqual(redis.client, null);
      redis.done();
      done();
    });
  });

  it('should return an error if there is an error acquiring a connection', function (done) {
    injectError();
    redisCache.store.getClient(function (err) {
      assert.notEqual(err, null);
      done();
    });
  });
});

describe('redisErrorEvent', function () {
  it('should return an error when the redis server is unavailable', function (done) {
    redisCache.store.events.on('redisError', function (err) {
      assert.notEqual(err, null);
      done();
    });
    redisCache.store._pool.emit('error', 'Something unexpected');
  });
});

describe('uses url to override redis options', function () {
  var redisCacheByUrl;

  before(function () {
    redisCacheByUrl = require('cache-manager').caching({
      store: redisStore,
      // redis://[:password@]host[:port][/db-number][?option=value]
      url: 'redis://:' + config.redis.auth_pass +'@' + config.redis.host + ':' + config.redis.port + '/' + config.redis.db +'?ttl=' + config.redis.ttl,
      // some fakes to see that url overrides them
      host: 'test-host',
      port: -78,
      db: -7,
      auth_pass: 'test_pass',
      password: 'test_pass',
      ttl: -6
    });
  });

  it('should ignore other options if set in url', function() {
    assert.equal(redisCacheByUrl.store._pool._redis_options.host, config.redis.host);
    assert.equal(redisCacheByUrl.store._pool._redis_options.port, config.redis.port);
    assert.equal(redisCacheByUrl.store._pool._redis_default_db, config.redis.db);
    assert.equal(redisCacheByUrl.store._pool._redis_options.auth_pass, config.redis.auth_pass);
    assert.equal(redisCacheByUrl.store._pool._redis_options.password, config.redis.auth_pass);
  });

  it('should get and set values without error', function (done) {
    var key = 'byUrlKey';
    var value = 'test';
    redisCacheByUrl.set(key, value, function (err) {
      assert.equal(err, null);
      redisCacheByUrl.get(key, function(getErr, val){
        assert.equal(getErr, null);
        assert.equal(val, value);
        done();
      });
    });
  });
});

describe('overridable isCacheableValue function', function () {
  var redisCache2;

  before(function () {
    redisCache2 = require('cache-manager').caching({
      store: redisStore,
      isCacheableValue: function () {return 'I was overridden';}
    });
  });

  it('should return its return value instead of the built-in function', function (done) {
    assert.equal(redisCache2.store.isCacheableValue(0), 'I was overridden');
    done();
  });
});

describe('defaults', function () {
  var redisCache2;

  before(function () {
    redisCache2 = require('cache-manager').caching({
      store: redisStore
    });
  });

  it('should default the host to `127.0.0.1`', function () {
    assert.equal(redisCache2.store._pool._redis_options.host, '127.0.0.1');
  });

  it('should default the port to 6379', function () {
    assert.equal(redisCache2.store._pool._redis_options.port, 6379);
  });
});

describe('wrap function', function () {

  // Simulate retrieving a user from a database
  function getUser(id, cb) {
    setTimeout(function () {
      cb(null, { id: id });
    }, 100);
  }

  // Simulate retrieving a user from a database with Promise
  function getUserPromise(id) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({ id: id });
      }, 100);
    });
  }

  it('should be able to cache objects', function (done) {
    var userId = 123;

    // First call to wrap should run the code
    redisCache.wrap('wrap-user', function (cb) {
      getUser(userId, cb);
    }, function (err, user) {
      assert.equal(user.id, userId);

      // Second call to wrap should retrieve from cache
      redisCache.wrap('wrap-user', function (cb) {
        getUser(userId+1, cb);
      }, function (err, user) {
        assert.equal(user.id, userId);
        done();
      });
    });
  });

  it('should work with promises', function () {
    var userId = 123;

    // First call to wrap should run the code
    return redisCache
      .wrap('wrap-promise', function () {
        return getUserPromise(userId);
      })
      .then(function (user) {
        assert.equal(user.id, userId);

        // Second call to wrap should retrieve from cache
        return redisCache
          .wrap('wrap-promise', function () {
            return getUserPromise(userId+1);
          })
          .then(function (user) {
            assert.equal(user.id, userId);
          });
      });
  });
});
