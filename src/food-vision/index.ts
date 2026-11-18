// M7b food-vision public API. Importing this does not load MediaPipe: the classifier imports
// @mediapipe/tasks-vision lazily on the first load / validate.
export {
  CLASS_LABELS,
  CLASS_MAP,
  classForDish,
  dishesForLabel,
  type ClassMap,
  type FoodClass,
} from './classMap';
export {
  DEFAULT_THRESHOLD,
  decide,
  type DecideOption,
  type DecideOptions,
  type Decision,
  type ScoredLabel,
} from './decide';
export {
  checkLabels,
  disposeFoodClassifier,
  loadFoodClassifier,
  readModelLabels,
  validateModel,
  type ClassifyResult,
  type Delegate,
  type FoodClassifier,
  type FoodModelSource,
  type ModelCheck,
} from './classifier';
