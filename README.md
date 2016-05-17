# cruderst

Sequelize based REST CRUD persistence.

## Example of usage:

    var crudrest = require('crudrest');
    var express  = require('express');
    ...
    crudrest.setperscache(perscache);
    crudrest.taidx(taidx);
    var router = express.Router({caseSensitive: 1});
    crudrest.defaultrouter(router);
    app.use('/ents', crudrest);

 For a more comprehensive example see the example test app crudrest.server.js in the module distribution.

## Example Sequelize Config

crudrest utilizes Sequelize and the associated Sequelize schema (table and attribute) definitions to drive
(i.e. take care of all the details of) persistence. Every HTTP based persistence operation gets thus "filtered" by the Sequelize config layer and
any faulty persistence ops with invalid tables or attributes get intercepted and turned into REST exceptions.
Sequelize configs for the whole app must be stored in a config file with following (wrapping) structure:

    // myapp.sequelize.conf.js
    var seqconfig = [
      // Sequelize Attribute, Table config for the first table ...
      [
        {
          "firstname": {"field" : "firstname","type" : Sequelize.STRING,},
          "lastname": {"field" : "lastname","type" : Sequelize.STRING,},
          "empid":    {"field" : "empid","type" : Sequelize.INTEGER,},
          "siteloc":  {"siteloc" : "empid","type" : Sequelize.STRING,},
          ...
        },
        {"tableName":"employee", "timestamps":0}
      ],
      // Attribute, Table config for the second table ...
      [
        {...},
        {...},
      },
  
    ];
    module.exports.sargs = seqconfig;

This can be then mapped into an index by entity types (see "tableName" below) that crudrest can use as-is:

     var seqcfg = require("./myapp.sequelize.conf.js");
     var perscache = {};
     seqcfg.forEach(function (item) {
       var tn = item[1].tableName;
       perscache[tn] = sequelize.define(tn, item[0], item[1]);
     });
     // Let crudrest know about your ORM Model config
     crudrest.setperscache(perscache);

## Associating Server URL routes to crudrest handlers

Example above (on top) showed a way to associate URL:s in a default way

    var router = express.Router({caseSensitive: 1});
    crudrest.defaultrouter(router);
    app.use('/ents', router);

To gain more control and actually "see" the associations you can do router assignments individually
(loading and initialization of crudrest and instantiation of Express router are left out):

    // All crudrest handlers are "mounted" under "/crud/"
    router.post  ("/crud/:type", crudrest.crudpost); // POST 1 arg: type
    router.put   ("/crud/:type/:idval", crudrest.crudput); // PUT 2 args: type,id
    router.delete("/crud/:type/:idval", crudrest.cruddelete); // DELETE 2 args: type,id
    router.get   ("/crud/:type/:idval", crudrest.crudgetsingle); // GET (single) 2 args: type,id
    router.get   ("/crud/:type", crudrest.crudgetmulti); // GET(multiple) 1 arg: type

If you are bit on the hard-core side you'll probably want to do something like above
(its still relatively terse).

## CRUD Handler Documentation

See embedded JSDoc documentation for details (See: "Generating JSDoc3 Docs" at the end of this doc).

## Customizing REST Responses

The rest response format is (even) much less "standardized" or "de-facto" than request.
By default crudrest goes with the simpliest route of having the
response/ result data immediately on the top level of JSON. For single
entry response the top level of JSON would be (result entry) Object
and for multientry response an Array of Objects (AoO). This is often
"too simple" as client might like to know if response was successful
and possibly a message for the reason of failure.

Crudrest allows one to customize the response for success and error cases with an intercepting callbacks
(applicable to all CRUD methods).
The REST error / exception response and success response are customizable by setting the callbacks via methods seterrhdlr() and setrespcb() respectively:

    // Set error / exception handler
    crudrest.seterrhdlr(function (typename, errmsg) {
      return {"status": "err", "msg": errmsg + ". Type: " + typename};
    });
    // Set success response handler
    crudrest.setrespcb(function (origdata, op) {
      return {"status": "ok", "data": origdata};
    });

## Intercepting CRUD requests

Instead of assigning handlers directly URL routes, you can allow your app to intercept
the request:

    router.get("/crud/:type/:idval", function (req, res) {
       // Do something here
       jerr = {"ok": 0, "msg":"Bad activity intercepted"};
       if (!validtype(req.params['type'])) {jerr.msg += ". Weird entity type requested !";req.json(jerr);return;}
       if (!valididformat(req.params['idval'])) {jerr.msg += ". Faulty ID format";req.json(jerr);return;}
       crudrest.crudgetsingle(req, res); // .. Only then call "raw" handler
    });

Now handler crudrest.crudgetsingle is indirectly assigned to URL route.

## Notes on Dependencies

With the Express the crudrest also depends on 'body-parser' (and setting up
the middleware bodyParser.json() to parse JSON HTTP request bodies for
POST/PUT methods).

## Limitations


### PUT / POST

When sending new data (POST => INSERT) or updating data (PUT => UPDATE), nested structures
(e.g. arrays of child objects) are not officially supported for now (actually Sequelize has
ways to cope with this, so stay tuned).

Also the pre-hook mechanism is not supported yet (in other words JSON data payload cannot be currently preprocessed). Sequelize however has some built-in mechanisms for this (and these are likely to work with
no crudrest support).

### GET (single entry or multiple)

SQL JOINS are not supported. Handlers will only feed back simple / raw entities with foreign keys
"untranslated".

### DELETE

Soft-delete is not supported yet. Multiple entry / batch delete does not exist (and is currently not planned).

## Generating JSDoc3 Docs

In the project top directory run jsdoc:

    jsdoc crudrest.server.js crudrest.js -R README.md -c jsdoc.conf.json

More on JSDoc: http://usejsdoc.org/

## References:

- http://expressjs.com/guide/routing.html
- http://expressjs.com/4x/api.html#router
- http://docs.sequelizejs.com/en/latest/
- http://www.getpostman.com/
