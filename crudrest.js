/** @module */

/* @file
* All JSDoc "Home" content moved to README.md
* @todo Make logging to console be optional / supressible.
*
* # Developer geared info
* - Primary key for smodel is available in smodel.primaryKeyAttribute
* - Sequelize Docs: http://docs.sequelizejs.com/en/latest/
*/
'use strict;';
// Note: During dev. install locally: sudo npm install -g

var express = require('express');
var async   = require('async'); // For mixed C,U,D processing.
var router = express.Router({caseSensitive: 1});
var perscache = {};
var errcb = null;
var respcb = null; // Custom response callback
var taidx = {}; // TODO: Move
var Promise = require('bluebird');

// Examples of options (these are per application)
var cropts = {
  softdelattr: '', // Universal soft-delete attribute
  softdeleted: null, // Softdeletion sequelize update (Object, e.g {active: 0})
  softactive: null, // Soft delete active state (not deleted) as sequelize filter (Object, e.g. {where: {active {"ne": 0}}
  mixeddelprop: null, // "isDeleted" property for mixed C,U,D processing, denoting deletion
  debug: 0, // TODO: Start using debug flag across the module
  incmap: null,
  otypetrans: {} // Object type transformations: mapping of otype to transformation CB
};
/** Internal static method to create ID based filter for Sequelize CRUD Operations.
 * The crudrest module convention requires to have parameter ":idval"
 * in the route URL, which will be used here to resolve entry id.
 * Note: req.params will not be modified in any way here.
 * @param {object} smodel - Sequelize model (for a entity type)
 * @param {object} req - Node.js / Express HTTP request (from whose params the ID filter will be extracted).
 * 
 */
