/** 
 * @fileOverview 同期／非同期パイプライン
 */
"use strict";
var events = require('events');
var Class = require(__dirname+'/class');

/**
 *  node.js 0.8 or 0.10 setting
 */
var _setImmediate = (function(){
    return (global.setImmediate ? setImmediate :
            (process.nextTick ?   process.nextTick :
                                  function(cb){ setTimeout(cb, 0); }
    ));
})();

/**
 *  スケジューラ作成
 */
var createScheduler = function(interval){
    if(interval > 0){
        return function(cb){
            setTimeout(cb, interval);
        };
    }
    return _setImmediate;
};

/**
 *  タスク補助
 */
var AsyncUtil = Class(events.EventEmitter,{
    initialize : function(){
        events.EventEmitter.call(this);
        this.count = 0;
        this.next_flag = true;
        this.timer = null;
    },
    finalize : function(){
        this.removeAllListeners();
        this._cancelTimeout();
    },
    _inc : function(){
        ++this.count;
        this.emit('inc', this.count);
    },
    _dec : function(){
        --this.count;
        this.emit('dec', this.count);
        if(this.count === 0){
            this._cancelTimeout();
            this.emit('complete');
        }
    },
    // タイムアウトのキャンセル
    _cancelTimeout : function(){
        if(!this.timer) return;
        var self = this;
        clearTimeout(this.timer);
        this.timer = null;
    },
    // タイムアウトを設定する
    setTimeout : function(ms){
        if(this.timer) return;
        var self = this;
        this.timer = setTimeout(function(){
            if(self.count > 0){
                self.count = 0;
                self.emit('error', new Error('Async Timeout'));
            }
        },ms);
    },
    // 非同期処理開始
    async : function(fnTask){
        this._inc();
        fnTask();
        return this;
    },
    // 非同期処理完了
    done : function(fnCallback){
        if(this.count === 0) throw new Error("don't call count zero");
        var self = this;
        return function(p1,p2,p3,p4,p5){
            if(self.count === 0){
                return;// タイムアウトやおかしなタイミングでの非同期復帰
            }
            try{
                fnCallback(p1,p2,p3,p4,p5);
                self._dec();
            }catch(e){
                self.emit('error', e);
            }
        };
    },
    stop : function(){
        this.next_flag = false;
    },
    checkNext : function(){
        return this.next_flag;
    },
});

var TASK_TIMELIMIT = 0.01; // タスク処理持ち時間

/**
 *  パイプライン直列化クラス
 */
var Pipeline = module.exports = Class({
    /**
     *  初期化
     */
    initialize :function(max){
        this.q = [];
        this.runflag = false;
    },
    /**
     *  後始末
     */
    finalize : function(){
        this.q.length = 0;
    },
    /**
     *  パイプライン処理を停止する
     */
    stop : function(){
        this.runflag = false;
    },
    /**
     *  パイプライン処理を開始する
     */
    run : function(interval){
        if(interval === undefined){
            interval = 10;
        }
        this.runflag = true;
        var max = this.max;
        var self = this;
        var fnScheduler = createScheduler(interval);
        fnScheduler(function T(){
            if(self.runflag){
                var len = self.q.length;
                var deadline = process.uptime() + TASK_TIMELIMIT;
                for(var i = 0; i<len; ++i){
                    if(process.uptime() < deadline){
                        var f = self.q[i];
                        if(f){
                            f();
                        }
                    }else{
                        break;
                    }
                }
                // 実行した分だけ削除
                if(i > 0){
                    self.q.splice(0, i);
                }
                fnScheduler(T);
            }
        });
    },
    /**
     *  タスクを作成する
     */
    createTask : function(funcs){
        if(!(funcs instanceof Array)){
            throw new Error("funcs must be Array");
        }
        var i = 0;
        var len = funcs.length;
        var q = this.q;
        var task = {
            done : function(){},
            error : function(){},
            run : function(){},
        };
        var errnum = 0;
        var onError = function(e,arg){
            if(errnum === 0){
                ++errnum;
                task.error(e, arg);
            }
        };
        // 内部のリストに一連の流れを登録する関数を返す
        task.run = function(arg){
            //if(i >= len){
            if(i >= funcs.length){
                task.done(arg);
            }else{
                q.push(function(){
                    //if(i < len){
                    if(i < funcs.length){
                        try{
                            var util = new AsyncUtil();
                            util.once('complete', function(){
                                if(util.checkNext()){
                                    task.run(arg);
                                }else{
                                    onError(new Error('task exit'), arg);
                                }
                                util.finalize();
                            });
                            util.once('error', function(e){
                                onError(e, arg);
                            });
                            util.async(function(){
                                funcs[i++](util, arg);
                                util.done(function(){})();
                            });
                        }catch(e){
                            onError(e, arg);
                        }
                    }
                });
            }
        };
        return task;
    },
});

/*
// --------------------------------------------
var fs = require('fs');
var p = new Pipeline();
p.run(0);
var f = function(){return [function(u,p){
    u 
    .async(function(){
        fs.readFile('./a.txt', 'utf-8', u.done(function(e,v){
            if(e)throw e;
            p.f.push(v);
        }));
    })
    .async(function(){
        fs.readFile('./a.txt', 'utf-8', u.done(function(e,v){
            if(e)throw e;
            p.f.push(v);
        }));
    })
    .async(function(){
        fs.readFile('./a.txt', 'utf-8', u.done(function(e,v){
            if(e)throw e;
            p.f.push(v);
        }));
    })
    .async(function(){
        setTimeout(u.done(function(){
        }),1000);
    })
    ;
//    u.setTimeout(1);
},function(u,p){
    u
    .async(function(){
        fs.readFile('./a.txt', 'utf-8', u.done(function(e,v){
            if(e)throw e;
            p.f.push(v);
        }));
    })
    .async(function(){
        setTimeout(u.done(function(){
        }),1000);
    })
    ;
},function(u,p){
    u
    .async(function(){
        fs.readFile('./a.txt', 'utf-8', u.done(function(e,v){
            if(e)throw e;
            p.f.push(v);
        }));
    })
    .async(function(){
        setTimeout(u.done(function(){
        }),1000);
    })
    ;
}
]};

var dd = function(){
    var task = p.createTask(f());
    task.done = function(p){
        console.log(p);
    };
    task.error = function(e){
        console.log(e.stack);
    };
    task.run({f:[]});
};
//process.nextTick(function FF(){
    dd();
//    process.nextTick(FF);
//});

var eventloop = function(){
    var WARN = 0.02;
    var next = process.uptime() + WARN;
    process.nextTick(function T(){
        var now = process.uptime();
        if(next < now){
            console.log(now - next);
        }
        next = now + WARN;
        process.nextTick(T);
    });
};
eventloop();
*/
