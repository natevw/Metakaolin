var model = memcouch.db(),
    mainStage = stage(document.body);

function hookUpPouch(e,db) {
    if (e) throw e;
    dbgDB = db;
    
    var status = memcouch.slaveToPouch(model, db);
    window.addEventListener('beforeunload', function () {
        if (status.changesPending) return (e.returnValue = "Not all of your changes have been saved to disk yet, please wait!");
    }, false);
    
    // TODO: move this to visible, app-level configuration when integrating back into CouchDB
    if (0 && location.protocol !== 'file:') {
        var ddocIdx = location.href.indexOf("/_design/"),
            ddocName = location.href.slice(ddocIdx).split('/')[2],
            dbURL = (~ddocIdx) ? location.href.slice(0, ddocIdx) : "";     // if no ddoc in URL, just try root I guess?
        Pouch.replicate(dbURL, db, {continuous:false, filter:ddocName+"/geodocs"});
        Pouch.replicate(db, dbURL, {continuous:true});
    }
}
try {
    Pouch("metakaolin", hookUpPouch);
} catch (e) {
    alert("Could not set up persistent storage!\n\nYou may try the app, but all your data will be lost when you close/refresh the page.");
}

mainStage.push(function () {
    this.scene("Maps", listView);
    this.title("All maps");
    this.extra("Setup", "Adjust application settings", function (container) {
        var root = d3.select(container).html('').classed('appSettings', true),
                offlineHeader = root.append('h3').text("Offline availability"),
                offlineStatusLabel = root.append('span').text("Status: "),
                    offlineStatus = offlineStatusLabel.append('output').text("Unknown"),
                offlineProgress = root.append('progress'),
                replicationHeader = root.append('h3').text("Replication"),
                replicationLabel = root.append('label').text("Continously replicate with CouchDB"),
                replicationStyle = replicationLabel.append('select').attr('disabled', true),
                replicationExplanation = root.append('p').classed('replDisableNote', true).text("Replication not available in static Dev Derby demo.");
        
        replicationStyle.selectAll('option').data(["Off", "From source", "To source", "Bi-directional"]).enter()
            .append('option').text(function (d) { return d; });
        
        var lastProgress = null;
        function updateDisplays(e) {
            if (e) switch (e.type) {
                case 'downloading':
                   lastProgress = 0;
                   break;
                case 'progress':
                   lastProgress = (e.lengthComputable) ? (e.loaded / e.total) : null;
                   break;
            }
            var applicationCache = window.applicationCache || {UNCACHED:-1, status:-1};
            switch (applicationCache.status) {
                case applicationCache.UNCACHED:
                case applicationCache.OBSOLETE:
                   offlineStatus.text("Not cached.").classed('good', false).classed('wait', false).classed('bad', true);
                   offlineProgress.attr('value', 0);
                   break;
                case applicationCache.IDLE:
                   offlineStatus.text("Ready.").classed('good', true).classed('wait', false).classed('bad', false);
                   offlineProgress.attr('value', 1);
                   break;
                case applicationCache.CHECKING:
                case applicationCache.DOWNLOADING:
                   offlineStatus.text("In progress.").classed('good', false).classed('wait', true).classed('bad', false);
                   offlineProgress.attr('value', lastProgress);
                   break;
                case applicationCache.UPDATEREADY:
                   offlineProgress.attr('value', 1);
                   offlineStatus.text("Refresh for latest.").classed('good', false).classed('wait', true).classed('bad', false);
                   break;
            }
            offlineProgress.text((offlineProgress.attr('value') * 100).toFixed(1) + "%");
        }
        
        if (window.applicationCache) {
            applicationCache.addEventListener('checking', updateDisplays, true);
            applicationCache.addEventListener('noupdate', updateDisplays, true);
            applicationCache.addEventListener('downloading', updateDisplays, true);
            applicationCache.addEventListener('progress', updateDisplays, true);
            applicationCache.addEventListener('cached', updateDisplays, true);
            applicationCache.addEventListener('updateready', updateDisplays, true);
            applicationCache.addEventListener('obsolete', updateDisplays, true);
            applicationCache.addEventListener('error', updateDisplays, true);
        }
        updateDisplays();
        
        if (~navigator.userAgent.indexOf('Firefox')) offlineStatusLabel.append('p').classed('ffBugWarning', true)
            .html("NOTE: status information and progress are <a href=\"https://bugzilla.mozilla.org/show_bug.cgi?id=825618\">broken in Firefox</a>. If you leave this page open long enough to download the complete sample tileset (~135MB, over 3000 files) then upon refresh you should see a Ready state.");
        
        return function () {
            if (window.applicationCache) {
                applicationCache.removeEventListener('checking', updateDisplays, true);
                applicationCache.removeEventListener('noupdate', updateDisplays, true);
                applicationCache.removeEventListener('downloading', updateDisplays, true);
                applicationCache.removeEventListener('progress', updateDisplays, true);
                applicationCache.removeEventListener('cached', updateDisplays, true);
                applicationCache.removeEventListener('updateready', updateDisplays, true);
                applicationCache.removeEventListener('obsolete', updateDisplays, true);
                applicationCache.removeEventListener('error', updateDisplays, true);
            }
            root.classed('appSettings', false);
        }
    });
});