function getidfilter (smodel, req) {
   var idval = req.params['idval'];
   var pka = smodel.primaryKeyAttribute; // Can be array for composite key ?
   var whereid = {}; // {"pid": 3};
   whereid[pka] = idval;
   var idf = {where: whereid, limit: 1};
   return idf;
}
/* Internal method to convert rawfilter to Sequelize format filter.
 * This only adds a "where" object layer to raw filter passed in.
 * @todo Allow wildcarding, etc.
 */
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
*
* Example of setting handler:
*
*     crudrest.seterrhdlr(function (typename, errmsg) {
*       return {"status": "err", "msg": errmsg + ". Type: " + typename};
*     });
* @param {function} f - Error callback function
*/
function seterrhdlr(f) {
   // Check that we fed a function
   if (typeof(f) != "function") {return;}
   errcb = f;
}
/** Internal static method to get Persister by entity type name.
 For a requests for invalid entity types send an REST Error automatically.
 If module variable errcb is set to a callback handler, this callback is used to formulate
 the error to res (Node.js HTTP response).
 If this returns false value (no persister), the calling Node handler should plainly return
 to end the response as all the response communication has already been done here.
 
      var model = getpersister("accesslog", res);
      if (!model) { return; } // Just return, error response is already sent.
 
 @param {string} otype - Name for Object/Entity type
 @param {object} res - Response
 @return null for no entity type found. REST Error has been already sent and
 caller should just return without further actions.
 
 @todo Consider doing more here: access control ?
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
   // Override jerr ? TODO: Use sendcruderror();
   // if (errcb) { jerr = errcb(otype, emsg); }
   sendcruderror(emsg, null, res);
   // General / default error message generation (Use errcb) to
   // override.
   //else {
     
     // jerr.msg += "Type:" + otype + ". Total types:" + Object.keys(perscache).length;
     
   //}
   // res.send(jerr); // TODO: NOT Here ? See/Analyze error handling above
   console.log("Invalid entity type requested: " + otype);
   return null;
}
/** Set a callback to transform response to a custom JSON topology.
* Custom here means that instead of the "raw" object the handler could return the data "wrapped"
* with one extra JSON (Object) layer (the choice of layering is yours).
* Whatever callback returns is serialized (as JSON) to client.
*
*     // Transform the JSON structure slightly. Add "status" layer.
*     crudrest.setrespcb(function (origdata, op) {
*       return {"status": "ok", "data": origdata};
*     });
* 
* The 2nd parameter "op" is one of: 'create','update','retrieve','delete' ('mixed').
*/
function setrespcb (cb) {
   // Must be function
   if (typeof(cb) != "function") {return;}
   respcb = cb;
}
/** Set entity type per-entry transformation.
* This needs to be called for every entity type that needs to have transformation.
* Can be applied for collections by calling individually per each item.
* @param {string} otype - Entity type name (e.g. "users")
* @param {function} cb - Transformation callback (with signature: ent, req
*
* Callback can do any transformations on the entry: add fields, delete fields, modify fields, etc. Callback is called on:
* - retrieving single entry
* - retrieving multiple entry
* - response to update
* The callback should have a signature (see also example below):
* - ent - Entry
* - req - Current (Node.js HTTP / Express) HTTP
* As usual signature is not checked.
* Example:
*    // Simple add attribute
*    function addfullname(ent) {ent.fullname = ent.firstname + " " + ent.lastname; }
*    crudrest.addotypetrans("users", addfullname);
*    // Bit more advanced, combine addition and deletion
*    function deletepassinfo(ent) { delete(ent.passwd); delete(ent.passtype); }
*    crudrest.addotypetrans("users", function (ent) { addfullname(ent); deletepassinfo(ent); });
*
* Currently the transformation is required to run syncronously and does not return any value.
* These trans callback assignments are also exclusive (non-cumulative), i.e. later assignment overrides and cancels earlier.
*/
function addotypetrans(otype, cb) {
   cropts.otypetrans[otype] = cb;
}
// Set or get crudrest package options
function opts(cropts_p) {
  if (cropts_p) {cropts = cropts_p;}
  return(cropts);
}
// Test if the Sequelize model for a schema has the named attribute.
// @param {object} model - Sequelize model definition
// @param {string}  attr - Attribute name expected to be found in schema model
// @return Tru3e (1) value for attribute found, False (0) for not found.
function hasattribute (model, attr) {
   if (typeof model !== 'object') {return 0;}
   // TODO: Find out if there is high-level Sequelize accessor for this.
   if (model.tableAttributes[attr]) {return 1;}
   return 0;
}
/*
* 
* @param req - Request with optional :inc route parameter (for inclusion profile label from route URL)
* @param filter - Sequelize find (findAll,findOne) filter parameter to add inclusion to.
* @return number of entry inclusions or -1 for error (ambiguous inclusion). Add inclusions to filter.
* @todo Weed out err comm from here to have more caller flexibility. Throw errors ?
*/
function addfindinclusions (req, resp, filter) {
  var inclbl = req.params['inc'];
  if (!inclbl) { return 0; } // No Inclusions
  // Mandate inclbl to be in dot-not ?
  // var m = inclbl.match(/^(\w+)\.(\w+)$/);
  // if (!m) { sendcruderror("Inclusion label not in correct format", null, resp); return -1; }
  var incmap = cropts[incmap];
  if (!incmap) { sendcruderror("No Inclusion map", null, resp); return -1; }
  var inc = incmap[inclbl]; // Array (as dictated by Sequelize). 
  if (!Array.isArray(inc)) { sendcruderror("Inclusion map not in array!", null, resp); return -1; }
  // TODO: Check type from inclbl (in t.prof dot-notation ?) ? OR ... trust passed inc ?
  // 
  idfilter.include = inc; // Add find-include
  return(inc.length);
}

/** Temporary AC handler.
 * Lookup options source from server side config.
 * To use this, 2 server Server side configurations must be assigned to module variables:
 * - Options / AC config - use accessor taidx() to set config.
 * - Sequelize model index - use accessor setperscache() for this.
 * (See other parts of doc for this module)
 * 
 * Example usage (for testing):
 * 
 *       // Do GET on http://myapp/ac/?ta=projects.projectid
 *       wget -O opts.json http://myapp/ac/?ta=projects.projectid
 *
 * Table and attribute parameter is allowed to be gotten from URL k-v parameter "ta" (e.g. &ta=product.vendor) or
 * route parameter route parameter (:ta) by same name "ta" (/ac/project.vendor?...).
 */
