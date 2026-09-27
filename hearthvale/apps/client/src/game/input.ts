import { isTyping } from '../ui/dom.ts';

/**
 * Keyboard + mouse state. Movement keys use `event.code` so WASD works on any keyboard layout.
 * Camera look: hold left or right mouse button on the world and drag.
 */
export class Input {
  private keys = new Set<string>();
  lookDX = 0;
  lookDY = 0;
  wheel = 0;
  private dragging = false;
  private pressed = new Set<string>();
  private released = new Set<string>();

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping()) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!this.keys.has(e.code)) this.pressed.add(e.code);
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (this.keys.has(e.code)) this.released.add(e.code);
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    for (const k of this.keys) this.released.add(k);
    this.keys.clear();
    this.dragging = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.dragging = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.canvas.focus();
    this.canvas.setPointerCapture?.(e.pointerId);
  };

  private onPointerUp = () => {
    this.dragging = false;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.lookDX += e.movementX;
    this.lookDY += e.movementY;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.wheel += Math.sign(e.deltaY);
  };

  down(code: string) {
    return !isTyping() && this.keys.has(code);
  }

  /** True once per key press. */
  consumePress(code: string) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had && !isTyping();
  }

  consumeRelease(code: string) {
    const had = this.released.has(code);
    this.released.delete(code);
    return had;
  }

  /** Called once per frame after all consumers have read this frame's input. */
  endFrame() {
    this.lookDX = this.lookDY = this.wheel = 0;
    this.pressed.clear();
    this.released.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointermove', this.onPointerMove);
  }
}