function listView(container) {
    var root = d3.select(container).html('').classed('listView', true),
            loading = root.append('p').classed('loadingNote', true).text("List may still be loading…"),
            list = root.append('ul').classed('maps', true),
                addMap = list.append('li').classed('addMap', true).append('h2').append('a').classed('action', true).text("New map…");
    
    function openDocument(doc) {
        mainStage.push(function () {
            var ctx = {doc:doc},
                mapInfoByKey = {};
            MAP_OPTIONS.forEach(function (info) { mapInfoByKey[info.key] = info; });
            this.scene("Features", mapView, ctx);
            this.title(doc.title || "Untitled", "Zoom to fit", ctx.zoomToDoc);
            this.extra("Edit", "Map document settings", function (container) {
                var root = d3.select(container).html('').classed('docSettings', true),
                    nameLabel = root.append('label').text("Map name:"),
                        nameInput = nameLabel.append('input').attr('value', doc.title),
                    basemapLabel = root.append('label').text("Basemap style:"),
                       basemapOptions = basemapLabel.append('select'),
                       basemapCredit = basemapLabel.append('p').classed('mapCredit', true),
                    deleteDoc = root.append('a').classed('action', true).classed('delete', true).text("Delete?");
                
                basemapOptions.selectAll('option').data(MAP_OPTIONS).enter().append('option').attr('value', function (d) { return d.key; }).text(function (d) { return d.name; });
                basemapOptions.on('change', function () {
                    doc.basemap = basemapOptions.property('value');
                    basemapCredit.html(mapInfoByKey[doc.basemap].attr);
                    showBasemap();
                }).property('value', doc.basemap);
                basemapCredit.html(mapInfoByKey[doc.basemap].attr);
                
                deleteDoc.on('click', function () {
                    var really = confirm("This document will be almost permanently deleted.");
                    if (!really) return;
                    model.del(doc._id);
                    mainStage.pop();
                });
                
                return function () {
                    doc.title = nameInput.property('value');
                    model.put(doc);
                    root.classed('docSettings', false);
                };
            });
            
            doc.basemap || (doc.basemap = MAP_OPTIONS[0].key);
            function showBasemap() {
                var basemap = mapInfoByKey[doc.basemap];
                ctx.basemap.url(basemap.url);
                ctx.mapCredit.html(basemap.attr).selectAll('a').attr('target', "_blank");
            }
            showBasemap();
        });
    }
    
    addMap.attr('href', "#").on('click', function () {
        d3.event.preventDefault();
        var doc = {
            'com.stemstorage.geodoc':true,
            _id: 'geodoc-' + memcouch.id(),
            content: {type:"FeatureCollection", features:[]},
            created: new Date().toISOString(),
            title: "Untitled map"
        };
        doc.last_modified = new Date().toISOString();
        model.put(doc);
        openDocument(doc);
    });
    
    function updateList() {
        var data = model.query(function (doc) {
            if (doc['com.stemstorage.geodoc']) this.emit(doc.last_modified);
        }, true).map(function (row) { return row.doc; }).reverse();
        
        var mapItems = list.selectAll('li:not(.addMap)').data(data, function (d) { return d._id; }),
            mapItemsEnter = mapItems.enter().insert('li', ".addMap");
        mapItemsEnter.append('h2').append('a');
        mapItemsEnter.append('span');
        //mapItemsEnter.append('a').classed('action', true).classed('delete', true).text("Delete?");
        mapItems.select('h2 > a').text(function (d) { return d.title || "- untitled -"; }).attr('href', function (d) { return "#" + d._id; }).on('click', function (d) {
            d3.event.preventDefault();
            openDocument(d);
        });
        mapItems.select('span').text(function (d) { return d.last_modified; });
        mapItemsEnter.select('.delete').on('click', function (d) {
            var really = confirm("This document will be almost permanently deleted.");
            if (!really) return;
            model.del(d._id);
        });
        mapItems.exit().remove();
        mapItems.order();
        loading.remove();
    }
    model.watch(updateList);
    updateList();
    // HACK: put handwavy loading notification back after first list update, unless a number of items there already
    if (list.node().childElementCount < 2) {
        root.node().insertBefore(loading.node(), root.node().firstChild);
        setTimeout(function () {
            loading.remove();
        }, 10*1000);
    }
    
    return function () {
        root.classed('listView', false);
        model.clear(updateList);
    };
}

