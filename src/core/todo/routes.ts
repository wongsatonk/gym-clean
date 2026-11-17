// M12 slice 1c: the deep links a "Try it" can open (AppRoute as runtime data).
import type { AppRoute } from '../types';

/** Every AppRoute once; the Record makes a new route in types.ts fail to compile here. */
const ROUTES: Record<AppRoute, true> = {
  today: true,
  fuel: true,
  coach: true,
  calendar: true,
  settings: true,
  'settings/health': true,
  'settings/myGym': true,
  'settings/foodPhotos': true,
  'settings/devlog': true,
  'settings/goal': true,
  'settings/progressPhotos': true,
  'fuel/measurements': true,
  intake: true,
  todos: true,
};

export const APP_ROUTES: readonly AppRoute[] = Object.keys(ROUTES) as AppRoute[];

export function isAppRoute(v: string): v is AppRoute {
  return Object.prototype.hasOwnProperty.call(ROUTES, v);
}
