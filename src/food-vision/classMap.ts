// M7b: classifier label → Thai dish ids. classMap.json is the single source of truth, shared with
// the Python pipeline in ml/ (labels = model output labels, in this order). DOM-free.
import raw from './classMap.json';

export interface FoodClass {
  /** `thai:*` dish ids; the first is the default, the rest are look-alike variants. */
  dishes: string[];
  /** Source class names per dataset that train this label (e.g. `{ thfood50: ['PadThai'] }`). */
  datasets?: Record<string, string[]>;
}

export interface ClassMap {
  version: number;
  classes: Record<string, FoodClass>;
}

/** Lower snake ASCII, starting with a letter. */
export const LABEL_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const DISH_PATTERN = /^thai:[a-z0-9-]+$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Validates an untrusted class map; throws with a reason on the first problem. */
export function parseClassMap(value: unknown): ClassMap {
  if (!isRecord(value) || !isRecord(value.classes)) throw new Error('classMap: missing classes');
  const version = typeof value.version === 'number' ? value.version : 1;
  const classes: Record<string, FoodClass> = Object.create(null) as Record<string, FoodClass>;
  const owner = new Map<string, string>();
  for (const [label, entry] of Object.entries(value.classes)) {
    if (!LABEL_PATTERN.test(label)) throw new Error(`classMap: bad label "${label}"`);
    if (!isRecord(entry) || !isStringArray(entry.dishes) || entry.dishes.length === 0) {
      throw new Error(`classMap: ${label} needs at least one dish`);
    }
    for (const id of entry.dishes) {
      if (!DISH_PATTERN.test(id)) throw new Error(`classMap: ${label} has bad dish id "${id}"`);
      const prev = owner.get(id);
      if (prev !== undefined) throw new Error(`classMap: ${id} is in ${prev} and ${label}`);
      owner.set(id, label);
    }
    const cls: FoodClass = { dishes: [...entry.dishes] };
    if (entry.datasets !== undefined) {
      if (!isRecord(entry.datasets) || !Object.values(entry.datasets).every(isStringArray)) {
        throw new Error(`classMap: ${label} has bad datasets`);
      }
      cls.datasets = entry.datasets as Record<string, string[]>;
    }
    classes[label] = cls;
  }
  return { version, classes };
}

export const CLASS_MAP: ClassMap = parseClassMap(raw);
export const CLASS_LABELS: readonly string[] = Object.keys(CLASS_MAP.classes);

const DISH_TO_CLASS = new Map<string, string>();
for (const label of CLASS_LABELS) {
  for (const id of CLASS_MAP.classes[label]?.dishes ?? []) DISH_TO_CLASS.set(id, label);
}

/** Dish ids for a classifier label (default first); [] for an unknown label. */
export function dishesForLabel(label: string, map: ClassMap = CLASS_MAP): readonly string[] {
  return Object.hasOwn(map.classes, label) ? (map.classes[label]?.dishes ?? []) : [];
}

/** The classifier label that covers a dish, if the camera knows it. */
export function classForDish(dishId: string): string | undefined {
  return DISH_TO_CLASS.get(dishId);
}
