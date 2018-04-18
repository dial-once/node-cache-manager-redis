var config = require('../config.json');
var redisStore = require('../../index');
var sinon = require('sinon');
var assert = require('assert');
var zlib = require('zlib');

var redisCompressCache;
var customRedisCompressCache;
var testJson;

describe('Compression Tests', function () {

  before(function () {
    redisCompressCache = require('cache-manager').caching({
      store: redisStore,
      host: config.redis.host,
      port: config.redis.port,
      auth_pass: config.redis.auth_pass,
      db: config.redis.db,
      ttl: config.redis.ttl,
      compress: true
    });

    customRedisCompressCache = require('cache-manager').caching({
      store: redisStore,
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
      ttl: config.redis.ttl,
      compress: true,
      isCacheableValue: function (val) {
        // allow undefined
        if (val === undefined) {
          return true;
        } else if (val === 'FooBarString') {
          return false;
        }
        return redisCompressCache.store.isCacheableValue(val);
      }
    });

    testJson = JSON.stringify(testObject);
  });

  beforeEach(function(done) {
    redisCompressCache.reset(function () {
      done();
    });
  });

  describe('compress set', function () {
    it('should store a value without ttl', function (done) {
      redisCompressCache.set('foo', 'bar', function (err) {
        assert.equal(err, null);
        done();
      });
    });

    it('should store a value with a specific ttl', function (done) {
      redisCompressCache.set('foo', 'bar', config.redis.ttl, function (err) {
        assert.equal(err, null);
        done();
      });
    });

    it('should store a value with a infinite ttl', function (done) {
      redisCompressCache.set('foo', 'bar', { ttl: 0 }, function (err) {
        assert.equal(err, null);
        redisCompressCache.ttl('foo', function (err, ttl) {
          assert.equal(err, null);
          assert.equal(ttl, -1);
          done();
        });
      });
    });

    it('should not be able to store a null value', function (done) {
      try {
        redisStore.set('foo2', null, function () {
          done(new Error('Should not be able to store a null value'));
        });
      } catch(e) {
        done();
      }
    });

    it('should store a value without callback', function (done) {
      redisCompressCache.set('foo', 'baz');
      redisCompressCache.get('foo', function (err, value) {
        assert.equal(err, null);
        assert.equal(value, 'baz');
        done();
      });
    });

    it('should not store an invalid value', function (done) {
      redisCompressCache.set('foo1', undefined, function (err) {
        try {
          assert.notEqual(err, null);
          assert.equal(err.message, 'value cannot be undefined');
          done();
        } catch(e) {
          done(e);
        }
      });
    });

    it('should store an undefined value if permitted by isCacheableValue', function (done) {
      assert(customRedisCompressCache.store.isCacheableValue(undefined), true);
      customRedisCompressCache.set('foo3', undefined, function (err) {
        try {
          assert.equal(err, null);
          customRedisCompressCache.get('foo3', function (err, data) {
            try {
              assert.equal(err, null);
              // redis stored undefined as 'undefined'
              assert.equal(data, 'undefined');
              done();
            } catch(e) {
              done(e);
            }
          });
        } catch(e) {
          done(e);
        }
      });
    });

    it('should not store a value disallowed by isCacheableValue', function (done) {
      assert.strictEqual(customRedisCompressCache.store.isCacheableValue('FooBarString'), false);
      customRedisCompressCache.set('foobar', 'FooBarString', function (err) {
        try {
          assert.notEqual(err, null);
          assert.equal(err.message, 'value cannot be FooBarString');
          done();
        } catch(e) {
          done(e);
        }
      });
    });
  });

  describe('compress get', function () {
    it('should retrieve a value for a given key', function (done) {
      redisCompressCache.set('foo', testObject, function () {
        redisCompressCache.get('foo', function (err, result) {
          assert.equal(err, null);
          assert.deepEqual(result, testObject);
          done();
        });
      });
    });

    it('should retrieve a value for a given key if options provided', function (done) {
      redisCompressCache.set('foo', testObject, function () {
        redisCompressCache.get('foo', {}, function (err, result) {
          assert.equal(err, null);
          assert.deepEqual(result, testObject);
          done();
        });
      });
    });

    it('should return null when the key is invalid', function (done) {
      redisCompressCache.get('invalidKey', function (err, result) {
        assert.equal(err, null);
        assert.equal(result, null);
        done();
      });
    });

    it('should return an error if there is an error acquiring a connection', function (done) {
      var pool = redisCompressCache.store._pool;
      sinon.stub(pool, 'acquireDb').yieldsAsync('Something unexpected');
      sinon.stub(pool, 'release');
      redisCompressCache.get('foo', function (err) {
        pool.acquireDb.restore();
        pool.release.restore();
        assert.notEqual(err, null);
        done();
      });
    });
  });

  describe('compress uses url to override redis options', function () {
    var redisCacheByUrl;

    before(function () {
      redisCacheByUrl = require('cache-manager').caching({
        store: redisStore,
        // redis://[:password@]host[:port][/db-number][?option=value]
        url: 'redis://:' + config.redis.auth_pass + '@' + config.redis.host + ':' + config.redis.port + '/' + config.redis.db + '?ttl=' + config.redis.ttl,
        // some fakes to see that url overrides them
        host: 'test-host',
        port: -78,
        db: -7,
        auth_pass: 'test_pass',
        password: 'test_pass',
        ttl: -6,
        compress: true
      });
    });

    it('should ignore other options if set in url', function () {
      assert.equal(redisCacheByUrl.store._pool._redis_options.host, config.redis.host);
      assert.equal(redisCacheByUrl.store._pool._redis_options.port, config.redis.port);
      assert.equal(redisCacheByUrl.store._pool._redis_default_db, config.redis.db);
      assert.equal(redisCacheByUrl.store._pool._redis_options.auth_pass, config.redis.auth_pass);
      assert.equal(redisCacheByUrl.store._pool._redis_options.password, config.redis.auth_pass);
    });

    it('should get and set values without error', function (done) {
      var key = 'byUrlKey';
      redisCacheByUrl.set(key, testObject, function (err) {
        assert.equal(err, null);
        redisCacheByUrl.get(key, function (getErr, val) {
          assert.equal(getErr, null);
          assert.deepEqual(val, testObject);
          done();
        });
      });
    });
  });

  describe('compress specific', function () {
    var bestSpeed;

    it('should compress the value being stored', function (done) {
      redisCompressCache.set('foo', testObject, function (err) {
        assert.equal(err, null);
        redisCompressCache.store.getClient(function (err, redis) {
          assert.equal(err, null);
          redis.client.strlen('foo', function (err, length) {
            assert.equal(err, null);
            console.log('\nBest Speed (gzip)');
            console.log('JSON length: ', testJson.length);
            console.log('Compress length: ' + length);
            console.log('REDUCTION: ' + Math.floor((length / testJson.length) * 100) + '% of original\n');
            bestSpeed = length;
            redis.done();
            done();
          });
        });
      });
    });

    it('should allow compress specific options', function (done) {
      var opts = {
        type: 'gzip',
        params: { level: zlib.Z_BEST_COMPRESSION }
      };
      redisCompressCache.set('foo', testObject, { compress: opts }, function (err) {
        assert.equal(err, null);
        redisCompressCache.store.getClient(function (err, redis) {
          assert.equal(err, null);
          redis.client.strlen('foo', function (err, length) {
            assert.equal(err, null);
            assert(length < bestSpeed);
            console.log('\nBest Compression (gzip)');
            console.log('JSON length: ', testJson.length);
            console.log('Compress length: ' + length);
            console.log('REDUCTION: ' + Math.floor((length / testJson.length) * 100) + '% of original\n');
            redis.done();
            redisCompressCache.get('foo', { compress: opts }, function (err, result) {
              assert.equal(err, null);
              assert.deepEqual(result, testObject);
              done();
            });
          });
        });
      });
    });

    it('should allow compress to be turned off per command', function (done) {
      redisCompressCache.set('foo', testObject, { compress: false }, function (err) {
        assert.equal(err, null);
        redisCompressCache.store.getClient(function (err, redis) {
          assert.equal(err, null);
          redis.client.strlen('foo', function (err, length) {
            assert.equal(length, testJson.length);
            redis.done();
            redisCompressCache.get('foo', { compress: false }, function (err, result) {
              assert.equal(err, null);
              assert.deepEqual(result, testObject);
              done();
            });
          });
        });
      });
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
      redisCompressCache.wrap('wrap-compress', function (cb) {
        getUser(userId, cb);
      }, function (err, user) {
        assert.equal(user.id, userId);

        // Second call to wrap should retrieve from cache
        redisCompressCache.wrap('wrap-compress', function (cb) {
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
      return redisCompressCache
        .wrap('wrap-compress-promise', function () {
          return getUserPromise(userId);
        })
        .then(function (user) {
          assert.equal(user.id, userId);

          // Second call to wrap should retrieve from cache
          return redisCompressCache
            .wrap('wrap-compress-promise', function () {
              return getUserPromise(userId+1);
            })
            .then(function (user) {
              assert.equal(user.id, userId);
            });
        });
    });
  });
});


var testObject = {
  _id: '57d046876102e12cd5b83fb0',
  index: 0,
  guid: '1a18758b-fa38-4ced-8d05-44637bf4716e',
  isActive: false,
  balance: '$1,116.12',
  picture: 'http://placehold.it/32x32',
  age: 39,
  eyeColor: 'blue',
  name: 'Lara Crane',
  gender: 'female',
  company: 'BIOTICA',
  email: 'laracrane@biotica.com',
  phone: '+1 (911) 538-2679',
  address: '330 Church Avenue, Slovan, Kansas, 3416',
  about: 'Aliqua incididunt eiusmod Lorem minim nostrud aliquip reprehenderit culpa aute exercitation. In deserunt irure ad reprehenderit labore cupidatat qui cupidatat dolore ullamco et do ullamco ut. Laborum cupidatat nostrud quis non quis laborum aute nisi sint consequat tempor dolore voluptate. Cillum minim minim enim ea id aliqua laboris elit exercitation.\r\nCulpa in aute est pariatur quis. Tempor dolor ullamco ex Lorem deserunt commodo aliqua. Anim officia esse veniam minim veniam laboris nostrud ipsum ullamco esse nulla adipisicing minim. Eu minim occaecat deserunt eu est ex.\r\nDuis nostrud magna excepteur id officia mollit veniam ipsum. Lorem adipisicing ad esse ad ullamco et consectetur in ex tempor mollit consequat cillum. Adipisicing ex anim consequat anim non exercitation adipisicing ipsum exercitation aute reprehenderit esse ad aliqua. Ut duis consequat cupidatat eiusmod sint voluptate nulla fugiat sunt nulla eu. Excepteur labore proident laboris enim laborum esse reprehenderit fugiat. Cupidatat sit esse voluptate magna mollit fugiat velit Lorem elit pariatur id. Deserunt in ad laboris nulla cupidatat deserunt ullamco voluptate consequat veniam elit exercitation occaecat proident.\r\nEa occaecat ullamco exercitation elit Lorem pariatur reprehenderit. Et mollit proident excepteur enim tempor excepteur sunt laborum deserunt anim fugiat dolor sunt. Nostrud pariatur incididunt aliquip dolore in id elit fugiat.\r\nVeniam ullamco cupidatat mollit commodo fugiat nisi incididunt qui reprehenderit laboris esse Lorem sint mollit. Sunt qui consectetur anim aute culpa laboris ut cupidatat incididunt elit do nisi. Minim minim incididunt eu fugiat. Eiusmod et mollit aliquip minim tempor consectetur adipisicing id sunt. Cillum in mollit elit laborum. Dolore excepteur do consectetur aliqua. Laboris velit ad proident reprehenderit voluptate nulla ipsum nisi dolore dolor.\r\n',
  registered: '2015-09-15T10:09:44 +07:00',
  latitude: 52.954985,
  longitude: -159.875625,
  tags: [
    'ad',
    'consectetur',
    'occaecat',
    'exercitation',
    'ex',
    'nisi',
    'magna'
  ],
  friends: [
    {
      id: 0,
      name: 'Tabatha Reeves',
      about: 'Veniam id ea anim commodo aliqua non aliqua velit. Dolor cillum exercitation eu commodo ea amet irure aute ad. Magna officia tempor consequat irure magna sunt dolor et pariatur est.\r\nAliqua ut et commodo adipisicing in exercitation nisi. Officia in culpa velit voluptate do. Dolor deserunt ex tempor qui nulla labore exercitation nulla fugiat. Esse elit amet consectetur id ad tempor tempor. Ipsum eiusmod velit nostrud laboris in do velit occaecat eu commodo voluptate ea eu.\r\nAnim veniam commodo consectetur sit fugiat aliquip est Lorem tempor sunt. Proident laborum est commodo eiusmod irure occaecat nulla ipsum magna ullamco. Amet nisi voluptate elit quis cupidatat reprehenderit do excepteur amet sit et commodo officia.\r\nCillum dolore consectetur quis reprehenderit non laborum cillum ea minim non officia consectetur. In dolor adipisicing ea est qui enim mollit ea irure. Voluptate qui eiusmod aliqua cillum enim aliquip fugiat nostrud elit irure. Magna anim officia quis irure ut quis Lorem magna cillum voluptate et aute ad. Nostrud sit ipsum velit magna aliquip mollit incididunt velit commodo ea do cupidatat duis.\r\nEa non sint pariatur laborum deserunt veniam dolore irure ipsum voluptate. Ea ea deserunt officia sit ullamco ea. Irure in deserunt aliqua duis.\r\n'
    },
    {
      id: 1,
      name: 'Samantha Bowen',
      about: 'Commodo et adipisicing tempor ea. Fugiat ea aliquip occaecat ut commodo labore in magna laborum incididunt amet enim labore. Consectetur laborum exercitation veniam aliquip labore minim ipsum exercitation officia.\r\nEsse eu consequat dolor irure elit. Sint qui elit sint officia non incididunt sunt nulla. Labore occaecat aliquip dolor culpa aliqua irure voluptate excepteur mollit sit proident. Excepteur eu veniam eu nisi enim sit qui magna ut laboris magna. Cupidatat dolor laborum adipisicing aliqua id aliquip nostrud minim nostrud cupidatat ut quis dolore non. Id ad ea pariatur esse sint ad esse cillum.\r\nVoluptate aute laborum cupidatat non minim nulla proident. Consequat quis velit culpa proident ipsum. Enim in reprehenderit dolore dolor proident occaecat laborum sunt eiusmod adipisicing quis veniam ipsum. Magna ut cillum excepteur proident nisi cillum proident nostrud voluptate deserunt. Sit ex sint sunt eu labore cillum incididunt ad proident sint amet Lorem. In duis cupidatat in aute non fugiat occaecat minim anim Lorem sit ullamco est. Aliquip et ad enim adipisicing fugiat nulla enim.\r\nElit ipsum nulla mollit magna qui. Laborum et sint anim reprehenderit ea consectetur. Elit aliqua consequat ex nostrud in. Est excepteur pariatur id ad culpa enim elit labore commodo Lorem ipsum. Labore ad ipsum occaecat veniam in ut fugiat voluptate fugiat enim ex sit duis.\r\nExcepteur quis dolore ipsum ullamco sint consectetur Lorem. Culpa cillum minim id est. Aliquip incididunt velit exercitation culpa sint officia tempor excepteur eu.\r\n'
    },
    {
      id: 2,
      name: 'Shelia Bray',
      about: 'Dolor quis duis aute excepteur ad. Aliqua aute velit excepteur voluptate labore Lorem veniam incididunt anim consequat eu. Non sint aliqua do Lorem. Esse commodo sint ullamco in tempor et est sit elit irure. Commodo ex in labore officia nulla non culpa reprehenderit in elit anim aliqua eu eiusmod.\r\nNostrud sit sunt do do. Veniam consequat laborum ullamco incididunt anim. Consequat ipsum ex laboris eu ut et enim.\r\nSint Lorem dolore duis pariatur ea amet anim. Dolore aliquip sunt exercitation labore sit deserunt enim velit labore aliqua incididunt eiusmod ipsum. Est dolore id sit nisi sint labore laborum. Consequat minim fugiat duis sint. Nulla est dolore est nostrud. Pariatur aute commodo consequat exercitation nisi elit sunt incididunt mollit.\r\nProident officia commodo anim et ut. Laboris do voluptate tempor anim commodo aliqua dolore ullamco aliqua anim cupidatat amet cupidatat. Sunt adipisicing qui quis occaecat voluptate anim ad ea enim nulla sit dolor ullamco mollit.\r\nAmet pariatur quis id consectetur anim labore occaecat aliquip incididunt tempor. Culpa veniam ut aliquip sint aute et mollit nostrud excepteur non. Eiusmod cillum reprehenderit occaecat cillum ut eiusmod culpa mollit mollit qui aliqua excepteur non. Consectetur dolore sit ad et do. Fugiat adipisicing ullamco sint ad pariatur aliqua labore adipisicing labore culpa magna consectetur nostrud. Nulla duis pariatur non ut eu tempor nisi deserunt.\r\n'
    },
    {
      id: 3,
      name: 'Dollie Suarez',
      about: 'Deserunt mollit non incididunt labore ipsum veniam qui ipsum veniam excepteur consectetur quis. Ullamco amet reprehenderit qui tempor do ullamco commodo reprehenderit ut in fugiat officia sunt. Tempor reprehenderit ullamco ipsum occaecat laboris ad labore duis excepteur elit do reprehenderit ut occaecat. Consectetur veniam adipisicing mollit fugiat eu duis. Esse dolore adipisicing excepteur dolor laborum nulla.\r\nElit fugiat velit eiusmod nulla labore in mollit reprehenderit laboris. Voluptate labore ea ad eiusmod esse nostrud amet. Labore anim ex id id laboris reprehenderit.\r\nSit amet aute sit aute nostrud Lorem et ad qui pariatur et duis ad. Aute nulla culpa mollit est occaecat non laborum et cillum. Eiusmod nulla ut nostrud voluptate culpa consectetur incididunt magna ad anim. Cupidatat voluptate nisi voluptate non. Dolor deserunt culpa occaecat velit sit. Ea laboris ea aliqua deserunt consequat in incididunt ex nisi duis cupidatat ullamco nostrud nulla. Eu duis reprehenderit Lorem non irure nulla dolor commodo minim id sit.\r\nConsectetur aliquip reprehenderit ea est laborum et sint nostrud cupidatat in cillum eu. Dolore exercitation ullamco do qui laborum laborum consequat veniam tempor. Enim anim elit exercitation tempor aliquip qui amet sint eiusmod tempor sunt. Sit culpa culpa ex consectetur incididunt ea pariatur dolor ad.\r\nExcepteur amet adipisicing consequat cillum proident excepteur velit ut reprehenderit. Cupidatat consequat cillum cupidatat aliqua culpa sint elit sunt sit in. Tempor enim ex magna enim fugiat reprehenderit qui laborum.\r\n'
    },
    {
      id: 4,
      name: 'Doris Hines',
      about: 'Enim irure fugiat nostrud sit in cupidatat qui. Aliquip labore dolor ea ea ea dolore est non anim esse elit excepteur. Nulla nulla velit ad aute mollit do irure minim ad. Anim deserunt velit cupidatat ipsum est commodo est dolor id aute veniam adipisicing ea enim. Aliquip duis labore cupidatat et occaecat laborum qui et. Eu aliquip adipisicing irure elit minim laborum sit sint non ea.\r\nEx laborum enim ut minim cillum deserunt magna ullamco dolore. Est mollit consectetur aliquip ad labore commodo laboris quis qui do officia cillum. Fugiat deserunt aute laboris commodo sunt do consectetur quis. Ullamco nulla sunt est Lorem incididunt nostrud nostrud nostrud.\r\nQuis aute qui id do exercitation deserunt laboris exercitation ad dolore. Occaecat exercitation ex excepteur adipisicing cillum excepteur sint dolor ut id. Incididunt velit est amet nostrud irure proident cupidatat eiusmod enim esse non in Lorem. Cillum nisi irure reprehenderit eiusmod adipisicing irure laboris eu deserunt. Duis sunt laborum incididunt est mollit anim eu proident Lorem reprehenderit quis. Quis magna deserunt excepteur aute nostrud non in nostrud enim exercitation ipsum incididunt velit. Lorem et do consequat ea dolor commodo mollit enim sunt non Lorem.\r\nDolor elit aliqua ad nostrud veniam cupidatat irure consectetur do. Qui sit est elit sunt incididunt cillum magna non et excepteur elit ullamco cupidatat. Pariatur cupidatat nisi velit ut do sint aliquip sit ullamco. Sit veniam et elit cupidatat pariatur consequat cupidatat sit elit dolor tempor in Lorem nulla. Elit in deserunt mollit quis voluptate enim proident mollit. Dolor fugiat magna reprehenderit do ullamco nisi proident. Minim pariatur laboris anim cupidatat aliquip ut pariatur.\r\nVelit nisi culpa ut esse qui adipisicing esse dolor occaecat Lorem. Nulla irure tempor occaecat dolore ullamco fugiat excepteur tempor. Aliqua quis pariatur officia sit aliqua ex minim. Eiusmod exercitation laborum Lorem eu et amet ex.\r\n'
    },
    {
      id: 5,
      name: 'Snider Blevins',
      about: 'Ut proident officia proident esse cillum irure anim Lorem non officia laborum. Labore duis quis eiusmod culpa Lorem commodo esse eu laborum elit. Pariatur quis cillum incididunt consequat ex laboris elit consectetur laborum ad laboris aliquip irure.\r\nId occaecat elit cillum nisi nulla amet. Elit sint eiusmod minim dolor ad magna voluptate. Ullamco nulla dolor aliqua labore amet anim. Consequat Lorem magna est eiusmod veniam amet esse nisi exercitation laboris ex reprehenderit. Quis dolor Lorem pariatur mollit esse sunt tempor labore deserunt velit tempor dolore esse.\r\nNostrud et aliqua duis excepteur mollit qui sunt esse ad deserunt. Cupidatat nulla sit velit tempor elit cillum officia. Adipisicing laborum dolor occaecat ad reprehenderit duis sunt esse esse elit deserunt. Nulla laborum ullamco mollit minim excepteur aliquip exercitation minim nisi cupidatat adipisicing ut aliqua. Cupidatat ullamco aliquip enim dolor incididunt commodo. Ullamco voluptate ut ex quis fugiat commodo.\r\nAliqua occaecat ex deserunt consequat esse cillum aliquip occaecat officia in. Magna laborum occaecat officia dolor ipsum eiusmod dolor ullamco consectetur occaecat ut. Ea dolore dolore id elit eiusmod velit mollit commodo esse sint exercitation commodo eiusmod tempor. Consequat et qui veniam culpa. Consectetur id aute ad eiusmod magna. Ex ad cillum est occaecat in dolor eiusmod officia nisi eu.\r\nEst nostrud sint non quis proident nulla nulla aliqua deserunt veniam non reprehenderit aliqua. Reprehenderit minim incididunt magna mollit qui sint sint anim officia sit exercitation officia laboris. Est cupidatat eu aute et cillum velit sit commodo duis incididunt mollit.\r\n'
    },
    {
      id: 6,
      name: 'Mckay Mcknight',
      about: 'Adipisicing et laboris in officia adipisicing proident. Do excepteur culpa reprehenderit mollit est nisi. Ad nisi nostrud Lorem aliquip excepteur nulla ex amet exercitation id deserunt reprehenderit eiusmod laboris. Aliqua ea proident adipisicing excepteur voluptate elit laboris amet.\r\nCillum proident dolor est minim mollit proident non commodo tempor duis pariatur voluptate. Culpa deserunt et nisi in et. Eu ea ipsum eu aliqua commodo duis sunt et in eu veniam laborum velit. Reprehenderit duis nulla nulla ad ut. Id et cillum amet fugiat mollit. Amet in eu amet laboris velit consectetur dolore excepteur aliqua. Commodo duis laborum eu ad Lorem ut excepteur irure culpa velit.\r\nAnim in eiusmod Lorem quis est consectetur exercitation sit voluptate. Pariatur nisi elit enim veniam quis pariatur adipisicing enim non nisi Lorem labore labore eu. Veniam sunt culpa do irure anim nisi culpa et nostrud aliqua excepteur ad excepteur in. Eiusmod exercitation esse proident ut incididunt quis commodo. Labore tempor enim aute nisi exercitation dolore non.\r\nEa nulla officia nostrud proident enim officia in eu non. Enim nisi ea ad exercitation magna veniam aute sunt voluptate in elit. Nostrud consequat labore minim irure sunt. Incididunt officia laboris exercitation culpa anim eu anim est deserunt officia do magna duis. Voluptate id dolore laboris ad mollit voluptate velit est elit do eu eu minim. Reprehenderit fugiat non sunt magna. Exercitation fugiat cupidatat consectetur est minim ad aute voluptate exercitation amet.\r\nDo reprehenderit qui sunt elit. Tempor esse non fugiat qui ea Lorem sit non fugiat cillum sint aliqua. Cillum laboris laboris non pariatur enim id enim reprehenderit aliquip non reprehenderit sunt esse Lorem.\r\n'
    },
    {
      id: 7,
      name: 'Lauren Rocha',
      about: 'Non aute ex qui elit pariatur commodo sunt veniam. Labore anim mollit Lorem incididunt pariatur esse do laboris enim. Est est adipisicing ea eu ex eiusmod dolore duis commodo sint sint. Laborum qui sint in dolor deserunt est sunt dolor irure. Sint labore aute minim dolor nisi ullamco velit esse ullamco culpa esse consequat irure. Nisi esse ut dolore in et in fugiat ipsum voluptate proident aliqua minim. Occaecat eu voluptate proident ea commodo cupidatat consequat est non ea ea.\r\nVeniam mollit aliquip elit et aliquip sit proident anim ea nisi ex mollit. Et reprehenderit nisi laborum enim ut. Anim veniam proident proident pariatur proident nulla labore ad mollit ea ullamco ut deserunt. Cillum amet laborum ea amet cupidatat mollit incididunt eiusmod est ipsum sit ullamco deserunt reprehenderit. Fugiat do consectetur consectetur magna eu elit nisi aute exercitation eu laboris ad cupidatat. Aliquip elit voluptate eu incididunt occaecat sunt.\r\nAliqua quis non et ullamco amet veniam mollit culpa cillum esse occaecat qui. Sint proident tempor magna dolor. Ea aliqua irure amet ipsum fugiat officia ad in consectetur. Do esse ipsum amet ipsum adipisicing eiusmod incididunt proident magna voluptate culpa excepteur.\r\nTempor ut ullamco pariatur sunt. Aute est et enim do dolor nulla voluptate tempor dolor veniam do minim exercitation esse. Sit magna aute excepteur labore culpa proident aliquip ad ad officia. Laboris sit pariatur sit incididunt duis eiusmod consectetur culpa ad. Minim voluptate id id eu veniam ut ex dolore. Consectetur sit consectetur minim proident est et occaecat non enim enim. Laboris fugiat occaecat fugiat laborum.\r\nEst ipsum culpa consequat ipsum est consectetur proident magna excepteur. Anim sint voluptate ut enim occaecat cupidatat in consectetur. Ullamco veniam amet minim tempor labore consequat ex. Aliquip consectetur occaecat ea velit ipsum consequat eiusmod incididunt in adipisicing magna. Veniam sunt culpa magna ullamco excepteur fugiat fugiat voluptate dolor adipisicing sint sunt consectetur.\r\n'
    },
    {
      id: 8,
      name: 'Nichole Hale',
      about: 'Mollit et excepteur minim cupidatat nostrud. Ullamco culpa fugiat culpa dolor qui. Proident aliqua ex labore id laborum officia aliquip ex et. Ex occaecat dolore aliquip anim ipsum amet dolore amet aute cupidatat cupidatat ea veniam. Ea ullamco dolor Lorem cupidatat dolor. Deserunt voluptate fugiat dolor nostrud.\r\nQuis proident reprehenderit mollit ea culpa amet aliquip. Lorem veniam proident deserunt anim officia pariatur eiusmod. Officia cillum in velit mollit in duis minim do veniam in aliquip mollit proident ad. Voluptate ex aliqua minim velit eu incididunt commodo enim ut aliqua consequat veniam.\r\nCommodo veniam labore culpa adipisicing ullamco laborum mollit commodo elit pariatur consequat. Pariatur ex nostrud nostrud minim cupidatat incididunt aute dolore officia quis id. Sit adipisicing ipsum sunt sit est ad. Anim ea nostrud consequat duis pariatur qui. Nostrud tempor do aliqua mollit. Ex culpa consectetur elit elit ut sit. Aute sint mollit cillum sint qui et minim adipisicing in fugiat excepteur.\r\nNostrud eu in ipsum sunt tempor. Et ullamco cillum dolor qui exercitation veniam. Tempor nisi occaecat sunt nostrud in voluptate ad cupidatat ad elit in. Nisi deserunt quis esse sunt eu cupidatat esse. Laborum labore velit dolor nostrud proident deserunt ea consectetur proident do. Consectetur nisi non sit consectetur dolor quis voluptate nisi pariatur cupidatat.\r\nElit velit culpa minim mollit eu est quis aliquip. Aliqua veniam nostrud cupidatat tempor. Eiusmod excepteur quis mollit cupidatat reprehenderit irure aliqua occaecat ex sunt et culpa.\r\n'
    },
    {
      id: 9,
      name: 'Valencia Mcbride',
      about: 'Nisi sit dolor in dolor deserunt id labore reprehenderit pariatur. In ad sint cupidatat velit. Amet dolore tempor tempor est nostrud quis. Commodo est dolor ad labore voluptate enim ut et duis labore minim non velit dolore. Cupidatat nulla irure quis eu qui. Quis non nostrud quis id nisi do elit veniam ex.\r\nVoluptate aliquip consequat incididunt dolor ipsum nisi quis. Proident laboris eu adipisicing ad ut laborum. Consectetur nostrud nisi velit et aute ullamco exercitation pariatur adipisicing commodo.\r\nEu minim eu ut deserunt. Adipisicing exercitation ex est tempor non elit id pariatur amet incididunt tempor. Qui exercitation duis qui ea.\r\nOfficia tempor laboris officia Lorem sint cillum tempor mollit aliquip exercitation. Nisi deserunt aliquip et aliquip non adipisicing minim laboris. In ut aute quis eu. Occaecat ut velit amet laborum qui. Amet do enim Lorem nisi.\r\nSit ipsum duis Lorem ea proident reprehenderit fugiat qui in veniam est labore veniam. Nisi non anim ullamco labore. Ut commodo id incididunt pariatur sunt et. Commodo qui aliquip elit irure eiusmod velit et ullamco. Adipisicing nostrud Lorem aute sit amet incididunt veniam officia aliquip. Culpa esse amet excepteur id sunt dolor elit reprehenderit velit ex ut quis adipisicing nostrud. Irure irure reprehenderit do quis sit non.\r\n'
    }
  ],
  greeting: 'Hello, Lara Crane! You have 9 unread messages.',
  favoriteFruit: 'apple'
};
