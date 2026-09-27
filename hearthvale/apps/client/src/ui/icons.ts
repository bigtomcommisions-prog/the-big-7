import {
  ChevronDown, CircleDot, Dices, DoorOpen, Hand, HeadphoneOff, Headphones, Link, MessageCircle, Mic, MicOff, Moon,
  Paperclip, RefreshCw, Settings, Shirt, Sparkles, Trees, TriangleAlert, User, Volume2, X,
  createElement, type IconNode,
} from 'lucide';

/** The icons the UI uses (Lucide, MIT). Import-by-name keeps the bundle to just these. */
export const ICONS = {
  mic: Mic,
  micOff: MicOff,
  headphones: Headphones,
  headphonesOff: HeadphoneOff,
  voice: Volume2,
  attachment: Paperclip,
  away: Moon,
  sparkles: Sparkles,
  message: MessageCircle,
  character: Shirt,
  settings: Settings,
  leave: DoorOpen,
  link: Link,
  live: CircleDot,
  close: X,
  dice: Dices,
  collapse: ChevronDown,
  wave: Hand,
  warning: TriangleAlert,
  refresh: RefreshCw,
  world: Trees,
  account: User,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

/** An inline SVG icon that inherits the surrounding text colour and scales with font size. */
export function icon(name: IconName, size = '1.1em'): SVGElement {
  const el = createElement(ICONS[name], { width: size, height: size, 'stroke-width': 2.25, 'aria-hidden': 'true' });
  el.classList.add('icon');
  return el;
}

/** Draw an icon onto a 2D canvas (used for in-world signs). `size` is in canvas pixels. */
export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.25;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [tag, attrs] of ICONS[name]) {
    const a = attrs as Record<string, string | number>;
    const p = new Path2D();
    if (tag === 'path') p.addPath(new Path2D(String(a.d)));
    else if (tag === 'circle') p.arc(Number(a.cx), Number(a.cy), Number(a.r), 0, Math.PI * 2);
    else if (tag === 'line') {
      p.moveTo(Number(a.x1), Number(a.y1));
      p.lineTo(Number(a.x2), Number(a.y2));
    } else if (tag === 'rect') p.rect(Number(a.x), Number(a.y), Number(a.width), Number(a.height));
    else continue;
    ctx.stroke(p);
  }
  ctx.restore();
}
