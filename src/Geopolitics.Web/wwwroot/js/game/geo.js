// Pure maths for the globe (no 3D library needed), so it can be tested in Node.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.GameGeo = factory();
})(typeof self !== 'undefined' ? self : this, function () {

    // One colour per player, by turn order. The human player is always gold.
    const PALETTE = ['#f5c542', '#4fc3f7', '#ef5350', '#66bb6a', '#ab47bc',
                     '#ff8a65', '#26c6da', '#d4e157', '#ec407a', '#8d9bff'];

    // Which of the ten colours / uniforms a player has: the human is always the first.
    function uniformIndex(turnOrder, isHuman) {
        return isHuman ? 0 : 1 + (turnOrder % (PALETTE.length - 1));
    }

    function playerColor(turnOrder, isHuman) {
        return PALETTE[uniformIndex(turnOrder, isHuman)];
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

    // ---- dice and moving soldiers ----

    // Box faces in three.js order: +x, -x, +y, -y, +z, -z. Opposite faces add up to 7.
    const DIE_FACE_VALUES = [3, 4, 1, 6, 2, 5];
    const DIE_FACE_NORMALS = [
        { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
        { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
    ];

    // Direction (in the die's own frame) of the face that shows this value.
    function dieFaceNormal(value) {
        return DIE_FACE_NORMALS[DIE_FACE_VALUES.indexOf(value)];
    }

    // Pip positions on a face, as fractions of its width and height.
    const PIPS = {
        1: [[0.5, 0.5]],
        2: [[0.25, 0.25], [0.75, 0.75]],
        3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
        4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
        5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
        6: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.5], [0.75, 0.5], [0.25, 0.75], [0.75, 0.75]]
    };

    // Who wins each pair of dice: the higher roll wins, a tie changes nothing.
    // Same rule as the server's battle engine; used only to colour the dice.
    function diceOutcomes(attackerRolls, defenderRolls) {
        const pairs = Math.min(attackerRolls.length, defenderRolls.length);
        const attacker = [], defender = [];
        for (let i = 0; i < pairs; i++) {
            const a = attackerRolls[i], d = defenderRolls[i];
            attacker.push(a > d ? 'win' : a < d ? 'lose' : 'tie');
            defender.push(d > a ? 'win' : d < a ? 'lose' : 'tie');
        }
        return { attacker, defender };
    }

    // The point a fraction u (0 to 1) of the way along a path of points.
    function pointAlong(points, u) {
        const t = Math.min(1, Math.max(0, u)) * (points.length - 1);
        const i = Math.min(points.length - 2, Math.floor(t));
        const f = t - i, a = points[i], b = points[i + 1];
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
    }

    // ---- soldiers standing on a country ----

    // A country shows at most this many soldiers; the number on its label is the true count.
    const MAX_SQUAD = 5;

    // Where each of n soldiers stands: in one row, sideways (x) around the middle of the country, with a tiny
    // front-to-back stagger (z) so neighbours overlap like a crowd. One row keeps every flag clear of the others.
    function squadOffsets(n) {
        const count = Math.max(0, Math.min(MAX_SQUAD, n));
        const spacing = 0.085;
        return Array.from({ length: count }, (_, i) => ({ x: (i - (count - 1) / 2) * spacing, z: count === 1 ? 0 : (i % 2 ? 0.01 : -0.01) }));
    }

    return {
        uniformIndex, MAX_SQUAD, squadOffsets, PALETTE, playerColor, latLonToXYZ, arcPoints, isFacing, markerHeight, unit, len, dot,
        DIE_FACE_VALUES, dieFaceNormal, PIPS, diceOutcomes, pointAlong
    };
});
