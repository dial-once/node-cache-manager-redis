'use strict';

var redis = require('redis');
var EventEmitter = require('events').EventEmitter;

/**
 * The cache manager Redis Store module
 * @module redisStore
 * @param {Object} [args] - The store configuration (optional)
 * @param {String} args.host - The Redis server host
 * @param {Number} args.port - The Redis server port
 * @param {Number} args.db - The Redis server db
 * @param {function} args.isCacheableValue - function to override built-in isCacheableValue function (optional)
 */
function redisStore(args) {
  var self = {
    name: 'redis',
    events: new EventEmitter()
  };

  // cache-manager should always pass in args
  /* istanbul ignore next */
  var redisOptions = args || {};

  redisOptions.host = args.host || '127.0.0.1';
  redisOptions.port = args.port || 6379;

  var conn = redis.createClient(redisOptions.port, redisOptions.host, redisOptions);
  conn.on('error', function (err) {
    self.events.emit('redisError', err);
  });

  var requestQueue = {};

  setImmediate(fulfillRequests);

  function addRequest(keys, cb) {
    keys.forEach(function (key) {
      requestQueue[key] = requestQueue[key] || [];
      requestQueue[key].push(cb);
    });
  }

  function fulfillRequests() {
    var keys = Object.keys(requestQueue);
    if (!keys.length) {
      setImmediate(fulfillRequests);
      return;
    }
    conn.mget(keys, function (err, values) {
      keys.forEach(function (key, i) {
        var cbs = requestQueue[key];
        delete requestQueue[key];
        cbs.forEach(function (cb) {
          cb(err, values[i]);
        });
      });
      setImmediate(fulfillRequests);
    });
  }

  /**
   * Helper to handle callback and release the connection
   * @private
   * @param {Function} [cb] - A callback that returns a potential error and the response
   * @param {Object} [opts] - The options (optional)
   */
  function handleResponse(cb, opts) {
    opts = opts || {};

    return function (err, result) {
      if (err) {
        return cb && cb(err);
      }

      if (opts.parse) {
        result = JSON.parse(result);
      }

      if (cb) {
        cb(null, result);
      }
    };
  }

  /**
   * Get a value for a given key.
   * @method get
   * @param {String} key - The cache key
   * @param {Object} [options] - The options (optional)
   * @param {Function} cb - A callback that returns a potential error and the response
   */
  self.get = function (key, options, cb) {
    if (typeof options === 'function') {
      cb = options;
    }

    addRequest([key], handleResponse(cb, {
      parse: true
    }));
  };

  /**
   * Set a value for a given key.
   * @method set
   * @param {String} key - The cache key
   * @param {String} value - The value to set
   * @param {Object} [options] - The options (optional)
   * @param {Object} options.ttl - The ttl value
   * @param {Function} [cb] - A callback that returns a potential error, otherwise null
   */
  self.set = function (key, value, options, cb) {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }
    options = options || {};

    var ttl = (options.ttl || options.ttl === 0) ? options.ttl : redisOptions.ttl;

    var val = JSON.stringify(value);

    if (ttl) {
      conn.setex(key, ttl, val, handleResponse(cb));
    } else {
      conn.set(key, val, handleResponse(cb));
    }
  };

  /**
   * Delete value of a given key
   * @method del
   * @param {String} key - The cache key
   * @param {Object} [options] - The options (optional)
   * @param {Function} [cb] - A callback that returns a potential error, otherwise null
   */
  self.del = function (key, options, cb) {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }

    conn.del(key, handleResponse(cb));
  };

  /**
   * Delete all the keys of the currently selected DB
   * @method reset
   * @param {Function} [cb] - A callback that returns a potential error, otherwise null
   */
  self.reset = function (cb) {
    conn.flushdb(handleResponse(cb));
  };

  /**
   * Returns the remaining time to live of a key that has a timeout.
   * @method ttl
   * @param {String} key - The cache key
   * @param {Function} cb - A callback that returns a potential error and the response
   */
  self.ttl = function (key, cb) {
    conn.ttl(key, handleResponse(cb));
  };

  /**
   * Returns all keys matching pattern.
   * @method keys
   * @param {String} pattern - The pattern used to match keys
   * @param {Function} cb - A callback that returns a potential error and the response
   */
  self.keys = function (pattern, cb) {
    if (typeof pattern === 'function') {
      cb = pattern;
      pattern = '*';
    }

    conn.keys(pattern, handleResponse(cb));
  };

  /**
   * Specify which values should and should not be cached.
   * If the function returns true, it will be stored in cache.
   * By default, it caches everything except null and undefined values.
   * Can be overriden via standard node-cache-manager options.
   * @method isCacheableValue
   * @param {String} value - The value to check
   * @return {Boolean} - Returns true if the value is cacheable, otherwise false.
   */
  self.isCacheableValue = args.isCacheableValue || function (value) {
      return value !== null && value !== undefined;
    };

  /**
   * Returns the underlying redis client connection
   * @method getClient
   * @param {Function} cb - A callback that returns a potential error and an object containing the Redis client and a done method
   */
  self.getClient = function (cb) {

    cb(null, {
      client: conn,
      done: function (done) {
        var args = Array.prototype.slice.call(arguments, 1);

        if (done && typeof done === 'function') {
          done.apply(null, args);
        }
      }
    });
  };

  return self;
}

module.exports = {
  create: function (args) {
    return redisStore(args);
  }
};
