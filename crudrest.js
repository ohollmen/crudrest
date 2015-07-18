
/* @file
* All JSDoc "Home" content moved to README.md
* @todo Make logging to console be optional / supressible.
* # Developer geared info
* - Primary key for smodel is available in smodel.primaryKeyAttribute
* - Sequelize Docs: http://docs.sequelizejs.com/en/latest/
*/
'use strict';
// TODO: Change routing URL:s

var express = require('express');
var router = express.Router({caseSensitive: 1});
var perscache = {};
var errcb = null;
var respcb = null;
var taidx = {}; // TODO: Move
/** Internal static method to create ID based filter for Sequelize CRUD Operations.
 * The crudrest module convention requires to have parameter ":idval"
 * in the route URL, which will be used here to resolve id.
 * @param {object} smodel - Sequelize model
 * @param {object} req - Node.js / Express HTTP request
 */
function getidfilter (smodel, req) {
   var idval = req.params['idval'];
   var pka = smodel.primaryKeyAttribute; // Can be array for composite key ?
   var whereid = {}; // {"pid": 3};
   whereid[pka] = idval;
   var idf = {where: whereid, limit: 1};
   return idf;
}
// Internal method to convert rawfilter to Sequelize format filter.
// TODO: Alow wildcarding, etc.
function kvfilter (rawfilter) { // (req)
   // TODO: Find k-v pairs in req ?
   // Validate as Object
   
   // Wrap in Sequelize filter format
   return {where: rawfilter}
}
// OLD: ... HTTP response object and send a desired JSON/REST response indicating the error.
/** Set custom error / exception handling callback.
* The callback should accept parameters object type name and error message and create the
* (error) message structure sent back to client as JSON.
* @param {function} f - Error callback function
* @example
* crudrest.seterrhdlr(function (typename, errmsg) {
*   return {"status": "err", "msg": errmsg + ". Type: " + typename};
* });
*/
function seterrhdlr(f) {
   // Check that we fed a function
   if (typeof(f) != "function") {return;}
   errcb = f;
}
/** Internal static method to get Persister by entity type name.
 For a requests for invalid entity types send an REST Error.
 If module variable errcb is set to a callback handler, this callback is used to formulate
 the error to res (Node.js HTTP response).
 If this returns false value (no persister), the calling Node handler should plainly return
 to end the response as all the response communication has already been done here.
 @todo Consider doing more here: access control ?
 @param {string} otype - Name for Object/Entity type
 @param {object} res - Response
*/
function getpersister (otype, res) {
   var pers;
   // Access control  ?
   // if () {}
   // 
   if (pers = perscache[otype]) {return pers;}
   // Invalid persister, custom error handling. Ensure request is ended.
   var emsg = "Not a valid entity type."; // Keep high level.
   var jerr = {"ok" : 0, "msg": emsg};
   // Override jerr ?
   if (errcb) { jerr = errcb(otype, emsg); }
   // General / default error message generation (Use errcb) to
   // override.
   else {
     
     // jerr.msg += "Type:" + otype + ". Total types:" + Object.keys(perscache).length;
     
   }
   res.send(jerr);
   console.log("Invalid entity type requested: " + otype);
   return null;
}
/** Set a callback to transform response to a custom JSON topology.
* Custom here means that instead of the "raw" object the handler could return the data "wrapped"
* with one extra JSON (Object) layer (the choice of layering is yours).
* Whatever callback returns is serialized (as JSON) to client.
* @example
*     // Transform the JSON structure slightly. Add "status" layer.
*     crudrest.setrespcb(function (origdata, op) {
*       return {"status": "ok", "data": origdata};
*     });
* 
* The 2nd parameter "op" is one of: 'create','update','retrieve','delete'.
*/
function setrespcb (cb) {
   // Must be function
   if (typeof(cb) != "function") {return;}
   respcb = cb;
}

/** Temporary AC handler.
 * Lookup options source from server side config.
 * To use this, 2 server Server side configurations must be assigned to module variables:
 * - Options / AC config - use accessor taidx() to set config.
 * - Sequelize model index - use accessor setperscache() for this.
 * (See other parts of doc for this module)
 * @example
 *     // Do GET on http://myapp/ac/?ta=projects.projectid
 *     wget -O opts.json http://myapp/ac/?ta=projects.projectid
 */
