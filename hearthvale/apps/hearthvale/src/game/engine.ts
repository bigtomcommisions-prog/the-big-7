import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { VoxelBuilder } from './voxel.ts';

const SKY_TOP = new THREE.Color('#86c3e8');
const SKY_HORIZON = new THREE.Color('#fbe2c2');
const FOG = new THREE.Color('#e9e4d0');

function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** Renderer, scene, lighting and atmosphere. Knows nothing about Discord. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly labels: CSS2DRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
  readonly sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  private skyUniforms: { top: { value: THREE.Color }; horizon: { value: THREE.Color } };
  private sky: THREE.Mesh;
  private clouds = new THREE.Group();
  private motes: THREE.Points;
  private moteBase: Float32Array;
  private onResize = () => this.resize();

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.tabIndex = 0;
    container.append(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    container.append(this.labels.domElement);

    this.scene.fog = new THREE.Fog(FOG.clone(), 70, 230);
    this.scene.background = FOG.clone();

    // Lighting: warm afternoon sun + sky/ground bounce
    this.hemi = new THREE.HemisphereLight('#dff0ff', '#86b35d', 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffe0b5', 2.4);
    this.sun.position.set(40, 70, 25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -45; s.right = 45; s.top = 45; s.bottom = -45; s.near = 1; s.far = 200;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.ambient = new THREE.AmbientLight('#fff4e0', 0.25);
    this.scene.add(this.ambient);

    // Sky dome
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: (this.skyUniforms = { top: { value: SKY_TOP.clone() }, horizon: { value: SKY_HORIZON.clone() } }),
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.08,0.0,1.0); gl_FragColor = vec4(mix(horizon, top, pow(h,0.8)),1.0); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), skyMat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    // Puffy voxel clouds
    for (let i = 0; i < 14; i++) {
      const b = new VoxelBuilder(0.03, i + 1);
      const n = 3 + (i % 3);
      for (let k = 0; k < n; k++) b.box(k * 4 - n * 2, (k % 2) * 1.5, (k % 3) - 1, 6 + (k % 2) * 3, 3, 5, '#ffffff');
      const c = new THREE.Mesh(b.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92 }));
      const a = (i / 14) * Math.PI * 2;
      c.position.set(Math.cos(a) * (150 + (i % 4) * 40), 70 + (i % 5) * 8, Math.sin(a) * (150 + (i % 3) * 50));
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);

    // Floating pollen / fireflies around the player
    const N = 160;
    this.moteBase = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) this.moteBase.set([(Math.random() - 0.5) * 60, Math.random() * 6 + 0.5, (Math.random() - 0.5) * 60], i * 3);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.moteBase), 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({
      color: '#fff3b0', size: 0.12, map: dotTexture(), alphaTest: 0.01, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);

    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  /** Dim or brighten the whole world: exposure plus sky and fog colours (which aren't tone-mapped). */
  setBrightness(b: number) {
    // Lights scale linearly and exposure by √b, so the slider feels roughly even across its range.
    this.hemi.intensity = 1.25 * b;
    this.sun.intensity = 2.4 * b;
    this.ambient.intensity = 0.25 * b;
    this.renderer.toneMappingExposure = 1.05 * Math.sqrt(b);
    this.skyUniforms.top.value.copy(SKY_TOP).multiplyScalar(b);
    this.skyUniforms.horizon.value.copy(SKY_HORIZON).multiplyScalar(b);
    (this.scene.fog as THREE.Fog).color.copy(FOG).multiplyScalar(b);
    (this.scene.background as THREE.Color).copy(FOG).multiplyScalar(b);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Keep the sun's shadow frustum and atmosphere centred on the player. */
  follow(target: THREE.Vector3, time: number) {
    this.sun.position.set(target.x + 40, 70, target.z + 25);
    this.sun.target.position.copy(target);
    this.sky.position.copy(this.camera.position);
    this.clouds.rotation.y = time * 0.004;
    const pos = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const bx = this.moteBase[i]!, by = this.moteBase[i + 1]!, bz = this.moteBase[i + 2]!;
      // wrap motes around the player so there are always some nearby
      const wx = ((((bx + time * 0.3 - target.x) % 60) + 90) % 60) - 30;
      const wz = ((((bz - target.z) % 60) + 90) % 60) - 30;
      arr[i] = target.x + wx + Math.sin(time * 0.7 + i) * 0.4;
      arr[i + 1] = by + 1.5 + Math.sin(time * 0.9 + i * 0.3) * 0.5;
      arr[i + 2] = target.z + wz + Math.cos(time * 0.6 + i) * 0.4;
    }
    pos.needsUpdate = true;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}
