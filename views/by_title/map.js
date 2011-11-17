function (doc) {
    if (doc['com.stemstorage.geodoc']) emit(doc.title, doc.title);
}