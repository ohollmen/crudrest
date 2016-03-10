#!/usr/bin/nodejs
/** @module */
'use strict';
/** @file
 * ## Simple example Crud Rest application
 *
 * ### Running
 *     # Pass main config
 *     node crudrest.server.js /the/path/to/myapp.conf.js
 *
 * ### Installing Dependencies
 *
 * Individually / Globally
 *     # Remember to set NODE_PATH (e.g. export NODE_PATH=/usr/local/lib/node_modules)
 *     sudo npm install -g express sequelize async
 *     sudo npm install -g sqlite3 mysql
 * npm should install dependencies automatically based on the bundled package.json.
 *
 * ### Configuration
 *
 * Config needs to be stored in a JS (or JSON) file (e.g. "hosts.conf.js", JS file should export the handle to config):
 *
       var config = {
         "httpport" : 3001, // Port for Node/Express
         "staticroot": "./public/", // Static files docroot path
         "sequelizeconfig": './hosts.sequelize.model.conf.js',
         "dbconn": {
           "dialect": "mysql", // "sqlite"
           "host": "db",
           "database": "mydb",
           "user": "mrx",
           "password": "s3Crt",
           "logging": false,
           "pool": {"maxConnections": 10, "maxIdleTime": 30}
         }
       };
       module.exports = config;

 */
'use strict;';
var Sequelize = require('sequelize');
var fs = require('fs');
var Getopt = require('node-getopt');
var aspec = [
  ['c','maincfg=ARG','Main Config Filename'],
  ['s','seqcfg=ARG','Sequelize Config Filename']
];
// console.log(process.argv);
var getopt = new Getopt(aspec);
// console.log(process.argv);
var opt = getopt.parseSystem();
var seqpath = process.env['SEQ_PATH'];
// Grab app and connection config from argv
// Also: http://stackoverflow.com/questions/4351521/how-to-pass-command-line-arguments-to-node-js
//process.argv.forEach(function (val, index, array) {console.log(index + ': ' +val);});
// console.log(process.argv);
if (process.argv.length < 3) {throw "Need at least one arg (mainconfig)!"; }
//OLD: var cfgname = process.argv[2];
var cfgname = process.argv.pop(); // Last arg
if (!cfgname) {console.log("Pass Main Config name (as first arg) on the command line");process.exit(0);}
console.log(opt);

if (0) {
var cfgok = fs.existsSync(cfgname);
if (!cfgok) {console.log("Main Config ("+cfgname+") not there");process.exit(0);}
// Allow anything that require() can use (.js or .json)
var cfg = require(cfgname); // e.g. "./APPID.conf.json"
}
var cfg = loadconfig(cfgname, "Main Config", {});

var dbopts = cfg.dbconn;
dbopts.dbname = dbopts.database; // sequelize compat.
dbopts.username = dbopts.user;
// Instantiate Sequelize with params given in config.
var sequelize = new Sequelize(dbopts.dbname, dbopts.username, dbopts.password, dbopts);
// Load Sequelize config. Either: name passed from CL OR name found in config.

var seqcfg = opt.options.seqcfg || cfg.sequelizeconfig; // OR ...

//var seqcfgok = fs.existsSync(seqcfg);
//if (!seqcfgok) {console.log("Sequelize Config ("+seqcfg+") not there");process.exit(0);}
//var pseq = require(seqcfg);

var pseq = loadconfig(seqcfg, "Sequelize Config", {});
var optconfarr;
var taidx;
if (cfg.optconfig) {
  var optcfgok = fs.existsSync(cfg.optconfig);
  if (!optcfgok) {console.log("Opt. Config not there");process.exit(0);}
  optconfarr = require(cfg.optconfig);
  // optconfarr = loadconfig(cfg.optconfig, "Opt. Config", {});
  // Index items, set to module var later.
  taidx = {};
  // Index opts / ac config
  optconfarr.forEach(function (iarr) { taidx[iarr[0]] = iarr; });
  console.log("Add " + Object.keys(taidx).length + " ac / opt configs.");
}

////////////////////////////////////////////////////////////////
// TODO: Move this as a method into crudrest ?
var perscache = {};
if (!pseq.sargs) {throw "No sargs member is sequelize config: " + seqcfg;}
// INLOOP: console.log(tn + " " + JSON.stringify(item));
pseq.sargs.forEach(function (item) {
  var tn = item[1].tableName;
  perscache[tn] = sequelize.define(tn, item[0], item[1]);
});
// GENERAL NOTE: Never let Sequelize sync the schema - fields will be unordered (!).
// pseq.syncschema(sequelize); // From inside config
// sequelize.sync().then(function () {console.log("Synced the schema");});
// process.exit(0);

var express  = require('express');
var crudrest = require('./crudrest'); // crudrest.js
// var router = crudrest.router; // Use crudrest router for AC + CRUD
// NEW:

crudrest.setperscache(perscache); // ORM cache / pool
if (taidx) {crudrest.settaidx(taidx);}

// Boilerplate express server setup
// var http = require('http');
var bodyParser = require('body-parser');
// Instantiate Express server / app
var app = express();
var router = express.Router({caseSensitive: 1});
var port = cfg.httpport || 3001;
app.set('json spaces', (cfg.jsonindent || 2)); // 2
var server = app.listen(port, function () {
  console.log("App 'Sequelize Tester' listening at http://localhost:%s", port);
  console.log("For CRUD Try out relative URL(s): /<type>/...");
});
// Static content (anywhere under top dir)
// To serve /tmp/example, create a symlink:
// ln -s /tmp/example example
// And use url: "/example/item.html"
var sroot = cfg.staticroot || __dirname + '/';
app.use(express.static(sroot));
app.use(bodyParser.json());
// Request interceptor (example). Potentially do validation here.
// Note: (valid) static content URL:s do not get intercepted here.
app.use(function(req, res, next) {
  if (req.url == "/favicon.ico") {res.end();return;}
  //if () {}
  console.log("Call to: " + req.url + " (" + req.method +")");
  next();
});
//app.use(bodyParser.urlencoded({ extended: true }));
if (taidx) {router.get(/^\/ac\/?/, crudrest.opt_or_ac);}
var routerXX = crudrest.defaultrouter(router);
// Everything under /. MUST Reside after app.use(bodyParser.json());
var subpath = cfg.crudpath || '/';
app.use(subpath, router);

/** Load config by checking FS presence first.
* Show error message with config descriptive name on problems.
* opts: path, dsfmt (array,object)
* @param {string} cfgfname - Configuration filename
* @param {string} descname - Descriptive name for the configuration
* @return Handle to the config (whatever require returned)
*/
function loadconfig(cfgfname, descname, opts) {
  var cfgok = fs.existsSync(cfgfname);
  if (!cfgok) {console.log(descname + " ("+cfgfname+") not there");process.exit(0);}
  // Allow anything that require() can use (.js or .json)
  var cfg = require(cfgfname);
  //if (opts.dsfmt) {} //  Validate structural format
  console.log("Loaded: "+cfgfname+ "("+descname+"), got: "+ cfg);
  return cfg;
}
