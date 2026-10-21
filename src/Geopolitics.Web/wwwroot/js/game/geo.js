// Pure maths for the globe (no 3D library needed), so it can be tested in Node.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.GameGeo = factory();
})(typeof self !== 'undefined' ? self : this, function () {

    // One colour per player, by turn order. The human player is always gold.
    const PALETTE = ['#f5c542', '#4fc3f7', '#ef5350', '#66bb6a', '#ab47bc',
                     '#ff8a65', '#26c6da', '#d4e157', '#ec407a', '#8d9bff'];

    function playerColor(turnOrder, isHuman) {
        if (isHuman) return PALETTE[0];
        return PALETTE[1 + (turnOrder % (PALETTE.length - 1))];
    }

    // Latitude/longitude in degrees to a point on a sphere. +y is north.
    function latLonToXYZ(lat, lon, radius) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lon + 180) * Math.PI / 180;
        return {
            x: -radius * Math.sin(phi) * Math.cos(theta),
            y: radius * Math.cos(phi),
            z: radius * Math.sin(phi) * Math.sin(theta)
        };
    }

    const len = (v) => Math.hypot(v.x, v.y, v.z);
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const scale = (v, k) => ({ x: v.x * k, y: v.y * k, z: v.z * k });
    const unit = (v) => scale(v, 1 / (len(v) || 1));

    // Points along the shortest path between two surface points, lifted into an
    // arc (highest in the middle) so it floats above the globe.
    function arcPoints(a, b, segments, lift, radius) {
        const ua = unit(a), ub = unit(b);
        const angle = Math.acos(Math.min(1, Math.max(-1, dot(ua, ub))));
        const pts = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            let p;
            if (angle < 1e-6) p = ua;
            else {
                const s = Math.sin(angle);
                const wa = Math.sin((1 - t) * angle) / s, wb = Math.sin(t * angle) / s;
                p = { x: ua.x * wa + ub.x * wb, y: ua.y * wa + ub.y * wb, z: ua.z * wa + ub.z * wb };
            }
            pts.push(scale(unit(p), radius * (1 + lift * Math.sin(Math.PI * t))));
        }
        return pts;
    }

    // True when a point on the sphere surface can be seen from the camera
    // (it is on the near side of the horizon).
    function isFacing(point, camera, radius) {
        return dot(point, camera) > radius * radius;
    }

    // Pillar height for a soldier count: grows with soldiers but levels off.
    function markerHeight(soldiers) {
        return 0.04 + 0.11 * Math.min(1, Math.sqrt(Math.max(0, soldiers)) / 6);
    }

    return { PALETTE, playerColor, latLonToXYZ, arcPoints, isFacing, markerHeight, unit, len, dot };
});
