// The 3D globe. It only DISPLAYS the game: the server decides every outcome.
// page.js tells it what to show (board colours and soldier counts, a battle arc,
// flashes, where to look) and it tells page.js when a country is clicked.
// Three.js is imported by path, not by a short name through an import map: ASP.NET's script tag helper
// rewrites <script type="importmap"> in a Razor page, so the short name "three" would not be found.
import * as THREE from '/lib/three/three.module.min.js';
import { OrbitControls } from '/lib/three/addons/controls/OrbitControls.js';
import './geo.js';
import './art.js';

const geo = window.GameGeo;
const art = window.GameArt;
const R = 1;                                         // globe radius
const UP = new THREE.Vector3(0, 1, 0);
const SOLDIER_H = 0.15;                              // soldier height; the globe has radius 1
const SOLDIER_W = SOLDIER_H * 20 / 24;
const FLAG_W = 0.075, FLAG_H = 0.056;                // narrower than the space between soldiers, so flags never overlap
const SQUAD_TOP = 0.30;                              // top of the flags above the ground
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Globe {
    // container: element that receives the canvas; overlay: element for the labels.
    // data: { coords: { code: [lat, lon] }, landDots: [[lat, lon], ...],
    //         flags: { image, cell: [w, h], cols, map: { code: index } } }   (flags is optional)
    constructor(container, overlay, data) {
        this.container = container;
        this.overlay = overlay;
        this.coords = data.coords;
        this.flags = data.flags || null;
        this.soldierTextures = new Map();   // one picture per uniform and pose
        this.flagTextures = new Map();      // one picture per flag
        this.fighting = null;               // the two countries currently in a battle
        this.deathDelay = 0;                // how long (ms) before a lost soldier falls
        this.spawnDelay = 0;                // how long (ms) before a new soldier appears
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

    // Creates the ground disc and label for each country in this game; the soldiers come with update().
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

            const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 32),
                new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
            shadow.rotation.x = -Math.PI / 2;
            shadow.position.y = 0.002;
            const ring = new THREE.Mesh(new THREE.RingGeometry(0.21, 0.235, 40),
                new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide }));
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.004;
            group.add(shadow, ring);
            this.scene.add(group);

            const label = document.createElement('button');
            label.type = 'button';
            label.className = 'globe-label';
            label.innerHTML = '<span class="nm"></span><span class="ct"></span>';
            label.querySelector('.nm').textContent = c.name;
            label.addEventListener('click', () => this.onPick(c.code));
            this.overlay.appendChild(label);

            this.markers.set(c.code, {
                code: c.code, name: c.name, surface, normal, group, ring, shadow, label,
                height: SQUAD_TOP, squad: [], uniform: -1, flagCode: null, painted: false, baseScale: 0.6, selected: false
            });
        }
    }

    // board: { countries: { code: { ownerPlayerId, soldiers } } }, players: snapshot players
    // (each with turnOrder, isHuman and homeCountryCode: the flag the player's soldiers carry).
    update(board, players) {
        const byId = new Map(players.map(p => [p.playerId, p]));
        for (const m of this.markers.values()) {
            const st = board.countries[m.code];
            if (!st) continue;
            const owner = byId.get(st.ownerPlayerId);
            const colour = owner ? geo.playerColor(owner.turnOrder, owner.isHuman) : '#888888';
            const uniform = owner ? geo.uniformIndex(owner.turnOrder, owner.isHuman) : 2;
            m.ring.material.color.set(colour);
            m.label.style.borderColor = colour;
            m.label.querySelector('.ct').textContent = st.soldiers;
            m.label.querySelector('.ct').style.background = colour;
            this.setSquad(m, st.soldiers, uniform, owner ? owner.homeCountryCode || null : null);
            m.painted = true;
        }
    }

    // Highlights the countries the player has picked (bigger ring, white outline on the label).
    setSelected(codes) {
        for (const m of this.markers.values()) {
            const on = codes.includes(m.code);
            m.selected = on;
            m.label.classList.toggle('selected', on);
            this.sizeGround(m);
        }
    }

    // ---------- soldiers ----------

    // One picture per uniform and pose, drawn in code and kept sharp (no smoothing) like pixel art.
    soldierTexture(uniform, frame) {
        const key = uniform + ':' + frame;
        let texture = this.soldierTextures.get(key);
        if (!texture) {
            const canvas = document.createElement('canvas');
            canvas.width = art.WIDTH;
            canvas.height = art.HEIGHT;
            art.paintSoldier(canvas.getContext('2d'), frame, Math.max(0, uniform), 1);
            texture = new THREE.CanvasTexture(canvas);
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.generateMipmaps = false;
            texture.colorSpace = THREE.SRGBColorSpace;
            this.soldierTextures.set(key, texture);
        }
        return texture;
    }

    // A country's flag, cut out of the flag sheet. A plain grey flag stands in if there is none.
    flagTexture(code) {
        const key = code || '?';
        let texture = this.flagTextures.get(key);
        if (!texture) {
            const f = this.flags;
            const canvas = document.createElement('canvas');
            canvas.width = f ? f.cell[0] : 48;
            canvas.height = f ? f.cell[1] : 36;
            const g = canvas.getContext('2d');
            const index = f && code ? f.map[code] : undefined;
            if (index !== undefined) {
                g.drawImage(f.image, (index % f.cols) * f.cell[0], Math.floor(index / f.cols) * f.cell[1], f.cell[0], f.cell[1],
                    0, 0, f.cell[0], f.cell[1]);
            } else {
                g.fillStyle = '#0d0d10'; g.fillRect(0, 0, canvas.width, canvas.height);
                g.fillStyle = '#8a8f98'; g.fillRect(1, 1, canvas.width - 2, canvas.height - 2);
            }
            texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            this.flagTextures.set(key, texture);
        }
        return texture;
    }

    // Shows min(count, 5) soldiers on the country, in the owner's uniform, each with the owner's flag
    // above their head. Fewer soldiers than before: the extra ones fall. More: new ones appear.
    setSquad(m, count, uniform, flagCode) {
        const want = Math.min(Math.max(0, count), geo.MAX_SQUAD);
        const look = m.uniform !== uniform || m.flagCode !== flagCode;
        m.uniform = uniform;
        m.flagCode = flagCode;
        if (look) for (const s of m.squad) this.dress(s, uniform, flagCode);

        while (m.squad.length > want) this.fall(m, m.squad.pop());
        while (m.squad.length < want) m.squad.push(this.spawnSoldier(m, uniform, flagCode));

        const spots = geo.squadOffsets(want);
        m.squad.forEach((s, i) => s.target.set(spots[i].x, 0, spots[i].z));
        m.baseScale = 0.4 + 0.15 * Math.max(1, want);       // the ring and shadow grow with the squad
        this.sizeGround(m);
    }

    sizeGround(m) {
        const k = m.baseScale * (m.selected ? 1.2 : 1);
        m.ring.scale.setScalar(k);
        m.shadow.scale.setScalar(k);
    }

    spawnSoldier(m, uniform, flagCode) {
        const soldier = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soldierTexture(uniform, 'idle'), alphaTest: 0.5 }));
        soldier.scale.set(SOLDIER_W, SOLDIER_H, 1);
        soldier.center.set(0.5, 0);                         // feet at the position
        const flag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flagTexture(flagCode), alphaTest: 0.1 }));
        flag.scale.set(FLAG_W, FLAG_H, 1);
        flag.center.set(0.5, 0);
        m.group.add(soldier, flag);

        const now = performance.now();
        const first = !m.painted;                           // the very first picture appears at once
        const appears = first ? 0 : now + (this.spawnDelay || 0);
        const s = {
            soldier, flag, uniform, flagCode, frame: 'idle', target: new THREE.Vector3(),
            phase: Math.random() * Math.PI * 2,
            appearAt: appears,
            bornAt: first ? -1e9 : appears
        };
        soldier.visible = flag.visible = first;
        return s;
    }

    dress(s, uniform, flagCode) {
        s.uniform = uniform;
        s.flagCode = flagCode;
        s.soldier.material.map = this.soldierTexture(uniform, s.frame);
        s.flag.material.map = this.flagTexture(flagCode);
    }

    setFrame(s, frame) {
        if (s.frame === frame) return;
        s.frame = frame;
        s.soldier.material.map = this.soldierTexture(s.uniform, frame);
    }

    // The camera's "up" in a country's own axes, so a flag can be put above a soldier's head on the screen.
    localUp(m) {
        this._up = this._up || new THREE.Vector3();
        this._q = this._q || new THREE.Quaternion();
        this._up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
        return this._up.applyQuaternion(this._q.copy(m.group.quaternion).invert());
    }

    // The camera's "right" along the ground of a country (in its own axes), so a row of soldiers stays
    // level on the screen however the globe is turned.
    localRight(m) {
        this._right = this._right || new THREE.Vector3();
        this._rq = this._rq || new THREE.Quaternion();
        this._right.set(1, 0, 0).applyQuaternion(this.camera.quaternion).applyQuaternion(this._rq.copy(m.group.quaternion).invert());
        this._right.y = 0;                                  // keep them on the ground
        if (this._right.lengthSq() < 1e-4) return this._right.set(1, 0, 0);
        return this._right.normalize();
    }

    // Puts a soldier's flag just above the head, fluttering a little.
    placeFlag(s, up, t, lift) {
        s.flag.position.copy(s.soldier.position)
            .addScaledVector(up, s.soldier.scale.y + 0.012 + Math.sin(t * 3 + s.phase) * 0.005 + (lift || 0));
        s.flag.material.rotation = Math.sin(t * 3.4 + s.phase) * 0.12;
    }

    // A lost soldier tips over and fades (after deathDelay, so it matches the dice landing).
    fall(m, s) {
        const start = performance.now() + (this.deathDelay || 0);
        const side = Math.random() < 0.5 ? -1 : 1;
        s.soldier.material.transparent = true;
        s.flag.material.transparent = true;
        this.effects.push({
            update: (now) => {
                if (now < start) return true;
                const k = Math.min(1, (now - start) / 600);
                s.soldier.material.rotation = side * k * 1.4;
                s.soldier.material.opacity = 1 - k * k;
                s.flag.material.opacity = 1 - k;
                this.placeFlag(s, this.localUp(m), now / 1000, k * 0.08);
                return k < 1;
            },
            dispose: () => {
                m.group.remove(s.soldier, s.flag);
                s.soldier.material.dispose();
                s.flag.material.dispose();
            }
        });
    }

    // Every frame: soldiers settle into place, bob, shoot when their country is in a battle, and wave their flags.
    animateSquads(now) {
        const t = now / 1000;
        for (const m of this.markers.values()) {
            if (m.squad.length === 0) continue;
            const up = this.localUp(m);
            const right = this.localRight(m);
            const fighting = this.fighting && (m === this.fighting.a || m === this.fighting.d);
            for (const s of m.squad) {
                if (now < s.appearAt) { s.soldier.visible = s.flag.visible = false; continue; }
                s.soldier.visible = s.flag.visible = true;
                const pop = Math.min(1, 0.2 + 0.8 * Math.min(1, (now - s.bornAt) / 250));
                s.soldier.scale.set(SOLDIER_W * pop, SOLDIER_H * pop, 1);
                const p = s.soldier.position;
                const goalX = right.x * s.target.x - right.z * s.target.z;      // the row, turned to face the camera
                const goalZ = right.z * s.target.x + right.x * s.target.z;
                p.x += (goalX - p.x) * 0.2;
                p.z += (goalZ - p.z) * 0.2;
                p.y = 0.012 + Math.abs(Math.sin(t * 2.4 + s.phase)) * 0.006;
                this.setFrame(s, fighting && ((t * 3.2 + s.phase) % 1) > 0.7 ? 'fire' : 'idle');
                this.placeFlag(s, up, t);
            }
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
        this.fighting = { a, d };
    }

    clearBattle() {
        this.fighting = null;
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
            art.paintDieFace(canvas.getContext('2d'), 128, v, 1);        // watercolour paper with inked pips
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            textures.push(texture);
        }
        this.assets = {
            textures,
            die: new THREE.BoxGeometry(0.1, 0.1, 0.1),
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
            const baseY = marker.height + 0.08;
            mesh.position.set((i - (rolls.length - 1) / 2) * 0.13, baseY, 0);
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
                for (const b of bits) b.mesh.position.set(b.vx * t, 0.14 + b.vy * t - 0.12 * t * t, b.vz * t);
                material.opacity = 1 - t;
                return true;
            },
            dispose: () => {
                for (const b of bits) marker.group.remove(b.mesh);
                material.dispose();
            }
        });
    }

    // The camera's "up" in world space (for putting a flag above a soldier on the screen).
    cameraUp() {
        this._wup = this._wup || new THREE.Vector3();
        return this._wup.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    }

    // Pixel soldiers (up to 8), each with its flag, travelling one after another along a path.
    // look = { uniform, flagCode }. running: show the running steps (otherwise they stand, like when falling in).
    march(points, count, look, ms, spread, onArrive, running) {
        const n = Math.max(1, Math.min(count, 8));
        const travel = Math.max(150, ms * 0.6);
        const gap = n > 1 ? (ms - travel) / (n - 1) : 0;
        const start = performance.now();
        const size = 0.8;
        const troops = [];
        for (let i = 0; i < n; i++) {
            const soldier = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soldierTexture(look.uniform, 'idle'), alphaTest: 0.5 }));
            soldier.scale.set(SOLDIER_W * size, SOLDIER_H * size, 1);
            soldier.center.set(0.5, 0);
            soldier.visible = false;
            const flag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flagTexture(look.flagCode), alphaTest: 0.1 }));
            flag.scale.set(FLAG_W * size, FLAG_H * size, 1);
            flag.center.set(0.5, 0);
            flag.visible = false;
            this.scene.add(soldier, flag);
            troops.push({ soldier, flag, frame: 'idle', dx: (Math.random() - 0.5) * spread, dy: (Math.random() - 0.5) * spread, dz: (Math.random() - 0.5) * spread });
        }
        let arrived = false;
        this.effects.push({
            update: (now) => {
                const up = this.cameraUp();
                let alive = false;
                troops.forEach((t, i) => {
                    const u = (now - start - i * gap) / travel;
                    if (u < 1) alive = true;
                    const on = u > 0 && u < 1;
                    t.soldier.visible = t.flag.visible = on;
                    if (!on) return;
                    const p = geo.pointAlong(points, u);
                    t.soldier.position.set(p.x + t.dx, p.y + t.dy, p.z + t.dz);
                    const frame = running ? (Math.floor((now - start) / 130 + i) % 2 ? 'runA' : 'runB') : 'idle';
                    if (frame !== t.frame) { t.frame = frame; t.soldier.material.map = this.soldierTexture(look.uniform, frame); }
                    t.flag.position.copy(t.soldier.position).addScaledVector(up, SOLDIER_H * size + 0.012 + Math.sin(now / 1000 * 8 + i) * 0.004);
                    t.flag.material.rotation = Math.sin(now / 1000 * 6 + i) * 0.15;
                });
                if (!alive && !arrived) { arrived = true; if (onArrive) onArrive(); }
                return alive;
            },
            dispose: () => {
                for (const t of troops) {
                    this.scene.remove(t.soldier, t.flag);
                    t.soldier.material.dispose();
                    t.flag.material.dispose();
                }
            }
        });
    }

    // Soldiers running from one country to another (conquest, or moving soldiers), in the mover's uniform and flag.
    sendTroops(fromCode, toCode, count, colour, ms) {
        const a = this.markers.get(fromCode), b = this.markers.get(toCode);
        if (!a || !b) return;
        const path = geo.arcPoints(a.surface, b.surface, 40, 0.06, R * 1.012);
        this.march(path, count, { uniform: Math.max(0, a.uniform), flagCode: a.flagCode }, ms, 0.01, () => this.flash(toCode, colour), true);
    }

    // Reinforcements falling in from above onto a country, in its owner's uniform and flag.
    dropReinforcements(code, count, colour, ms) {
        const m = this.markers.get(code);
        if (!m) return;
        const at = (r) => ({ x: m.normal.x * r, y: m.normal.y * r, z: m.normal.z * r });
        this.march([at(R + 0.7), at(R + 0.02)], count, { uniform: Math.max(0, m.uniform), flagCode: m.flagCode }, ms, 0.05, () => this.flash(code, colour), false);
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

        this.animateSquads(now);

        for (let i = this.effects.length - 1; i >= 0; i--) {
            if (!this.effects[i].update(now)) { this.effects[i].dispose(); this.effects.splice(i, 1); }
        }

        this.renderer.render(this.scene, this.camera);
        this.placeLabels();
    }

    // Moves each HTML label to just under its soldiers; hides it on the far side of the globe.
    placeLabels() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        const cam = this.camera.position;
        const v = new THREE.Vector3();
        for (const m of this.markers.values()) {
            const facing = geo.isFacing(m.surface, cam, R);
            m.label.style.display = facing ? '' : 'none';
            if (!facing) continue;
            v.copy(m.normal).multiplyScalar(R).project(this.camera);
            m.label.style.transform = 'translate(' + Math.round((v.x * 0.5 + 0.5) * w) + 'px,' +
                Math.round((-v.y * 0.5 + 0.5) * h) + 'px) translate(-50%, 10px)';
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
        for (const t of this.soldierTextures.values()) t.dispose();
        for (const t of this.flagTextures.values()) t.dispose();
        this.observer.disconnect();
        this.controls.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
