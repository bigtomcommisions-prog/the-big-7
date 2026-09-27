import * as THREE from 'three';
import {
  ACCESSORIES, BODY_TYPES, CHARACTER_PRESETS, HAIR_STYLES, SKIN_TONES,
  type Appearance,
} from '@hearthvale/shared';
import { VoxelCharacter } from '../game/assets/character.ts';
import { h } from './dom.ts';
import { icon } from './icons.ts';

const COLOR_SWATCHES = ['#e25d5d', '#f28f3b', '#e3a53c', '#f2c14e', '#7cc47f', '#5fb3b3', '#4f86c6', '#6f7ee8', '#9b7fd6', '#ff8fb1', '#f4f1ea', '#3b3355', '#2f2a28', '#6b4a32'];
const HAIR_SWATCHES = ['#2f2a28', '#1e1b1a', '#6b4a32', '#c2703d', '#f2c14e', '#f4f1ea', '#e25d5d', '#9b7fd6', '#4f86c6', '#7cc47f'];

/**
 * Character picker/customiser modal with a live rotating preview.
 * Resolves with the chosen appearance, or null if cancelled (only when cancellable).
 */
export function openCharacterEditor(root: HTMLElement, initial: Appearance, opts: { firstTime?: boolean } = {}): Promise<Appearance | null> {
  return new Promise((resolve) => {
    let a: Appearance = { ...initial };

    // Preview renderer
    const previewEl = h('div', { class: 'char-preview' });
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    previewEl.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#9ccf7a', 1.6));
    const dl = new THREE.DirectionalLight('#fff0d8', 1.8);
    dl.position.set(2, 4, 3);
    scene.add(dl);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.2, 16), new THREE.MeshLambertMaterial({ color: '#8fcf6a' }));
    pedestal.position.y = -0.1;
    scene.add(pedestal);
    const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    cam.position.set(0, 1.4, 4.6);
    cam.lookAt(0, 0.95, 0);
    const character = new VoxelCharacter(a);
    scene.add(character.root);
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      const w = previewEl.clientWidth, hh = previewEl.clientHeight;
      if (w && hh && (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio()))) {
        renderer.setSize(w, hh, false);
        cam.aspect = w / hh;
        cam.updateProjectionMatrix();
      }
      character.root.rotation.y += dt * 0.6;
      character.animate('idle', dt);
      renderer.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const controls = h('div');
    const update = (patch: Partial<Appearance>) => {
      a = { ...a, ...patch };
      character.setAppearance(a);
      renderControls();
    };

    const chips = <T extends string>(values: readonly T[], current: T, onPick: (v: T) => void) =>
      h('div', { class: 'chips' }, ...values.map((v) => h('button', { class: `chip ${v === current ? 'selected' : ''}`, type: 'button', onclick: () => onPick(v) }, v)));
    const swatches = (values: readonly string[], current: string, onPick: (v: string) => void) => {
      const picker = h('input', { type: 'color', value: current, title: 'Custom colour' });
      picker.addEventListener('input', () => onPick(picker.value));
      return h('div', { class: 'swatches' },
        ...values.map((v) => h('button', { class: `swatch ${v.toLowerCase() === current.toLowerCase() ? 'selected' : ''}`, type: 'button', style: `background:${v}`, title: v, onclick: () => onPick(v) })),
        picker);
    };
    const field = (label: string, ...children: Node[]) => h('div', { class: 'field' }, h('label', {}, label), ...children);

    function renderControls() {
      controls.replaceChildren(
        h('div', { class: 'presets' }, ...CHARACTER_PRESETS.map((p) => h('button', { class: 'btn small', type: 'button', onclick: () => update(p.appearance) }, p.name))),
        field('Body', chips(BODY_TYPES, a.body, (body) => update({ body }))),
        field('Skin', swatches(SKIN_TONES, a.skin, (skin) => update({ skin }))),
        field('Hair', chips(HAIR_STYLES, a.hair, (hair) => update({ hair })), swatches(HAIR_SWATCHES, a.hairColor, (hairColor) => update({ hairColor }))),
        field('Top', swatches(COLOR_SWATCHES, a.shirt, (shirt) => update({ shirt }))),
        field('Trousers', swatches(COLOR_SWATCHES, a.pants, (pants) => update({ pants }))),
        field('Shoes', swatches(COLOR_SWATCHES, a.shoes, (shoes) => update({ shoes }))),
        field('Accessory', chips(ACCESSORIES, a.accessory, (accessory) => update({ accessory })), swatches(COLOR_SWATCHES, a.accessoryColor, (accessoryColor) => update({ accessoryColor }))),
      );
    }
    renderControls();

    const finish = (result: Appearance | null) => {
      cancelAnimationFrame(raf);
      character.dispose();
      renderer.dispose();
      backdrop.remove();
      resolve(result);
    };

    const backdrop = h('div', { class: 'modal-backdrop' },
      h('div', { class: 'modal panel', role: 'dialog', 'aria-label': 'Character' },
        opts.firstTime ? null : h('button', { class: 'btn icon-btn small close', title: 'Close', onclick: () => finish(null) }, icon('close')),
        h('h2', {}, opts.firstTime ? 'Choose your villager' : 'Your character'),
        h('div', { class: 'char-layout' },
          h('div', {}, previewEl,
            h('div', { style: 'display:flex;gap:8px;margin-top:12px' },
              h('button', { class: 'btn small', type: 'button', onclick: () => {
                const p = CHARACTER_PRESETS[Math.floor(Math.random() * CHARACTER_PRESETS.length)]!.appearance;
                const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;
                update({ ...p, hair: pick(HAIR_STYLES), accessory: pick(ACCESSORIES), shirt: pick(COLOR_SWATCHES), pants: pick(COLOR_SWATCHES), skin: pick(SKIN_TONES) });
              } }, icon('dice'), 'Surprise me'),
              h('button', { class: 'btn primary', type: 'button', style: 'flex:1', onclick: () => finish(a) }, opts.firstTime ? 'Enter the world' : 'Save'))),
          controls)));
    root.append(backdrop);
  });
}
