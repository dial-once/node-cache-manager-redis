'use strict';

var RedisPool = require('sol-redis-pool');
var EventEmitter = require('events').EventEmitter;

function redisStore(args) {
  var self = {
    name: 'redis'
  };
  var redisOptions = args || {};
  var poolSettings = redisOptions;
  self.events = new EventEmitter();

  redisOptions.host = args.host || '127.0.0.1';
  redisOptions.port = args.port || 6379;

  var pool = new RedisPool(redisOptions, poolSettings);
  pool.on("error", function(err) {
    self.events.emit("redisError", err);
  });

  function connect(cb) {
    pool.acquire(function (err, conn) {
      if (err) {
        pool.release(conn);
        return cb(err);
      }

      if (args.db || args.db === 0) {
        conn.select(args.db);
      }

      cb(null, conn);
    });
  }

  function handleResponse(conn, cb, opts) {
    opts = opts || {};

    return function (err, result) {
      pool.release(conn);

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

  self.get = function (key, options, cb) {
    if (typeof options === 'function') {
      cb = options;
    }

    connect(function (err, conn) {
      if (err) {
        return cb && cb(err);
      }
      conn.get(key, handleResponse(conn, cb, {
        parse: true
      }));
    });
  };

  self.set = function (key, value, options, cb) {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }
    options = options || {};

    var ttl = (options.ttl || options.ttl === 0) ? options.ttl : redisOptions.ttl;

    connect(function (err, conn) {
      if (err) {
        return cb && cb(err);
      }
      var val = JSON.stringify(value);

      if (ttl) {
        conn.setex(key, ttl, val, handleResponse(conn, cb));
      } else {
        conn.set(key, val, handleResponse(conn, cb));
      }
    });
  };

  self.del = function (key, options, cb) {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }

    connect(function (err, conn) {
      if (err) {
        return cb && cb(err);
      }
      conn.del(key, handleResponse(conn, cb));
    });
  };

  self.reset = function(cb) {
    connect(function (err, conn) {
      if (err) {
        return cb && cb(err);
      }
      conn.flushdb(cb);
    });
  };

  self.ttl = function (key, cb) {
    connect(function (err, conn) {
      if (err) {
        return cb && cb(err);
      }
      conn.ttl(key, handleResponse(conn, cb));
    });
  };

  self.keys = function (pattern, cb) {
    if (typeof pattern === 'function') {
      cb = pattern;
      pattern = '*';
    }

    connect(function (err, conn) {
      if (err) {
        return cb && cb(err);
      }
      conn.keys(pattern, handleResponse(conn, cb));
    });
  };

  self.isCacheableValue = function(value) {
    return value !== null && value !== undefined;
  };

  self.getClient = function(cb) {
    connect(function (err, conn) {
      if (err) {
        return cb && cb(err);
      }
      cb(null, {
        client: conn,
        done: function(done) {
          var args = Array.prototype.slice.call(arguments, 1);
          pool.release(conn);
          if (done && typeof done === 'function') done.apply(null, args);
        }
      });
    });
  };

  return self;
}

module.exports = {
  create: function (args) {
    return redisStore(args);
  }
};