function mapView(container, ctx) {
    var root = d3.select(container).html('').classed('mapView', true),
            mapContainer = root.append('svg:svg'),
            addButton = root.append('a').classed('action', true).classed('add', true).text("+"),
            mapCredit = root.append('p').classed('mapCredit', true);
    
    var po = org.polymaps,
        map = po.map().container(mapContainer.node());
    dbgMap = map;
    map.add(po.interact()).zoomRange([0,24]);
        // TODO: properly attribute whichever layer is used
    var tiles = po.image().on('load', function (e) {
        // https://github.com/simplegeo/polymaps/issues/36
        e.tile.element.width.baseVal.value += 1;
        e.tile.element.height.baseVal.value += 1;
    }).zoom(function(z) { return Math.max(0, Math.min(18, z)); });
    map.add(tiles);
    
    // expose these for dialog use
    ctx.basemap = tiles;
    ctx.mapCredit = mapCredit;
    
    var doc = ctx.doc,
        vector = po_metakaolin_viewer(),
        editor = po_metakaolin_editor();
    vector.on('show', function (loadEvent) {
        if (loadEvent.features) loadEvent.features.forEach(function (f,i) {
            d3.select(f.element).on('click', function () {
                d3.event.stopPropagation();
                d3.event.preventDefault();
                editFeature(f.data);
            }).on("mouseover", function () {
                d3.select(this).classed('hover', true);
            }).on("mouseout", function () {
                d3.select(this).classed('hover', false);
            }).classed('color' + (i % 3), true).style('stroke', f.data.color).style('fill', f.data.color);
        });
    }).features(doc.content.features);
    d3.select(vector.container()).classed('viewer', true);
    map.add(vector).add(editor);
    
    addButton.on('click', function () {
        d3.event.preventDefault();
        addFeature();
    });
    
    function zoomableBounds(feature) {
        var bounds = d3.geo.bounds(feature).map(function (c) { return {lon:c[0], lat:c[1]}; }),
            MIN_DIFF = 0.0005;
        if (bounds[0].lat === bounds[1].lat && bounds[0].lon === bounds[1].lon) return;     // just don't zoom
        // pad features that are just legitimately tiny
        if ((bounds[1].lat - bounds[0].lat) < MIN_DIFF) {
            bounds[0].lat -= MIN_DIFF / 2;
            bounds[1].lat += MIN_DIFF / 2;
        }
        if ((bounds[1].lon - bounds[0].lon) < MIN_DIFF) {
            bounds[0].lon -= MIN_DIFF / 2;
            bounds[1].lon += MIN_DIFF / 2;
        }
        return bounds;
    }
    
    function zoomToDoc() {
        if (!doc.content.features.length) {
            map.extent(DEFAULT_BOUNDS);
            return;
        }
        var bounds = zoomableBounds(doc.content);
        if (bounds) map.extent(bounds).zoomBy(-0.25);
    }
    zoomToDoc();
    
    ctx.zoomToDoc = zoomToDoc;
    
    function addFeature() {
        var feat = {type:"Feature", properties:null},
            geom = {type:"Point", coordinates:[]},
            center = map.center();
        geom.coordinates.push(center.lon);
        geom.coordinates.push(center.lat);
        feat.geometry = geom;
        feat._new = true;
        doc.content.features.push(feat);
        editFeature(feat);
    }
    
    function editFeature(feature) {
        function zoomToFeature() {
            if ('_new' in feature) {
                // for brand new features, we skip initial zoom since user likely already found desired context
                delete feature._new;
                return;
            }
            var zoomFeature = editor.geometry(),
                bounds = zoomableBounds(zoomFeature);
            if (bounds) map.extent(bounds).zoomBy(-0.25);
        }
        addButton.style('display', "none");
        mainStage.push(function () {
            var featureName = (feature.properties && typeof feature.properties === 'object') ? feature.properties.name : feature.properties,
                ctx = {map:map, layer:editor, geometry:feature.geometry};
            ctx.removeShape = function () {
                var features = doc.content.features,
                    featureIdx = features.indexOf(feature);
                if (~featureIdx) features.splice(featureIdx, 1);
            };
            this.scene("Edit", shapeView, ctx);
            this.title("Editing " + ((featureName) ? ('"' + featureName + '"') : "shape"), "Zoom map to fit shape", zoomToFeature);
            this.extra("Details", "Feature details", function (container) {
                var nameProp = feature.properties;
                var root = d3.select(container).html('').classed('shapeDetails', true),
                        nameLabel = root.append('label').text("Name").attr('title', "Enter a name (or JSON properties) for this feature"),
                           nameEntry = nameLabel.append('input').attr('value', (nameProp && typeof nameProp === 'object') ? JSON.stringify(nameProp) : nameProp),
                        colorLabel = root.append('h3').text("Choose a color:"),
                        colorOptions = root.append('ul').classed('colorChoices', true),
                        deleteShape = root.append('a').classed('action', true).classed('delete', true).text("Remove feature?"),
                        usageNotesLabel = root.append('h3').text("Drawing instructions"),
                        usageNotes1 = root.append('p').html("Double click–drag on a point to create a new node.<br>Drop one node onto another to combine them."),
                        usageNotes2 = root.append('p').html("Pull on the middle of a line to refine it.<br>Drag from the end of a line (near a node) to disconnect it."),
                        usageNotes3 = root.append('p').html("You also can watch a <a href=\"http://vimeo.com/53201727\" target=_blank>rough demo video</a> to see how editing works.");
                
                colorOptions.selectAll('li').data(SHAPE_COLORS).enter()
                    .append('li').style('background', function (d) { return d.val; }).attr('title', function (d) { return d.name; }).on('click', function (d) {
                        feature.color = d.val;
                        updateColorSelection();
                    });
                colorOptions.insert('li', "li").text("None").attr('title', "Don't assign a color").on('click', function () {
                    delete feature.color;
                    updateColorSelection();
                });
                function updateColorSelection() {
                    colorOptions.selectAll('li').classed('selected', function (d) {
                        return (d) ? d.val === feature.color : !feature.color;
                    });
                }
                updateColorSelection();
                
                deleteShape.on('click', function () {
                    var really = confirm("This feature will be removed from the map.");
                    if (!really) return;
                    ctx.removeShape();
                    mainStage.pop();
                });
                
                return function () {
                    try {
                        // if text field looks like JSON, use its value
                        feature.properties = JSON.parse(nameEntry.property('value'))
                    } catch (e) {
                        // otherwise just assign as string/null
                        feature.properties = nameEntry.property('value') || null;
                    }
                    root.classed('shapeDetails', false);
                };
            });
            zoomToFeature();
        });
    }
    
    return function () {
        doc.last_modified = new Date().toISOString();
        model.put(doc);
        root.classed('mapView', false);
    };
}