function opt_or_ac (req, res) {
   "use strict";
   var ta = req.query["ta"]; // OR: req.params["ta"] (Allowed below)
   // Support alternative server URL route embedding of ta parameter
   // TODO: Make this primary
   if (!ta && req.params['ta']) {ta = req.params['ta'];}
   console.log("Run opt_or_ac");
   var term = req.query["term"];
   // OLD: ... 
   if (!ta) { sendcruderror("No ta parameter", null, res); return; } //  // throw "No ta parameter";
   // ta.match(/^\w+\.\w+/) // OR search ?
   if (ta.indexOf('.') < 1) {throw "ta in wrong format (missing dot)";} // Later regexp
   if (!taidx || typeof taidx !== 'object') {throw "No taidx available";}
   var optinfo = taidx[ta]; // Array: 
   if (!optinfo) {throw "No ta entry for '" + ta + "' in " + taidx + "(Use taidx() to set)";} // TODO: Array
   // Support static / constant options (rawlist, keyvallist)
   if (Array.isArray(optinfo[1])) {
      // 
      res.send(optinfo[1]);return;
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
   // Do not error twice: throw "No Model for " + optinfo[1];
   if (!smodel) {return;}
   var filter = {};
   if (term) { filter.where = [optinfo[3]+' LIKE ?', term + '%'];console.log("Got term:" + term);}
   console.log("Using filter: ", filter);
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
   
   .then(function (arr) {
     if (!arr) {jr.msg = "No result set array !"; } // res.send(jr);
     // NOTE: Sequelize 2.1.0 hash AoAoH and duplicates result set wrapped by extra array (!?)
     // 2.1.3 ...
     else {
       console.log("Got multiple: " + arr.length + " ents. from: " + optinfo[1]);
       console.log(arr);
       // Hi-level sequelize -> Need to map original/ ACTUAL field name(s) array to value, label
       //arr = arr.map(function (it) {
       //  var e = {'value' : it[optinfo[2]], 'label': it[optinfo[3]]};
       // console.log(e); // DEBUG
       // return e;
       //});
     }
     res.send(arr);
   })
   // TODO: sendcruderror()
   // .catch(function (ex) {jr.ok = 0;jr.msg = "Search error: "+ ex.message;res.send(jr);});
   .catch(function (ex) {sendcruderror("Search error: ", ex, res); return; });
}
/** Internal method to send exception based Sequelize error messages to client.
 * Message is also replicated on server console.

 * Note: Do not send another response body after calling this as this also ends / terminates the response output (!).
 *    
 *     if (err) { sendcruderror("Failed to update ...:"+err,ex,res); return; }
 *
 * @param {string} basemsg - Human readable error message
 * @param {object} ex - Exception object
 * @param {object} res - Response Object to send error to.
 */
function sendcruderror(basemsg, ex, res) {
   // Set error with base message.
   var jr = {"ok": 0, "msg": basemsg };
   // TODO: Make ex.message optional If (debug) {...}
   jr.msg += ": " + (ex ? ex.message : "(No exceptions)");
   // Intercept / transform by
   // TODO: Need more context to have otype (1st param)
   if (errcb) {jr = errcb("unknown_type", jr.msg);} // TODO
   res.send(jr);
   console.log(jr.msg);
}
/* ************************* CRUD ************************** */

/** Insert/Create a single entry of type by HTTP POST.
 * Route pattern must have params: ":type"
 * The request body must have JSON entry (as Object) to store into DB.
 * 
 *     var crudrest = require('crudrest');
 *     // ...
 *     router.post("/:type/", crudrest.crudpost);
 * Note: This haslder also works for arrays.
 * @todo: Support fields:[...]
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
  // Not twice: jr.ok = 0;jr.msg = "No Model";res.send(jr);
  if (!smodel) {return;}
  //console.log("POST Dump: ", req.body);jr.id = 6666666;jr.msg = "Things ok in debug mode";
  //res.send(jr);return; // DEBUG
  // Intercept with a callback (validate, add timestamps, check access permissions ...)
  // var f = preproc(smodel); // 'create'
  // if (f) {f( req.body, req, smodel);} // apply ...
  // Traditional try / catch will NOT work here
  // NOT: req.body as array also works for create().
  // Whats diff. with bulkCreate() (?):
  // bulkCreate will not have autoinc attributes, bulkCreate (also) supports fields:[...]
  // sendcruderror("Insert: Not an object.",ex,res);
  if (Array.isArray(req.body)) { crudpostmulti(req.body); return;}
  smodel.create(req.body)
  .then(function (ent) {
    if (!ent) {console.log("Likely earlier exception");return;} // Earlier exception
    console.log("Saved(OK): " + JSON.stringify(ent));
    if (cropts.otypetrans[otype]) { cropts.otypetrans[otype](ent.get(), req); }
    var rd = respcb ? respcb(ent, "create") : ent;
    res.send(rd);
  })
  .catch(function (ex) {sendcruderror("Creation problem ",ex,res); return; });
  // Multi-insert. NOTE: bulkCreate() will return null for auto-incrementing ID. Only attrs stored will
  // be returned to then callback (in Objects)
  function crudpostmulti(arr) {
    var opts = {};
    // Note: node/express also parses Q-string on POST
    var q = req.query;
    if (q && q._fields) {console.log("Q:", q); opts.fields = q._fields.split(/,\s*/); }
    console.log("opts:", opts);
    smodel.bulkCreate(arr, opts)
    .then(function (ent) {
      if (!ent) { console.log("Likely earlier exception (case-multi)");return; }
      // TODO: What is ent here (as passed by Sequelize) ? Array ? count ?
      // Need to do: ents.forEach(function (ent) { cropts.otypetrans[otype](ent, req); } ); ???
      // if (cropts.otypetrans[otype]) { cropts.otypetrans[otype](ent, req); } // Unlikely
      var rd = respcb ? respcb(ent, "create") : ent;
      res.send(rd);
    })
    .catch(function (ex) {sendcruderror("Multi-Creation problem ",ex,res);});
  }
}

