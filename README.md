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

## Customizing REST Exception

The REST eror / exception response is customizable by setting the exception callback via:

    // Set error handler
    crudrest.errhdlr(function (otype, res) {
      res.json({"status": "waybad", "code": -1, "message": "No such object:" + otype});
      return;
    });

## Notes on Dependencies

With the Express the crudrest also depends on 'body-parser' (and setting up
the middleware bodyParser.json() to parse JSON HTTP request bodies for
POST/PUT methods).

## Limitations


### PUT / POST

When sending new data (POST => INSERT) or updating data (PUT => UPDATE), nested structures (e.g. arrays of chile objects)
are not officially supported for now (actually Sequelize has ways to cope with this, so stay tuned).

Also the pre-hook mechanism is not supported yet (in other words JSON data payload cannot be currently preprocessed).

### GET (single entry or multiple)

SQL JOINS are not supported.

## Generating JSDoc3 Docs

In the project top directory run jsdoc (add -R README.md):

    jsdoc crudrest.server.js crudrest.js  -c conf.json

More on JSDoc: http://usejsdoc.org/

## References:

- http://expressjs.com/guide/routing.html
- http://expressjs.com/4x/api.html#router
