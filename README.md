Node Cache Manager store for Redis
==================================

[![Codacy Badge](https://img.shields.io/codacy/5b2c2727618c4acb8d06db34c2f61c03.svg)](https://www.codacy.com/public/dialonce/node-cache-manager-redis) [![Dependency Status](https://david-dm.org/dial-once/node-dom-extractor.svg)](https://david-dm.org/dial-once/node-cache-manager-redis)

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

redisCache.set('foo', 'bar', ttl, function(err) {
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
}, ttl, function (err, user) {
    console.log(user);

    // Second time fetches user from redisCache
    redisCache.wrap(key, function (cb) {
        getUser(userId, cb);
    }, function (err, user) {
        console.log(user);
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
multiCache.set('foo2', 'bar2', ttl, function(err) {
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
}, ttl, function (err, user) {
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

Contribution
------------

If you would like to contribute to the project, please fork it and send us a pull request.

License
-------

`node-cache-manager-redis` is licensed under the MIT license.
