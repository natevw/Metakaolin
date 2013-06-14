var memsync;
if (typeof memcouch === 'object') memsync = memcouch;
else memsync = module.exports;

memsync.slaveToPouch = function (memdb, pouch) {
    /*
        We'd need a lot more logic in memcouch.db to make this *really* work:
        control over revs history and conflict tracking with get/put options.
        
        Relevant links:
        - https://github.com/couchbaselabs/TouchDB-iOS/wiki/Replication-Algorithm
        - http://wiki.apache.org/couchdb/Replication_and_conflicts
        
        What this does is blithely assume a standalone master-slave type relationship.
    */
    
    var status = {changesPending:0},
        ignoreOwnChange = false;
    pouch.changes({continuous:true, include_docs:true, onChange: function (change) {
        var memdoc = memdb.get(change.id);
        if (!memdoc || memdoc._rev !== change.doc._rev) {
            ignoreOwnChange = true;
            memdb.put(change.doc);
            ignoreOwnChange = false;
        }
    }});
    memdb.watch(function (change) {
        if (ignoreOwnChange) return;
        status.changesPending += 1;
        var _seq = change.doc._seq;
        delete change.doc._seq;
        pouch.put(change.doc, function (e, d) {
            status.changesPending -= 1;
            /* NOTE: we simply don't handle errors here, choosing instead to close our eyes and
               pretend that errors are _always_ due to remote changes we will be getting soon! */
            if (!e) change.doc._rev = d.rev;
            else if (typeof console === 'object' && console.warn) console.warn(e);
        });
        change.doc._seq = _seq;
    }, 0);
    return status;
};