function shapeView(container, ctx) {
    var root = d3.select(container)/*.html('')*/.classed('mapView', true).classed('editing', true);      // assume container is shared and just use existing map
    
    ctx.layer.geometry(ctx.geometry);
    
    return function () {
        var editor = ctx.layer,
            newGeometry = editor.geometry(),
            editingGeometry = ctx.geometry;
        Object.keys(newGeometry).forEach(function (key) {
            editingGeometry[key] = newGeometry[key];
            if (key === "geometries") delete editingGeometry["coordinates"];
            if (key === "coordinates") delete editingGeometry["geometries"];
        });
        editor.geometry(null);
        root.classed('editing', false).classed('mapView', false);
    }
}

function generateAppCache() {
    var baseURL = window.location.href.replace(/index\.html$/, ''),
        scripts = d3.selectAll('script').datum(function () { return this.src.slice(baseURL.length); }).data(),
        tiles = tilesInExtent(dbgMap.extent(), 18).map(MAP_OPTIONS[0].url);
    
    function tilesInExtent(extent, zoom) {
        var tileSW = org.polymaps.map.locationCoordinate(extent[0]),
            tileNE = org.polymaps.map.locationCoordinate(extent[1]);
        
        var tiles = [];
        for (var z = 0; z <= zoom; z +=1) {
            var zoomMultiplier = 1 << z,
                minX = Math.floor(tileSW.column * zoomMultiplier),
                maxX = Math.floor(tileNE.column * zoomMultiplier),
                minY = Math.floor(tileNE.row * zoomMultiplier),
                maxY = Math.floor(tileSW.row * zoomMultiplier);
            for (var x = minX; x <= maxX; x += 1) {
                for (var y = minY; y <= maxY; y += 1) {
                    tiles.push({zoom:z,column:x,row:y});
                }
            }
        }
        return tiles;
    }
    
    return [].concat("CACHE MANIFEST", "CACHE:", scripts, tiles, "NETWORK:", "*").join('\n');
}
