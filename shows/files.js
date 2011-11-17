function (doc, req) {
    var ddoc = this;
    var fs = require('lib/flatstache');
    provides("html", function () {
        var db_url = '/' + req.info.db_name,
            app_url = fs.to_html("{{{db_url}}}/{{{id}}}", {db_url:db_url, id:ddoc._id});
        var template = "<li><a href='{{db_url}}/{{id}}/{{name}}'>./{{ name }}</a></li>",
            files = (doc && doc._attachments) ? Object.keys(doc._attachments).map(function (name) {
                return fs.to_html(template, {db_url:db_url, id:doc._id, name:name});
            }).join('') : "<li class='empty'>No files.</li>";
        var may_upload = (doc) ? 'yes' : '';
        return fs.to_html(ddoc.templates.files, {
            db_url:db_url, app_url:app_url, files:files, may_upload:may_upload,
            id:(doc && doc._id), revno:(doc && doc._rev), title:(doc && doc.title)
        });
    });
}
