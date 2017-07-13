Node Cache Manager store for Redis
==================================

[![Codacy Badge](https://api.codacy.com/project/badge/grade/3d5933f95c88472d9075dc302c8d62e1)](https://www.codacy.com/app/dialonce-jkernech/node-cache-manager-redis) [![Codacy Badge](https://api.codacy.com/project/badge/coverage/3d5933f95c88472d9075dc302c8d62e1)](https://www.codacy.com/app/dialonce-jkernech/node-cache-manager-redis) [![Dependency Status](https://david-dm.org/dial-once/node-cache-manager-redis.svg)](https://david-dm.org/dial-once/node-cache-manager-redis)

The Redis store for the [node-cache-manager](https://github.com/BryanDonovan/node-cache-manager) module.

Installation
------------

```sh
npm install cache-manager-redis --save
```

Usage examples
--------------

Here are examples that demonstrate how to implement the Redis cache store.

### Single store

```js
var cacheManager = require('cache-manager');
var redisStore = require('cache-manager-redis');

var redisCache = cacheManager.caching({
	store: redisStore,
	host: 'localhost', // default value
	port: 6379, // default value
	auth_pass: 'XXXXX',
	db: 0,
	ttl: 600
});

var ttl = 5;

// listen for redis connection error event
redisCache.store.events.on('redisError', function(error) {
	// handle error here
	console.log(error);
});

redisCache.set('foo', 'bar', { ttl: ttl }, function(err) {
    if (err) {
      throw err;
    }

    redisCache.get('foo', function(err, result) {
        console.log(result);
        // >> 'bar'
        redisCache.del('foo', function(err) {});
    });
});

function getUser(id, cb) {
    setTimeout(function () {
        console.log("Returning user from slow database.");
        cb(null, {id: id, name: 'Bob'});
    }, 100);
}

var userId = 123;
var key = 'user_' + userId;

// Note: ttl is optional in wrap()
redisCache.wrap(key, function (cb) {
    getUser(userId, cb);
}, { ttl: ttl }, function (err, user) {
    console.log(user);

    // Second time fetches user from redisCache
    redisCache.wrap(key, function (cb) {
        getUser(userId, cb);
    }, function (err, user) {
        console.log(user);
    });
});

// The del() method accepts a single key or array of keys,
// with or without a callback.
redisCache.set('foo', 'bar', function () {
    redisCache.set('bar', 'baz', function() {
        redisCache.set('baz', 'foo', function() {
          redisCache.del('foo');
          redisCache.del(['bar', 'baz'], function() { });
        });
    });
});

// The keys() method uses the Redis SCAN command and accepts
// optional `pattern` and `options` arguments. The `pattern`
// must be a Redis glob-style string and defaults to '*'. The
// options argument must be an object and accepts a single
// `scanCount` property, which determines the number of elements
// returned internally per call to SCAN. The default `scanCount`
// is 100.
redisCache.set('foo', 'bar', function () {
    redisCache.set('far', 'boo', function () {
        redisCache.keys('fo*', function (err, arrayOfKeys) {
            // arrayOfKeys: ['foo']
        });
        
        redisCache.keys(function (err, arrayOfKeys) {
            // arrayOfKeys: ['foo', 'far']
        });
        
        redisCache.keys('fa*', { scanCount: 10 }, function (err, arrayOfKeys) {
            // arrayOfKeys: ['far']
        });
    });
});

```

### Multi-store

```js
var cacheManager = require('cache-manager');
var redisStore = require('cache-manager-redis');

var redisCache = cacheManager.caching({store: redisStore, db: 0, ttl: 600});
var memoryCache = cacheManager.caching({store: 'memory', max: 100, ttl: 60});

var multiCache = cacheManager.multiCaching([memoryCache, redisCache]);


userId2 = 456;
key2 = 'user_' + userId;
ttl = 5;

// Sets in all caches.
multiCache.set('foo2', 'bar2', { ttl: ttl }, function(err) {
    if (err) { throw err; }

    // Fetches from highest priority cache that has the key.
    multiCache.get('foo2', function(err, result) {
        console.log(result);
        // >> 'bar2'

        // Delete from all caches
        multiCache.del('foo2');
    });
});

// Note: ttl is optional in wrap()
multiCache.wrap(key2, function (cb) {
    getUser(userId2, cb);
}, { ttl: ttl }, function (err, user) {
    console.log(user);

    // Second time fetches user from memoryCache, since it's highest priority.
    // If the data expires in the memory cache, the next fetch would pull it from
    // the 'someOtherCache', and set the data in memory again.
    multiCache.wrap(key2, function (cb) {
        getUser(userId2, cb);
    }, function (err, user) {
        console.log(user);
    });
});
```

### Using a URL instead of options (if url is correct it overrides options host, port, db, auth_pass and ttl)
Urls should be in this format `redis://[:password@]host[:port][/db-number][?ttl=value]`
```js
var cacheManager = require('cache-manager');
var redisStore = require('cache-manager-redis');

var redisCache = cacheManager.caching({
	store: redisStore,
	url: 'redis://:XXXX@localhost:6379/0?ttl=600'
});

// proceed with redisCache
```

### Seamless compression (currently only supports Node's built-in zlib / gzip implementation)

```js
// Compression can be configured for the entire cache.
var redisCache = cacheManager.caching({
	store: redisStore,
	host: 'localhost', // default value
	port: 6379, // default value
	auth_pass: 'XXXXX',
	db: 0,
	ttl: 600,
	compress: true
});

// Or on a per command basis. (only applies to get / set / wrap)
redisCache.set('foo', 'bar', { compress: false }, function(err) {
    if (err) {
      throw err;
    }

    redisCache.get('foo', { compress: false }, function(err, result) {
        console.log(result);
        // >> 'bar'
        redisCache.del('foo', function(err) {});
    });
});

// Setting the compress option to true will enable a default configuration 
// for best speed using gzip. For advanced use, a configuration object may 
// also be passed with implementation-specific parameters. Currently, only 
// the built-in zlib/gzip implementation is supported.
var zlib = require('zlib');
var redisCache = cacheManager.caching({
	store: redisStore,
	host: 'localhost', // default value
	port: 6379, // default value
	auth_pass: 'XXXXX',
	db: 0,
	ttl: 600,
	compress: {
	  type: 'gzip',
	  params: {
	    level: zlib.Z_BEST_COMPRESSION
	  } 
	}
});
```
Currently, all implementation-specific configuration parameters are passed directly to the `zlib.gzip` and `zlib.gunzip` methods. Please see the [Node Zlib documentation](https://nodejs.org/dist/latest-v6.x/docs/api/zlib.html#zlib_class_options) for available options.

Tests
-----

1. Run a Redis server
2. Run tests `npm test` or `npm run coverage`


Contribution
------------

If you would like to contribute to the project, please fork it and send us a pull request. Please add tests for any new features or bug fixes. Also make sure the code coverage is not impacted.


License
-------

`node-cache-manager-redis` is licensed under the MIT license.
