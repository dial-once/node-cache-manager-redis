'use strict';

var RedisPool = require('sol-redis-pool');
var EventEmitter = require('events').EventEmitter;
var redisUrl = require('redis-url');

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
  var redisOptions = getFromUrl(args) || args || {};
  var poolSettings = redisOptions;

  redisOptions.host = redisOptions.host || '127.0.0.1';
  redisOptions.port = redisOptions.port || 6379;
  redisOptions.db = redisOptions.db || 0;

  var pool = new RedisPool(redisOptions, poolSettings);

  pool.on('error', function(err) {
    self.events.emit('redisError', err);
  });

  /**
   * Helper to connect to a connection pool
   * @private
   * @param {Function} cb - A callback that returns
   */
  function connect(cb) {
    pool.acquireDb(cb, redisOptions.db);
  }

  /**
   * Helper to handle callback and release the connection
   * @private
   * @param {Object} conn - The Redis connection
   * @param {Function} [cb] - A callback that returns a potential error and the result
   * @param {Object} [opts] - The options (optional)
   */
  function handleResponse(conn, cb, opts) {
    opts = opts || {};

    return function(err, result) {
      pool.release(conn);

      if (err) {
        return cb && cb(err);
      }

      if (opts.parse) {
        try {
          result = JSON.parse(result);
        } catch (e) {
          return cb && cb(e);
        }
      }

      if (cb) {
        cb(null, result);
      }
    };
  }

  /**
   * Extracts options from an args.url
   * @param {Object} args
   * @param {String} args.url a string in format of redis://[:password@]host[:port][/db-number][?option=value]
   * @returns {Object} the input object args if it is falsy, does not contain url or url is not string, otherwise a new object with own properties of args
   * but with host, port, db, ttl and auth_pass properties overridden by those provided in args.url.
   */
  function getFromUrl(args) {
    if (!args || typeof args.url !== 'string') {
      return args;
    }

    try {
      var options = redisUrl.parse(args.url);
      // make a clone so we don't change input args
      return applyOptionsToArgs(args, options);
    } catch (e) {
      //url is unparsable so returning original
      return args;
    }

  }

  /**
   * Clones args'es own properties to a new object and sets isCacheableValue on the new object
   * @param  {Object} args
   * @returns {Object} a clone of the args object
   */
  function cloneArgs(args) {
    var newArgs = {};
    for(var key in args){
      if (key && args.hasOwnProperty(key)) {
        newArgs[key] = args[key];
      }
    }
    newArgs.isCacheableValue = args.isCacheableValue && args.isCacheableValue.bind(newArgs);
    return newArgs;
  }

  /**
   * Apply some options like hostname, port, db, ttl, auth_pass, password
   * from options to newArgs host, port, db, auth_pass, password and ttl and return clone of args
   * @param {Object} args
   * @param {Object} options
   * @returns {Object} clone of args param with properties set to those of options
   */
  function applyOptionsToArgs(args, options) {
    var newArgs = cloneArgs(args);
    newArgs.host = options.hostname;
    newArgs.port = parseInt(options.port, 10);
    newArgs.db = parseInt(options.database, 10);
    newArgs.auth_pass = options.password;
    newArgs.password = options.password;
    if(options.query && options.query.ttl){
      newArgs.ttl = parseInt(options.query.ttl, 10);
    }
    return newArgs;
  }

  /**
   * Get a value for a given key.
   * @method get
   * @param {String} key - The cache key
   * @param {Object} [options] - The options (optional)
   * @param {Function} cb - A callback that returns a potential error and the response
   */
  self.get = function(key, options, cb) {
    if (typeof options === 'function') {
      cb = options;
    }

    connect(function(err, conn) {
      if (err) {
        return cb && cb(err);
      }

      conn.get(key, handleResponse(conn, cb, {
        parse: true
      }));
    });
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
  self.set = function(key, value, options, cb) {

    if (typeof options === 'function') {
      cb = options;
      options = {};
    }

    if (!self.isCacheableValue(value)) {
      return cb(new Error('value cannot be ' + value));
    }

    options = options || {};

    var ttl = (options.ttl || options.ttl === 0) ? options.ttl : redisOptions.ttl;

    connect(function(err, conn) {
      if (err) {
        return cb && cb(err);
      }
      var val = JSON.stringify(value) || '"undefined"';
      if (ttl) {
        conn.setex(key, ttl, val, handleResponse(conn, cb));
      } else {
        conn.set(key, val, handleResponse(conn, cb));
      }
    });
  };

  /**
   * Delete value of a given key
   * @method del
   * @param {String} key - The cache key
   * @param {Object} [options] - The options (optional)
   * @param {Function} [cb] - A callback that returns a potential error, otherwise null
   */
  self.del = function(key, options, cb) {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }

    connect(function(err, conn) {
      if (err) {
        return cb && cb(err);
      }
      conn.del(key, handleResponse(conn, cb));
    });
  };

  /**
   * Delete all the keys of the currently selected DB
   * @method reset
   * @param {Function} [cb] - A callback that returns a potential error, otherwise null
   */
  self.reset = function(cb) {
    connect(function(err, conn) {
      if (err) {
        return cb && cb(err);
      }
      conn.flushdb(handleResponse(conn, cb));
    });
  };

  /**
   * Returns the remaining time to live of a key that has a timeout.
   * @method ttl
   * @param {String} key - The cache key
   * @param {Function} cb - A callback that returns a potential error and the response
   */
  self.ttl = function(key, cb) {
    connect(function(err, conn) {
      if (err) {
        return cb && cb(err);
      }
      conn.ttl(key, handleResponse(conn, cb));
    });
  };

  /**
   * Returns all keys matching pattern.
   * @method keys
   * @param {String} pattern - The pattern used to match keys
   * @param {Function} cb - A callback that returns a potential error and the response
   */
  self.keys = function(pattern, cb) {
    if (typeof pattern === 'function') {
      cb = pattern;
      pattern = '*';
    }

    connect(function(err, conn) {
      if (err) {
        return cb && cb(err);
      }
      conn.keys(pattern, handleResponse(conn, cb));
    });
  };

  /**
   * Specify which values should and should not be cached.
   * If the function returns true, it will be stored in cache.
   * By default, it caches everything except undefined and null values.
   * Can be overriden via standard node-cache-manager options.
   * @method isCacheableValue
   * @param {String} value - The value to check
   * @return {Boolean} - Returns true if the value is cacheable, otherwise false.
   */
  self.isCacheableValue = args.isCacheableValue || function(value) {
    return value !== undefined && value !== null;
  };

  /**
   * Returns the underlying redis client connection
   * @method getClient
   * @param {Function} cb - A callback that returns a potential error and an object containing the Redis client and a done method
   */
  self.getClient = function(cb) {
    connect(function(err, conn) {
      if (err) {
        return cb && cb(err);
      }
      cb(null, {
        client: conn,
        done: function(done) {
          var args = Array.prototype.slice.call(arguments, 1);
          pool.release(conn);

          if (done && typeof done === 'function') {
            done.apply(null, args);
          }
        }
      });
    });
  };

  /**
   * Expose the raw pool object for testing purposes
   * @private
   */
  self._pool = pool;

  return self;
}

module.exports = {
  create: function(args) {
    return redisStore(args);
  }
};
