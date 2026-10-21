// The 3D globe. It only DISPLAYS the game: the server decides every outcome.
// page.js tells it what to show (board colours and soldier counts, a battle arc,
// flashes, where to look) and it tells page.js when a country is clicked.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './geo.js';

const geo = window.GameGeo;
const R = 1;                                         // globe radius
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
        this.observer.disconnect();
        this.controls.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
