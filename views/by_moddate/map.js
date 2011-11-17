function (doc) {
    if (doc['com.stemstorage.geodoc']) emit(doc.last_modified, doc.title);
}