// http://stackoverflow.com/questions/8158244/how-to-update-a-record-using-sequelize-for-node
/** Update single entry of a type by id by HTTP PUT.
 * Route pattern must have params: ":type", ":idval".
 * PUT Request Body must contain the JSON to update entry.
 * After successful update REST Response will have the complete entry as JSON in it.
 * 
 *     var crudrest = require('crudrest');
 *     // ...
 *     router.put("/:type/:idval", crudrest.crudput);
 */
function crudput (req, res) {
  
  var jr = {'ok': 1};
  var otype = req.params['type'];
  var idval = req.params['idval']; // For DEBUG
  console.log(req.body);
  var smodel = getpersister(otype, res);
  if (!smodel) {return;}
  //var idfilter = {where: whereid, limit: 1};
  var idfilter = getidfilter(smodel, req);
  console.log("PUT: Update Triggered on " + idval);
  console.log(req.body);
  // Need to find entry first (share id filter with update)
  smodel.find(idfilter)
  
  .then(function (ent) {
    if (!ent) {var msg = "No entry for update";console.log(msg);sendcruderror(msg,new Error("No entry by id:"+idval),res);return;}
    console.log("Seems to exist for update): " + idval);
    smodel.update(req.body, idfilter) // options.limit (mysql)
    // Alternative method (Sequelize ~2012): ent.updateAttributes(req.body).success(...)
    // This seems to gain: [1]. Need to run find()
    .then(function (ent) {
      if (!ent) {console.log("PUT: Exception ?");return;} // Earlier exception
      // Need to find again ? Need to reconfig idfilter ?
      smodel.find(idfilter)
      .then(function (ent) {
        console.log("Updated: ", ent);
	if (cropts.otypetrans[otype]) { cropts.otypetrans[otype](ent.get(), req); }
        var rd = respcb ? respcb(ent, "update") : ent;
        res.send(rd);
      })
      .catch(function (ex) {sendcruderror("Updated ent reload failure",ex,res); return; });
      
      // end of re-fetch/then
    })
    // .catch(function (ex) {jr.ok = 0;jr.msg = ex.message;res.send(jr);})
    .catch(function (ex) {sendcruderror("Update failure",ex,res); return; });
    // end of update/then
  })
  //.catch(function (ex) {jr.ok = 0;jr.msg = "No entry: " + ex.message;res.send(jr);})
  .catch(function (ex) {sendcruderror("No entry for update",ex,res); return; });
   // end of find/then
}

/**
 *
 * Wrapper of deletetion which encapsulates hard/soft delete
 *
 * @param {object}  smodel - Sequelize model (for a entity type)
 * @param {object} filter - Sequelize filter to destroy (hard delete) or update (soft delete)
 * @param {int} forceharddel - if true call destroy Sequelize method
 * @returns {Promise.<int>} - number of affecteds row
 * @private
 */
function _cruddelete(smodel, filter, forceharddel) {

  return new Promise(function(resolve, reject) {
    // var cropts = opts();
    // Need to check exists first ?
    // Need a flag for exception ?
    // Soft delete => UPDATE (need attr and value)
    if (cropts.softdelattr && hasattribute(smodel, cropts.softdelattr) && (!forceharddel)) { // smodel.hasAttr(sdattr)
      var softdel = cropts.softdeleted;

      if (typeof softdel !== 'object') { var error = new Error(); error.basemsg = "Soft delete not properly configured"; return reject(error); }
      console.log("Soft-delete mode: Use update setter: ", softdel);
      smodel.update(softdel, filter) //Promise.<Array.<affectedCount>>
      .then(function (num) { if (num && num.length) { num = num[0]; }  console.log("Sofdel (update) ret: ", num); resolve(num); })
      .catch(function (ex) { ex.basemsg = "Failed to SoftDelete"; reject(ex); } );
    }
    // Real (Hard) DELETE (non-soft)
    else {
      smodel.destroy(filter)
      .then(function (num) { console.log("Deleted (count): " + num); resolve(num); })
      .catch(function (ex) { ex.basemsg = "Failed to Delete:"; reject(ex); });
    }
  });
}


