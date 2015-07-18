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

## Example sequelize config

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
    module.exports = seqconfig;

This can be then mapped into an index by entity types (see "tableName" below) that crudrest can use as-is:

     var seqcfg = require("./myapp.sequelize.conf.js");
     seqcfg.forEach(function (item) {
       var tn = item[1].tableName;
       perscache[tn] = sequelize.define(tn, item[0], item[1]);
     });
     // Let crudrest know about your config
     crudrest.setperscache(perscache);

## Associating Server URL routes to crudrest handlers

Example above (on top) showed a way to associate URL:s in a default way

    var router = express.Router({caseSensitive: 1});
    crudrest.defaultrouter(router);
    app.use('/ents', crudrest);

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

## Customizing REST Responses

The rest response format is (even) much less "standardized" or "de-facto" than request.
Crudrest allows one to customize the response for success and error cases with an intercepting callbacks
(applicable to all CRUD methods).
The REST error / exception response is customizable by setting the exception callback via:

    // Set error / exception handler
    crudrest.seterrhdlr(function (typename, errmsg) {
      return {"status": "err", "msg": errmsg + ". Type: " + typename};
    });
    // Set success response handler
    crudrest.setrespcb(function (origdata, op) {
      return {"status": "ok", "data": origdata};
    });

## Intercepting CRUD requests

Instead of assigning handlers directly URL routes, you can allow yourself to intercept
the request:

    router.get("/crud/:type/:idval", function (req, res) {
       // Do something here
       jerr = {"ok": 0, "msg":"Bad activity intercepted"};
       if (!validtype(req.params['type'])) {jerr.msg += ". Weird entity type requested !";req.json(jerr);return;}
       if (!valididformat(req.params['idval'])) {jerr.msg += ". Faulty ID format";req.json(jerr);return;}
       crudrest.crudgetsingle(req, res); // .. Only then call
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

Also the pre-hook mechanism is not supported yet (in other words JSON data payload cannot be currently preprocessed).

### GET (single entry or multiple)

SQL JOINS are not supported. Handlers will only feed back simple / raw entities with foreign keys
"untranslated".

### DELETE

Soft-delete is not supported yet. Multiple entry / batch delete does not exist (and is currently not planned).

## Generating JSDoc3 Docs

In the project top directory run jsdoc:

    jsdoc crudrest.server.js crudrest.js -R README.md -c conf.json

More on JSDoc: http://usejsdoc.org/

## References:

- http://expressjs.com/guide/routing.html
- http://expressjs.com/4x/api.html#router
