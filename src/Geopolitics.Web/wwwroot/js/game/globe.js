// The 3D globe. It only DISPLAYS the game: the server decides every outcome.
// page.js tells it what to show (board colours and soldier counts, a battle arc,
// flashes, where to look) and it tells page.js when a country is clicked.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './geo.js';

const geo = window.GameGeo;
const R = 1;                                         // globe radius
const UP = new THREE.Vector3(0, 1, 0);
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Globe {
    // container: element that receives the canvas; overlay: element for the labels.
    // data: { coords: { code: [lat, lon] }, landDots: [[lat, lon], ...] }
    constructor(container, overlay, data) {
        this.container = container;
        this.overlay = overlay;
        this.coords = data.coords;
        this.markers = new Map();
        this.flashes = [];
        this.effects = [];      // running battle animations (dice, soldiers, bursts)
        this.dice = [];         // the dice effects, so a new roll can clear the old ones
        this.assets = null;     // shared dice textures and shapes, made on first use
        this.battle = null;
        this.focus = null;
        this.onPick = () => {};
        this.lastTouched = 0;
        this.fast = false;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });   // throws without WebGL
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
        this.camera.position.set(0.4, 1.0, 3.2);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.enablePan = false;
        this.controls.minDistance = 1.8;
        this.controls.maxDistance = 5;
        this.controls.autoRotate = !reduceMotion;
        this.controls.autoRotateSpeed = 0.35;
        this.controls.addEventListener('start', () => { this.lastTouched = performance.now(); this.focus = null; });
        this.controls.addEventListener('end', () => { this.lastTouched = performance.now(); });

        this.buildWorld(data.landDots);

        this.resize = this.resize.bind(this);
        this.observer = new ResizeObserver(this.resize);
        this.observer.observe(container);
        this.resize();

        this.running = true;
        this.clock = new THREE.Clock();
        this.tick = this.tick.bind(this);
        this.tick();
    }

    // ---------- scene ----------

    buildWorld(landDots) {
        this.scene.add(new THREE.AmbientLight(0x6f8fb5, 1.0));
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(5, 3, 5);
        this.scene.add(sun);

        const ball = new THREE.Mesh(
            new THREE.SphereGeometry(R, 64, 48),
            new THREE.MeshPhongMaterial({ color: 0x0b1d33, emissive: 0x040f1d, shininess: 14 }));
        this.scene.add(ball);

        // latitude / longitude grid every 30 degrees
        const grid = [];
        const push = (lat, lon) => { const p = geo.latLonToXYZ(lat, lon, R * 1.001); grid.push(p.x, p.y, p.z); };
        for (let lat = -60; lat <= 60; lat += 30)
            for (let lon = 0; lon < 360; lon += 4) { push(lat, lon); push(lat, lon + 4); }
        for (let lon = 0; lon < 360; lon += 30)
            for (let lat = -88; lat < 88; lat += 4) { push(lat, lon); push(lat + 4, lon); }
        const gridGeo = new THREE.BufferGeometry();
        gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
        this.scene.add(new THREE.LineSegments(gridGeo,
            new THREE.LineBasicMaterial({ color: 0x1c3a5e, transparent: true, opacity: 0.55 })));

        // continents as dots
        const dots = [];
        for (const [lat, lon] of landDots) { const p = geo.latLonToXYZ(lat, lon, R * 1.003); dots.push(p.x, p.y, p.z); }
        const dotGeo = new THREE.BufferGeometry();
        dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
        this.scene.add(new THREE.Points(dotGeo,
            new THREE.PointsMaterial({ color: 0x5b97d6, size: 0.014, sizeAttenuation: true })));

        // soft blue glow around the edge
        this.scene.add(new THREE.Mesh(
            new THREE.SphereGeometry(R * 1.12, 48, 32),
            new THREE.ShaderMaterial({
                side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
                vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
                fragmentShader: 'varying vec3 vN; void main(){ float i = pow(max(0.0, 0.62 - dot(vN, vec3(0.0, 0.0, 1.0))), 2.5); gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * i; }'
            })));

        // stars
        const stars = [];
        for (let i = 0; i < 700; i++) {
            const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
                .multiplyScalar(20 + Math.random() * 20);
            stars.push(v.x, v.y, v.z);
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
        this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, sizeAttenuation: true })));
    }

    // Creates one pillar + label for each country in this game.
    // countries: [{ code, name }]. Countries without coordinates are skipped.
    setCountries(countries) {
        for (const m of this.markers.values()) { this.scene.remove(m.group); m.label.remove(); }
        this.markers.clear();

        for (const c of countries) {
            const ll = this.coords[c.code];
            if (!ll) continue;
            const surface = geo.latLonToXYZ(ll[0], ll[1], R);
            const normal = new THREE.Vector3(surface.x, surface.y, surface.z).normalize();

            const group = new THREE.Group();
            group.position.set(surface.x, surface.y, surface.z);
            group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

            const colour = new THREE.Color(0x888888);
            const pillarGeo = new THREE.CylinderGeometry(0.013, 0.019, 1, 12);
            pillarGeo.translate(0, 0.5, 0);                           // base at the surface
            const pillar = new THREE.Mesh(pillarGeo, new THREE.MeshBasicMaterial({ color: colour }));
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: colour }));
            const ring = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.055, 32), new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide }));
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.004;
            group.add(pillar, cap, ring);
            this.scene.add(group);

            const label = document.createElement('button');
            label.type = 'button';
            label.className = 'globe-label';
            label.innerHTML = '<span class="nm"></span><span class="ct"></span>';
            label.querySelector('.nm').textContent = c.name;
            label.addEventListener('click', () => this.onPick(c.code));
            this.overlay.appendChild(label);

            this.markers.set(c.code, { code: c.code, name: c.name, surface, normal, group, pillar, cap, ring, label, height: 0.1 });
        }
    }

    // board: { countries: { code: { ownerPlayerId, soldiers } } }, players: snapshot players.
    update(board, players) {
        const byId = new Map(players.map(p => [p.playerId, p]));
        for (const m of this.markers.values()) {
            const st = board.countries[m.code];
            if (!st) continue;
            const owner = byId.get(st.ownerPlayerId);
            const colour = owner ? geo.playerColor(owner.turnOrder, owner.isHuman) : '#888888';
            for (const part of [m.pillar, m.cap, m.ring]) part.material.color.set(colour);
            m.height = geo.markerHeight(st.soldiers);
            m.pillar.scale.y = m.height;
            m.cap.position.y = m.height;
            m.label.style.borderColor = colour;
            m.label.querySelector('.ct').textContent = st.soldiers;
            m.label.querySelector('.ct').style.background = colour;
        }
    }

    // Highlights the countries the player has picked (white ring).
    setSelected(codes) {
        for (const m of this.markers.values()) {
            const on = codes.includes(m.code);
            m.label.classList.toggle('selected', on);
            m.ring.scale.setScalar(on ? 1.7 : 1);
        }
    }

    // ---------- effects ----------

    setFast(on) { this.fast = !!on; }

    // Turns the globe to face the given countries.
    focusOn(codes) {
        const pts = codes.map(c => this.markers.get(c)).filter(Boolean);
        if (pts.length === 0) return;
        const mid = new THREE.Vector3();
        for (const m of pts) mid.add(m.normal);
        if (mid.lengthSq() < 1e-6) return;
        const dist = Math.min(3.6, Math.max(2.4, this.camera.position.length()));
        this.focus = { target: mid.normalize().multiplyScalar(dist), dist };
        if (reduceMotion) { this.camera.position.copy(this.focus.target); this.focus = null; }
    }

    showBattle(attackerCode, defenderCode) {
        this.clearBattle();
        const a = this.markers.get(attackerCode), d = this.markers.get(defenderCode);
        if (!a || !d) return;
        const pts = geo.arcPoints(a.surface, d.surface, 48, 0.28, R * 1.02).map(p => new THREE.Vector3(p.x, p.y, p.z));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0xff5252 }));
        const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        this.scene.add(line, pulse);
        this.battle = { line, pulse, pts, t: 0 };
    }

    clearBattle() {
        if (!this.battle) return;
        this.scene.remove(this.battle.line, this.battle.pulse);
        this.battle.line.geometry.dispose();
        this.battle = null;
    }

    // An expanding ring on a country (conquest, reinforcement, ...).
    flash(code, colour) {
        const m = this.markers.get(code);
        if (!m) return;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.065, 40),
            new THREE.MeshBasicMaterial({ color: colour, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.006;
        m.group.add(ring);
        this.flashes.push({ ring, group: m.group, start: performance.now() });
    }

    // ---------- battle animation ----------

    // The six pip textures and the shared shapes, made the first time they are needed.
    ensureAssets() {
        if (this.assets) return this.assets;
        const textures = [];
        for (let v = 1; v <= 6; v++) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 128;
            const g = canvas.getContext('2d');
            g.fillStyle = '#f4f4f0';
            g.fillRect(0, 0, 128, 128);
            g.strokeStyle = '#b8b8b0';
            g.lineWidth = 6;
            g.strokeRect(3, 3, 122, 122);
            g.fillStyle = '#16202c';
            for (const [px, py] of geo.PIPS[v]) {
                g.beginPath();
                g.arc(px * 128, py * 128, 11, 0, Math.PI * 2);
                g.fill();
            }
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            textures.push(texture);
        }
        this.assets = {
            textures,
            die: new THREE.BoxGeometry(0.07, 0.07, 0.07),
            ball: new THREE.SphereGeometry(1, 10, 8)
        };
        return this.assets;
    }

    // Throws the real dice onto both countries. Each die tumbles, lands showing its
    // rolled value, then turns green (won), red (lost) or stays white (tie). A lost
    // die also sends up a burst of red specks: one lost soldier.
    // ms is how long the whole roll has before the next event.
    rollDice(attackerCode, defenderCode, attackerRolls, defenderRolls, ms) {
        const a = this.markers.get(attackerCode), d = this.markers.get(defenderCode);
        if (!a || !d) return;
        this.clearDice();
        const assets = this.ensureAssets();
        const result = geo.diceOutcomes(attackerRolls, defenderRolls);
        const spinMs = Math.max(120, ms * 0.55);
        const lifeMs = Math.max(spinMs + 150, ms * 0.95);
        const tint = { win: 0xc8f7d0, lose: 0xff9a9a, tie: 0xffffff };

        const throwDice = (marker, rolls, outcomes) => rolls.forEach((value, i) => {
            if (!outcomes[i]) return;                          // unpaired die: not part of the fight
            const materials = geo.DIE_FACE_VALUES.map(v => new THREE.MeshBasicMaterial({ map: assets.textures[v - 1] }));
            const mesh = new THREE.Mesh(assets.die, materials);
            const baseY = marker.height + 0.1;
            mesh.position.set((i - (rolls.length - 1) / 2) * 0.09, baseY, 0);
            marker.group.add(mesh);

            const n = geo.dieFaceNormal(value);
            // final pose: the face for this value points straight out of the globe
            const final = new THREE.Quaternion().setFromAxisAngle(UP, Math.random() * Math.PI * 2)
                .multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(n.x, n.y, n.z), UP));
            const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            const turns = 2 + Math.random() * 2;
            const start = performance.now() + i * 60;
            let landed = false;

            const effect = {
                update: (now) => {
                    const age = now - start;
                    if (age < 0) { mesh.visible = false; return true; }
                    mesh.visible = true;
                    const f = Math.min(1, age / spinMs);
                    const spinLeft = (1 - f) * (1 - f);        // spin slows down to nothing
                    mesh.quaternion.setFromAxisAngle(axis, spinLeft * turns * Math.PI * 2).multiply(final);
                    mesh.position.y = baseY + 0.05 * Math.sin(Math.PI * Math.min(1, f * 1.15));
                    if (f >= 1 && !landed) {
                        landed = true;
                        for (const m of materials) m.color.setHex(tint[outcomes[i]]);
                        if (outcomes[i] === 'lose') this.burst(marker, 0xff5252, 7, ms);
                    }
                    return age < lifeMs;
                },
                dispose: () => {
                    marker.group.remove(mesh);
                    for (const m of materials) m.dispose();
                }
            };
            this.effects.push(effect);
            this.dice.push(effect);
        });

        throwDice(a, attackerRolls, result.attacker);
        throwDice(d, defenderRolls, result.defender);
    }

    clearDice() {
        for (const e of this.dice) {
            e.dispose();
            const i = this.effects.indexOf(e);
            if (i >= 0) this.effects.splice(i, 1);
        }
        this.dice = [];
    }

    // Specks flying up from a country: used where soldiers are lost.
    burst(marker, colour, count, ms) {
        const assets = this.ensureAssets();
        const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true });
        const bits = [];
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(assets.ball, material);
            mesh.scale.setScalar(0.011);
            marker.group.add(mesh);
            bits.push({ mesh, vx: (Math.random() - 0.5) * 0.25, vy: 0.05 + Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.25 });
        }
        const start = performance.now(), life = Math.max(250, ms * 0.7);
        this.effects.push({
            update: (now) => {
                const t = (now - start) / life;
                if (t >= 1) return false;
                for (const b of bits) b.mesh.position.set(b.vx * t, marker.height + 0.06 + b.vy * t - 0.12 * t * t, b.vz * t);
                material.opacity = 1 - t;
                return true;
            },
            dispose: () => {
                for (const b of bits) marker.group.remove(b.mesh);
                material.dispose();
            }
        });
    }

    // Little soldiers (up to 8) travelling one after another along a path.
    march(points, count, colour, ms, spread, onArrive) {
        const assets = this.ensureAssets();
        const material = new THREE.MeshBasicMaterial({ color: colour });
        const n = Math.max(1, Math.min(count, 8));
        const travel = Math.max(150, ms * 0.6);
        const gap = n > 1 ? (ms - travel) / (n - 1) : 0;
        const start = performance.now();
        const troops = [];
        for (let i = 0; i < n; i++) {
            const mesh = new THREE.Mesh(assets.ball, material);
            mesh.scale.setScalar(0.017);
            mesh.visible = false;
            this.scene.add(mesh);
            troops.push({ mesh, dx: (Math.random() - 0.5) * spread, dy: (Math.random() - 0.5) * spread, dz: (Math.random() - 0.5) * spread });
        }
        let arrived = false;
        this.effects.push({
            update: (now) => {
                let alive = false;
                troops.forEach((t, i) => {
                    const u = (now - start - i * gap) / travel;
                    if (u < 1) alive = true;
                    t.mesh.visible = u > 0 && u < 1;
                    if (t.mesh.visible) {
                        const p = geo.pointAlong(points, u);
                        t.mesh.position.set(p.x + t.dx, p.y + t.dy, p.z + t.dz);
                    }
                });
                if (!alive && !arrived) { arrived = true; if (onArrive) onArrive(); }
                return alive;
            },
            dispose: () => {
                for (const t of troops) this.scene.remove(t.mesh);
                material.dispose();
            }
        });
    }

    // Soldiers marching from one country to another (conquest, or moving soldiers).
    sendTroops(fromCode, toCode, count, colour, ms) {
        const a = this.markers.get(fromCode), b = this.markers.get(toCode);
        if (!a || !b) return;
        const path = geo.arcPoints(a.surface, b.surface, 40, 0.2, R * 1.03);
        this.march(path, count, colour, ms, 0.01, () => this.flash(toCode, colour));
    }

    // Reinforcements falling in from above onto a country.
    dropReinforcements(code, count, colour, ms) {
        const m = this.markers.get(code);
        if (!m) return;
        const at = (r) => ({ x: m.normal.x * r, y: m.normal.y * r, z: m.normal.z * r });
        this.march([at(R + 0.7), at(R + m.height + 0.03)], count, colour, ms, 0.05, () => this.flash(code, colour));
    }

    // Stops every running animation (used when playback has caught up with the server).
    clearEffects() {
        for (const e of this.effects) e.dispose();
        this.effects = [];
        this.dice = [];
    }

    // ---------- loop ----------

    resize() {
        const w = this.container.clientWidth || 600, h = this.container.clientHeight || 500;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    tick() {
        if (!this.running) return;
        requestAnimationFrame(this.tick);
        const dt = Math.min(0.1, this.clock.getDelta());
        const now = performance.now();

        if (this.focus) {
            this.camera.position.lerp(this.focus.target, this.fast ? 0.2 : 0.07);
            this.camera.position.setLength(this.focus.dist);
            if (this.camera.position.distanceTo(this.focus.target) < 0.01) this.focus = null;
        }
        this.controls.autoRotate = !reduceMotion && !this.focus && !this.battle && now - this.lastTouched > 4000;
        this.controls.update();

        if (this.battle) {
            this.battle.t = (this.battle.t + dt * (this.fast ? 2.4 : 0.9)) % 1;
            const n = this.battle.pts.length - 1, f = this.battle.t * n, i = Math.min(n - 1, Math.floor(f));
            this.battle.pulse.position.lerpVectors(this.battle.pts[i], this.battle.pts[i + 1], f - i);
        }

        for (let i = this.flashes.length - 1; i >= 0; i--) {
            const fl = this.flashes[i], age = (now - fl.start) / 900;
            if (age >= 1) { fl.group.remove(fl.ring); fl.ring.geometry.dispose(); this.flashes.splice(i, 1); continue; }
            fl.ring.scale.setScalar(1 + age * 5);
            fl.ring.material.opacity = 1 - age;
        }

        for (let i = this.effects.length - 1; i >= 0; i--) {
            if (!this.effects[i].update(now)) { this.effects[i].dispose(); this.effects.splice(i, 1); }
        }

        this.renderer.render(this.scene, this.camera);
        this.placeLabels();
    }

    // Moves each HTML label to the top of its pillar; hides it on the far side of the globe.
    placeLabels() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        const cam = this.camera.position;
        const v = new THREE.Vector3();
        for (const m of this.markers.values()) {
            const facing = geo.isFacing(m.surface, cam, R);
            m.label.style.display = facing ? '' : 'none';
            if (!facing) continue;
            v.copy(m.normal).multiplyScalar(R + m.height + 0.04).project(this.camera);
            m.label.style.transform = 'translate(' + Math.round((v.x * 0.5 + 0.5) * w) + 'px,' +
                Math.round((-v.y * 0.5 + 0.5) * h) + 'px) translate(-50%,-100%)';
        }
    }

    dispose() {
        this.running = false;
        this.clearEffects();
        if (this.assets) {
            for (const t of this.assets.textures) t.dispose();
            this.assets.die.dispose();
            this.assets.ball.dispose();
        }
        this.observer.disconnect();
        this.controls.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