/** Delete single entry of a type by id by HTTP DELETE.
 * Route pattern must have params: ":type", ":idval"
 *
 *
 *
 *     var crudrest = require('crudrest');
 *     // ...
 *     router.delete("/:type/:idval", crudrest.cruddelete);
 *
 * ## Automatic soft-delete
 *
 * Automatic soft-delete is triggered when following conditions are met:
 *
 * - Crud module option "softdelattr" is set to true (string) value
 * - It is found to be a valid declated attribute of current Sequelize entity-type (:type)
 * - Above contions imply that entity types that do not have the "universal" soft-delete attribute in
 *   their sequelize model are hard deleted (no auto-soft-delete has chance to kick in because of
 *   missing attribute)
 *
 * ## Forcing hard-deletes (in softdelete mode)
 * This is intentionally a hard-to-use configurable feature. Delete handler supports a (direct) property "_forceharddel" (named to not step on any existing properties) that must be set by node.js http / express middleware (this cannot be leaked into request accidentally from req.query or req.params). The middleware should do all the security checks for allowing hard delete and set req._forceharddel (possibly from incoming params or some other setting).
 */
function cruddelete (req, res) {
  
  var jr = {'ok': 1};
  var otype = req.params['type'];
  var idval = req.params['idval']; // Keep for error handling
  console.log("DELETE: entry(id) " + idval + " of type: " + otype);
  // console.log(req.body); // Shows "{}" on empty body.
  var smodel = getpersister(otype, res);
  if (!smodel) {return;}
  //////////////////////////
  //var pka = smodel.primaryKeyAttribute; // primaryKeyField: (scalar), primaryKeyAttributes: (Array)
  //var whereid = {};
  //whereid[pka] = idval;
  //var idfilter = {where: whereid, limit: 1};
  
  var idfilter = getidfilter(smodel, req);
  var byfilter = null; // Delete by attribute ...
  // 
  _cruddelete(smodel, idfilter, req._forceharddel).then( function (num) {

    jr.ok = num;
    if (!num) { jr.msg = "No such entry: " + idval; }
    else      { jr.idval = idval; }
    console.log("Deleted (count): " + num);
    // if (!num) {return;} // Earlier exception
    var d = respcb ? respcb(jr, "delete") : jr; // What to do on delete ?? Common pattern ok ?
    res.send(d);
  },
  function(err) { sendcruderror(err.basemsg, err, res); });
}

// 2 cases for GET
// Recommended route pattern: /^\/(\w+)\/(\d+)/

/** Fetch/Retrieve single entry by type and id using HTTP GET method.
 * Route pattern must have params: ":type", ":idval"
 * 
 *     // Server side - setup route
 *     var crudrest = require('crudrest');
 *     // ...
 *     router.get("/:type/:idval", crudrest.crudgetsingle);
 *
 * NOTE: Any filter components (sent as GET URL k-v params) are ignored by this method (only :idval param
 * is used for the entry lookup).
 */