function opt_or_ac (req, res) { // 
   "use strict";
   var ta = req.query["ta"]; // OR: req.params["ta"]
   console.log("opt_or_ac");
   var term = req.query["term"];
   if (!ta) {throw "No ta parameter";}
   // ta.match(/^\w+\.\w+/) // OR search ?
   if (ta.indexOf('.') < 1) {throw "ta in wrong format";} // Later regexp
   var optinfo = taidx[ta];
   if (!optinfo) {throw "No ta entry for " + ta + " in " + taidx + "(Use taidx() )";} // TODO: Array
   // Support static / constant options (rawlist, keyvallist)
   if (Array.isArray(optinfo[1])) {
      // 
      res.send(JSON.stringify(optinfo[1]));return;
   }
   // Check file (missing last / 3) && !optinfo[3]
   //if (optinfo[1].indexOf('/') ) {
   //   var opts = require(optinfo[1]);
   //   res.send(opts);return;
   //}
   // Check self-referring distinct
   //if (!optinfo[0].indefOf(optinfo[1]+'.') ) {
   //   var qs = "SELECT DISTINCT(" + optinfo[2] + ") FROM " + optinfo[1];
   //   // TODO: How do we get handle to sequelize ?
   //   sequelize.query(qs, ....);
   //}
   // Assume correct format
   var w = '';
   // Try to add filters here (from server side info: session, etc)
   // Possibly make ta attached callback return the filter.
   
   // TODO: sequelize.constructor.Utils.escape(term);
   // 
   if (term) {term.replace(/\'/,''); w = " WHERE " + optinfo[3] + " LIKE '%" + term + "%'"; } // label OR optinfo[3] ?
   // Raw SQL:... select as value, label
   var qs = "SELECT " + optinfo[2] + " value ," + optinfo[3] + " label FROM " + optinfo[1] + w;
   console.log("Using RAW SQL filter: " + qs);
   // conn.query(qs, function (err, result, flds) {
   // });
   // Sequelize. TODO: Refine filter
   var smodel = getpersister(optinfo[1], res); // otype
   if (!smodel) {throw "No Model for " + optinfo[1];}
   var filter = {};
   if (term) { filter.where = [optinfo[3]+' LIKE ?', term + '%'];console.log("Got term:" + term);}
   console.log("Using filter: " + JSON.stringify(filter));
   var jr = {'ok': 1};
   // Sequelize raw query
   // http://docs.sequelizejs.com/en/1.7.0/docs/usage/ => Executing raw SQL queries
   var qpara = null;
   if (term) {qpara = ['%'+ term +'%'];}
   // TODO: Use raw SQL
   var sequelize = smodel.sequelize;
   if (!sequelize) {throw "No sequelize instance gotten from Model for " + smodel.name;}
   //sequelize.query(qs, null, {raw: true, plain: false}) // , replacements: qpara (This form dulicates result sets => AoAoH)
   sequelize.query(qs,{type: sequelize.QueryTypes.SELECT}) // This (overload) form does not duplicate result sets
   //smodel.findAll(filter)
   .catch(function (ex) {jr.ok = 0;jr.msg = "Search error: "+ ex.message;res.send(jr);})
   .then(function (arr) {
     if (!arr) {jr.msg = "No result set array !"; } // res.send(jr);
     // NOTE: Sequelize 2.1.0 hash AoAoH and duplicates result set wrapped by extra array (!?)
     // 2.1.3 ...
     else {
       console.log("Got multiple: " + arr.length + " ents. from: " + optinfo[1]);
       console.log(JSON.stringify(arr));
       // Hi-level sequelize -> Need to map original/ ACTUAL field name(s) array to value, label
       //arr = arr.map(function (it) {
       //  var e = {'value' : it[optinfo[2]], 'label': it[optinfo[3]]};
       // console.log(e); // DEBUG
       // return e;
       //});
     }
     res.send(JSON.stringify(arr));
   });
   
}
/** Internal method to send exception based Sequelize error messages to client.
 * Message is also replicated on server console.
 */
function sendcruderror(basemsg,ex,res) {
   
   var jr = {"ok": 0, "msg": basemsg };
   // TODO: Make ex.message optional If (debug) {...}
   jr.msg += ": " + ex.message;
   // Intercept / transform by 
   //if (errcb) {jr = errcb(..., r.msg);} // TODO
   res.send(jr);
   console.log(jr.msg);
}
/************************** CRUD ***************************/

// Assign handler(s) for REST URL
// How do we automatically get parsed JSON here ? "/people/"
// Recommended route pattern: /^\/(\w+)\/?/ (e.g. "/people/")
/** Insert/Create a single entry of type by HTTP POST.
 * Route pattern must have params: ":type"
 * 
 * @example
 * var crudrest = require('crudrest');
 * // ...
 * router.post("/:type/", crudrest.crudpost);
 */
// Note: ER_BAD_FIELD_ERROR: Unknown column 'id' in 'field list'
// ... Table does not have primary key
function crudpost(req, res) { // 
  res.setHeader('Content-Type', 'text/json');
  console.log("Posted JSON: " + JSON.stringify(req.body, null, 2));
  // console.log("User is-a: " + User); //  [object SequelizeModel]
  var otype = req.params['type'];
  console.log("POST: OType: " + otype);
  var jr = {'ok': 1};
  // Lookup persister
  var smodel = getpersister(otype, res); //  [object SequelizeModel]
  if (!smodel) {jr.ok = 0;jr.msg = "No Model";res.send(jr);return;}
  //console.log("Dump: " + JSON.stringify(req.body));jr.id = 6666666;jr.msg = "Things ok in debug mode";
  //res.send(JSON.stringify(jr));return; // DEBUG
  // Intercept with a callback (validate, add timestamps, check access permissions ...)
  // var f = preproc(smodel); // 'create'
  // if (f) {f( req.body, req, smodel);} // apply ...
  // Traditional try / catch will NOT work here
  // req.body as array also works.
  smodel.create(req.body)
  // .catch(function (ex) {jr.ok = 0;jr.msg = "Creation problem: "+ex.message;console.log(jr.msg);res.send(jr);})
  .catch(function (ex) {sendcruderror("Creation problem",ex,res);})
  .then(function (ent) {
    if (!ent) {console.log("Likely earlier exception");return;} // Earlier exception
    console.log("Saved: " + JSON.stringify(ent));
    //jr.data = ent; // Hard default
    var d = respcb ? respcb(ent, "create") : ent;
    res.send(d);
  });
}


// Recommended route pattern: /^\/(\w+)\/(\d+)/ (e.g. "/people/3")
// http://stackoverflow.com/questions/8158244/how-to-update-a-record-using-sequelize-for-node
/** Update single entry of a type by id by HTTP PUT.
 * Route pattern must have params: ":type", ":idval"
 * REST Response will have the complete entry after update in it.
 * @example
 * var crudrest = require('crudrest');
 * // ...
 * router.put("/:type/:idval", crudrest.crudput);
 */
function crudput (req, res) { // 
  
  var jr = {'ok': 1};
  var otype = req.params['type'];
  var idval = req.params['idval']; // For DEBUG
  console.log(req.body);
  var smodel = getpersister(otype, res);
  if (!smodel) {return;}
  //var pka = smodel.primaryKeyAttribute; // primaryKeyField: (scalar), primaryKeyAttributes: (Array)
  //var whereid = {};
  //whereid[pka] = idval;
  //var idfilter = {where: whereid, limit: 1};
  var idfilter = getidfilter(smodel, req);
  console.log("PUT: Update Triggered on " + idval);
  console.log(req.body);
  // Need to find entry first (share id filter with update)
  smodel.find(idfilter)
  //.catch(function (ex) {jr.ok = 0;jr.msg = "No entry: " + ex.message;res.send(jr);})
  .catch(function (ex) {sendcruderror("No entry for update",ex,res);})
  .then(function (ent) {
    console.log("Seems to exist for update): " + idval);
    smodel.update(req.body, idfilter) // options.limit (mysql)
    // Alternative method (~2012)
    // ent.updateAttributes(req.body).success(...)
    // .catch(function (ex) {jr.ok = 0;jr.msg = ex.message;res.send(jr);})
    .catch(function (ex) {sendcruderror("Update failure",ex,res);})
    // This seems to gain: [1]
    .then(function (ent) {
      if (!ent) {console.log("PUT: Exception ?");return;} // Earlier exception
      // Need to find again ? Need to reconfig idfilter ?
      smodel.find(idfilter)
      .catch(function (ex) {sendcruderror("Updated ent reload failure",ex,res);})
      .then(function (ent) {
        console.log("Updated: " + JSON.stringify(ent));
        var d = respcb ? respcb(ent, "update") : ent;
        res.send(d);
      }); // end of re-fetch/then
    }); // end of update/then
  }); // end of find/then
}


//  Recommended route pattern: /^\/(\w+)\/(\d+)/ (e.g "/people/3")
/** Delete single entry of a type by id by HTTP DELETE.
 * Route pattern must have params: ":type", ":idval"
 *
 * @todo Account for softdelete
 * @example
 * var crudrest = require('crudrest');
 * // ...
 * router.delete("/:type/:idval", crudrest.cruddelete);
 */
function cruddelete (req, res) { // 
  
  var jr = {'ok': 1};
  var otype = req.params['type'];
  var idval = req.params['idval']; // Keep for error handling
  console.log("DELETE: entry(id) " + idval + " of type: " + otype);
  console.log(req.body);
  var smodel = getpersister(otype, res);
  if (!smodel) {return;}
  //////////////////////////
  //var pka = smodel.primaryKeyAttribute; // primaryKeyField: (scalar), primaryKeyAttributes: (Array)
  //var whereid = {};
  //whereid[pka] = idval;
  //var idfilter = {where: whereid, limit: 1};
  var idfilter = getidfilter(smodel, req);
  // Need to check exists first ?
  // Need a flag for exception ?
  smodel.destroy(idfilter)
  // .catch(function (ex) {jr.ok = 0;jr.msg = ex.message;res.send(jr);})
  .catch(function (ex) {sendcruderror("Failed to Delete",ex,res);})
  .then(function (num) {
    jr.ok = num;
    jr.idval = idval;
    if (!num) {jr.msg = "No such entry: " + idval;}
    console.log("Deleted (count): " + num);
    // if (!num) {return;} // Earlier exception
    var d = respcb ? respcb(jr, "delete") : jr; // What to do on delete ?? Common pattern ok ?
    res.send(d);
  });
  // Soft delete (need attr and value)
  // if (conf.softdel && smodel.hasAttr(sdattr)) {
  //   smodel.update(softdel, idfilter)
  //   .catch(function (ex) {sendcruderror("Failed to SoftDelete",ex,res);})
  //   .then(function (num) {
  //      
  //   });
  // }
}

// 2 cases for GET
// Recommended route pattern: /^\/(\w+)\/(\d+)/

/** Fetch/Retrieve single entry by type and id by HTTTP GET.
 * Route pattern must have params: ":type", ":idval"
 * 
 * @example
 * var crudrest = require('crudrest');
 * // ...
 * router.get("/:type/:idval", crudrest.crudgetsingle);
 */
function crudgetsingle (req, res) { // 
  var jr = {'ok': 1};
  var otype = req.params['type'];
  // OLD: var idval = req.params[1];
  var smodel = getpersister(otype, res);
  if (!smodel) {return;}
  var idfilter = getidfilter(smodel, req);
  console.log("GET single by: " + JSON.stringify(idfilter));
  smodel.find(idfilter)
  //.catch(function (ex) {jr.ok = 0;jr.msg = ex.message;res.send(jr);})
  .catch(function (ex) {sendcruderror("No Entry Found",ex,res);})
  .then(function (ent) {
    //jr.ok = num;
    //if (!num) {jr.msg = "No such entry: " + idval;}
    console.log("Got single: " + JSON.stringify(ent));
    // if (!num) {return;} // Earlier exception
    var d = respcb ? respcb(ent, "retrieve") : ent;
    res.send(d);
  });
}

// Example route pattern: /^\/(\w+)\/?/
/** Get multiple (default all) of type by HTTTP GET.
 * Route pattern must have params: ":type"
 * The URL may have one or more k-v pairs forming a simple AND filter that is
 * added to the base query.
 * @example
 * var crudrest = require('crudrest');
 * // ...
 * router.get("/:type", crudrest.crudgetmulti);
 * // ...
 * // On client side
 * $http.get("/products", {params: {vendor: "Cray"}}).success(...)
 */
function crudgetmulti (req, res)  { // 
  // var otype = req.params[0]; // OLD !
  var otype = req.params['type'];
  var smodel = getpersister(otype, res);
  if (!smodel) {return;}
  var filter = {};
  // If parameters, add to filter here.
  // TODO: Check type of Object
  if (req.query && Object.keys(req.query).length) {
    var keys = Object.keys(req.query);
    console.log("Have query: " + JSON.stringify(req.query) ); // + " keycnt:" + kcnt
    keys.forEach(function (k) {filter[k] = req.query[k];});
    // Wrap in Sequelize compatible (format is more complex than meets the eye)
    filter = kvfilter(filter);
    console.log("Assembled filter (Seq): " + JSON.stringify(filter));
  }
  else {console.log("DO NOT Have query filter (no keys found)");}
  smodel.findAll(filter)
  // .catch(function (ex) {jr.ok = 0;jr.msg = ex.message;res.send(jr);})
  .catch(function (ex) {sendcruderror("No Entries Found",ex,res);})
  .then(function (arr) {
    // if (!arr) {jr.msg = "No result set array !"; res.send(jr);}
    console.log("Got multiple: " + arr.length + " ents.");
    var d = respcb ? respcb(arr, "retrieve") : arr;
    res.send(d);
  });
}

/** Setup a good default router with default router URL:s.
 * Mainly used for the example app bundled in to module distribution.
 * For more granular routing setup do a similar reouter calls directly in your own app.
 * You can still have all routes setup here under a sub-path (coordinated by express routing, see
 * example below).
 * @example
 *     var router = express.Router({caseSensitive: 1});
 *     crudrest.defaultrouter(router);
 *     // ...
 *     // Directly under root
 *     app.use('/', router);
 *     // ... or under special path
 *     // app.use('/specialpath', router);
 */
function defaultrouter(router) {
   if (!router) {  router = express.Router({caseSensitive: 1}); }
   // function dummy (req, res) {}
   // OLD Regexp routes
   //router.post(/^\/(\w+)\/?/, crudpost); // POST 1 arg: ot
   //router.put(/^\/(\w+)\/(\d+)/, crudput); // PUT 2 args: ot,id
   //router.delete(/^\/(\w+)\/(\d+)/, cruddelete); // DELETE 2 args: ot,id
   //router.get(/^\/(\w+)\/(\d+)/, crudgetsingle); // GET (single) 2 args: ot,id
   //router.get(/^\/(\w+)\/?/, crudgetmulti); // GET(multiple) 1 arg: ot
   
   // Options or AC (Based on this pattern must be early)
   // TODO: Have this SEPARATELY "connectable"
   // router.get(/^\/ac\/?/, opt_or_ac);
   
   router.post  ("/:type", crudpost); // POST 1 arg: type
   router.put   ("/:type/:idval", crudput); // PUT 2 args: type,id
   router.delete("/:type/:idval", cruddelete); // DELETE 2 args: type,id
   router.get   ("/:type/:idval", crudgetsingle); // GET (single) 2 args: type,id
   router.get   ("/:type", crudgetmulti); // GET(multiple) 1 arg: type
   
   console.log("Set up router: " + router);
   return router;
}

//Example: module.exports = router;
// TODO: MUST Store other things here too.
// module.exports.perscache = {};
module.exports.router = router; // ????
/** Set Sequelize ORM/persister config.
 * Persister cache should be pre-indexed as described by documentation main page.
 * @param {object} pc - Indexed ORM map
 */
// module.exports.setperscache =
function setperscache (pc) {
  // TODO: Allow array form to be passed. Problem: need sequelize
  if (Array.isArray(pc)) {
     pc.forEach(function (item) {
       var tn = item[1].tableName;
       //perscache[tn] = sequelize.define(tn, item[0], item[1]);
     });
     return;
  }
  // Direct pre-indexed format assignment
  perscache = pc;
}
/** Set Table / Attribute index for the Options and Autocomplete.
 * This is *only* needed if opt_or_ac is used to 
 */
function settaidx(pc) {taidx = pc;}

// Helper methods
module.exports.setperscache = setperscache;
module.exports.defaultrouter = defaultrouter;
// Assign Main Handler methods: crudpost crudput cruddelete crudgetsingle crudgetmulti
module.exports.crudpost = crudpost;
module.exports.crudput = crudput;
module.exports.cruddelete = cruddelete;
module.exports.crudgetsingle = crudgetsingle;
module.exports.crudgetmulti = crudgetmulti;
// More helpers
module.exports.opt_or_ac = opt_or_ac;
module.exports.setrespcb = setrespcb;
module.exports.seterrhdlr = seterrhdlr;
module.exports.settaidx = settaidx;
