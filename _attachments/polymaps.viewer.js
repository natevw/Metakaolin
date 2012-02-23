/*
    Metakaolin's geometry viewing layer, for Polymaps
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
var po_metakaolin_viewer = function () {
    var po = org.polymaps,
        POINT_RADIUS = 4.5;
    
    var viewer = po.layer(load);
    viewer.tile(false);
    
    var features;
    viewer.features = function (newFeatures) {
        if (!arguments.length) {
            return features;
        }
        features = newFeatures;
        viewer.reload();
        return viewer;
    }
    
    viewer.show = function (tile) {
        viewer.dispatch({type:'show', tile:tile, features:tile.features});
        return viewer;
    };
    
    viewer.reshow = function () {
        var locks = viewer.cache.locks();
        for (var key in locks) viewer.show(locks[key]);
        return viewer;
    };
    
    function load(tile, tileProj) {
        function geometryElement(geom) {
            var DRAW = {
                "Point": function (pos) {
                    var el = po.svg("circle"),
                        pt = posProj(pos);
                    el.setAttribute('cx', pt.x), el.setAttribute('cy', pt.y);
                    el.setAttribute('r', POINT_RADIUS);
                    return el;
                },
                "LineString": function (a) {
                    var el = po.svg("polyline"),
                        pts = a.map(function (pos) { var pt = posProj(pos); return pt.x + ',' + pt.y; });
                    el.setAttribute('points', pts.join(' '));
                    return el;
                },
                "Polygon": function (a) {
                    var el = po.svg("path"), cmds = [];
                    a.forEach(function (ring) {
                        ring.forEach(function (pos, i) {
                            var pt = posProj(pos);
                            cmds.push(((i) ? 'L' : 'M') + pt.x + ',' + pt.y);
                        });
                        cmds.pop();
                        cmds.push('Z');
                    });
                    el.setAttribute('d', cmds.join(' '));
                    return el;
                }
            };
            
            var el;
            if (DRAW[geom.type]) {
                el = DRAW[geom.type](geom.coordinates);
            } else if (geom.type.indexOf("Multi") === 0) {
                el = po.svg('g');
                var subtype = geom.type.slice("Multi".length);
                geom.coordinates.forEach(function (subcoords) {
                    el.appendChild(DRAW[subtype](subcoords));
                });
            } else if (geom.type == "GeometryCollection") {
                el = po.svg('g');
                geom.geometries.forEach(function (subgeom) {
                    el.appendChild(geometryElement(subgeom));
                });
            } else {
                throw Error("Unknown geometry type: " + geom.type);
            }
            return el;
        }
        
        var proj = tileProj(tile).locationPoint,
            posProj = function (pos) { return proj({lat:pos[1], lon:pos[0]}); };
        tile.element = po.svg('g');
        if (features) tile.features = features.map(function (feature) {
            var el = geometryElement(feature.geometry);
            tile.element.appendChild(el)
            return {element:el, data:feature};
        });
        viewer.dispatch({type:'load', tile:tile, features:tile.features});
    }
    
    return viewer;
};