function crudgetsingle (req, res) {
  var jr = {'ok': 1};
  var otype = req.params['type'];
  var smodel = getpersister(otype, res);
  if (!smodel) {return;}
  var idfilter = getidfilter(smodel, req); // From: req.params.idval
  // if (addfindinclusions(req, resp, idfilter) < 0) {return; }
  console.log("GET single by: " + JSON.stringify(idfilter));
  smodel.find(idfilter)
  .then(function (ent) {
    if (!ent) { sendcruderror("No Entry Found!",new Error(" id:" + req.params.idval), res);return; } // Earlier exception or ent == null
    console.log("Got single(by:"+req.params.idval+"): " + JSON.stringify(ent) );
    if (cropts.otypetrans[otype]) { cropts.otypetrans[otype](ent.get(), req); }
    var rd = respcb ? respcb(ent, "retrieve") : ent; // FIXME: ent may be null (should not be by now, see above check)
    res.send(rd);
  })
  .catch(function (ex) {sendcruderror("No Entry Found",ex,res);});
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
 *     $http.get("/products", {params: {vendor: "Cray"}}).then(...)
 *
 * Sorting the results - use reserved parameter "_sort"
 *
 *     // Single sort criteria
 *     $http.get("/products", {params: {vendor: "Cray", _sort: "model,ASC"}}).then(...)
 *     // Multiple sort properties (sort direction specifier ASC/DESC is optional)
 *     $http.get("/products", {params: {vendor: "Cray", _sort: ["model,ASC", "mfgdate"]}}).then(...)
 *     // Same as raw URL
 *     // /products?vendor=Cray&_sort=model,ASC&_sort=mfgdate
 *
 * For more sort examples, see probe_sort() documentation.
 * Get multiple by entry ID:s
 *
 *     // Equivalent to raw GET /products?id=4&id=7&id=11&id=18&id=45
 *     $http.get("/products", {params: {id: [4, 7, 11, 18, 45]}}).then(...)
 *
 * ... Although most of the time you are likely to get the associated entries by their parent id:
 *
 *     $http.get("/products", {params: { parent: 34778} }).then(...)
 *
 * TODO: explain sorting feature in README.md
 * TODO: Add support for _limit (Sequelize: ...)
 */
function crudgetmulti (req, res)  {
  // var otype = req.params[0]; // OLD !
  var otype = req.params['type'];
  var smodel = getpersister(otype, res);
  // Note: getpersister already sends error, do not send twice: 
  // sendcruderror("No Model Found for "+ otype, null, res);
  if (!smodel) {return;}
  var filter = {}; // Add where: {} ?
  // If there are any k-v parameters, add them to filter here.
  // TODO: Check type of Object
  if (req.query && Object.keys(req.query).length) {
    // Call probe_sort() to figure out "order" for Sequelize (param key '_sort')
    // Having no '_sort' param changes nothing.
    var order = probe_sort(req); // No ret value, modifies filter and req.query // OLD: , filter
    // Only Attributes in req.query._attrs
    // http://docs.sequelizejs.com/en/latest/api/model/
    var attrs = probe_attr(req);
    
    var keys = Object.keys(req.query);
    console.log("Have query params (for multi): " + JSON.stringify(req.query) ); // + " keycnt:" + kcnt
    // Note: Treat Array val specially (or let the normal thing happen ?)
    keys.forEach(function (k) {filter[k] = req.query[k];});
    // Wrap in Sequelize compatible (format is more complex than meets the eye)
    filter = kvfilter(filter);
    // ONLY NOW add order,attributes
    if (order) { filter.order = order; }
    //if (attrs) { filter.attributes = {include: attrs}; } // Does not work in OLD ?!
    if (attrs) { filter.attributes = attrs; }
    console.log("Assembled filter (Seq): " + JSON.stringify(filter));
    
    
  }
  else {console.log("Do NOT Have query filter (no keys found)");}
  // Check the need for softdel filter (TODO: selectsoftdel or softdelsel)
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
  .then(function (arr) {
    // if (!arr) {jr.msg = "No result set array !"; res.send(jr);}
    console.log("Got multiple: " + arr.length + " ents.");
    if (cropts.otypetrans[otype]) {
      // ent.get() is equivalent of ent.dataValues
      arr.forEach(function (ent) { cropts.otypetrans[otype](ent.get(), req); }  );
    }
    var rd = respcb ? respcb(arr, "retrieve") : arr;
    res.send(rd);
  })
  // .catch(function (ex) {jr.ok = 0;jr.msg = ex.message;res.send(jr);})
  .catch(function (ex) {sendcruderror("No Entries Found.",ex,res);});
  
  // TODO: Parse _join (list of tabs). Assume natural JOIN (for ease ...)
  // http://stackoverflow.com/questions/20460270/how-to-make-join-querys-using-sequelize-in-nodejs
  // var addattrs = ","+joined.map(function (jt) {return jt+".*";}).join(", ");
  // var i = 1;joined.unshift(otype);
  // var joins = joined.map(function (jt) { return " NATURAL JOIN "+jt; });
  // seq.query("SELECT "+otype+".* "+addattrs+" FROM "+otype+"");
}
// Generate a very simple SQL (AND-based) filter out of a filter-object
// TODO: Check attrs validity in regards to model (pass: model, fobj).
function filter2sql(fobj) {
  // Check Object param validity
  // if (!) {return "";}
  var wcomp = [];
  Object.keys(fobj).forEach(function (k) { wcomp.push(fobj[k]); });
  return wcomp.join(" AND ");
}

/** Execute multi-faceted CUD (Create AND/OR Update AND/OR Delete) Operation
 * in HTTP PUT request.
 * Items of same type (by route param ":type") are passed in a single JSON Array of Objects (AoO).
 * Apply following logic to decide what to do (In terms od C,U,D) with each item:
 * - Have a predifined (configured) flag-like property (e.g. "deleted") in Object AND have (true valued) primary key property => DELETE
 * - Entry has primary key property => UPDATE
 * - No primary key property => INSERT
 *
 * The property to label entities to be delete is configurable via CRUD options (see opts() method, defaults to "deleted").
 * Notes:
 * - This crud method does not manage relationships. The foreign key ID:s (e.g. to parent entry) must be right in JSON (PUT) data sent
 * - Entries must be compliant with schema attributes to be processed successfully. There is no custom validation (outside standard Sequelize validation)
 * - There is no support for softdelete (currently)
 * Recommended CRUD PUT URL: /:type/
 * 
 * Data example (commented with JSON-violating JS comments for clarity):
 *
 *      [
 *        {"name":"Luke Jefferson"}, // C - Create (has no ID, no deleted flag)
 *        {"id": 3455, "title":"Vice President"}, // U - Update (has ID)
 *        {"id": 45, "title": "N/A", "deleted": 1} // D - Delete (has ID AND deleted flag)
 *      ]
 * @todo Possibly (optionally ?) return entries inserted and updated.
 */ 
function mixedbatchmod(req, res) {
  var delprop = cropts["mixeddelprop"] || "deleted"; // TODO: default to _deleted
  var ents = req.body; // Entries in AoO
  var otype = req.params['type'];
  if (!Array.isArray(ents)) {sendcruderror("Not an Array of "+ otype + " ents for mixed processing", null, res);return;}
  var smodel = getpersister(otype, res);
  if (!smodel) {return;}
  var pka = smodel.primaryKeyAttribute;
  if (!pka) {sendcruderror("No pkey for "+ otype + " (for mixed processing)", null, res);return;}
  var delids = [];
  var arr_up = [];
  var arr_ins = [];
  var jr = {"ok": 1};
  var debug = 3;
  // Pre-process into sets of del/up/ins.
  ents.forEach(function (e) {  // e = Entry
    // Check that we have object
    //if () {return;} // console.log("Non-Object ...");
    if (e[delprop] && e[pka]) {delids.push(e[pka]);} // Deletes
    else if (e[pka]) {arr_up.push(e);} // Updates
    else {arr_ins.push(e);} // Inserts
  });
  console.log("Mixed: Deletes(flagged):" + delids.length + ", Updates(have-id): " + arr_up.length + ", Inserts(no-id):" + arr_ins.length);
  var delfilter = {where: {}};
  var upfilter = {where: {}}; // upfilter.where[pka] = -1;
  var arr_prom = [];
  // TODO: Allow dry-run (for debugging) ?
  
  // Deletes: Bulk by where-filter with id:s
  // TODO: DONE reusing _cruddelete function
  // - Reuse some of the crudrest delete functionality to avoid duplicating (relatively) complex logic for
  //   soft-delets AND foreced hard delete ? What is the right amount of reuse ?
  // - Allow soft delete (!) - the intial implementation ONLY did hard delete (despite "soft*" settings in cropts - see top of the file) - see above
  // - Allow req._forceharddel (also see above)

  if (delids.length) {
    delfilter.where[pka] = delids; // Set WHERE IN filter for delete
    // arr_prom.push(smodel.destroy(delfilter));
    arr_prom.push(_cruddelete(smodel, delfilter, req._forceharddel));
  }
  // Insert/Create: Do in Bulk
  if (arr_ins.length) {arr_prom.push(smodel.bulkCreate(arr_ins));}
  // Updates: need to be done individually. There is no bulk-update.
  if (arr_up.length) {
    arr_up.forEach( function (e) {
      var upf = JSON.parse(JSON.stringify(upfilter));
      upf.where[pka] = e[pka];
      arr_prom.push(smodel.update(e, upf));
    } );
  }
  var i = 0;
  // async.map() callback to process single promise (and probe its success)
  function processcrudpromise (pr, cb) {
    // Way to probe what kind of promise we're dealing with ?
    if (debug > 2) { console.log("Processing Promise " + i); i++; }
    pr.then(function (somedata) { cb(null, "ok"); }).catch(function (ex) { cb(ex, null); });
  }
  // TODO: Treat promises like "data params" and use async.map() to process them
  async.map(arr_prom, processcrudpromise, function(err, results) {
    // Note: This sometimes returned (e.g.) ",," or "ok,ok,,ok" TODO: Follow what these are from
    if (debug > 2) { console.log("Completion Results:"+results.join(',')); } // debug
    if (err) {sendcruderror("Failed mixed C,U,D processing (via promises)", null, res);return;}
    jr.stats = {up: arr_up.length, ins: arr_ins.length, del: delids.length};
    
    var rd = respcb ? respcb(jr, "mixedop") : jr;
    // TODO: Return modification statistics
    res.send(rd);
  });
  
  
}

/** Add Sort/Order components from request parameters to Sequelize filter (if any).
 * Has a side effect of removing all Sort/Order query parameters from request (req) to not
 * treat them as WHERE filter components later.
 * Sort/Order components are picked up from query parameter "_sort" with following options
 * - value should be attr name with optional direction parameter separated by comma (e.g. ...&_sort=age,DESC&...)
 * - If direction parameter is missing, 'ASC' is used
 * - One or more Sort/Order components can be passed (Add each as separate component)
 * 
 * Example query URL (One flter component, Two sort components, One of the two gives explicit sort direction)
 *
 *     http://crudserver/crud/projects?_sort=projname&_sort=starttime,DESC&customerid=698
 *
 * @param {object} req - Request Object (to access the URL params embedded filter passed in query key "_sort")
 * @return Sequelize "order" parameter to where filter definition passed here
 */
function probe_sort(req) { // OLD: , filter
  var qp = req.query;
  
  if (!qp) {return;} // No query !
  if (!qp['_sort']) {return;} // No sort parameter
  
  var defdir = 'ASC';
  var validdir = {ASC: true, DESC: true}; // Valid sort directions (as upper case)
  // Coerce to array
  if (!Array.isArray(qp['_sort'])) {qp['_sort'] = [qp['_sort']];}
  var sarr = qp['_sort'];
  // Custom processing for "_sort"
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
      sortpair[1] = sortpair[1].toUpperCase();
      if (!validdir[ sortpair[1] ]) {console.log("Invalid direction param "+sortpair[1]+" !");return null;}
    }
    return sortpair;
  });
  // Add Sequelize "order" param to filter to use in later query.
  // OLD: filter.order = order.filter(function (it) {return it;}); // Strip null:s
  // NEW: sort definition is returned as a structure to be embedded by caller (!)
  order = order.filter( function (it) {return it;} ); // OLD: var order (dup decl)
  // Get rid of '_sort'
  delete(qp['_sort']);
  return order;
}

