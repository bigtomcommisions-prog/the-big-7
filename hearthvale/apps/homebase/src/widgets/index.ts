import { clock, greeting, links, notes, quote, search, todo } from './basic.ts';
import { currency, markets, weather } from './data.ts';
import { breathe, calendar, countdown, moon, pomodoro, progress, stopwatch, worldclock } from './time.ts';
import { calculator, photo } from './tools.ts';
import type { WidgetDef } from './types.ts';

export const WIDGETS: WidgetDef[] = [
  clock, greeting, search, links, weather, worldclock, countdown, notes, todo, pomodoro, calendar,
  quote, calculator, currency, markets, moon, progress, stopwatch, breathe, photo,
];

export const widgetByType = new Map(WIDGETS.map((w) => [w.type, w]));
