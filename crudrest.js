
/* @file
* All JSDoc "Home" content moved to README.md
* @todo Make logging to console be optional / supressible.
* # Developer geared info
* - Primary key for smodel is available in smodel.primaryKeyAttribute
* - Sequelize Docs: http://docs.sequelizejs.com/en/latest/
*/
'use strict;';
// Note: During dev. install locally: sudo npm install -g

var express = require('express');
var router = express.Router({caseSensitive: 1});
var perscache = {};
var errcb = null;
var respcb = null; // Custom response callback
var taidx = {}; // TODO: Move
// Examples of options
var cropts = {
  softdelattr: '', // Universal soft-delete attribute
  softdeleted: null, // Softdeletion sequelize update (Object, e.g {active: 0})
  softactive: null // Soft delete active state (not deleted) as sequelize filter (Object, e.g. {where: {active {"ne": 0}}
};
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
   return {where: rawfilter};
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
   res.send(jerr); // TODO: NOT Here ? See/Analyze error handling above
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
// Set or get sequelize package options
function opts(cropts_p) {
  if (cropts_p) {cropts = cropts_p;}
  return(cropts);
}
function hasattribute (model, attr) {
   if (typeof model !== 'object') {return 0;}
   // TODO: Find out if there is high-level Sequelize accessor for this.
   if (model.tableAttributes[attr]) {return 1;}
   return 0;
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
 *
 * Table and attribute parameter is allowed to be gotten from URL k-v parameter "ta" (e.g. &ta=product.vendor) or
 * route patameter route parameter (:ta) by same name "ta" (/ac/project.vendor?...).
 */
function opt_or_ac (req, res) {
   "use strict";
   var ta = req.query["ta"]; // OR: req.params["ta"]
   // Support alternative server URL route embedding of ta notation
   if (!ta && req.params['ta']) {ta = req.params['ta'];}
   console.log("opt_or_ac");
   var term = req.query["term"];
   // OLD: ... 
   if (!ta) {throw "No ta parameter";}
   // ta.match(/^\w+\.\w+/) // OR search ?
   if (ta.indexOf('.') < 1) {throw "ta in wrong format (missing dot)";} // Later regexp
   if (!taidx || typeof taidx !== 'object') {throw "No taidx available";}
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
   // Set error with base message.
   var jr = {"ok": 0, "msg": basemsg };
   // TODO: Make ex.message optional If (debug) {...}
   jr.msg += ": " + ex ? ex.message : "(No exceptions)";
   // Intercept / transform by 
   //if (errcb) {jr = errcb(..., r.msg);} // TODO
   res.send(jr);
   console.log(jr.msg);
}
/************************** CRUD ***************************/

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
function crudpost(req, res) {
  // res.setHeader('Content-Type', 'text/json'); /// Let app middleware handle this collectively.
  console.log("POSTed JSON: " + JSON.stringify(req.body, null, 2));
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

// http://stackoverflow.com/questions/8158244/how-to-update-a-record-using-sequelize-for-node
/** Update single entry of a type by id by HTTP PUT.
 * Route pattern must have params: ":type", ":idval"
 * REST Response will have the complete entry after update in it.
 * @example
 * var crudrest = require('crudrest');
 * // ...
 * router.put("/:type/:idval", crudrest.crudput);
 */
function crudput (req, res) {
  
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

/** Delete single entry of a type by id by HTTP DELETE.
 * Route pattern must have params: ":type", ":idval"
 *
 * @todo Account for softdelete
 * @example
 *     var crudrest = require('crudrest');
 *     // ...
 *     router.delete("/:type/:idval", crudrest.cruddelete);
 * 
 */
function cruddelete (req, res) {
  
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
  // var cropts = opts();
  // Need to check exists first ?
  // Need a flag for exception ?
  // Soft delete => UPDATE (need attr and value)
  if (cropts.softdelattr && hasattribute(smodel, cropts.softdelattr)) { // smodel.hasAttr(sdattr)
    var softdel = cropts.softdeleted;
    if (typeof softdel !== 'object') {sendcruderror("Soft delete no properly configured", null, res);}
    console.log("Soft-delete mode: Use update setter", softdel);
    smodel.update(softdel, idfilter)
    .catch(function (ex) {sendcruderror("Failed to SoftDelete", ex, res);})
    .then(function (num) {
       console.log("Sofdel (update) ret: ", num);
       var d = respcb ? respcb(jr, "delete") : jr;
       res.send(d);
    });
  }
  // Real DELETE
  else {
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
  }
}

// 2 cases for GET
// Recommended route pattern: /^\/(\w+)\/(\d+)/

/** Fetch/Retrieve single entry by type and id using HTTP GET method.
 * Route pattern must have params: ":type", ":idval"
 * 
 * @example
 * var crudrest = require('crudrest');
 * // ...
 * router.get("/:type/:idval", crudrest.crudgetsingle);
 */
function crudgetsingle (req, res) {
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

/** Get multiple (default all) of type using HTTP GET method.
 * Route pattern must have params: ":type"
 * The URL may have one or more k-v pairs (in req.query) forming a simple AND filter that is
 * added to the base query.
 * Passing multiple values by same key is converted to as WHERE key IN (v1,v2...) by Sequelize.
 *
 *     var crudrest = require('crudrest');
 *     // ...
 *     router.get("/:type", crudrest.crudgetmulti);
 *     // ...
 *     // On client side (pass search filter for vendor)
 *     $http.get("/products", {params: {vendor: "Cray"}}).success(...)
 *
 * Sorting the results - use reserved parameter "_sort"
 *     // Single sort criteria
 *     $http.get("/products", {params: {vendor: "Cray", _sort: "model,ASC"}}).success(...)
 *     // Multiple sort properties (sort direction specifier ASC/DESC is optional)
 *     $http.get("/products", {params: {vendor: "Cray", _sort: ["model,ASC", "mfgdate"]}}).success(...)
 *
 */
function crudgetmulti (req, res)  {
  // var otype = req.params[0]; // OLD !
  var otype = req.params['type'];
  var smodel = getpersister(otype, res);
  if (!smodel) {sendcruderror("No Model Found for "+ otype, null, res);return;}
  var filter = {}; // Add where: {} ?
  // If parameters, add to filter here.
  // TODO: Check type of Object
  if (req.query && Object.keys(req.query).length) {
    // Call probe_sort() to figure out "order" for Sequelize (param key '_sort')
    // Having no '_sort' param changes nothing.
    var order = probe_sort(req, filter); // No ret value, modifies filter and req.query
    var keys = Object.keys(req.query);
    console.log("Have query params: " + JSON.stringify(req.query) ); // + " keycnt:" + kcnt
    // Note: Treat Array val specially (or let the normal thing happen ?)
    keys.forEach(function (k) {filter[k] = req.query[k];});
    // Wrap in Sequelize compatible (format is more complex than meets the eye)
    filter = kvfilter(filter);
    if (order) { filter.order = order; }
    console.log("Assembled filter (Seq): " + JSON.stringify(filter));
  }
  else {console.log("Do NOT Have query filter (no keys found)");}
  // Check softdel filter
  // Soft del attribute explicitly already in filter - honor the value given (make exclusive to auto-softdetele-filter)
  //if (cropts.softdelattr && filter.where && filter.where[cropts.softdelattr]) {} // return ...
  // else ... Automatic softdel (optim. hasattribute() to be last)
  //if (cropts.softdelattr &&  cropts.softactive && hasattribute(smodel, cropts.softdelattr) ) {
  //  if (!filter.where) { filter.where = {}; }
  //  var sa = cropts.softactive;
  //  if (typeof sa !== 'object') { sendcruderror("Soft Activity not configured (as Object)", null, res); return;}
  //  // Add to (previous) filter. How to overlay 2 independent filters in a bulletproof manner ?
  //  var dks = Object.keys(sa.where); // e.g. {where: {active: {"ne": 0}}
  //  dks.forEach(function (k) { filter.where[k] = sa.where[k]; });
  //  console.log("Final Sequelize soft-active query filter: ", filter);
  //}
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
/** Add Sort/Order components from request parameters to Sequelize filter (if any).
 * Has a side effect of removing all Sort/Order query parameters from request (req) to not
 * treat them as where filter components later.
 * Sort/Order components are picked up from query parameter "_sort" with following options
 * - value should be attr name with optional direction parameter separated by comma
 * - If direction parameter is missing, 'ASC' is used
 * - One or more Sort/Order components can be passed
 * Returns Sequelize "order" parameter to where filter definition passed here
 */
function probe_sort(req, filter) {
  var qp = req.query;
  
  if (!qp) {return;} // No query !
  if (!qp['_sort']) {return;} // No sort parameter
  
  var defdir = 'ASC';
  var validdir = {ASC: true, DESC: true}; // Valid sort directions (as upper case)
  // Coerce to array
  if (!Array.isArray(qp['_sort'])) {qp['_sort'] = [qp['_sort']];}
  var sarr = qp['_sort'];
  var order = sarr.map(function (sortp) {
    // Split to attribute, sort_direction
    var sortpair = sortp.split(/,/);
    if (!sortpair) {console.log("No sortpair !");return null;}
    if (!sortpair.length || sortpair.length > 2) {console.log("No length for sortpair or too many attr params (should be 1 or 2) !");return null;}
    // TODO: To be _really_ clean, check attr presence.
    // Add (defaylt) sort direction if needed
    if (sortpair.length === 1) {sortpair.push(defdir);}
    // Conver to upper and validate
    else {
      sortpair[1] = sortpair[1].toUpper();
      if (!validdir[ sortpair[1] ]) {console.log("Invalid direction param "+sortpair[1]+" !");return null;}
    }
    return sortpair;
  });
  // Add Sequelize "order" param to filter to use in later query.
  // OLD: filter.order = order.filter(function (it) {return it;}); // Strip null:s
  var order = order.filter(function (it) {return it;});
  // Get rid of '_sort'
  delete(qp['_sort']);
  return order;
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
 *     // Directly under root (unlikely)
 *     app.use('/', router);
 *     // ... or under special path
 *     // app.use('/specialpath', router);
 */
function defaultrouter(router) {
   if ( ! router) {  router = express.Router({caseSensitive: 1}); }
   // function dummy (req, res) {}
   
   // Options or AC (Based on this pattern must be early)
   // TODO: Have this SEPARATELY "connectable"
   // router.get(/^\/ac\/?/, opt_or_ac);
   
   router.post  ("/:type", crudpost); // POST 1 arg: type
   router.put   ("/:type/:idval", crudput); // PUT 2 args: type,id
   router.delete("/:type/:idval", cruddelete); // DELETE 2 args: type,id
   router.get   ("/:type/:idval", crudgetsingle); // GET (single) 2 args: type,id
   router.get   ("/:type", crudgetmulti); // GET(multiple) 1 arg: type
   
   console.log("Set up router: ", router);
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
module.exports.opts = opts;