// TODO: Consider sharing with probe_sort
function probe_attr(req) {
  console.log("Probe attrs !"+JSON.stringify(req.query));
  var qp = req.query;
  if (!qp) {return;} // No query !
  if (!qp['_attrs']) {return;} // No attr parameter
  // Coerce to array
  if (!Array.isArray(qp['_attrs'])) {qp['_attrs'] = [qp['_attrs']];}
  // TODO: Finish
  else if (qp['_attrs'][0].indexOf(",") > 0) { qp['_attrs'][0].split(","); } // TODO
  var arr = qp['_attrs'];
  // Validate to be all scalars (valid attr names)
  var re = /^[a-zA-Z]\w+$/;
  console.log("Apply regexp ("+arr+")");
  // Could apply many policies here: silent ignore (all) _attrs, allow valid
  // throw exception
  var attrnotok = function (it) { return ( ((typeof it === 'string') && (it.match(re))) ? 0 : 1 ); };
  var bad = arr.filter(attrnotok);
  if (bad && bad.length) {
    console.log("Attribute param(s) not valid:"+ bad);
    delete(qp['_attrs']);
    return;
  }
  delete(qp['_attrs']);
  return arr;
}

/** Setup a good default router with default router URL:s.
 * Mainly used for the example app bundled in to module distribution.
 * For more granular routing setup do a similar reouter calls directly in your own app.
 * You can still have all routes setup here under a sub-path (coordinated by express routing, see
 * example below).
 *
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
   
   // NEW
   router.put  ("/:type", mixedbatchmod);
   
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
 * 
 * @param {object} pc - Indexed ORM map (or Array for auto-indexing by crudrest module)
 * @param {object} sequelize - Optional Sequelize instance for Array usecase described for first (pc) parameter
 * @todo Create example
 */
function setperscache (pc, sequelize) {
  // TODO: Allow array form to be passed. Problem: we depend on sequelize, must be passed for case "Array"
  if (Array.isArray(pc) && sequelize) {
     pc.forEach(function (item) {
       var tn = item[1].tableName;
       perscache[tn] = sequelize.define(tn, item[0], item[1]);
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
module.exports.mixedbatchmod =  mixedbatchmod;
// More helpers
module.exports.opt_or_ac = opt_or_ac;
module.exports.setrespcb = setrespcb;
module.exports.seterrhdlr = seterrhdlr;
module.exports.settaidx = settaidx;
module.exports.opts = opts;
module.exports.addotypetrans = addotypetrans;

