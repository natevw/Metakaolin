var memcouch = {};

memcouch.cmp = function (a,b) {
    // TOOD: full JSON comparisons similar to CouchDB — http://wiki.apache.org/couchdb/View_collation?action=show&redirect=ViewCollation#Collation_Specification
    return (a < b) ? -1 : (a > b) ? 1 : 0;
};

memcouch.id = function () { return Math.random().toFixed(20).slice(2); };

memcouch.db = function () {
    var db = {},
        docs = [],
        byId = Object.create(null);
    
    db.update_seq = 0;
    
    db.put = function (doc) {
        doc._id || (doc._id = memcouch.id());
        doc._seq = ++db.update_seq;         // NOTE: this is different than _rev (we leave that field alone)
        
        var id = doc._id;
        if (id in byId) docs[byId[id]] = doc;
        else byId[id] = docs.push(doc) - 1;
        if (doc._deleted) delete byId[id];
        notify(doc);
    };
    
    db.get = function (id) {
        return docs[byId[id]];
    };
    
    db.del = function (id) {
        var doc = db.get(id);
        Object.keys(doc).forEach(function (k) {
            if (k[0] !== '_') delete doc[k];
        });
        doc._deleted = true;
        db.put(doc);
    };
    
    db.all = function () {
        return db.query(function (doc) {
            this.emit(doc._id, doc);
        });
    };
    
    db.query = function (map, cmp, opts) {
        map || (map = function (d) { return d._id; });
        if (cmp === true) cmp = memcouch.cmp;
        opts || (opts = {});
        
        var results = [],
            _doc = null;
        db.emit = function (k,v) {
            // TODO: provide built-in key/start/end filtering here to facilitate map fn re-use (and cmp coordination)
            results.push({id:_doc._id, doc:_doc, key:k||null, value:v||null});
        };
        docs.forEach(function (doc) {
            if (doc._deleted && !opts.include_deleted) return;
            map.call(db, _doc = doc);
        });
        delete db.emit;
        
        return (cmp) ? results.sort(function (a,b) {
            return cmp(a.key, b.key);
        }) : results;
    };
    
    db.since = function (seq) {
        return db.query(function (doc) {
            if (doc._seq > seq) this.emit(doc._seq);
        }, true, {include_deleted:true}).map(function (row) {
            var result = {seq:row.key, doc:row.doc, id:row.id};
            if (row.doc._deleted) result.deleted = true;            // TODO: .query() won't give us _deleted docs!
            return result;
        });
    };
    
    var watchers = [];
    db.watch = function (cb, seq) {
        watchers.push(cb);
        if (arguments.length > 1) db.since(seq).forEach(cb);
    };
    db.clear = function (cb) { var idx = watchers.indexOf(cb); if (~idx) watchers.splice(idx, 1); };
    function notify(doc) {
        watchers.forEach(function (cb) {
            var result = {seq:doc._seq, doc:doc, id:doc._id};
            if (doc._deleted) result.deleted = true;
            cb.call(db, result);
        });
    }
    
    return db;
};

if (typeof module === 'object') module.exports = memcouch;