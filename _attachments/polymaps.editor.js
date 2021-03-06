/*
    Metakaolin's geometry editing layer, for Polymaps
    https://github.com/natevw/metakaolin
    
    Copyright (c) 2011, Nathan Vander Wilt
    All rights reserved.
    
    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions are met:
        * Redistributions of source code must retain the above copyright
          notice, this list of conditions and the following disclaimer.
        * Redistributions in binary form must reproduce the above copyright
          notice, this list of conditions and the following disclaimer in the
          documentation and/or other materials provided with the distribution.
        * Neither the name of Nathan Vander Wilt nor the
          names of its contributors may be used to endorse or promote products
          derived from this software without specific prior written permission.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
    ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
    WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
    DISCLAIMED. IN NO EVENT SHALL SIMPLEGEO BE LIABLE FOR ANY
    DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
    (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
    LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
    ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
    (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
    SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
var po_metakaolin_editor = function () {
    var po = org.polymaps,
        DOUBLE_CLICK_MSEC = 300,
        MAX_CONNECTIONS = 2,        // prevent full-fledged node networks from springing up
        MARKER_RADIUS = (window.TouchEvent) ? 25 : 5,
        HIGHLIGHT_WIDTH = Math.log(MARKER_RADIUS),
        CONNECTION_WIDTH = (window.TouchEvent) ? 15 : 5;
    
    var editor = po.layer(load);
    editor.tile(false);
    editor.cache.size(0);
    resetNodes();
    
    editor.geometry = function (geom) {
        if (!arguments.length) {
            return dumpGeometry();
        }
        resetNodes();
        if (geom) loadGeometry(geom);
        editor.reload();
        return editor;
    }
    
    
    var nodeObjects, nodeTicket;
    function resetNodes() {
        nodeObjects = {};
        nodeTicket = 0;
    }
    
    function createNode(pt) {
        nodeTicket += 1;
        var n = {id:nodeTicket, position:pt, connectedTo:{}};
        nodeObjects[n.id] = n;
        return n;
    }
    function destroyNode(n) {
        Object.keys(n.connectedTo).forEach(function (id) {
            disconnectNodes(n, nodeObjects[id]);
        });
        delete nodeObjects[n.id];
    }
    
    function connectNodes(a, b) {
        var c = {};
        a.connectedTo[b.id] = c;
        b.connectedTo[a.id] = c;
        return c;
    }
    function disconnectNodes(a, b) {
        delete a.connectedTo[b.id];
        delete b.connectedTo[a.id];
    }
    
    
    // loadGeometry/dumpGeometry convert between GeoJSON and internal "linked nodes" representation
    
    function loadGeometry(geom) {
        var LOAD = {
            "Point": function (pt) {
                createNode(pt);
            },
            "LineString": function (a) {
                var prevNode;
                a.forEach(function (pt) {
                    var n = createNode(pt);
                    if (prevNode) {
                        connectNodes(prevNode, n);
                    }
                    prevNode = n;
                });
            },
            "Polygon": function (a) {
                a.forEach(function (ring) {
                    var firstNode, prevNode;
                    ring.slice(0,-1).forEach(function (pt) {
                        var n = createNode(pt);
                        if (prevNode) {
                            connectNodes(prevNode, n);
                        } else {
                            firstNode = n;
                        }
                        prevNode = n;
                    });
                    connectNodes(firstNode, prevNode);
                });                    
            }
        };
        
        if (LOAD[geom.type]) {
            LOAD[geom.type](geom.coordinates);
        } else if (geom.type.indexOf("Multi") === 0) {
            geom.coordinates.forEach(LOAD[geom.type.slice("Multi".length)]);
        } else if (geom.type == "GeometryCollection") {
            geom.geometries.forEach(loadGeometry);
        } else {
            throw Error("Unknown geometry type: " + geom.type);
        }
    }
    
    
    function dumpGeometry() {
        var points = [], lines = [], rings = [],
            consumedNodes = {}, currentObject = null;
        
        // first pass grab all points and line segments
        Object.keys(nodeObjects).forEach(function (id) {
            if (consumedNodes[id]) return;
            
            var node = nodeObjects[id],
                connections = Object.keys(node.connectedTo);
            
            if (!connections.length) {
                // a rock feels no pain. an island never cries.
                points.push(node.position);
                consumedNodes[node.id] = true;
            } else if (connections.length == 1) {
                // end of line segment, collect all subsequent
                var line = [], nextId;
                while (node) {
                    line.push(node.position);
                    consumedNodes[node.id] = true;
                    nextId = connections.filter(function (cid) { return !consumedNodes[cid]; })[0];
                    node = nextId && nodeObjects[nextId];
                    connections = node && Object.keys(node.connectedTo);
                }
                lines.push(line);
            } else {
                // middle of ring or line, skip for now
            }
        });
        
        // now we can assume any un-consumed nodes belong to rings
        Object.keys(nodeObjects).forEach(function (id) {
            if (consumedNodes[id]) return;
            
            var node = nodeObjects[id],
                connections = Object.keys(node.connectedTo);
            
            var ring = [], nextId;
            while (node) {
                ring.push(node.position);
                consumedNodes[node.id] = true;
                nextId = connections.filter(function (cid) { return !consumedNodes[cid]; })[0];
                node = nextId && nodeObjects[nextId];
                connections = node && Object.keys(node.connectedTo);
            }
            ring.push(ring[0]);
            rings.push(ring);
        });
        
        // now convert into simplest equivalent GeoJSON object (anything from Point -> GeometryCollection)
        var geometry = {};
        if (points.length && !lines.length && !rings.length) {
            if (points.length == 1) {
                geometry.type = "Point";
                geometry.coordinates = points[0];
            } else {
                geometry.type = "MultiPoint";
                geometry.coordinates = points;
            }
        } else if (lines.length && !points.length && !rings.length) {
            if (lines.length == 1) {
                geometry.type = "LineString";
                geometry.coordinates = lines[0];
            } else {
                geometry.type = "MultiLineString";
                geometry.coordinates = lines;
            }
        } else if (rings.length && !points.length && !lines.length) {
            if (rings.length == 1) {
                geometry.type = "Polygon";
                geometry.coordinates = rings;
            } else {
                geometry.type = "MultiPolygon";
                geometry.coordinates = rings.map(function (ring) { return [ring]; });
            }
        } else {
            geometry.type = "GeometryCollection";
            geometry.geometries = [];
            points.forEach(function (p) {
                geometry.geometries.push({type:"Point", coordinates:p});
            });
            lines.forEach(function (l) {
                geometry.geometries.push({type:"LineString", coordinates:l});
            });
            rings.forEach(function (r) {
                geometry.geometries.push({type:"Polygon", coordinates:[r]});
            });
        }
        return geometry;
    }
    
    
    // three core interactions: "extend" a point (/refine a segment), "break" a connection, "merge" two points
    // to add a new point, tap an existing one and pull its extension onto the map
    // to unlink segments, tap a point or segment and 
    // to delete a point, drop it onto another — this combines their connections as well and can be used to link segments together
    
    // WORKAROUND: enable code below to deal with http://code.google.com/p/chromium/issues/detail?id=141840
    var bug141840 = (~navigator.userAgent.indexOf('Android') && (navigator.appVersion.match(/Chrome\/(.*?) /) || ["N/A"])[1] < "19");
    
    function load(tile, tileProj) {
        tile.element = po.svg('g');
        
        var connectionsLayer = po.svg('g'),
            nodesLayer = po.svg('g'),
            chromeLayer = po.svg('g');
        tile.element.appendChild(connectionsLayer);
        tile.element.appendChild(nodesLayer);
        tile.element.appendChild(chromeLayer);
        
        function setupNodeUI(n, captureInfo) {
            if (!n.ui) {
                n.ui = {};
                n.ui.el = po.svg('circle');
                n.ui.el.setAttribute('r', MARKER_RADIUS);
                n.ui.el.setAttribute('stroke-width', HIGHLIGHT_WIDTH);
                n.ui.el._graph_node = n;
            }
            if (n.ui.el.parentNode !== nodesLayer) {
                watch(n.ui.el, n.ui, function (e, ptr) {
                    _stopEvent(e);
                    if (n.ui.createNew) {
                        var coord = _getLocation(ptr);
                        var nn = createNode([coord.lon, coord.lat]),
                            nc = (Object.keys(n.connectedTo).length < MAX_CONNECTIONS) ? connectNodes(n, nn) : null;
                        if (nc) setupConnectionUI(nc, nn), setupConnectionUI(nc, n);
                        setupNodeUI(nn, {e:e,ptr:ptr});
                        nn.ui.targetNode = n;
                    } else setupCapture(e, ptr);
                });
                nodesLayer.appendChild(n.ui.el);
            }
            function setupCapture(e, ptr) {
                n.ui.el.setAttribute('fill', "yellow");
                capture(e, ptr, {
                    move: function (e, ptr) {
                        _stopEvent(e);
                        var coord = _getLocation(ptr);
                        n.position[0] = coord.lon, n.position[1] = coord.lat;
                        _setPosition(n.ui.el, 'c_', n.position);
                        Object.keys(n.connectedTo).forEach(function (cid) {
                            setupConnectionUI(n.connectedTo[cid], n);
                        });
                        
                        // cheatly hit testing, HT http://stackoverflow.com/questions/2174640/hit-testing-svg-shapes
                        n.ui.el.style.setProperty('display', "none", null);
                        var targetNode, targetConnection;
                        var targetEl = (!bug141840) ?
                            document.elementFromPoint(ptr.pageX, ptr.pageY) :
                            document.elementFromPoint(ptr.screenX, ptr.screenY);
                        
                        if (!targetEl) {
                            // ignore, mouse likely outside window or similar
                        } else if (targetEl.parentNode === nodesLayer) {
                            targetNode = targetEl._graph_node;
                        } else if (targetEl.parentNode === connectionsLayer) {
                            targetConnection = targetEl._graph_connecion;
                        }
                        n.ui.el.style.removeProperty('display');
                        
                        if (targetNode) {
                            var combinedConnections = {};
                            Object.keys(targetNode.connectedTo).forEach(function (cid) { combinedConnections[cid] = true; });
                            Object.keys(n.connectedTo).forEach(function (cid) { combinedConnections[cid] = true; });
                            delete combinedConnections[n.id], delete combinedConnections[targetNode.id];
                            if (Object.keys(combinedConnections).length > MAX_CONNECTIONS) {
                                targetNode = void 0;
                            }
                        }
                        if (n.ui.targetNode && targetNode !== n.ui.targetNode) {
                            n.ui.targetNode.ui.el.removeAttribute('fill');
                        }
                        if (targetNode) {
                            n.ui.targetNode = targetNode;
                            n.ui.targetNode.ui.el.setAttribute('fill', "yellow");
                        } else {
                            delete n.ui.targetNode;
                        }
                    },
                    up: function (e, ptr) {
                        _stopEvent(e);
                        n.ui.el.removeAttribute('fill');
                        uncapture(e, ptr);
                        
                        if (n.ui.targetNode) {          // remove after merging unique connections to target node
                            var tn = n.ui.targetNode;
                            tn.ui.el.removeAttribute('fill');
                            Object.keys(n.connectedTo).forEach(function (cid) {
                                var c = n.connectedTo[cid],
                                    cn = nodeObjects[cid];
                                removeConnectionUI(c);
                                disconnectNodes(cn, n);
                                if (cn !== tn && !tn.connectedTo[cid]) {
                                    var nc = connectNodes(cn, tn);
                                    setupConnectionUI(nc, tn), setupConnectionUI(nc, cn);
                                }
                            });
                            removeNodeUI(n);
                            destroyNode(n);
                        } else {
                            n.ui.createNew = true;
                            n.ui.el.setAttribute('stroke', (Object.keys(n.connectedTo).length === MAX_CONNECTIONS) ? "yellow" : "green");
                            setTimeout(function () {
                                delete n.ui.createNew;
                                n.ui.el.removeAttribute('stroke');
                            }, DOUBLE_CLICK_MSEC);
                        }
                    }
                });
            }
            if (captureInfo) setupCapture(captureInfo.e, captureInfo.ptr);
            
            _setPosition(n.ui.el, 'c_', n.position);
        }
        function removeNodeUI(n) {
            nodesLayer.removeChild(n.ui.el);
            delete n.ui;
        }
        
        function setupConnectionUI(c, n) {
            if (!c.ui) {
                c.ui = {};
                c.ui.el = po.svg('line');
                c.ui.el.setAttribute('stroke', "grey");
                c.ui.el.setAttribute('stroke-opacity', "0.75");
                c.ui.el.setAttribute('stroke-width', CONNECTION_WIDTH);
                c.ui.el._graph_connecion = c;
                
                var marker1 = editor.map().container().querySelector('#testMarker1');
                if (!marker1) {
                    marker1 = po.svg('marker');
                    marker1.setAttribute('id', "testMarker1");
                    marker1.setAttribute('markerUnits', "userSpaceOnUse");
                    marker1.setAttribute('orient', "auto");
                    marker1.setAttribute('overflow', "visible");
                    
                    var sq = po.svg('line');
                    sq.setAttribute('x1', 0);
                    sq.setAttribute('x2', MARKER_RADIUS * 2);
                    sq.setAttribute('stroke', "yellow");
                    sq.setAttribute('stroke-opacity', "0.125");
                    sq.setAttribute('stroke-width', CONNECTION_WIDTH);
                    marker1.appendChild(sq);
                    sq = po.svg('line');
                    sq.setAttribute('x1', MARKER_RADIUS * 2);
                    sq.setAttribute('x2', MARKER_RADIUS * 2 + 3);
                    sq.setAttribute('stroke', "green");
                    sq.setAttribute('stroke-opacity', "0.125");
                    sq.setAttribute('stroke-width', CONNECTION_WIDTH);
                    marker1.appendChild(sq);
                    editor.map().container().appendChild(marker1);
                    
                    var marker2 = marker1.cloneNode(true);
                    marker2.setAttribute('id', "testMarker2");
                    marker2.childNodes[0].setAttribute('x2', -MARKER_RADIUS * 2);
                    marker2.childNodes[1].setAttribute('x1', -MARKER_RADIUS * 2);
                    marker2.childNodes[1].setAttribute('x2', -MARKER_RADIUS * 2 - 3);
                    editor.map().container().appendChild(marker2);
                }
                c.ui.el.setAttribute('marker-start', "url(#testMarker1)");
                c.ui.el.setAttribute('marker-end', "url(#testMarker2)");
                
                
                c.ui.newVertex = po.svg('circle');
                c.ui.newVertex.setAttribute('r', MARKER_RADIUS);
                c.ui.newVertex.setAttribute('fill', "none");
                c.ui.newVertex.setAttribute('stroke', "green");
                c.ui.newVertex.setAttribute('stroke-width', HIGHLIGHT_WIDTH);
            }
            if (c.ui.el.parentNode !== connectionsLayer) {
                c.ui.el.removeEventListener('mouseover', c.ui.mouseoverListener, false);
                c.ui.el.addEventListener('mouseover', c.ui.mouseoverListener = function (e) {
                    _stopEvent(e);
                    chromeLayer.appendChild(c.ui.newVertex);
                }, false);
                c.ui.el.removeEventListener('mousemove', c.ui.mousemoveListener, false);
                c.ui.el.addEventListener('mousemove', c.ui.mousemoveListener = function (e) {
                    _stopEvent(e);
                    var coord = _getLocation(e),
                        pos = [coord.lon, coord.lat];
                    _setPosition(c.ui.newVertex, 'c_', pos);
                    if (_dist(c.ui.n1.position, pos) > 2*MARKER_RADIUS &&
                        _dist(c.ui.n2.position, pos) > 2*MARKER_RADIUS) c.ui.newVertex.setAttribute('stroke', "green");
                    else c.ui.newVertex.setAttribute('stroke', "yellow");
                }, false);
                c.ui.el.removeEventListener('mouseout', c.ui.mouseoutListener, false);
                c.ui.el.addEventListener('mouseout', c.ui.mouseoutListener = function (e) {
                    _stopEvent(e);
                    chromeLayer.removeChild(c.ui.newVertex);
                }, false);
                watch(c.ui.el, c.ui, function (e, ptr) {
                    _stopEvent(e);
                    var coord = _getLocation(ptr);
                    disconnectNodes(c.ui.n1, c.ui.n2);
                    var nn = createNode([coord.lon, coord.lat]),
                        c1 = (_dist(c.ui.n1.position, nn.position) > 2*MARKER_RADIUS) ? connectNodes(c.ui.n1, nn) : null,
                        c2 = (_dist(c.ui.n2.position, nn.position) > 2*MARKER_RADIUS) ? connectNodes(c.ui.n2, nn) : null;
                    if (c1) setupConnectionUI(c1, nn), setupConnectionUI(c1, c.ui.n1);
                    if (c2) setupConnectionUI(c2, nn), setupConnectionUI(c2, c.ui.n2);
                    setupNodeUI(nn, {e:e, ptr:ptr});
                    removeConnectionUI(c);
                });
                
                connectionsLayer.appendChild(c.ui.el);
            }
            
            var nN = (c.ui.n1 && c.ui.n1 !== n) ? 2 : 1;
            c.ui['n'+nN] = n;   // freshen storage of which node owns which end
            _setPosition(c.ui.el, '_'+nN, n.position);
        }
        function removeConnectionUI(c) {
            if (c.ui.newVertex.parentNode) {
                c.ui.el.removeEventListener('mouseout', c.ui.mouseoutListener, false);
                chromeLayer.removeChild(c.ui.newVertex);
            }
            connectionsLayer.removeChild(c.ui.el);
            delete c.ui;
        }
        
        var proj = tileProj(tile).locationPoint;
        function _setPosition(el, attr, pos) {
            var pt = proj({lat:pos[1], lon:pos[0]});
            el.setAttribute(attr.replace('_','x'), pt.x);
            el.setAttribute(attr.replace('_','y'), pt.y);
            return pt;
        }
        function _getLocation(ptr) {
            var mouse = editor.map().mouse(ptr);
            return editor.map().pointLocation(mouse);
        }
        function _dist(pos1, pos2) {
            var pt1 = proj({lat:pos1[1], lon:pos1[0]}),
                pt2 = proj({lat:pos2[1], lon:pos2[0]}),
                dx = pt2.x - pt1.x, dy = pt2.y - pt1.y;
            return Math.sqrt(dx*dx + dy*dy);
        }
        
        Object.keys(nodeObjects).forEach(function (id) {
            var node = nodeObjects[id];
            setupNodeUI(node);
            Object.keys(node.connectedTo).forEach(function (cid) {
                var connection = node.connectedTo[cid];
                setupConnectionUI(connection, node);
            });
        });
    }
    
    
    // on mouse/touch/(TBD: pointer) down, an object can "capture" that input and these window move/up listeners will dispatch to its handlers
    
    function _stopEvent(e) { e.preventDefault(); e.stopPropagation(); }
    
    var inputOwners = {};
    function watch(el, ui, cb) {
        el.removeEventListener('mousedown', ui.mousedownListener, false);
        el.removeEventListener('touchstart', ui.touchstartListener, false);
        el.addEventListener('mousedown', ui.mousedownListener = function (e) {
            return cb(e, e);
        });
        el.addEventListener('touchstart', ui.touchstartListener = function (e) {
            var targetEl = e.target;
            targetEl.addEventListener('touchmove', ui.touchmoveListener = function (e) {
                [].forEach.call(e.changedTouches, function (ptr) {
                    var owner = inputOwners['touch-'+ptr.identifier];
                    if (owner && owner.move) return owner.move(e, ptr);
                });
            }, false);
            targetEl.addEventListener('touchend', ui.touchoffListener = function (e) {
                targetEl.removeEventListener('touchmove', ui.touchmoveListener, false);
                targetEl.removeEventListener('touchend', ui.touchoffListener, false);
                targetEl.removeEventListener('touchcancel', ui.touchoffListener, false);
                [].forEach.call(e.changedTouches, function (ptr) {
                    var owner = inputOwners['touch-'+ptr.identifier];
                    if (owner && owner.up) return owner.up(e, ptr);
                });
            }, false);
            targetEl.addEventListener('touchcancel', ui.touchoffListener, false);
            return cb(e, e.changedTouches[0]);
        }, false);
    }
    function capture(e, ptr, owner) {
        var source;
        if (window.TouchEvent && e instanceof TouchEvent) {
            source = 'touch-'+ptr.identifier;
        } else source = 'mouse';
        inputOwners[source] = owner;
    }
    function uncapture(e, ptr) {
        var source;
        if (ptr !== e) {
            source = 'touch-'+ptr.identifier;
        } else source = 'mouse';
        delete inputOwners[source];
    }
    
    window.addEventListener('mousemove', function (e) {
        var owner = inputOwners['mouse'];
        if (owner && owner.move) {
            return owner.move(e, e);
        };
    }, false);
    window.addEventListener('mouseup', function (e) {
        var owner = inputOwners['mouse'];
        if (owner && owner.up) {
            return owner.up(e, e);
        };
    }, false);
    
    return editor;
};