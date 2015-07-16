#!/usr/bin/nodejs
'use strict';
/* @file
 * Simple example Crud Rest application
 *
 * Installing Dependencies:
 * @example
 * sudo npm install -g express sequelize
 * sudo npm install -g sqlite3 mysql
 * @description
 
 */
'use strict;';
var Sequelize = require('sequelize');
var fs = require('fs');
// Grab app and connection config from argv
// Also: http://stackoverflow.com/questions/4351521/how-to-pass-command-line-arguments-to-node-js
// process.argv.forEach(function (val, index, array) {console.log(index + ': ' +val);});

var cfgname = process.argv[2];
if (!cfgname) {console.log("Pass Main Config name on the command line");process.exit(0);}
var cfgok = fs.existsSync(cfgname);
if (!cfgok) {console.log("Main Config ("+cfgname+") not there");process.exit(0);}
// Allow anything that require() can use (.js or .json)
var cfg = require(cfgname); // e.g. "./APPID.conf.json"
var dbopts = cfg.dbconn;
dbopts.dbname = dbopts.database; // sequelize compat.
dbopts.username = dbopts.user;
// Instantiate Sequelize with params given in config.
var sequelize = new Sequelize(dbopts.dbname, dbopts.username, dbopts.password, dbopts);
//var seqcfg = "./people.sequelize.js";
var seqcfg = cfg.sequelizeconfig;
var seqcfgok = fs.existsSync(seqcfg);
if (!seqcfgok) {console.log("Sequelize Config ("+seqcfg+") not there");process.exit(0);}
var pseq = require(seqcfg);
var optconfarr;
var taidx;
if (cfg.optconfig) {
  var optcfgok = fs.existsSync(cfg.optconfig);
  if (!optcfgok) {console.log("Opt. Config not there");process.exit(0);}
  optconfarr = require(cfg.optconfig);
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
// GENERAL NOTE: Never let Sequelize sync the schema - fields will be unordered.
//pseq.syncschema(sequelize); // From inside config
//sequelize.sync().then(function () {console.log("Synced the schema");});
// process.exit(0);

var express  = require('express');
var crudrest = require('./crudrest'); // crudrest.js
// var router = crudrest.router; // Use crudrest router for AC + CRUD
// NEW:

crudrest.setperscache(perscache); // ORM cache / pool
if (taidx) {crudrest.taidx(taidx);}

// Boilerplate express server setup
// var http = require('http');
var bodyParser = require('body-parser');
// Instantiate Express server / app
var app = express();
var router = express.Router({caseSensitive: 1});
var port = cfg.httpport || 3001;
var server = app.listen(port, function () {
  console.log("App 'Sequelize Tester' listening at http://localhost:%s", port);
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
  //if (req.url == "/favicon.ico") {res.end();return;}
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

