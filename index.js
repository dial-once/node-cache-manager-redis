'use strict';

var RedisPool = require('sol-redis-pool');
var EventEmitter = require('events').EventEmitter;
var redisUrl = require('redis-url');
var zlib = require('zlib');

/**
 * The cache manager Redis Store module
 * @module redisStore
 * @param {Object} [args] - The store configuration (optional)
 * @param {String} args.host - The Redis server host
 * @param {Number} args.port - The Redis server port
 * @param {Number} args.db - The Redis server db
 * @param {function} args.isCacheableValue - function to override built-in isCacheableValue function (optional)
 * @param {boolean|Object} args.compress - (optional) Boolean / Config Object for pluggable compression.
 *            Setting this to true will use a default gzip configuration for best speed. Passing in a config
 *            object will forward those settings to the underlying compression implementation. Please see the
 *            Node zlib documentation for a list of valid options for gzip:
 *            https://nodejs.org/dist/latest-v4.x/docs/api/zlib.html#zlib_class_options
 */
function redisStore(args = {}) {
  var self = {
    name: 'redis',
    events: new EventEmitter()
  };

  // cache-manager should always pass in args
  /* istanbul ignore next */
  var redisOptions = getFromUrl(args) || args;
  var poolSettings = redisOptions;
  var Promise = args.promiseDependency || global.Promise;

  redisOptions.host = redisOptions.host || '127.0.0.1';
  redisOptions.port = redisOptions.port || 6379;
  redisOptions.db = redisOptions.db || 0;

  // default compress config
  redisOptions.detect_buffers = true;
  var compressDefault = {
    type: 'gzip',
    params: {
      level: zlib.Z_BEST_SPEED
    }
  };

  // if compress is boolean true, set default
  if (redisOptions.compress === true) {
    redisOptions.compress = compressDefault;
  }

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

        if (result && opts.compress) {
          return zlib.gunzip(result, opts.compress.params || {}, function (gzErr, gzResult) {
            if (gzErr) {
              return cb && cb(gzErr);
            }
            try {
              gzResult = JSON.parse(gzResult);
            } catch (e) {
              return cb && cb(e);
            }

            return cb && cb(null, gzResult);
          });
        }

        try {
          result = JSON.parse(result);
        } catch (e) {
          return cb && cb(e);
        }
      }

      return cb && cb(null, result);
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
   * @param {boolean|Object} options.compress - compression configuration
   * @param {Function} cb - A callback that returns a potential error and the response
   * @returns {Promise}
   */
  self.get = function(key, options, cb) {
    return new Promise(function(resolve, reject) {
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
      options = options || {};
      options.parse = true;

      cb = cb ? cb : (err, result) => err ? reject(err) : resolve(result);

      var compress = (options.compress || options.compress === false) ? options.compress : redisOptions.compress;
      if (compress) {
        options.compress = (compress === true) ? compressDefault : compress;
        key = new Buffer(key);
      }

      connect(function(err, conn) {
        if (err) {
          return cb(err);
        }

        conn.get(key, handleResponse(conn, cb, options));
      });
    });
  };

  /**
   * Set a value for a given key.
   * @method set
   * @param {String} key - The cache key
   * @param {String} value - The value to set
   * @param {Object} [options] - The options (optional)
   * @param {Object} options.ttl - The ttl value
   * @param {boolean|Object} options.compress - compression configuration
   * @param {Function} [cb] - A callback that returns a potential error, otherwise null
   * @returns {Promise}
   */
  self.set = function(key, value, options, cb) {
    options = options || {};
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }
    return new Promise(function(resolve, reject) {
      cb = cb || ((err, result) => err ? reject(err) : resolve(result));

      if (!self.isCacheableValue(value)) {
        return cb(new Error('value cannot be ' + value));
      }

      var ttl = (options.ttl || options.ttl === 0) ? options.ttl : redisOptions.ttl;
      var compress = (options.compress || options.compress === false) ? options.compress : redisOptions.compress;
      if (compress === true) {
        compress = compressDefault;
      }

      connect(function(err, conn) {
        if (err) {
          return cb(err);
        }
        var val = JSON.stringify(value) || '"undefined"';

        // Refactored to remove duplicate code.
        function persist(pErr, pVal) {
          if (pErr) {
            return cb(pErr);
          }

          if (ttl) {
            conn.setex(key, ttl, pVal, handleResponse(conn, cb));
          } else {
            conn.set(key, pVal, handleResponse(conn, cb));
          }
        }

        if (compress) {
          zlib.gzip(val, compress.params || {}, persist);
        } else {
          persist(null, val);
        }
      });
    });
  };

  /**
   * Delete value of a given key
   * @method del
   * @param {String|Array} key - The cache key or array of keys to delete
   * @param {Object} [options] - The options (optional)
   * @param {Function} [cb] - A callback that returns a potential error, otherwise null
   * @returns {Promise}
   */
  self.del = function(key, options, cb) {
    return new Promise((resolve, reject) => {
      cb = cb || ((err) => err ? reject(err) : resolve('OK'));

      if (typeof options === 'function') {
        cb = options;
        options = {};
      }

      connect(function(err, conn) {
        if (err) {
          return cb(err);
        }

        if (Array.isArray(key)) {
          var multi = conn.multi();
          for (var i = 0, l = key.length; i < l; ++i) {
            multi.del(key[i]);
          }
          multi.exec(handleResponse(conn, cb));
        }
        else {
          conn.del(key, handleResponse(conn, cb));
        }
      });
    });
  };

  /**
   * Delete all the keys of the currently selected DB
   * @method reset
   * @param {Function} [cb] - A callback that returns a potential error, otherwise null
   * @returns {Promise}
   */
  self.reset = function(cb) {
    return new Promise((resolve, reject) => {
      cb = cb || (err => err ? reject(err) : resolve('OK'));
      connect(function(err, conn) {
        if (err) {
          return cb(err);
        }
        conn.flushdb(handleResponse(conn, cb));
      });
    });
  };

  /**
   * Returns the remaining time to live of a key that has a timeout.
   * @method ttl
   * @param {String} key - The cache key
   * @param {Function} cb - A callback that returns a potential error and the response
   * @returns {Promise}
   */
  self.ttl = function(key, cb) {
    return new Promise((resolve, reject) => {
      cb = cb || ((err, res) => err ? reject(err) : resolve(res));
      connect(function(err, conn) {
        if (err) {
          return cb(err);
        }
        conn.ttl(key, handleResponse(conn, cb));
      });
    });
  };

  /**
   * Returns all keys matching pattern using the SCAN command.
   * @method keys
   * @param {String} [pattern] - The pattern used to match keys (default: *)
   * @param {Object} [options] - The options (default: {})
   * @param {number} [options.scanCount] - The number of keys to traverse with each call to SCAN (default: 100)
   * @param {Function} cb - A callback that returns a potential error and the response
   * @returns {Promise}
   */
  self.keys = function(pattern, options, cb) {
    options = options || {};

    // Account for all argument permutations.
    // Only cb supplied.
    if (typeof pattern === 'function') {
      cb = pattern;
      options = {};
      pattern = '*';
    }
    // options and cb supplied.
    else if (typeof pattern === 'object') {
      cb = options;
      options = pattern;
      pattern = '*';
    }
    // pattern and cb supplied.
    else if (typeof options === 'function') {
      cb = options;
      options = {};
    }

    return new Promise((resolve, reject) => {
      cb = cb || ((err, res) => err ? reject(err) : resolve(res));
      connect(function(err, conn) {
        if (err) {
          return cb(err);
        }

        // Use an object to dedupe as scan can return duplicates
        var keysObj = {};
        var scanCount = Number(options.scanCount) || 100;

        (function nextBatch(cursorId) {
          conn.scan(cursorId, 'match', pattern, 'count', scanCount, function (err, result) {
            if (err) {
              handleResponse(conn, cb)(err);
            }

            var nextCursorId = result[0];
            var keys = result[1];

            for (var i = 0, l = keys.length; i < l; ++i) {
              keysObj[keys[i]] = 1;
            }

            if (nextCursorId !== '0') {
              return nextBatch(nextCursorId);
            }

            handleResponse(conn, cb)(null, Object.keys(keysObj));
          });
        })(0);
      });
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
   * @returns {Promise}
   */
  self.getClient = function(cb) {
    return new Promise((resolve, reject) => {
      cb = cb || ((err, res) => err ? reject(err) : resolve(res));
      connect(function(err, conn) {
        if (err) {
          return cb(err);
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
