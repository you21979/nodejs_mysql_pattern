"use strict";
var Pipeline = require(__dirname+'/pipeline');
var Class = require(__dirname+'/class');
var mysql = require('mysql');

var createQuery = function( sql, param, callback ){
    return function(u,p){
        u.async(function(){
            p.conn.query(sql, param ,u.done(function(err, val){
                if(err){
                    console.log(err);
                    throw err
                }
                if(callback){
                    callback(val);
                }
            }));
        });
    };
};

var DBFlow = Class({
    initialize : function(){
        var conf = {
            host : "localhost",
            port : 3306,
            user : "root",
            password : "",
            database : "test",
            debug : false,
            connectionLimit : 100,
        };
        this.pool = mysql.createPool(conf);
    },
    finalize : function(){
    },
    connectDB : function(){
        var self = this;
        return function(u, p){
            u.async(function(){
                self.pool.getConnection(u.done(function(err, conn){
                    if(err){
                        console.log(err);
                        throw err
                    }
                    p.conn = conn;
                }));
            });
        };
    },
    closeDB : function(){
        return function(u, p){
            if(p.conn){
                p.conn.end();
            }
        };
    },
    beginTX : function(){
        return createQuery("begin",[]);
    },
    commitTX : function(){
        return createQuery("commit",[]);
    },
});
var flow = new DBFlow();

var pl = new Pipeline();
pl.run();


var tasklist = [];
tasklist.push(flow.connectDB());
tasklist.push(flow.beginTX());

tasklist.push(createQuery("select 1",[],function(p){
    console.log(p);
    tasklist.push(createQuery("select 2",[],function(p){
        console.log(p);
    }));
    tasklist.push(createQuery("select x",[],function(p){
        console.log(p);
    }));
    tasklist.push(createQuery("select x",[],function(p){
        console.log(p);
    }));
    aaa();// throw
    tasklist.push(flow.commitTX());
    tasklist.push(flow.closeDB());
}));


var f = pl.createTask(tasklist);
f.done = function(p){
    console.log("done");
};
f.error = function(e,p){
    if(p.conn){
        p.conn.query("rollback");
        p.conn.end();
    }
    console.log("error");
    console.log(e)
};
f.run({});



