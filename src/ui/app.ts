// App controller: owns the session state, renders screens, runs side effects
// (voice, wake lock, IndexedDB). All workout rules live in src/core/.
import { restCueText, restCuesBetween } from '../core/restCues';
import {
  currentPlanned,
  currentSide,
  currentWarmup,
  sideTurn,
  next,
  next as nextState,
  restElapsedMs,
  startSession,
  summarize,
  type SessionEvent,
  type SessionState,
} from '../core/session';
import type {
  GoalKind,
  Accent,
  ChatCard,
  ChatMessage,
  DayAdjust,
  FocusBlock,
  PeriodScore,
  BodyArea,
  DayFeel,
  DayOverride,
  FocusCueId,
  FoodSuggestion,
  Goal,
  Intake,
  PlanChange,
  PlannedExercise,
  ProgramDay,
  Proposal,
  ProposalAction,
  GymProfile,
  SetEffort,
  SetLog,
  TrainerKitSettings,
  TrainerState,
  OnboardingStep,
  LengthUnit,
  UnitPrefs,
  TextSize,
  OwnerMode,
  ShareLead,
} from '../core/types';
// M13: owner mode, About / credits, first launch, Story share.
import { isVisible, versionLine } from '../core/ownerMode';
import { APP_BUILD, APP_RELEASE } from '../core/version';
import { selfCheckScreen } from './screens/selfCheck';
import { defaultSelfCheckDeps, selfCheckRuns } from './selfCheckRuns';
import { resolveOwnerMode, setOwnerMode } from '../data/ownerMode';
import { aboutScreen } from './screens/about';
import { licensesView } from './screens/licenses';
import {
  insertAfterIntake,
  onboardingSteps,
  permissionCatchUpSteps,
  shouldOnboard,
  type OnboardingPermission,
} from '../core/onboarding';
import {
  INTAKE_SKIPPED_KEY,
  loadOnboardingFacts,
  loadPermissionCatchUp,
  markOnboarding,
  markPermissionCatchUp,
} from '../data/onboarding';
import { onboardingScreen, type OnboardingScreen } from './onboarding/welcome';
import { leadOptions, pickLead, shareStats } from '../core/progress/shareStats';
import { sharePreview } from './sharePreview';
import { doneMark } from './backButton';
import { isWarmup, warmupLabel, warmupLifts, warmupLine, workingSets } from '../core/warmup';
import { setupCuesFor } from '../core/setupCues';
import { mergeTrainerKit } from '../core/trainerKit/defaults';
import { summaryFoodIdea } from '../core/nutrition/nudges';
import {
  getDayFeel,
  getIntake,
  getTrainerKit,
  listDayFeels,
  listGoals,
  deleteGoal,
  saveDayFeel,
  saveGoal,
  saveIntake,
} from '../data/trainerKit/store';
import { LEARN_CARDS } from '../data/learnCards';
import { closeLearnCard, findLearnCard, openLearnCard } from './coach/learnCard';
import type { MealIdea } from './fuel/proteinNudge';
// ----- M12 1b wiring B -----
import { easyOnTreatment, proposeEasyOn } from '../core/trainer/actions/easyOn';
import { proposeStarterPlan } from '../core/trainer/actions/starterPlan';
import type { ActionContext } from '../core/trainer/actions/lighter';
import { intakeToChanges, normalizeIntake } from '../core/trainerKit/intake';
import { goalProgress, goalProgressText, suggestGoals } from '../core/trainerKit/goals';
import { reviewDue } from '../core/trainerKit/review';
import { deloadSuggested } from '../core/trainer/nextBlock';
import { todaysFeelOffers } from '../core/health/readiness';
import { e1rmSeries } from '../core/progress/e1rm';
import {
  addProgressPhoto,
  deleteAllProgressPhotos,
  deleteProgressPhoto,
  listProgressPhotos,
} from '../data/progressPhotos/store';
import {
  GYM_FILE_MIME,
  GYM_FILE_NAME,
  GYM_FILE_REASON_TEXT,
  exportGymFile,
  parseGymFile,
} from '../data/gymFile';
import {
  EASY_ON_TITLE,
  FUEL_TITLE,
  PLAN_TITLE_REBUILD,
  PLAN_TITLE_STARTER,
  areaList,
  intakeScreen,
  type IntakeChange,
  type IntakeChangeId,
} from './intake/intake';
import type { GoalCardItem, GoalCardProps } from './screens/goalCard';
import { createProgressPhotos, type ProgressPhotosView } from './photos/progressPhotos';
import { GYM_IMPORT_NOTHING, GYM_SHARED_NOTE, type GymImportPreview } from './screens/myGym';
import { defaultUnits, formatWeight, snapToStep, stepFor, type Unit } from '../core/units';
import { deviceLocale } from './deviceLocale';
import { shouldSpeakFocusCue } from '../core/focusCue';
import {
  adviceSpeakDue,
  adviceSpeakOnCommit,
  afterSetAdvice,
  coachSummary,
  type Advice,
} from '../core/advice';
import {
  bodyAreaLabel,
  bodyAreaOf,
  catalogExercises,
  cueFor,
  exerciseById,
  exerciseName,
  defaultGymProfile,
  equipmentItems,
  gymCanDo,
  missingKitLabels,
  preferredSwaps,
  program,
} from '../data/catalog';
import { missingKit as coreMissingKit } from '../core/trainer/equipment';
import { keepExercise, loadGymProfile, saveGymProfile } from '../data/gym';
import {
  blockAt,
  calendar,
  effectiveDay,
  localDate,
  programHash,
  seedPlan,
  upNext as trainerUpNext,
  type EffectiveDay,
  type EffectiveOptions,
  addDate,
} from '../core/trainer/plan';
import { applyProposal, resetToProgram, undoLast } from '../core/trainer/changes';
import {
  MID_SESSION_REPLY,
  QUICK_CHIPS,
  stallSince,
  starterChips,
  type CoachArgs,
  type CoachChipId,
  type CoachContext,
  type CoachInput,
  type CoachPhase,
  type QuickChipId,
} from '../core/trainer/coach';
import { isFocusExercise } from '../core/trainer/focusBlock';
import {
  dayCompletion,
  missedDay as coreMissedDay,
  monthCompletion,
  monthScore,
  weekScore,
  type CompletionInput,
  type MissedDay,
} from '../core/progress/completion';
import { recapDue } from '../core/progress/recap';
import { TRAINER_TOOLS } from '../core/trainer/tools';
import { createRouter, type CoachRouter } from '../data/brain/router';
import { rulesBrain } from '../data/brain/rules';
// M12 slice 2: Apple's on-device brain, the mic, reminders, the weekly check-in.
import {
  appleBrain,
  askApple,
  buildAppleRequest,
  type AppleDeps,
  type AppleTrace,
} from '../data/brain/apple';
import { coachNoteStore } from '../data/brain/notes';
import { runBrainEval } from '../data/brain/evalRunner';
import { brainInstructions } from '../core/trainer/brain/instructions';
import { micAllowed, sayFor, shouldSpeak } from '../core/trainer/speakRules';
import { mergeReminders, reminderPlan } from '../core/reminders/schedule';
import { CHECK_IN_QUESTIONS, CHECK_IN_SCALE, checkInDue } from '../core/checkIn/checkIn';
import { listCheckIns, saveCheckIn, skipCheckIn } from '../data/checkIn/store';
// Native modules load only inside the iPhone app (dynamic import in initSlice2).
import type { GymBrain } from '../native/gymBrain';
import type { Speech } from '../native/speech';
import type { Reminders } from '../native/reminders';
import type { MicProps } from './coach/micButton';
import { updateChatMic } from './coach/chat';
import type { CheckInAnswers, CheckInQuestionView } from './coach/checkInCard';
import { coachSettingsScreen, type BrainStatusView } from './screens/coachSettings';
import { remindersScreen, type NotificationPermission } from './screens/reminders';
import { brainEvalScreen, type BrainEvalProps, type BrainEvalTokens } from './screens/brainEval';
import {
  addMessage,
  clearChat,
  getCoachUi,
  listThread,
  patchCoachUi,
  pruneChat,
  updateCard,
  COACH_UI_KEY,
  type ChatCardPatch,
  type CoachUiState,
} from '../data/chat/store';
import { adjustSummary, rowAdjustNote } from '../core/trainer/replies';
import { detectStalls, stallLine } from '../core/trainer/actions/stall';
import type { TrainerCatalog } from '../core/trainer/swapCandidates';
import {
  commitChange,
  defaultProgramChanged,
  listChanges,
  loadTrainerState,
  saveTrainerState,
} from '../data/plan';
import {
  GymDb,
  finishSession,
  getExerciseNote,
  getCoachTips,
  getAccent,
  setAccent,
  getCoachVoice,
  sessionsSince,
  setsForExercises,
  setsForSessions,
  type SessionRow,
  getHandsFree,
  COACH_VOICE_DEFAULT,
  setCoachVoice,
  type CoachVoice,
  getSpokenCount,
  getUnitPrefs,
  getLengthUnit,
  lastSessionSets,
  lastWeights,
  saveExerciseNote,
  saveSessionNote,
  saveSet,
  setCoachTips,
  setHandsFree,
  setSpokenCount,
  setUnit,
  setUnitPrefs,
  setLengthUnit,
  getTextSize,
  setTextSize,
  startSessionRow,
  type ExerciseNoteRow,
  type SetRow,
} from '../data/db';
import { startDevLogSession, type DevLogRecorder } from '../data/devlog';
import {
  chat,
  coachTabScreen,
  splitReplyChips,
  WORKOUT_CHAT_CHIPS,
  type ChatActions,
  type ChatChip,
  type ChatProps,
} from './coach/chat';
import { calendarScreen, dayLong, shiftMonth } from './screens/calendar';
import { calendarDayScreen } from './screens/calendarDay';
import {
  renderShareMonth,
  shareMonth,
  shareMonthLayout,
  shareStoryLayout,
  type ShareSize,
} from './shareMonth';
import { saveFile } from './saveFile';
import { ONE_SIDED_COPY, otherSide } from '../core/exercises/oneSided';
import { oneSidedView } from './oneArm';
import { APP_NAME } from '../core/brand';
import { reducedMotion, screenEntrance, type EnterDir } from './motion';
import { undoToast, type UndoToast } from './coach/undoToast';
import { planChangesScreen } from './screens/planChanges';
import { myGymScreen } from './screens/myGym';
import {
  backupErrorText,
  backupFileName,
  backupPanel,
  type RestoreStep,
} from './screens/backupPanel';
import { BackupError, exportAll, importAll, validateBackup, type BackupFile } from '../data/backup';
import { alignRows, rowChanged } from '../core/trainer/rows';
import type { StallCardData } from './coachSummary';
import type { PreviewRow } from './screens/preview';
import { bodyMapSvg, pickView } from './bodyMap';
import type { Body3D } from './body3d/viewer';
import { badgesFor } from './badges';
import {
  createCameraView,
  type CameraTarget,
  type CameraView,
  type HandsFreeOptions,
} from './cameraView';
import { createHowToSheet } from './howToSheet';
import { silentHint } from './silentHint';
import { audioTestPanel, disposeAudioTest } from './audioTest';
import { createCoachTip } from './coachTip';
import { createCoachSummary } from './coachSummary';
import { createFocusSummary } from './focusSummary';
import { exerciseScreen as renderExercise } from './screens/exercise';
import { pauseSheet as renderPauseSheet } from './screens/pauseSheet';
import { previewScreen as renderPreview } from './screens/preview';
import { historyScreen as renderHistory } from './screens/history';
import { restScreen as renderRest } from './screens/rest';
import { exerciseHistory } from '../core/history';
import { settingsScreen as renderSettings, settingsRowButton } from './screens/settings';
import { summaryScreen as renderSummary } from './screens/summary';
import { createTodayMotion, todayScreen as renderToday, type TodayLast } from './screens/today';
import { icon } from './icons';
import { TABS, tabBar, type TabId } from './tabBar';
import { applyAccent } from './tokens';
import {
  doneDaysThisWeek,
  lastSession,
  newBests,
  sessionVolume,
  previousSameDaySession,
  STREAK_MIN_PER_WEEK,
  volumeVsLast,
  weekDots,
  weeklyStreak,
  type WeekDot,
} from '../core/stats';
import { createDevLogPanel, type DevLogPanelHandle } from './devLogPanel';
import { createLastSetCorrection, type LastSetCorrectionHandle } from './lastSetCorrection';
import { cameraInfo, oneSidedLimb, ruleStatus } from '../core/exercises';
// ---- M13c: Library, search, tappable badges, Practice, background, Claude card ----
import { equipmentGroupLabel, groupExercises } from '../core/library';
import {
  buildSearchIndex,
  exerciseSearchItems,
  learnSearchItems,
  search as searchIndex,
  type SearchIndex,
} from '../core/search';
import {
  personalQueryUsable,
  type PersonalKind,
  type PersonalResults,
} from '../core/searchPersonal';
import { personalSearch } from '../data/searchSources';
import { muscleLabel } from '../core/dayInfo';
import { createLibraryScreen, type LibraryHandle, type LibraryRow } from './screens/library';
import {
  detailHistoryOf,
  exerciseDetailScreen,
  type DetailHistory,
} from './screens/exerciseDetail';
import { settingsSearchItems, settingsSectionFor } from './screens/settingsIndex';
import { settingsSectionId } from './screens/settings';
import { closeCameraInfo, openCameraInfo } from './cameraInfoSheet';
import { howToContent } from './howToSheet';
import type { BadgeKind } from './badges';
import { applyBackground, backgroundStyle } from './backgroundPicker';
import { watchAmbient } from './motion';
import { claudeOfferFor, claudeOfferShown, claudeOutcomeOf } from '../core/trainer/claude/offer';
import { COULDNT_DO } from '../data/brain/apple';
import { REVEAL_MS, revealMessage } from './coach/chat';
import type { BackgroundStyle, ClaudeOffer, LibraryGroupBy, SearchHit } from '../core/types';
import { h } from './dom';
import { createCoachVoiceSettings } from './coachVoiceSettings';
import { createFuel } from './fuel/fuelController';
import { createFoodVisionHost } from './fuel/foodVisionHost';
import { createHealthHost } from './healthHost';
import { isAppRoute } from '../core/todo/routes';
import type {
  AppRoute,
  WorkSide,
  CheckIn,
  CoachSettings,
  ReminderKind,
  ReminderSettings,
  WhatsNewPage,
} from '../core/types';
import { noteSignal } from '../data/todos/store';
import { createTodoHost, nativeShell } from './todo/todoHost';
import { setPressFeel } from './iconButton';
import { installEdgeBack } from './gestures/edgeBack';
import { applyTextSize } from './textSizePicker';
import type { WhatsNewTour } from './todo/whatsNewTour';
import { voice } from './voice';
import { wakeLock } from './wakeLock';

const TICK_MS = 250;

type Sheet =
  | null
  | { kind: 'list' }
  | { kind: 'notes'; exerciseId: string }
  | { kind: 'body'; exerciseId: string };

/** M4e Today tiles (loaded with the up-next day). */
type TodayStats = {
  streakWeeks: number;
  weekDots: WeekDot[];
  last: TodayLast | null;
  doneThisWeek: Record<string, number>;
};

/** M12 Calendar: every session (the projection reads them), the finished ones and their sets. */
type CalendarData = { sessions: SessionRow[]; finished: SessionRow[]; sets: SetRow[]; t: number };

/**
 * M10 day preview: `day` is what Start runs. For today's day it's `effectiveDay` (with any adjust
 * override applied, `today: true`); for another day it's the plan day.
 */
type PreviewDay = {
  day: ProgramDay;
  planDay: ProgramDay;
  today: boolean;
  adjust: DayAdjust['kind'] | null;
  /** The adjust's row map (plan row id -> the id that runs instead), when it has one. */
  replaced: NonNullable<DayAdjust['replaced']>;
};

type View =
  | { screen: 'today'; upNextDayId: string | null; stats: TodayStats | null }
  | { screen: 'settings' }
  | { screen: 'fuel' }
  | { screen: 'planChanges' }
  | { screen: 'myGym' }
  | { screen: 'healthSettings' }
  // M12 slice 2: Settings → Coach, Reminders, and the dev-only Coach eval (iPhone app).
  | { screen: 'coachSettings' }
  | { screen: 'reminders' }
  | { screen: 'brainEval' }
  // M13: Settings → About and its open-source credits; the first-launch flow.
  | { screen: 'about' }
  | { screen: 'licenses' }
  | { screen: 'selfCheck' }
  | { screen: 'welcome' }
  | { screen: 'coach' }
  // M12 slice 1c: the to-do list and one topic's guide (`from` = the tab that opened them).
  | { screen: 'todos'; from: 'today' | 'settings' }
  // M12 slice 1b: the intake (first run, Today's Goal card or Settings → Your goal) and
  // Settings → Progress photos.
  | { screen: 'intake'; from: 'first' | 'today' | 'settings' }
  | { screen: 'progressPhotos' }
  | { screen: 'todoTopic'; from: 'today' | 'settings'; topicId: string; stepIndex: number }
  | {
      screen: 'calendar';
      /** 'YYYY-MM' shown. */
      month: string;
      /** Day detail open (YYYY-MM-DD), else the month. */
      date: string | null;
      /** Exercise history open (one tap deeper than a day). */
      exerciseId: string | null;
      data: CalendarData | 'error' | null;
    }
  | ({ screen: 'preview'; loading: boolean } & PreviewDay)
  // M13c: the Library (Search) and an exercise's detail; `back` is the view to return to.
  | { screen: 'library'; back: View }
  | {
      screen: 'exerciseDetail';
      exerciseId: string;
      back: View;
      /** undefined while loading; null = never done. */
      history: DetailHistory | null | undefined;
    }
  | { screen: 'session'; s: SessionState; sheet: Sheet };

const UNDO_FAILED = "Can't undo that now: the plan changed since.";

export function mountApp(root: HTMLElement): void {
  const db = new GymDb();
  let view: View = { screen: 'today', upNextDayId: null, stats: null };
  // M13c state: background style, the Claude card's message and shown date, the open Library.
  let background: BackgroundStyle = 'glow';
  /** M13d: Settings → Display → Text size (index.html applies the mirrored copy before first paint). */
  let textSize: TextSize = 'standard';
  let claudeOffer: ClaudeOffer = {};
  let claudeOfferMsgId: number | null = null;
  let lib: {
    handle: LibraryHandle;
    query: string;
    groupBy: LibraryGroupBy;
    myGymOnly: boolean;
    personal: PersonalResults | undefined;
    opener: HTMLElement | null;
    scrollY: number;
    seq: number;
    timer: ReturnType<typeof setTimeout> | undefined;
  } | null = null;
  let libIndex: SearchIndex | null = null;
  let libDoneIds: ReadonlySet<string> = new Set();
  /** One counter for every Library, so a late personal result never matches a newer Library. */
  let libSeq = 0;
  let pendingReveal: { id: string; until: number } | null = null;
  let unit: Unit = 'kg';
  /** M13d: height and tape (settings 'lengthUnit'; no row → follows the weight unit). */
  let lengthUnit: LengthUnit = 'cm';
  let spokenCount = true;
  let coachTips = true;
  let handsFree = true;
  let accent: Accent = 'orange';
  let coachVoice: CoachVoice = { ...COACH_VOICE_DEFAULT };
  /** M13: owner mode (null until resolved at start; off until then). */
  let ownerMode: OwnerMode | null = null;
  const ownerOn = (): boolean => ownerMode?.on === true;
  /** M13: Today's "N things to sort" row kept open across re-renders. */
  let noticesOpen = false;
  let lastCueElapsedMs = 0;
  let ticker: number | undefined;

  // ---------- M10 trainer state ----------
  // The stored plan/schedule/overrides (seeded from program.json on first run), the sessions the
  // calendar reads, and the change log for Undo. Loaded once at startup; every Apply / Undo /
  // Reset goes through core changes.ts and is saved with commitChange.
  let trainer: TrainerState | null = null;
  let trainerSessions: SessionRow[] = [];
  let changes: PlanChange[] = [];
  let newProgram = false;
  // ----- M12 coach chat (one thread: the Coach tab + the Pause sheet's compact chat) -----
  // Slice 1 registers the rule brain only (no network). Live Proposals (with their `next`
  // state) stay in memory by message id; the stored cards keep only what the thread shows.
  // M12 slice 2: the iPhone app puts Apple's on-device brain first once its plugin loads
  // (initSlice2); the PWA keeps the rules only.
  let router: CoachRouter = createRouter([rulesBrain]);
  let thread: ChatMessage[] = [];
  let threadReady: Promise<void> | null = null;
  let chatBusy = false;
  let chatTyping = false;
  /** Messages with a higher id rise in on the next render (undefined: none). */
  let chatSeen: number | undefined;
  let justApplied: number | undefined;
  let refocusInput = false;
  let tempMsgId = 0;
  /** Phase of the Coach tab's turns ('preview' when the preview's Coach button opened it). */
  let tabPhase: CoachPhase = 'today';
  let coachHistory: { sets: SetLog[]; lastWeightKg: Record<string, number> } = {
    sets: [],
    lastWeightKg: {},
  };
  let chatSheet: { el: HTMLElement | null; opener: HTMLElement | null } | null = null;
  const liveProposals = new Map<
    number,
    { proposal: Proposal; source: PlanChange['source']; intent: string }
  >();
  /** Focus blocks proposed this run, by block id (applied ones are in trainer.blocks). */
  const focusDrafts = new Map<string, FocusBlock>();
  /** Message id → the plan change its Apply made (focus-block cards don't store it). */
  const appliedChange = new Map<number, number>();
  // M12 Today prompts and Calendar.
  let coachUi: CoachUiState = { missedAnswered: [] };
  let missedPrompt: MissedDay | null = null;
  let promptsBusy = false;
  let calCounted = false;
  const todayMotion = createTodayMotion();
  let toast: (HTMLElement & { dispose?: () => void }) | null = null;
  // The running session's adjustments (SessionRow.adjust): lighter/deload sessions skip stalls.
  let sessionAdjust: ProposalAction[] = [];
  let summaryStalls: { sessionId: string; stalls: StallCardData[] } | null = null;
  // M10e: his gym's equipment and the exercises he kept anyway (default until he edits My gym).
  let gym: GymProfile = defaultGymProfile();
  const trainerCatalog: TrainerCatalog = {
    exercises: catalogExercises(),
    areaOf: bodyAreaOf,
    canDo: (id) => gymCanDo(id, gym),
    preferred: preferredSwaps,
    missingKitLabels: (id) => missingKitLabels(id, gym),
  };
  const todayDate = () => localDate(now());
  const planDays = () => trainer?.plan.days ?? program.days;

  // ----- M12 1b: the standing go-easy list, applied wherever a day is shown or started -----
  /** Last working weight per plan exercise (loaded off-workout, stable during one). */
  let easyLastKg: Record<string, number> = {};
  const easyOpts = (): EffectiveOptions => ({
    easyOn: easyOnTreatment({ catalog: trainerCatalog, unit, lastWeightKg: easyLastKg }),
  });
  /** What `date` runs as shown / started (the go-easy list applied). */
  const effDay = (state: TrainerState, date: string): EffectiveDay =>
    effectiveDay(state, trainerSessions, date, easyOpts());
  async function loadEasyLastKg(): Promise<void> {
    try {
      const ids = [...new Set(planDays().flatMap((d) => d.exercises.map((p) => p.exerciseId)))];
      const last = await lastSessionSets(db, ids);
      easyLastKg = lastWeights(
        Object.fromEntries(Object.entries(last).map(([id, rows]) => [id, workingSets(rows)])),
      );
    } catch (err) {
      logDbError(err);
    }
  }

  // ----- M12 1b: intake, goals, feel today, progress photos -----
  let intake: Intake | null = null;
  let goals: Goal[] = [];
  /** Today's Goal card (null: not loaded yet). */
  let goalItems: GoalCardItem[] | null = null;
  let feels: DayFeel[] = [];
  let feelOpen = false;
  let progressPhotosOn = false;

  // ---------- M7 Fuel (state, sub-views and sheets live in fuel/fuelController.ts) ----------
  // Nutrition data never goes to the developer log (no `rec` calls on this path).
  // M7b food photos: classifier + Settings → Food photos (fuel/foodVisionHost.ts).
  const foodVision = createFoodVisionHost({
    db,
    now: () => now(),
    onChange: (next) => fuel.setPhoto(next),
    toast: (text, onUndo) => showActionToast(text, onUndo),
    logError: (err) => logDbError(err),
  });
  const fuel = createFuel({
    db,
    root,
    now: () => now(),
    unit: () => unit,
    lengthUnit: () => lengthUnit,
    // M13d: a unit switch next to a field changes the app-wide units (the open page already shows
    // them; no render, so unsaved edits stay).
    onUnits: (next) => {
      unit = next.weight;
      lengthUnit = next.length;
      // In the first run the Units page shows (and saves on Next) the same choice.
      if (onboarding) onboarding.units = next;
      void setUnitPrefs(db, next).catch(logDbError);
    },
    // M13d: Set up Fuel pre-fills height / birth year / sex from Apple Health (iPhone app, connected).
    healthProfile: () => health.profile(),
    render: () => render(),
    showFuel: () => {
      view = { screen: 'fuel' };
      render();
    },
    showSettings: () => {
      view = { screen: 'settings' };
      render();
    },
    goTab: (t) => goTab(t),
    toast: (text, onUndo) => showActionToast(text, onUndo),
    logError: (err) => logDbError(err),
    photo: foodVision.photoHost,
    health: {
      activitySuggestion: (c) => health.fuelHost.activitySuggestion(c),
      onActivityAnswered: (a, l) => health.fuelHost.onActivityAnswered(a, l),
    },
    // M12 1b
    trainerKit: () => kit,
    bodyComp: () => health.bodyCompDays(),
    openLearn: (id, opener) => {
      const card = findLearnCard(LEARN_CARDS, id);
      if (card) openLearnCard(card, opener);
    },
    onSearch: (opener) => openLibrary(opener),
  });

  // ---------- M11 Health (iPhone app only; healthHost.ts) ----------
  // Synced on open (after the plan loads), on foreground and on Read now. The card shows only on
  // Today, never spoken; nothing from Health reaches the coach context.
  const health = createHealthHost({
    db,
    now: () => now(),
    render: () => {
      if (['today', 'healthSettings', 'fuel'].includes(view.screen)) render();
    },
    trainingDay: () => {
      if (!trainer) return undefined;
      const eff = effectiveDay(trainer, trainerSessions, todayDate());
      return eff.day !== null && !eff.rest && !eff.done;
    },
    inWorkout: () => view.screen === 'session' && view.s.phase !== 'summary',
    sessions: () => trainerSessions,
    onWeighIns: () => void fuel.refresh().then(() => render()),
    logError: (err) => logDbError(err),
  });

  // Developer log (M4c): numbers only, stays on the phone. Calls queue until the recorder exists,
  // then run at once: a hands-free set is opened and the camera's first writes to it (meta, the
  // auto-start rep) follow in the same task, so a queued beginSet would drop them.
  let recorder: DevLogRecorder | null = null;
  let recorderReady: Promise<DevLogRecorder | null> = Promise.resolve(null);
  const rec = (f: (r: DevLogRecorder) => unknown) => {
    if (recorder) {
      f(recorder);
      return;
    }
    void recorderReady.then((r) => {
      if (r) f(r);
    });
  };
  let lastCounted: { reps: number; partials: number } | null = null;
  // A camera set that never counted a rep still logs counted {0, 0} (vs a manual set: none).
  let cameraThisSet = false;
  // M4f: the last logged set was counted by a learning camera rule (Rest/Summary Fix note).
  let lastLogLearning = false;
  let pendingSet: Parameters<DevLogRecorder['beginSet']>[0] | null = null;
  // Exercises whose phone-placement sentence was already spoken this workout.
  let placementSpoken = new Set<string>();
  let devLogPanel: DevLogPanelHandle | null = null;
  let howTo: { el: HTMLElement; dispose(): void } | null = null;
  // M5b after-set coach: one tip instance per logged set; spoken once per logged set.
  let coachTip: { key: string; tip: ReturnType<typeof createCoachTip>; applied: boolean } | null =
    null;
  let adviceSpokenKey = '';
  // ----- M12 1b trainer kit (the stored 'trainerKit' row merged over the defaults) -----
  let kit: TrainerKitSettings = mergeTrainerKit(undefined);
  /** How each catalog exercise is loaded, for warm-up sets (built once). */
  let liftsForWarmups: ReturnType<typeof warmupLifts> | null = null;
  /** Exercises whose setup cues were spoken this workout (once each). */
  let setupCuesSaid: string[] = [];
  /** The upcoming set the between-sets lines were last spoken for (no repeats on re-render). */
  let betweenSetsKey = '';
  /** Summary's post-workout meal idea for this session (null: none to show). */
  let mealIdea: { sessionId: string; idea: MealIdea | null } | null = null;

  function currentAdvice(s: SessionState): Advice | null {
    return coachTips ? afterSetAdvice(s, exerciseName, lastTime) : null;
  }

  /** Rest: the coach tip for the set just logged (null when off or nothing to say). */
  function coachTipFor(s: SessionState): HTMLElement | null {
    const advice = currentAdvice(s);
    if (!advice || s.paused) return null;
    const key = `${s.sessionId}:${s.logs.length}`;
    // Apply only while the upcoming set is the advice's exercise (the reducer checks this too).
    const canApply = currentPlanned(s).exerciseId === advice.exerciseId;
    if (coachTip?.key !== key) {
      const tip = createCoachTip({
        advice,
        unit,
        canApply,
        onApply: (weightKg) => {
          if (coachTip) coachTip.applied = true;
          // The APPLY_NEXT_WEIGHT event itself is logged by logToDevLog.
          dispatch({ type: 'APPLY_NEXT_WEIGHT', exerciseId: advice.exerciseId, weightKg });
        },
      });
      coachTip = { key, tip, applied: false };
      rec((r) =>
        r.logEvent('advice', { rule: advice.rule, exerciseId: advice.exerciseId, shown: true }),
      );
    } else {
      // `applied` stays true once applied: a Fix can't change the suggested weight, and the
      // reducer state really holds the applied weight.
      coachTip.tip.update(advice, { canApply, unit, applied: coachTip.applied });
    }
    return coachTip.tip.el;
  }

  /** M4b: full-screen "How to" sheet with the 3D demo (or the muscle map when there's none). */
  function openHowTo(
    p: Pick<PlannedExercise, 'exerciseId' | 'tracking'>,
    opener: HTMLElement | null,
  ): void {
    if (howTo) return;
    const sheet = createHowToSheet({
      exerciseId: p.exerciseId,
      tracking: p.tracking,
      onClose: () => {
        if (howTo !== sheet) return; // Close and Escape may both fire
        sheet.dispose();
        sheet.el.remove();
        howTo = null;
        root.inert = false;
        opener?.focus();
      },
    });
    howTo = sheet;
    root.inert = true; // nothing behind the sheet takes focus or taps
    document.body.append(sheet.el); // same task as create, so focus lands on Close
  }

  // ---------- M13c: Library, search, tappable badges, Practice ----------
  // Search opens from Today, Fuel, Calendar and Settings only; badges and Practice work before a
  // workout and never during a set. Everything is on this phone: no search leaves it.

  /** The badge input for any exercise: the camera counts it when a rule exists. */
  const trackingOf = (id: string): PlannedExercise['tracking'] =>
    cameraInfo(id) ? 'pose' : 'manual';

  function openBadge(kind: BadgeKind, id: string, opener: HTMLElement): void {
    switch (kind) {
      case '3d':
      case 'info':
        openHowTo({ exerciseId: id, tracking: trackingOf(id) }, opener);
        return;
      case 'camera':
        openCameraSheet(id, opener);
        return;
      case 'learning': {
        const card = findLearnCard(LEARN_CARDS, 'cameraLearning');
        if (card) openLearnCard(card, opener);
        return;
      }
    }
  }

  function openCameraSheet(id: string, opener: HTMLElement): void {
    const info = cameraInfo(id);
    if (!info) return;
    openCameraInfo(
      info,
      { name: exerciseName(id), exerciseId: id, onPractice: () => openPractice(id) },
      opener,
    );
  }

  /** Practice: the camera counts and speaks reps; nothing is saved, no dev log, no hands-free. */
  function openPractice(id: string): void {
    if (camera || view.screen === 'session') return;
    voice.unlock(); // inside the tap, so iOS lets the count be spoken
    camera = createCameraView({
      title: `Practice: ${exerciseName(id)}`,
      note: 'Practice: nothing is saved.',
      onClose: closeCameraView,
      exerciseId: id,
      spokenCount,
      speakPlacement: true,
    });
    cameraExerciseId = null; // not a workout set: syncCamera leaves it alone
    cameraHandsFree = false;
    root.append(camera.el);
    void camera.start();
  }

  function libRows(): LibraryRow[] {
    return catalogExercises().map((e) => ({
      id: e.id,
      name: exerciseName(e.id),
      tracking: trackingOf(e.id),
      muscle: muscleLabel(e.primaryMuscles[0] ?? ''),
      equipment: equipmentGroupLabel(e.equipment),
      needs: missingKitLabels(e.id, gym),
    }));
  }

  function libGroups(by: LibraryGroupBy, myGymOnly: boolean) {
    return groupExercises(catalogExercises(), by, {
      planDays: planDays(),
      areaOf: bodyAreaOf,
      muscleLabel,
      canDo: (id) => gymCanDo(id, gym),
      myGymOnly,
      doneIds: libDoneIds,
    });
  }

  function buildLibIndex(): SearchIndex {
    return buildSearchIndex([
      ...exerciseSearchItems(catalogExercises(), {
        planDays: planDays(),
        areaOf: bodyAreaOf,
        areaLabel: bodyAreaLabel,
        muscleLabel,
      }),
      ...settingsSearchItems({ owner: ownerOn() }),
      ...learnSearchItems(LEARN_CARDS),
    ]);
  }

  const backLabelFor = (v: View): string => {
    const t = tabOf(v);
    return t ? (TABS.find((x) => x.id === t)?.label ?? 'Back') : 'Back';
  };

  /** Search: the Library over the current view; focus goes to the field inside this tap (iOS). */
  function openLibrary(opener: HTMLElement): void {
    if (view.screen === 'session' || view.screen === 'library') return;
    const back = view;
    libIndex = buildLibIndex();
    const groupBy: LibraryGroupBy = 'muscle';
    const handle = createLibraryScreen(
      {
        rows: libRows(),
        groups: libGroups(groupBy, false),
        groupBy,
        query: '',
        hits: [],
        myGymOnly: false,
        areaLabel: bodyAreaLabel,
        backLabel: backLabelFor(back),
        autofocus: true,
      },
      {
        onQuery: (q) => libQuery(q),
        onGroupBy: (by) => {
          if (!lib) return;
          lib.groupBy = by;
          lib.handle.update({ groupBy: by, groups: libGroups(by, lib.myGymOnly) });
        },
        onMyGym: (on) => {
          if (!lib) return;
          lib.myGymOnly = on;
          lib.handle.update({ myGymOnly: on, groups: libGroups(lib.groupBy, on) });
        },
        onOpenExercise: (id) => openExerciseDetail(id),
        onBadge: (kind, id, op) => openBadge(kind, id, op),
        onHit: (hit, op) => openSearchHit(hit, op),
        onMore: (kind) => void libMore(kind),
        onBack: () => closeLibrary(),
      },
    );
    lib = {
      handle,
      query: '',
      groupBy,
      myGymOnly: false,
      personal: undefined,
      opener,
      scrollY: window.scrollY,
      seq: 0,
      timer: undefined,
    };
    view = { screen: 'library', back };
    render();
    handle.focusSearch();
    window.scrollTo(0, 0);
    void loadDoneIds();
  }

  /** Exercises with logged sets (listed first; ranked first on ties). */
  async function loadDoneIds(): Promise<void> {
    try {
      const ids = new Set<string>();
      await db.sets.each((r) => {
        ids.add(r.exerciseId);
      });
      libDoneIds = ids;
      if (lib && view.screen === 'library') {
        lib.handle.update({
          groups: libGroups(lib.groupBy, lib.myGymOnly),
          hits: lib.query && libIndex ? searchIndex(libIndex, lib.query, { doneIds: ids }) : [],
        });
      }
    } catch (err) {
      logDbError(err);
    }
  }

  function closeLibrary(): void {
    if (view.screen !== 'library' || !lib) return;
    const { opener, scrollY } = lib;
    if (lib.timer) clearTimeout(lib.timer);
    view = view.back;
    render();
    window.scrollTo(0, scrollY);
    // The opener's screen was rebuilt: focus the new screen's Search button instead.
    const target = opener?.isConnected
      ? opener
      : root.querySelector<HTMLElement>('[data-search-open]');
    target?.focus({ preventScroll: true });
  }

  /** Bundled hits now; this phone's workouts, meals and chat after a short pause (on device). */
  function libQuery(q: string): void {
    if (!lib || !libIndex) return;
    lib.query = q;
    const seq = ++libSeq;
    lib.seq = seq;
    if (lib.timer) clearTimeout(lib.timer);
    const usable = personalQueryUsable(q, todayDate());
    lib.personal = undefined;
    lib.handle.update({
      query: q,
      hits: searchIndex(libIndex, q, { doneIds: libDoneIds }),
      personal: undefined,
      personalLoading: usable,
    });
    if (!usable) return;
    lib.timer = setTimeout(() => {
      void personalSearch(db, q, { now: now(), dayName: dayNameOf })
        .then((r) => {
          if (!lib || lib.seq !== seq) return; // a newer query won
          lib.personal = r;
          lib.handle.update({ personal: r, personalLoading: false });
        })
        .catch((err: unknown) => {
          logDbError(err);
          if (lib && lib.seq === seq) lib.handle.update({ personalLoading: false });
        });
    }, 200);
  }

  async function libMore(kind: PersonalKind): Promise<void> {
    if (!lib?.personal) return;
    const seq = lib.seq;
    const sec = lib.personal.sections.find((x) => x.kind === kind);
    if (!sec) return;
    try {
      const r = await personalSearch(db, lib.query, {
        now: now(),
        dayName: dayNameOf,
        kinds: [kind],
        offset: { [kind]: sec.hits.length },
      });
      if (!lib?.personal || lib.seq !== seq) return;
      const next = r.sections.find((x) => x.kind === kind);
      if (!next) return;
      const personal: PersonalResults = {
        ...lib.personal,
        sections: lib.personal.sections.map((x) =>
          x.kind === kind ? { ...x, hits: [...x.hits, ...next.hits], more: next.more } : x,
        ),
      };
      lib.personal = personal;
      lib.handle.update({ personal });
    } catch (err) {
      logDbError(err);
    }
  }

  function openSearchHit(hit: SearchHit, opener: HTMLElement): void {
    switch (hit.kind) {
      case 'exercise':
        openExerciseDetail(hit.id);
        return;
      case 'learn': {
        const card = findLearnCard(LEARN_CARDS, hit.id);
        if (card) openLearnCard(card, opener);
        return;
      }
      case 'setting': {
        const key = settingsSectionFor(hit.id, ownerOn());
        setEnter('settings');
        view = { screen: 'settings' };
        render();
        const el = key ? document.getElementById(settingsSectionId(key)) : null;
        if (el) {
          el.scrollIntoView({ block: 'start' });
          el.focus({ preventScroll: true });
        } else window.scrollTo(0, 0);
        return;
      }
      case 'food': {
        const q = hit.keywords[0] ?? '';
        setEnter('fuel');
        const seq = ++navSeq;
        void fuel.open().then(() => {
          if (seq !== navSeq || view.screen !== 'library') return; // another tab was chosen
          view = { screen: 'fuel' };
          render();
          window.scrollTo(0, 0);
          fuel.openLogSearch(q);
        });
        return;
      }
      case 'workout': {
        const date = hit.date;
        if (!date) return;
        setEnter('calendar');
        openCalendar();
        if (view.screen === 'calendar') {
          view = { ...view, month: date.slice(0, 7), date };
          render();
        }
        return;
      }
      case 'meal': {
        const date = hit.date ?? hit.id;
        setEnter('fuel');
        const seq = ++navSeq;
        void fuel.openDay(date).then(() => {
          if (seq !== navSeq || view.screen !== 'library') return; // another tab was chosen
          view = { screen: 'fuel' };
          render();
          window.scrollTo(0, 0);
        });
        return;
      }
      case 'chat': {
        // Re-applied after every Coach render while it lasts (a late mic refresh rebuilds the tab).
        pendingReveal = { id: hit.id, until: now() + REVEAL_MS };
        void openCoachTab(tabPhase).then(() => applyPendingReveal());
        return;
      }
    }
  }

  /** Search → a chat message: outline it again if the Coach tab was rebuilt meanwhile. */
  function applyPendingReveal(): void {
    if (!pendingReveal) return;
    if (view.screen !== 'coach' || now() > pendingReveal.until) {
      pendingReveal = null;
      return;
    }
    const coachRoot = coachTabEl;
    if (coachRoot?.isConnected && !revealMessage(coachRoot, pendingReveal.id)) pendingReveal = null;
  }

  function libraryView(): HTMLElement {
    if (!lib) {
      // Lost its state (e.g. a restore re-render): back to Today rather than an empty screen.
      view = { screen: 'today', upNextDayId: null, stats: null };
      queueMicrotask(goToday);
      return todayScreen(null, null);
    }
    return lib.handle.el;
  }

  function openExerciseDetail(id: string): void {
    if (view.screen === 'session') return;
    const back = view;
    view = { screen: 'exerciseDetail', exerciseId: id, back, history: undefined };
    render();
    window.scrollTo(0, 0);
    void loadDetailHistory(id);
  }

  async function loadDetailHistory(id: string): Promise<void> {
    let history: DetailHistory | null = null;
    try {
      const t = now();
      const sessions = await db.sessions.toArray();
      const finished = sessions.filter((x) => x.endedAt !== undefined);
      const sets = await setsForSessions(
        db,
        finished.map((x) => x.sessionId),
      );
      history = detailHistoryOf(exerciseHistory(sets, id, t, 520));
    } catch (err) {
      logDbError(err);
    }
    if (view.screen !== 'exerciseDetail' || view.exerciseId !== id) return;
    view = { ...view, history };
    render();
  }

  function exerciseDetailView(v: Extract<View, { screen: 'exerciseDetail' }>): HTMLElement {
    const id = v.exerciseId;
    const plan = planDays().flatMap((d) =>
      d.exercises
        .filter((x) => x.exerciseId === id)
        .map((x) => ({ day: d.name, sets: x.sets, targetReps: x.targetReps })),
    );
    return exerciseDetailScreen(
      {
        exerciseId: id,
        name: exerciseName(id),
        tracking: trackingOf(id),
        content: howToContent(id),
        equipment: equipmentGroupLabel(exerciseById(id)?.equipment ?? null),
        needs: missingKitLabels(id, gym),
        camera: cameraInfo(id),
        plan,
        history: v.history ?? null,
        unit,
        backLabel: v.back.screen === 'library' ? 'Library' : backLabelFor(v.back),
      },
      {
        onBack: () => {
          if (view.screen !== 'exerciseDetail') return;
          const back = view.back;
          // A preview left while loading never finishes: open it again.
          if (back.screen === 'preview' && back.loading) {
            void openPreview(back.planDay);
            return;
          }
          view = back;
          render();
        },
        onBadge: (kind, exId, opener) => openBadge(kind, exId, opener),
        onHowTo: (opener) => openHowTo({ exerciseId: id, tracking: trackingOf(id) }, opener),
        onMyGym: () => goRoute('settings/myGym'),
        onCameraInfo: (opener) => openCameraSheet(id, opener),
        onHistory: () => {
          setEnter('calendar');
          openCalendar();
          if (view.screen === 'calendar') {
            view = { ...view, exerciseId: id };
            render();
          }
        },
      },
    );
  }

  let correction: { key: string; handle: LastSetCorrectionHandle } | null = null;

  // Per-day caches, loaded on the preview screen and kept for the session.
  let lastTime: Record<string, SetRow[]> = {};
  let exerciseNotes: Record<string, ExerciseNoteRow> = {};
  let todayNotes: Record<string, string> = {};

  const now = () => Date.now();
  const w = (kg: number) => formatWeight(kg, unit);
  const setsText = (sets: Pick<SetLog, 'reps' | 'weightKg'>[]) =>
    sets.length ? `${sets.map((l) => `${l.reps}×${w(l.weightKg)}`).join(', ')} ${unit}` : '';
  const repsRange = (p: PlannedExercise) =>
    p.targetReps[0] === p.targetReps[1]
      ? `${p.targetReps[0]}`
      : `${p.targetReps[0]}–${p.targetReps[1]}`;
  const noteFor = (id: string): ExerciseNoteRow =>
    exerciseNotes[id] ?? { exerciseId: id, machineSetting: '', note: '' };

  // ---------- 3D body (lazy, one WebGL context for the whole app) ----------

  let body3d: Body3D | null = null;
  let body3dState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';

  function ensureBody3d(): void {
    if (body3dState !== 'idle') return;
    body3dState = 'loading';
    import('./body3d/viewer')
      .then((m) => {
        if (!m.webglAvailable()) {
          body3dState = 'failed';
          return;
        }
        body3d = m.createBody3D({ reducedMotion: reducedMotion() });
        body3dState = 'ready';
        placeBody3d();
      })
      .catch((err: unknown) => {
        body3dState = 'failed';
        console.warn('3D body unavailable, using the 2D map', err);
      });
  }

  const musclesOf = (exerciseId: string) => {
    const ex = exerciseById(exerciseId);
    return { primary: ex?.primaryMuscles ?? [], secondary: ex?.secondaryMuscles ?? [] };
  };

  /** Slot showing the 2D map until the 3D body is ready; the 3D canvas is moved into it. */
  function muscleSlot(exerciseId: string, variant: 'inline' | 'rest' | 'full'): HTMLElement {
    const { primary, secondary } = musclesOf(exerciseId);
    const slot = h('div', {
      class: `muscle-slot ${variant}`,
      'data-muscle-slot': exerciseId,
      'data-interactive': variant === 'full' ? 'true' : 'false',
    });
    slot.innerHTML = bodyMapSvg({ view: pickView(primary), primary, secondary });
    if (variant === 'full') return slot;
    return h(
      'button',
      {
        class: 'muscle-btn',
        'aria-label': 'Show target muscles in 3D',
        onclick: () => setSheet({ kind: 'body', exerciseId }),
      },
      slot,
    );
  }

  function placeBody3d(): void {
    if (!body3d) return;
    const slot =
      root.querySelector<HTMLElement>('.sheet [data-muscle-slot]') ??
      root.querySelector<HTMLElement>('[data-muscle-slot]');
    if (!slot) {
      body3d.el.remove();
      return;
    }
    const { primary, secondary } = musclesOf(slot.dataset.muscleSlot ?? '');
    slot.classList.add('has-3d');
    slot.append(body3d.el);
    body3d.setInteractive(slot.dataset.interactive === 'true');
    body3d.setMuscles(primary, secondary);
  }

  // ---------- Camera (M3) ----------

  let camera: CameraView | null = null;
  // M4e Summary: last time's same day + today's new bests (loaded when the workout ends).
  // Raw inputs only: the % and bests are recomputed from the current logs on every render, so a
  // Fix on Summary updates them too.
  let summaryHistory: {
    sessionId: string;
    prevLogs: SetLog[];
    last: { volumeKg: number; reps: number } | null;
    history: SetLog[];
  } | null = null;
  // M4e Rest: the mounted Rest screen's cheap per-tick updater (clock + ring).
  let restView: { update(remainingMs: number, targetMs: number): void; dispose(): void } | null =
    null;
  // Hands-free (M5c): the exercise the open camera counts, and the pre-roll for the next set.
  let cameraExerciseId: string | null = null;
  // The hands-free setting the open camera was created with (Settings can't change it mid-camera).
  let cameraHandsFree = false;
  let cameraPrerollFromT: number | undefined;

  /** `exerciseId` turns on rep counting (M4); leave it out for Settings → Camera test. */
  function openCameraView(title: string, exerciseId?: string): void {
    if (camera) return;
    voice.unlock(); // inside the tap, so iOS lets the count be spoken
    camera = createCameraView({
      title,
      onClose: closeCameraView,
      ...(exerciseId === undefined
        ? {}
        : {
            exerciseId,
            spokenCount,
            ...cameraTarget(),
            speakPlacement: !placementSpoken.has(exerciseId),
            recorder,
            // The reducer ignores this outside an active, unpaused set.
            onCount: (reps: number, partials: number) =>
              dispatch({ type: 'SET_COUNTED', reps, partials }),
            // M5: every cue fired so far this set (ids); the reducer scores it at Set done.
            onFocus: (cues: FocusCueId[]) => dispatch({ type: 'SET_FOCUS', cues }),
            onSetDone: () => {
              // Hands-free keeps the camera for the next set of the same exercise (syncCamera).
              if (!cameraHandsFree) closeCameraView();
              dispatch({ type: 'SET_DONE', now: now() });
            },
            // M13b: Next arm on the first side of a one-sided set (it takes Set done's place).
            onNextSide: () => {
              if (view.screen === 'session') nextSide(view.s);
            },
            ...(handsFree ? { handsFree: handsFreeOptions() } : {}),
          }),
    });
    cameraExerciseId = exerciseId ?? null;
    cameraHandsFree = handsFree && exerciseId !== undefined;
    if (exerciseId !== undefined) {
      placementSpoken.add(exerciseId);
      cameraThisSet = true;
      openLoggedSet(); // before the camera writes frames
    }
    root.append(camera.el);
    syncCamera(); // before start(), so the camera knows the phase from its first frame
    void camera.start();
  }

  /** M13b: true while a hands-free auto start dispatches (no side start line then). */
  let autoStarting = false;

  function handsFreeOptions(): HandsFreeOptions {
    return {
      onAutoStart: ({ at, frameT }) => {
        // The set's frames from 1.5 s before the first rep go into the dev log (pre-roll).
        cameraPrerollFromT = frameT - 1500;
        // He is already reps into the right arm: no "Right arm first." over the count words.
        autoStarting = true;
        try {
          dispatch({ type: 'START_SET', now: at });
        } finally {
          autoStarting = false;
        }
        cameraPrerollFromT = undefined;
      },
      onCommit: ({ endedAt }) => {
        dispatch({ type: 'SET_DONE', now: endedAt });
        // The rest is backdated (~11 s in): no rest cue for the seconds already gone.
        if (view.screen === 'session' && view.s.phase === 'rest')
          lastCueElapsedMs = restElapsedMs(view.s, now());
        speakAdviceOnCommit();
      },
      // M5c break hold: "Start next set" saves the held set (backdated to its last rep) and
      // starts the next one now; the break counts as that set's rest. No coach tip here — the
      // lifter is already starting.
      onHoldNext: ({ endedAt }) => {
        dispatch({ type: 'SET_DONE', now: endedAt });
        dispatch({ type: 'START_SET', now: now() });
      },
      onIdleClose: () => closeCameraView(),
      onStartSet: () => dispatch({ type: 'START_SET', now: now() }),
    };
  }

  /**
   * Hands-free commit: say the coach tip now if it fits before "Ten seconds"; else it is shown
   * only (the rest is backdated past the usual 2 s moment). Also after an exercise's last set,
   * when the camera has already closed.
   */
  function speakAdviceOnCommit(): void {
    if (view.screen !== 'session') return;
    const s = view.s;
    if (s.phase !== 'rest' || s.paused) return;
    const key = `${s.sessionId}:${s.logs.length}`;
    if (adviceSpokenKey === key) return;
    if (!adviceSpeakOnCommit(restElapsedMs(s, now()), s.restTargetSec)) return;
    const advice = currentAdvice(s);
    if (!advice) return;
    adviceSpokenKey = key;
    voice.speak(advice.say, { kind: 'cue' });
    rec((r) =>
      r.logEvent('advice', {
        rule: advice.rule,
        exerciseId: advice.exerciseId,
        spoken: true,
        atCommit: true,
      }),
    );
  }

  /**
   * Hands-free: tell the open camera the session phase (after every dispatch), close it when the
   * next set is another exercise or the workout ended, and open the dev-log set it now counts.
   */
  function syncCamera(): void {
    if (!camera || cameraExerciseId === null || view.screen !== 'session') return;
    const s = view.s;
    const nextId = s.phase === 'summary' ? null : currentPlanned(s).exerciseId;
    if (cameraHandsFree && nextId !== cameraExerciseId) {
      closeCameraView();
      return;
    }
    camera.setSession({
      phase: s.phase === 'exercise' ? 'exercise' : s.phase === 'rest' ? 'rest' : 'other',
      paused: s.paused,
      restElapsedMs: restElapsedMs(s, now()),
      ...cameraTarget(),
      // M13b: locks the counter to the right arm, then the left after Next arm (null: two-sided).
      sideTurn: sideTurn(s),
    });
    if (s.phase === 'exercise' && pendingSet) {
      cameraThisSet = true;
      openLoggedSet(cameraPrerollFromT === undefined ? {} : { prerollFromT: cameraPrerollFromT });
      camera.setBegun();
    }
    if (camera.mode === 'rest') updateCameraRest(s);
  }

  /** Hands-free rest panel on the camera: clock, next set, coach tip and Fix. */
  function updateCameraRest(s: SessionState): void {
    if (!camera || s.phase !== 'rest') return;
    const p = currentPlanned(s);
    camera.setRest({
      restMs: s.restTargetSec * 1000 - restElapsedMs(s, now()),
      nextLine: (() => {
        const warm = currentWarmup(s);
        return warm
          ? `Next: ${warmupLabel(warm, unit)}`
          : `Next: Set ${s.setIndex + 1} of ${p.sets} · ${s.reps} reps × ${w(s.weightKg)} ${unit}`;
      })(),
      coachTipEl: coachTipFor(s),
      fixEl: lastSetFix(s),
    });
  }

  /** "3 / 12" and "Set 2 of 3 · 8–12 reps" on the camera page, from the current set. */
  function cameraTarget(): { target?: CameraTarget } {
    if (view.screen !== 'session') return {};
    const s = view.s;
    const p = currentPlanned(s);
    return {
      target: {
        setNumber: s.setIndex + 1,
        sets: p.sets,
        targetReps: p.targetReps[1],
        minReps: p.targetReps[0],
      },
    };
  }

  function closeCameraView(): void {
    camera?.stop();
    camera = null;
    cameraExerciseId = null;
    render();
  }

  function render(): void {
    // M13d: the left-edge swipe Back never works in a workout.
    root.toggleAttribute('data-in-workout', view.screen === 'session');
    // Left Settings by any route (a tab, Nutrition setup, Plan changes): stop the audio test's
    // camera and beep context. A no-op when there is no live panel.
    if (view.screen !== 'settings') disposeAudioTest();
    // M12 1b: leaving Progress photos frees its object URLs.
    if (view.screen !== 'progressPhotos' && photosView) {
      photosView.dispose();
      photosView = null;
    }
    if (view.screen !== 'intake') intakeEl = null;
    // M13c: leaving the Library (and a detail opened from it) drops its state.
    if (
      lib &&
      view.screen !== 'library' &&
      !(view.screen === 'exerciseDetail' && view.back.screen === 'library')
    ) {
      if (lib.timer) clearTimeout(lib.timer);
      lib = null;
    }
    // M13: leaving the Calendar drops an open share preview (and its image URL).
    if (view.screen !== 'calendar' && sharePrev) {
      if (sharePrev.url) URL.revokeObjectURL(sharePrev.url);
      sharePrev = null;
      shareSeq++;
    }
    // M13: leaving the workout stops the Rest card's 3D watcher.
    if (view.screen !== 'session' && restView) {
      restView.dispose();
      restView = null;
    }
    // M12 slice 1c: the What's New tour never stays over a workout, its preview or the camera.
    if (tour && (view.screen === 'session' || view.screen === 'preview' || camera)) closeTour();
    const screen = screenFor(view);
    const overlays = [camera?.el, tour?.el].filter(
      (el): el is HTMLElement => el !== undefined && el.parentNode === root,
    );
    if (overlays.length) {
      // Camera sheet / tour open: swap only the screen under it, so it keeps focus and scroll.
      for (const el of [...root.children]) if (!overlays.includes(el as HTMLElement)) el.remove();
      root.prepend(screen);
    } else {
      // The Library hands back the same element: re-inserting it would drop the field's focus.
      if (!(root.childElementCount === 1 && root.firstElementChild === screen))
        root.replaceChildren(screen);
      if (camera) root.append(camera.el);
    }
    if (tour && tour.el.parentNode !== root) root.append(tour.el);
    // A tab switch opens the new tab at its top (Back inside a tab keeps its scroll).
    if (scrollTopTab !== null && tabOf(view) === scrollTopTab) {
      scrollTopTab = null;
      window.scrollTo(0, 0);
    }
    if (view.screen === 'session') {
      ensureBody3d();
      placeBody3d();
    }
    if (pendingReveal && view.screen === 'coach') applyPendingReveal();
    // Settings shows "Restore undone." inline: the notice would say it twice.
    if (view.screen === 'settings' && toast?.dataset.notice === 'restore') removeToast();
    placeToast();
    // The screen's parts slide, not the screen: a transform on it would carry the fixed tab
    // bar along for the slide. A re-render while it plays (data arriving) continues the slide.
    entrance.apply(
      [...screen.children].filter(
        (p): p is HTMLElement => p instanceof HTMLElement && !p.matches('[data-tabbar]'),
      ),
      view.screen,
      pendingEnter,
    );
    pendingEnter = null;
  }

  function screenFor(v: View): HTMLElement {
    switch (v.screen) {
      case 'today':
        return todayScreen(v.upNextDayId, v.stats);
      case 'settings':
        return settingsScreen();
      case 'fuel':
        return fuel.screen();
      case 'planChanges':
        return planChangesView();
      case 'healthSettings':
        return health.settingsScreen(() => {
          view = { screen: 'settings' };
          render();
        });
      case 'myGym':
        return myGymView();
      case 'coachSettings':
        return coachSettingsView();
      case 'reminders':
        return remindersView();
      case 'brainEval':
        return brainEvalView();
      case 'about':
        return aboutView();
      case 'licenses':
        return licensesScreenView();
      case 'selfCheck':
        return selfCheckView();
      case 'welcome':
        return welcomeView();
      case 'intake':
        return intakeView(v);
      case 'progressPhotos':
        return progressPhotosScreen();
      case 'coach':
        return coachTabView();
      case 'todos':
        return todoListView(v);
      case 'todoTopic':
        return todoTopicView(v);
      case 'calendar':
        return calendarView(v);
      case 'preview':
        return previewScreen(v, v.loading);
      case 'session':
        return sessionScreen(v.s, v.sheet);
      case 'library':
        return libraryView();
      case 'exerciseDetail':
        return exerciseDetailView(v);
    }
  }

  /** The tab a view belongs to (sub-screens count as their tab), or null (preview, workout). */
  function tabOf(v: View): TabId | null {
    switch (v.screen) {
      case 'today':
      case 'fuel':
      case 'coach':
      case 'calendar':
        return v.screen;
      case 'settings':
      case 'planChanges':
      case 'myGym':
      case 'healthSettings':
      case 'progressPhotos':
      case 'coachSettings':
      case 'reminders':
      case 'brainEval':
      case 'about':
      case 'licenses':
      case 'selfCheck':
        return 'settings';
      case 'intake':
        return v.from === 'settings' ? 'settings' : v.from === 'today' ? 'today' : null;
      case 'todos':
      case 'todoTopic':
        return v.from;
      case 'library':
      case 'exerciseDetail':
        return tabOf(v.back);
      default:
        return null;
    }
  }

  /** The next render enters in the direction of travel along the tab bar (motion.ts). */
  let pendingEnter: EnterDir | null = null;
  /** The tab entrance, carried across re-renders that land while it plays (motion.ts). */
  const entrance = screenEntrance();
  function setEnter(to: TabId): void {
    const from = tabOf(view);
    if (from === to) return;
    const i = (t: TabId) => TABS.findIndex((x) => x.id === t);
    pendingEnter = from === null ? 'up' : i(to) > i(from) ? 'next' : 'prev';
  }

  /** Tab bar: every tab is handled here, so a new tab id fails to compile until it's wired. */
  function goTab(tab: TabId): void {
    navSeq++;
    if (tab !== 'coach') void micCancel();
    setEnter(tab);
    scrollTopTab = tabOf(view) === tab ? null : tab;
    switch (tab) {
      case 'today':
        if (view.screen !== 'today') goToday();
        return;
      case 'settings':
        if (view.screen !== 'settings') {
          view = { screen: 'settings' };
          render();
        }
        return;
      case 'calendar':
        if (view.screen !== 'calendar') openCalendar();
        else if (view.date !== null || view.exerciseId !== null) {
          view = { ...view, date: null, exerciseId: null };
          render();
        }
        return;
      case 'coach':
        if (view.screen !== 'coach') void openCoachTab('today');
        return;
      case 'fuel':
        if (view.screen !== 'fuel') void openFuel();
        return;
      default: {
        const unhandled: never = tab;
        throw new Error(`Unhandled tab: ${String(unhandled)}`);
      }
    }
  }

  /** Bumped on every tab tap, so a slow Fuel load can tell another tab was chosen meanwhile. */
  let navSeq = 0;
  /** The tab just tapped: its first render scrolls to the top (some tabs load before they render). */
  let scrollTopTab: TabId | null = null;

  async function openFuel(): Promise<void> {
    const seq = ++navSeq;
    const from = view.screen;
    await fuel.open();
    // Another tab (or a workout) was chosen during the first load: stay there.
    if (seq !== navSeq || view.screen !== from) return;
    view = { screen: 'fuel' };
    render();
  }

  function goToday(): void {
    if (view.screen === 'session') finishDevLog();
    devLogPanel?.destroy();
    devLogPanel = null;
    disposeAudioTest(); // stops its camera, restores audioSession 'auto'
    fuel.closeSheet();
    view = { screen: 'today', upNextDayId: null, stats: null };
    render();
    void loadUpNext();
    void fuel.refresh().then(() => {
      if (view.screen === 'today') render();
    });
  }

  // ---------- Today ----------

  /** Weeks of history loaded for the streak (generous: the streak stops at the first gap). */
  const STATS_WEEKS = 26;

  async function loadUpNext(): Promise<void> {
    let upNext: string | null;
    try {
      await trainerReady;
      // All sessions: the calendar's rotation starts after the last finished one, however old.
      trainerSessions = await db.sessions.toArray();
      upNext =
        trainerUpNext(trainer ?? seedPlan(program), trainerSessions, todayDate())?.dayId ?? null;
    } catch (err) {
      console.warn('Could not read history', err);
      upNext = null;
    }
    upNext ??= planDays()[0]?.id ?? null; // never leave Start disabled
    if (view.screen !== 'today') return;
    view = { screen: 'today', upNextDayId: upNext, stats: null };
    render();
    // The tiles load separately, so a failed history query never blocks Start.
    try {
      const t = now();
      const sessions = await sessionsSince(db, t - STATS_WEEKS * 7 * 24 * 3600 * 1000);
      const sets = await setsForSessions(
        db,
        sessions.map((x) => x.sessionId),
      );
      if (view.screen === 'today' && view.upNextDayId === upNext) {
        view = { screen: 'today', upNextDayId: upNext, stats: todayStats(sessions, sets, t) };
        render();
      }
      // M12: the missed-day card and any recap due (each once; answers in settings 'coach').
      void coachPrompts(sets);
      // M12 1b: feel today, the Goal card and the go-easy weights (off-workout only).
      void Promise.all([loadFeels(), loadGoals(), loadEasyLastKg()]).then(() => {
        if (view.screen === 'today') render();
      });
    } catch (err) {
      console.warn('Could not read history stats', err);
    }
  }

  function todayStats(sessions: SessionRow[], sets: SetRow[], t: number): TodayStats {
    const dots = weekDots(sessions, t);
    const doneThisWeek = doneDaysThisWeek(sessions, t);
    const info = lastSession(sessions, sets);
    let last: TodayLast | null = null;
    if (info) {
      const prev = previousSameDaySession(sessions, info.sessionId);
      last = {
        dayName: planDays().find((d) => d.id === info.dayId)?.name ?? info.dayId,
        date: info.date,
        durationMs: info.durationMs,
        volumeKg: info.volumeKg,
        volumeVsLast: volumeVsLast(
          sets.filter((x) => x.sessionId === info.sessionId),
          prev ? sets.filter((x) => x.sessionId === prev.sessionId) : [],
        ),
      };
    }
    return {
      streakWeeks: weeklyStreak(sessions, t, STREAK_MIN_PER_WEEK),
      weekDots: dots,
      last,
      doneThisWeek,
    };
  }

  function todayScreen(upNextDayId: string | null, stats: TodayStats | null): HTMLElement {
    return renderToday(
      {
        now: now(),
        days: todayDays(),
        upNextDayId,
        streakWeeks: stats?.streakWeeks ?? 0,
        weekDots: stats?.weekDots ?? weekDots([], now()),
        last: stats?.last ?? null,
        doneThisWeek: stats?.doneThisWeek,
        unit,
        // M10: the dated week (moved days follow the calendar) once the trainer state is loaded.
        calendar:
          trainer && upNextDayId !== null
            ? calendar(trainer, trainerSessions, todayDate(), 7)
            : undefined,
        adjustedToday: adjustedTodayText(),
        newProgram,
        nudge: fuel.nudgeText(),
        missingKit: trainer && upNextDayId !== null ? todayMissingKit() : null,
        ...health.todayProps(),
        missedDay: trainer && upNextDayId !== null ? missedPrompt : null,
        missedAction: missedActionOf(missedPrompt),
        motion: todayMotion,
        todo: isVisible('todos', ownerOn()) ? todos.cardProps() : null,
        noticesOpen,
        // M12 1b
        feel: feels.find((f) => f.date === todayDate()) ?? null,
        feelOffers: todaysFeelOffers(feels, todayDate()),
        feelOpen,
        cardioMinutes: health.cardioMinutes(),
        goal: goalCardProps(),
      },
      {
        ...health.readinessActions(
          (chip) => void openCoach('today', { chip }),
          (area) => easyOnToday(area),
        ),
        onSaveFeel: (feel) => saveFeel(feel),
        onSetGoal: () => openIntake('today'),
        onOpenGoal: () => openIntake('settings'),
        // The hero goes through the preview, which loads last time's weights for the defaults.
        onStart: (day) => void openPreview(day),
        onOpenDay: (day) => void openPreview(day),
        onTab: (tab) => goTab(tab),
        onSearch: (opener) => openLibrary(opener),
        onNoticesToggle: (open) => {
          noticesOpen = open;
        },
        onUndoAdjust: () => void undoNewest('banner'),
        onTrainAnyway: (day) => trainAnyway(day),
        onUseNewProgram: () => void resetPlan(),
        onKeepPlan: () => keepPlan(),
        onDismissNudge: () => fuel.dismissNudge(),
        onOpenFuel: () => void openFuel(),
        onSeeGymSwap: (id) => seeGymSwap('today', id),
        onKeepExercise: (id) => keepGymExercise(id),
        // A focus-block miss: the coach's Do it today proposal for that day.
        onMoveMissed: (m) =>
          void answerMissed(m).then(() =>
            openCoachTab('today', { chip: 'doToday', args: { dayId: m.dayId } }),
          ),
        // A rotation miss is carried forward (usually today's workout): its preview.
        onStartMissed: (m) => void answerMissed(m).then(() => startMissed(m.dayId)),
        onSkipMissed: (m) => void answerMissed(m).then(() => render()),
        onOpenTodos: () => openTodos('today'),
      },
    );
  }

  // ---------- M10 trainer: plan state, coach sheet, Apply / Undo ----------

  async function loadTrainer(): Promise<void> {
    try {
      kit = await getTrainerKit(db);
    } catch (err) {
      logDbError(err); // the defaults stay
    }
    try {
      trainer = await loadTrainerState(db, program);
      newProgram = defaultProgramChanged(trainer, program);
      changes = await listChanges(db);
      gym = await loadGymProfile(db);
      await loadEasyLastKg();
    } catch (err) {
      // No stored plan (IndexedDB off): the default program, in memory, still runs.
      logDbError(err);
      trainer ??= seedPlan(program);
    }
  }

  // ----- M10e: kit his gym doesn't have (asked once, never silent) -----

  const missingFor = (exerciseId: string) => ({ exerciseId, name: exerciseName(exerciseId) });

  /** Today's first exercise the gym can't do (kept ones skipped), as it runs today. */
  function todayMissingKit(): { exerciseId: string; name: string } | null {
    if (!trainer) return null;
    const m = coreMissingKit(trainer, trainerSessions, trainerCatalog, todayDate(), gym.kept)[0];
    return m ? missingFor(m.exerciseId) : null;
  }

  /** The preview's first row the gym can't do (any day the preview shows). */
  function dayMissingKit(day: ProgramDay): { exerciseId: string; name: string } | null {
    if (!trainer) return null;
    const p = day.exercises.find(
      (x) => !gym.kept.includes(x.exerciseId) && !trainerCatalog.canDo(x.exerciseId),
    );
    return p ? missingFor(p.exerciseId) : null;
  }

  /** See a swap: the coach's plan-scope swap for the missing kit (Apply / Undo as usual). */
  function seeGymSwap(phase: CoachPhase, exerciseId: string): void {
    void openCoach(phase, { chip: 'gymSwap', args: { exerciseId } });
  }

  /** Keep it: stop asking about this exercise until My gym changes. */
  function keepGymExercise(exerciseId: string): void {
    if (!gym.kept.includes(exerciseId)) gym = { ...gym, kept: [...gym.kept, exerciseId] };
    render();
    void keepExercise(db, exerciseId)
      .then((p) => {
        gym = p;
        if (view.screen === 'today' || view.screen === 'preview') render();
      })
      .catch(logDbError);
  }

  /** My gym: save the ticked items (clears Keep it choices), then rerender. */
  function saveGym(equipment: readonly string[]): void {
    // The checklist flips its row in place: no render here, so focus stays on the row.
    gym = { equipment: [...equipment], kept: [], updatedAt: now() };
    void saveGymProfile(db, equipment, now())
      .then((p) => {
        gym = p;
      })
      .catch(logDbError);
  }

  /** Dev log (M10): ids only, never message text. Lands only while a workout's log is open. */
  function trainerLog(
    intent: string,
    action: string,
    outcome: 'shown' | 'applied' | 'dismissed' | 'undone',
    source: string,
  ): void {
    rec((r) => r.logEvent('trainer', { intent, action, outcome, source }));
  }

  /** "Adjusted today: …" for today's override; null when there's none to show or undo. */
  function adjustedTodayText(): string | null {
    if (!trainer) return null;
    const eff: EffectiveDay = effDay(trainer, todayDate());
    const o = eff.override;
    if (!o || eff.done) return null;
    // Train anyway writes a plain override that isn't a coach change (nothing to undo).
    if (!o.rest && !o.adjust && o.dayId === undefined) return null;
    const planDay = trainer.plan.days.find((d) => d.id === (o.dayId ?? eff.day?.id));
    return adjustSummary(o, exerciseName, planDay);
  }

  /** The plan days, with today's day as it runs (so the hero counts what Start runs). */
  function todayDays(): readonly ProgramDay[] {
    if (!trainer) return program.days;
    const eff = effDay(trainer, todayDate());
    const run = !eff.done && !eff.rest && eff.adjusted ? eff.day : null;
    return trainer.plan.days.map((d) => (run && d.id === run.id ? run : d));
  }

  /** Stores a new trainer state that isn't a plan change (Train anyway, Keep mine). */
  function saveTrainer(next: TrainerState): void {
    trainer = next;
    void saveTrainerState(db, next).catch(logDbError);
  }

  /**
   * Train anyway on a rest day (Decision, main): today becomes a training day in the trainer
   * state (a `{ date }` override, version bump, no PlanChange), so the calendar and the coach
   * agree, then the preview of the day it runs.
   */
  function trainAnyway(day: ProgramDay): void {
    if (trainer) {
      const date = todayDate();
      // Rest only because of a standing "Not today": take that postpone back as a change.
      const postponed = postponeRestingToday(trainer, date);
      if (postponed) {
        void trainAnywayRevert(trainer, postponed, date, day);
        return;
      }
      saveTrainer({
        ...trainer,
        version: trainer.version + 1,
        overrides: [...trainer.overrides.filter((o) => o.date !== date), { date }],
      });
      const eff = effDay(trainer, date);
      void openPreview(eff.day ?? day);
      return;
    }
    void openPreview(day);
  }

  /**
   * The newest standing postpone whose rest override on `date` is still in the state, or null
   * (today is a genuine rest weekday, or the rest came from somewhere else).
   */
  function postponeRestingToday(state: TrainerState, date: string): PlanChange | null {
    const resting = (os: readonly DayOverride[]) => os.some((o) => o.date === date && o.rest);
    if (!resting(state.overrides)) return null;
    let found: PlanChange | null = null;
    for (const c of changes) {
      if (c.action !== 'postpone' || c.undoneAt !== undefined) continue;
      if (!resting(c.after.overrides) || resting(c.before.overrides)) continue;
      if (!found || c.createdAt > found.createdAt) found = c;
    }
    return found;
  }

  /**
   * Train anyway after a "Not today": the dates that postpone touched go back to what they were
   * before it (where they still are as it left them), so the rest day it turned into a training
   * day doesn't stay an extra session. Stored as its own change, with the normal Undo toast.
   */
  async function trainAnywayRevert(
    state: TrainerState,
    postpone: PlanChange,
    date: string,
    day: ProgramDay,
  ): Promise<void> {
    const key = (o: DayOverride | undefined) => (o ? JSON.stringify(o) : '');
    const byDate = (os: readonly DayOverride[], d: string) => os.find((o) => o.date === d);
    const touched = new Set(
      [...postpone.before.overrides, ...postpone.after.overrides]
        .map((o) => o.date)
        .filter(
          (d) =>
            key(byDate(postpone.before.overrides, d)) !== key(byDate(postpone.after.overrides, d)),
        )
        .filter(
          (d) => key(byDate(state.overrides, d)) === key(byDate(postpone.after.overrides, d)),
        ),
    );
    touched.add(date);
    const restored = [...touched].flatMap((d) => {
      const o = byDate(postpone.before.overrides, d);
      return o ? [structuredClone(o)] : [];
    });
    const next: TrainerState = {
      ...structuredClone(state),
      version: state.version + 1,
      overrides: [...state.overrides.filter((o) => !touched.has(o.date)), ...restored],
    };
    trainer = next;
    const change = await saveChangeRecord(next, {
      createdAt: now(),
      action: 'postpone',
      title: 'Train anyway today',
      source: 'chip',
      before: structuredClone(state),
      after: structuredClone(next),
    });
    changes = [change, ...changes];
    trainerLog('trainAnyway', 'postpone', 'applied', 'chip');
    showUndoToast('Done. Today is a training day.', change.id);
    const eff = effDay(next, date);
    void openPreview(eff.day ?? day);
  }

  /** M10-q11 "Keep mine": his plan stays; the prompt goes until program.json changes again. */
  function keepPlan(): void {
    if (!trainer) return;
    saveTrainer({
      ...trainer,
      version: trainer.version + 1,
      plan: { ...trainer.plan, seededFrom: programHash(program) },
    });
    newProgram = false;
    render();
  }

  async function resetPlan(): Promise<void> {
    if (!trainer) return;
    const r = resetToProgram(trainer, program, now(), 'chip');
    if (!r.ok) return;
    trainer = r.state;
    newProgram = false;
    const change = await saveChangeRecord(r.state, r.change);
    changes = [change, ...changes];
    trainerLog('reset', 'reset', 'applied', 'chip');
    showUndoToast('Done. Default program is back.');
    refreshAfterChange();
  }

  /** Saves state + change in one transaction; returns the change with its id. */
  async function saveChangeRecord(state: TrainerState, change: PlanChange): Promise<PlanChange> {
    try {
      const id = await commitChange(db, state, change);
      return { ...change, id };
    } catch (err) {
      logDbError(err);
      return change;
    }
  }

  /** Re-render whatever is under the change (Today / preview / Plan changes / Summary). */
  function refreshAfterChange(): void {
    if (view.screen === 'today') {
      void loadUpNext();
    } else if (view.screen === 'preview') {
      const eff = trainer ? effDay(trainer, todayDate()) : null;
      // Not today from the preview: today no longer runs this day, so back to Today.
      if (view.today && (!eff || eff.rest || eff.day?.id !== view.day.id)) goToday();
      else void openPreview(view.planDay);
    } else if (view.screen === 'session' && view.s.phase === 'summary') {
      void loadSummaryHistory(view.s);
      render();
    } else {
      render();
    }
  }

  // ----- the running session follows a mid-workout change -----

  /**
   * Replays the plan change on the running session (the reducer accepts both events while
   * paused, so the Pause sheet's coach works too):
   * - every row that differs between the session's day and today's day in `next`, and that has no
   *   logged set yet, is replaced or removed with REPLACE_UPCOMING;
   * - every row of today's day that pairs with no session row and isn't in the session (an Undo
   *   of a removal) goes back with INSERT_UPCOMING, right after the row it followed in today's
   *   day (or first). Logged sets are never touched.
   * Rows are paired with the adjust's row map (DayAdjust.replaced) when it has one.
   */
  function syncSession(next: TrainerState): void {
    if (view.screen !== 'session' || view.s.phase === 'summary') return;
    const start = view.s;
    const t = now();
    const today = effDay(next, todayDate());
    if (!today.day || today.day.id !== start.day.id) return;
    const target = today.day.exercises;
    const replaced = today.override?.adjust?.replaced ?? [];
    let s = start;
    type RowEvent = Extract<SessionEvent, { type: 'REPLACE_UPCOMING' | 'INSERT_UPCOMING' }>;
    const step = (e: RowEvent, fromId: string | null, toId: string | null): void => {
      const after = nextState(s, e);
      if (after === s) return;
      // Ids only in the dev log.
      rec((r) => r.logEvent(e.type, { exIndex: e.exIndex, exerciseId: fromId, toId }));
      s = after;
    };
    const pairs = alignRows(start.day.exercises, target, replaced);
    for (const { from, to } of pairs) {
      if (!rowChanged(from, to)) continue;
      if (s.logs.some((l) => l.exerciseId === from.exerciseId)) continue;
      const exIndex = s.day.exercises.findIndex((p) => p.exerciseId === from.exerciseId);
      if (exIndex < 0) continue;
      step(
        { type: 'REPLACE_UPCOMING', exIndex, planned: to, now: t },
        from.exerciseId,
        to?.exerciseId ?? null,
      );
    }
    // Rows that came back (Undo of a removal): in today's order, after the row they followed.
    const paired = new Set(pairs.map((x) => x.to));
    target.forEach((p, i) => {
      if (paired.has(p) || s.phase === 'summary') return;
      if (s.day.exercises.some((x) => x.exerciseId === p.exerciseId)) return;
      let exIndex = 0;
      for (let k = i - 1; k >= 0; k--) {
        const at = s.day.exercises.findIndex((x) => x.exerciseId === target[k]?.exerciseId);
        if (at >= 0) {
          exIndex = at + 1;
          break;
        }
      }
      step({ type: 'INSERT_UPCOMING', exIndex, planned: p, now: t }, null, p.exerciseId);
    });
    if (s === start) return;
    view = { screen: 'session', s, sheet: null };
    if (s.phase === 'summary') onFinished(s);
    syncCamera();
    render();
  }

  /** The session row records what this workout ran with (stalls skip adjusted sessions). */
  function markSessionAdjust(action: ProposalAction): void {
    if (view.screen !== 'session' || sessionAdjust.includes(action)) return;
    sessionAdjust = [...sessionAdjust, action];
    void db.sessions.update(view.s.sessionId, { adjust: [...sessionAdjust] }).catch(logDbError);
  }

  /** Speaks a confirmation mid-workout: a cue, queued (never cancels), never during a set. */
  function sayConfirmation(text: string | undefined): void {
    if (!text || view.screen !== 'session') return;
    const s = view.s;
    if (s.phase === 'summary' || (s.phase === 'exercise' && !s.paused)) return;
    voice.speak(text, { kind: 'cue' });
  }

  // ----- Apply / Undo -----

  /** Undo the newest standing change (LIFO). With `id`, only if it's that one. */
  async function undoNewest(source: string, id?: number): Promise<void> {
    if (!trainer) return;
    const r = undoLast(trainer, changes, now(), id);
    if (!r.ok) {
      showNotice(UNDO_FAILED);
      return;
    }
    trainer = r.state;
    const undone = r.change;
    changes = changes.map((c) =>
      (undone.id !== undefined ? c.id === undone.id : c.createdAt === undone.createdAt)
        ? undone
        : c,
    );
    await saveChangeRecord(r.state, undone);
    trainerLog('undo', undone.action, 'undone', source);
    markCardsUndone(undone.id);
    expireStale(); // cards built on the plan before the Undo can't apply now
    removeToast();
    syncSession(r.state); // mid-workout: only rows still unstarted go back
    refreshAfterChange();
  }

  function removeToast(): void {
    // An Undo toast's 10 s timer is cleared too (a notice has no dispose).
    toast?.dispose?.();
    toast?.remove();
    toast = null;
    document.documentElement.style.removeProperty('--toast-space');
  }

  /**
   * Keeps the toast above the screen's bottom chrome (tab bar, sticky Start / Set done dock), so
   * nothing it would hide is underneath for its 10 s. That chrome already carries the bottom
   * safe area; with none, the CSS default keeps the toast clear of it.
   */
  function placeToast(): void {
    if (!toast) return;
    let top = window.innerHeight;
    // A Fuel sheet covers the screen's chrome: the toast drops to the bottom edge instead, and
    // the sheet keeps its main button above it (--toast-space, fuel.css). `.fuel-sheet` is the
    // class src/ui/fuel gives every body-level sheet; a new sheet kind that needs this layout
    // must carry it. data-toast-over records the choice for e2e (fuel.spec.ts).
    const sheet = document.querySelector('.fuel-sheet');
    toast.dataset.toastOver = sheet ? 'sheet' : 'screen';
    if (!sheet) {
      for (const el of root.querySelectorAll<HTMLElement>('[data-tabbar], .sticky-bottom')) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.bottom > 0 && r.top < top) top = r.top;
      }
    }
    const above = window.innerHeight - top;
    if (above > 0) toast.style.setProperty('--toast-bottom', `${Math.round(above + 8)}px`);
    else toast.style.removeProperty('--toast-bottom');
    // Room the toast takes from the bottom of the screen (plus a gap), for sheets under it.
    const space = window.innerHeight - toast.getBoundingClientRect().top + 8;
    document.documentElement.style.setProperty('--toast-space', `${Math.round(space)}px`);
  }
  window.addEventListener('resize', placeToast);
  // Fuel sheets open and close as body children: the toast moves with them (over a sheet it sits
  // at the bottom edge; back on a screen, above the tab bar again).
  new MutationObserver(placeToast).observe(document.body, { childList: true });

  function showUndoToast(text: string, id?: number): void {
    removeToast();
    const el: UndoToast = undoToast(
      { text },
      {
        onUndo: () => void undoNewest('toast', id),
        onExpire: () => {
          if (toast === el) removeToast();
        },
      },
    );
    toast = el;
    document.body.append(el);
    placeToast();
  }

  /** M7: an Undo toast for a Fuel action (log, delete); `onUndo` puts it back. */
  function showActionToast(text: string, onUndo: () => void): void {
    removeToast();
    const el: UndoToast = undoToast(
      { text },
      {
        onUndo: () => {
          removeToast();
          onUndo();
        },
        onExpire: () => {
          if (toast === el) removeToast();
        },
      },
    );
    toast = el;
    document.body.append(el);
    placeToast();
  }

  /** A short status line in the toast slot (no Undo), gone after 4 s. */
  function showNotice(text: string, kind = 'status'): void {
    removeToast();
    const el = h(
      'div',
      { class: 'undo-toast', role: 'status', 'data-notice': kind },
      h('p', { class: 'undo-text' }, text),
    );
    toast = el;
    document.body.append(el);
    placeToast();
    window.setTimeout(() => {
      if (toast === el) removeToast();
    }, 4000);
  }

  // ----- Plan changes (Settings) -----

  function openPlanChanges(): void {
    view = { screen: 'planChanges' };
    render();
    void listChanges(db)
      .then((list) => {
        changes = list;
        if (view.screen === 'planChanges') render();
      })
      .catch(logDbError);
  }

  function planChangesView(): HTMLElement {
    return planChangesScreen(
      { changes },
      {
        onBack: () => {
          view = { screen: 'settings' };
          render();
        },
        onUndo: (c) => void undoNewest('planChanges', c.id),
        onReset: () => void resetPlan(),
      },
    );
  }

  // ----- M12 the coach: one thread, two frames (Coach tab + the Pause sheet's compact chat) -----

  /**
   * Opens the coach. Mid-workout ('workout', the Pause sheet only) → the compact sheet on the same
   * thread. Anything else (Today / preview Coach buttons, the readiness card, the missing-kit
   * prompt, Summary's stall card) → the Coach tab, with `first` already sent.
   */
  async function openCoach(phase: CoachPhase, first?: CoachInput): Promise<void> {
    if (phase === 'workout') {
      await openChatSheet();
      return;
    }
    await openCoachTab(phase, first);
  }

  /** Thread loaded once (pruned to 30 days on start); later turns append to `thread`. */
  function ensureThread(): Promise<void> {
    threadReady ??= (async () => {
      try {
        await pruneChat(db, now());
        thread = await listThread(db, now());
      } catch (err) {
        logDbError(err);
      }
      expireStale();
    })();
    return threadReady;
  }

  /** History the coach reads (stalls, last weights) and Fuel's totals; read on every open. */
  async function loadCoachHistory(): Promise<void> {
    try {
      trainerSessions = await db.sessions.toArray();
      const finished = trainerSessions.filter((x) => x.endedAt !== undefined);
      const sets = await setsForSessions(
        db,
        finished.map((x) => x.sessionId),
      );
      const ids = [...new Set(planDays().flatMap((d) => d.exercises.map((p) => p.exerciseId)))];
      coachHistory = { sets, lastWeightKg: lastWeights(await lastSessionSets(db, ids)) };
      await fuel.ensureLoaded();
    } catch (err) {
      logDbError(err);
    }
  }

  async function openCoachTab(phase: CoachPhase, first?: CoachInput): Promise<void> {
    await trainerReady;
    if (view.screen === 'session') {
      // Summary's stall card: the workout is over; close its log like Done does.
      if (view.s.phase !== 'summary') return;
      finishDevLog();
    }
    fuel.closeSheet();
    tabPhase = phase;
    if (view.screen !== 'coach') {
      setEnter('coach');
      chatSeen = undefined; // a fresh open shows the thread as it is (no rise-in)
    }
    await ensureThread();
    view = { screen: 'coach' };
    render();
    await loadCoachHistory();
    // M12 slice 2: the mic's availability, and this week's check-in once (Coach tab only).
    void refreshMic();
    await postCheckInIfDue();
    if (first) await coachSend(first, saidFor(first), phase);
  }

  async function openChatSheet(): Promise<void> {
    if (chatSheet || !trainer) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await ensureThread();
    await loadCoachHistory();
    if (chatSheet) return;
    chatSeen = undefined;
    chatSheet = { el: null, opener };
    renderChatSheet();
    void refreshMic(); // the Pause sheet may open before the Coach tab ever did
  }

  function closeChatSheet(): void {
    const s = chatSheet;
    if (!s) return;
    void micCancel(); // a hold never outlives the sheet (no mic in a set)
    // Mid-workout proposals left open are set aside (they were built for this set's state).
    for (const m of thread) {
      if (m.phase !== 'workout' || m.id === undefined || !isPendingCard(m)) continue;
      const entry = liveProposals.get(m.id);
      if (entry) trainerLog(entry.intent, entry.proposal.action, 'dismissed', entry.source);
      liveProposals.delete(m.id);
      patchCard(m.id, { status: 'dismissed' });
    }
    s.el?.remove();
    chatSheet = null;
    if (!howTo) root.inert = false;
    const back =
      (s.opener?.isConnected ? s.opener : null) ??
      root.querySelector<HTMLElement>('[data-pause="coach"]');
    back?.focus();
  }

  /** Words for his bubble when a chip is sent from outside the chat (Today, Summary, …). */
  function saidFor(input: CoachInput): string {
    if ('text' in input) return input.text;
    const quick = QUICK_CHIPS.find((c) => c.id === input.chip);
    if (quick) return quick.label;
    const ex = input.args?.exerciseId;
    switch (input.chip) {
      case 'deload':
        return 'Deload week';
      case 'gymSwap':
        return ex ? `Swap ${exerciseName(ex)}` : 'Swap an exercise';
      case 'stallFix':
        return ex ? `Fix ${exerciseName(ex)}` : 'Adjust my plan';
      case 'week':
        return "How's my week?";
      case 'progress':
        return 'How am I doing?';
      case 'doToday': {
        const id = input.args?.dayId;
        const name = id ? planDays().find((d) => d.id === id)?.name : undefined;
        return name ? `Do ${name} today` : 'Do a workout today';
      }
      case 'moveDay': {
        const from = input.args?.from;
        return from ? `Move ${dayLong(from)}` : 'Move a workout';
      }
      default:
        return input.chip.charAt(0).toUpperCase() + input.chip.slice(1);
    }
  }

  const isPendingCard = (m: ChatMessage): boolean =>
    (m.card?.kind === 'proposal' || m.card?.kind === 'focusBlock') && m.card.status === 'pending';

  /** Updates a card in memory and in the store (ids < 0: the store was unavailable). */
  function patchCard(id: number, patch: ChatCardPatch): void {
    const i = thread.findIndex((m) => m.id === id);
    const m = thread[i];
    if (!m?.card) return;
    const card = m.card;
    let next: ChatCard = card;
    if (card.kind === 'proposal')
      next = {
        ...card,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.changeId !== undefined ? { changeId: patch.changeId } : {}),
      };
    else if (card.kind === 'focusBlock' && patch.status !== undefined)
      next = { ...card, status: patch.status };
    else if (card.kind === 'food' && patch.logged !== undefined)
      next = { ...card, logged: [...patch.logged] };
    else if (card.kind === 'checkIn' && patch.checkIn !== undefined)
      next = { ...card, status: patch.checkIn };
    thread = thread.map((x, k) => (k === i ? { ...m, card: next } : x));
    if (id > 0) void updateCard(db, id, patch).catch(logDbError);
  }

  /**
   * A pending card can still be applied only while its live Proposal is in memory and the plan
   * hasn't changed since (baseVersion). Otherwise it reads "expired" with Ask again.
   */
  function expireStale(): void {
    for (const m of thread) {
      if (m.id === undefined || !isPendingCard(m)) continue;
      const entry = liveProposals.get(m.id);
      if (entry && trainer && entry.proposal.baseVersion === trainer.version) continue;
      liveProposals.delete(m.id);
      patchCard(m.id, { status: 'expired' });
    }
  }

  /** Waiting focus-block cards read "expired" (their live proposals are dropped, not logged). */
  function expireWaitingBlocks(): void {
    for (const m of thread) {
      if (m.id === undefined || m.card?.kind !== 'focusBlock' || !isPendingCard(m)) continue;
      liveProposals.delete(m.id);
      patchCard(m.id, { status: 'expired' });
    }
  }

  /** Stores a message; with the store off it still shows (negative id, not kept). */
  async function postMessage(m: ChatMessage): Promise<ChatMessage> {
    let id: number;
    try {
      id = await addMessage(db, m);
    } catch (err) {
      logDbError(err);
      id = --tempMsgId;
    }
    const saved: ChatMessage = { ...m, id };
    thread = [...thread, saved];
    return saved;
  }

  /** The newest pending focus-block card's block: what "only 4 days a week" revises. */
  function focusDraft(): FocusBlock | undefined {
    for (let i = thread.length - 1; i >= 0; i--) {
      const c = thread[i]?.card;
      if (c?.kind === 'focusBlock' && c.status === 'pending') return focusDrafts.get(c.blockId);
    }
    return undefined;
  }

  /** What core's coach reads. Mid-workout, today is the running day as it runs now. */
  function coachContext(phase: CoachPhase): CoachContext {
    const t = todayDate();
    let state = trainer ?? seedPlan(program);
    let logged: string[] = [];
    let lastWeightKg = coachHistory.lastWeightKg;
    if (phase === 'workout' && view.screen === 'session') {
      const s = view.s;
      lastWeightKg = { ...s.lastWeightKg };
      logged = [...new Set(s.logs.map((l) => l.exerciseId))];
      // The running set's exercise counts as started (the reducer won't replace it).
      if (s.phase === 'exercise') logged.push(currentPlanned(s).exerciseId);
      const eff = effectiveDay(state, trainerSessions, t);
      if (eff.rest || eff.day?.id !== s.day.id)
        state = {
          ...state,
          overrides: [...state.overrides.filter((o) => o.date !== t), { date: t, dayId: s.day.id }],
        };
    }
    const draft = phase === 'workout' ? undefined : focusDraft();
    return {
      phase,
      state,
      sessions: trainerSessions,
      sets: coachHistory.sets,
      changes,
      today: t,
      unit,
      lastWeightKg,
      logged,
      catalog: trainerCatalog,
      gymKept: gym.kept,
      m7Available: fuel.m7Available(),
      fuel: fuel.coachFuel(),
      ...(draft ? { focusDraft: draft } : {}),
    };
  }

  /** The phase of a turn sent now: the open Pause-sheet chat, else the Coach tab's. */
  function phaseNow(): CoachPhase {
    return chatSheet ? 'workout' : tabPhase;
  }

  /** One turn: his message, the router's answer (chips → rules), both stored. */
  async function coachSend(
    input: CoachInput,
    said: string,
    phase: CoachPhase,
    opts: { viaMic?: boolean } = {},
  ): Promise<void> {
    if (chatBusy || !trainer) return;
    chatBusy = true;
    try {
      await ensureThread();
      const chip = 'chip' in input ? input : null;
      await postMessage({
        createdAt: now(),
        role: 'user',
        text: said,
        source: chip ? 'chip' : 'rules',
        phase,
        ...(opts.viaMic ? { viaMic: true as const } : {}),
        // The chip he tapped (id + args), so Ask again can send it again.
        ...(chip
          ? {
              chips: [
                { id: chip.chip, label: said, ...(chip.args ? { args: { ...chip.args } } : {}) },
              ],
            }
          : {}),
      });
      chatTyping = true;
      renderCoachViews();
      lastAppleTrace = null;
      const r = await router.ask(input, { coach: coachContext(phase), turns: thread });
      chatTyping = false;
      brainLog(r.source, opts.viaMic === true);
      const msg: ChatMessage = {
        createdAt: now(),
        role: 'coach',
        text: r.reply,
        source: r.source,
        phase,
        ...(r.say ? { say: r.say } : {}),
        ...(r.note ? { note: r.note } : {}),
        ...(r.usedHealth ? { usedHealth: true } : {}),
        ...(r.learnId ? { learnId: r.learnId } : {}),
        ...(r.chips.length
          ? {
              chips: r.chips.map((c) => ({
                id: c.id,
                label: c.label,
                ...(c.args ? { args: { ...c.args } } : {}),
              })),
            }
          : {}),
      };
      const p = r.proposal;
      if (r.safety === 'redFlag') msg.card = { kind: 'redFlag' };
      else if (p && p.action === 'focusBlock' && r.focusBlock) {
        focusDrafts.set(r.focusBlock.id, r.focusBlock);
        msg.card = { kind: 'focusBlock', blockId: r.focusBlock.id, status: 'pending' };
      } else if (p)
        msg.card = {
          kind: 'proposal',
          title: p.title,
          lines: p.lines.map((l) => ({ ...l })),
          why: p.why,
          status: 'pending',
          baseVersion: p.baseVersion,
        };
      else if (r.foods?.length) msg.card = { kind: 'food', suggestions: r.foods, logged: [] };
      // A revised focus block replaces the one waiting: only the newest card keeps Apply.
      if (msg.card?.kind === 'focusBlock') expireWaitingBlocks();
      const saved = await postMessage(msg);
      // M13c: the coach couldn't help → the Claude explain card (shown, never sent; once a day).
      const offerNow = claudeOfferFor({
        outcome: claudeOutcomeOf(
          {
            reply: r.reply,
            safety: r.safety,
            source: chip ? 'chip' : r.source,
            ...(r.note ? { note: r.note } : {}),
            ...(p ? { proposal: p } : {}),
            ...(r.foods ? { foods: r.foods } : {}),
            ...(r.focusBlock ? { focusBlock: r.focusBlock } : {}),
          },
          { couldntDo: [COULDNT_DO] },
        ),
        claudeWanted: coachSettings.claudeWanted,
        offer: claudeOffer,
        today: todayDate(),
        phase,
      });
      if (offerNow.show && saved.id !== undefined) {
        claudeOfferMsgId = saved.id;
        claudeOffer = claudeOfferShown(todayDate());
        void db.settings.put({ key: 'claudeOffer', value: claudeOffer }).catch(logDbError);
      }
      if (p && saved.id !== undefined && msg.card?.kind !== 'redFlag') {
        liveProposals.set(saved.id, { proposal: p, source: r.source, intent: r.intent });
        trainerLog(r.intent, p.action, 'shown', r.source);
      }
      // Only the red-flag line is spoken, and only mid-workout (core sets `say` then).
      if (r.say && phase === 'workout') voice.speak(r.say, { kind: 'cue' });
      // M12 slice 2: Speak replies (default: answers to mic-sent messages). The chat is never
      // open during a set (the Pause sheet is paused), so a reply never talks over a count.
      else if (
        shouldSpeak({
          speakReplies: coachSettings.speakReplies,
          viaMic: opts.viaMic,
          phase,
          inSet: false,
        })
      ) {
        const line = sayFor({ reply: r.reply, say: r.say }, phase);
        if (line) voice.speak(line, { kind: 'cue' });
      }
    } finally {
      chatBusy = false;
      chatTyping = false;
    }
    renderCoachViews();
  }

  /** The coach's Keep X chip (UI-only): open proposals are set aside, nothing changes. */
  async function keepFromCoach(exerciseId: string, said: string): Promise<void> {
    for (const m of thread) {
      if (m.id === undefined || !isPendingCard(m)) continue;
      const entry = liveProposals.get(m.id);
      if (entry) trainerLog(entry.intent, entry.proposal.action, 'dismissed', entry.source);
      liveProposals.delete(m.id);
      patchCard(m.id, { status: 'dismissed' });
    }
    const phase = phaseNow();
    await postMessage({ createdAt: now(), role: 'user', text: said, source: 'chip', phase });
    await postMessage({
      createdAt: now(),
      role: 'coach',
      text: `OK, keeping ${exerciseName(exerciseId)}. I won't ask again until you change My gym.`,
      source: 'chip',
      phase,
    });
    keepGymExercise(exerciseId);
    renderCoachViews();
  }

  /** Lighter today applied after a set was logged: started lifts keep their weights. */
  const LIGHTER_STARTED = 'Done. Lifts not started yet are lighter.';

  async function applyFromChat(id: number): Promise<void> {
    const entry = liveProposals.get(id);
    liveProposals.delete(id);
    if (!entry || !trainer) {
      patchCard(id, { status: 'expired' });
      renderCoachViews();
      return;
    }
    const r = applyProposal(trainer, entry.proposal, now(), entry.source);
    if (!r.ok) {
      patchCard(id, { status: 'expired' });
      renderCoachViews();
      return;
    }
    trainer = r.state;
    const change = await saveChangeRecord(r.state, r.change);
    changes = [change, ...changes];
    if (change.id !== undefined) appliedChange.set(id, change.id);
    patchCard(id, {
      status: 'applied',
      ...(change.id !== undefined ? { changeId: change.id } : {}),
    });
    justApplied = id;
    trainerLog(entry.intent, entry.proposal.action, 'applied', entry.source);
    expireStale(); // other open cards were built on the plan before this change
    const workout = chatSheet !== null && view.screen === 'session';
    if (workout) {
      // Mid-workout Lighter today only changes lifts with no logged set: say so once any are.
      const say =
        entry.proposal.action === 'lighter' && view.screen === 'session' && view.s.logs.length > 0
          ? LIGHTER_STARTED
          : entry.proposal.say;
      closeChatSheet();
      markSessionAdjust(entry.proposal.action);
      syncSession(r.state);
      sayConfirmation(say);
      // The sheet is gone, so its Undo lives in the toast.
      showUndoToast(say ?? `Done. ${entry.proposal.title}.`, change.id);
    }
    refreshAfterChange();
  }

  function dismissFromChat(id: number): void {
    const entry = liveProposals.get(id);
    liveProposals.delete(id);
    if (entry) trainerLog(entry.intent, entry.proposal.action, 'dismissed', entry.source);
    patchCard(id, { status: 'dismissed' });
    renderCoachViews();
  }

  /** The plan change a card applied (proposal: stored; focus block: found in the change log). */
  function changeIdOf(m: ChatMessage): number | undefined {
    if (m.id !== undefined && appliedChange.has(m.id)) return appliedChange.get(m.id);
    const c = m.card;
    if (c?.kind === 'proposal') return c.changeId;
    if (c?.kind !== 'focusBlock') return undefined;
    const has = (s: TrainerState) => (s.blocks ?? []).some((b) => b.id === c.blockId);
    return changes.find((x) => x.action === 'focusBlock' && has(x.after) && !has(x.before))?.id;
  }

  async function undoFromChat(id: number): Promise<void> {
    const m = thread.find((x) => x.id === id);
    const changeId = m ? changeIdOf(m) : undefined;
    if (changeId === undefined) {
      showNotice(UNDO_FAILED);
      return;
    }
    await undoNewest('chat', changeId);
  }

  /** After any Undo (card, toast, Plan changes): the card that applied it reads "undone". */
  function markCardsUndone(changeId: number | undefined): void {
    if (changeId === undefined) return;
    for (const m of thread)
      if (m.id !== undefined && m.card && 'status' in m.card && m.card.status === 'applied')
        if (changeIdOf(m) === changeId) patchCard(m.id, { status: 'undone' });
  }

  /** Ask again on an expired / dismissed card: what he asked before it, sent again. */
  function askAgain(id: number): void {
    const at = thread.findIndex((m) => m.id === id);
    for (let i = at - 1; i >= 0; i--) {
      const m = thread[i];
      if (m?.role !== 'user') continue;
      const c = m.chips?.[0];
      const input: CoachInput = c
        ? { chip: c.id as CoachChipId, ...(c.args ? { args: c.args as CoachArgs } : {}) }
        : { text: m.text };
      void coachSend(input, m.text, phaseNow());
      return;
    }
  }

  /** M7 F3: a food idea's Log → the store, the row marked logged, the Undo toast. */
  function logChatFood(id: number, index: number): void {
    const m = thread.find((x) => x.id === id);
    const card = m?.card;
    if (card?.kind !== 'food') return;
    const s = card.suggestions[index];
    if (!s || card.logged.includes(index)) return;
    patchCard(id, { logged: [...card.logged, index] });
    renderCoachViews();
    const unlog = () => {
      const now2 = thread.find((x) => x.id === id)?.card;
      if (now2?.kind !== 'food') return;
      patchCard(id, { logged: now2.logged.filter((i) => i !== index) });
      renderCoachViews();
    };
    void fuel.logSuggestion(s, unlog).catch((err: unknown) => {
      logDbError(err);
      unlog();
    });
  }

  async function clearThread(): Promise<void> {
    try {
      await clearChat(db);
    } catch (err) {
      logDbError(err);
    }
    thread = [];
    liveProposals.clear();
    focusDrafts.clear();
    appliedChange.clear();
    chatSeen = undefined;
    renderCoachViews();
  }

  /**
   * What to offer under the thread: the newest coach reply's chips (in its own frame), else the
   * defaults. An answered card brings the defaults back (as Not now did on the M10 sheet).
   */
  function chatOffers(sheet: boolean): {
    quick: QuickChipId[] | undefined;
    showAreas: boolean;
    followUps: ChatChip[];
  } {
    const m = thread.at(-1);
    const none = { quick: undefined, showAreas: false, followUps: [] };
    if (!m || m.role !== 'coach' || !m.chips?.length) return none;
    if ((m.phase === 'workout') !== sheet) return none;
    if (m.card && 'status' in m.card && m.card.status !== 'pending') return none;
    const split = splitReplyChips(m.chips as ChatChip[]);
    const quick = sheet ? split.quick.filter((id) => WORKOUT_CHAT_CHIPS.includes(id)) : split.quick;
    return {
      quick: quick.length ? quick : undefined,
      showAreas: split.showAreas,
      followUps: split.followUps,
    };
  }

  /** Message ids whose applied card is the newest standing change (Undo is LIFO). */
  function undoableIds(): number[] {
    const top = changes
      .filter((c) => c.undoneAt === undefined)
      .reduce<PlanChange | null>((a, c) => (!a || c.createdAt > a.createdAt ? c : a), null);
    if (top?.id === undefined) return [];
    return thread.flatMap((m) =>
      m.id !== undefined &&
      m.card &&
      'status' in m.card &&
      m.card.status === 'applied' &&
      changeIdOf(m) === top.id
        ? [m.id]
        : [],
    );
  }

  function chatProps(sheet: boolean): Omit<ChatProps, 'variant'> {
    expireStale();
    const offers = chatOffers(sheet);
    const blocks: Record<string, FocusBlock> = Object.fromEntries(focusDrafts);
    for (const b of trainer?.blocks ?? []) blocks[b.id] = b;
    let messages: readonly ChatMessage[] = thread;
    // The Pause sheet opens on what it can do mid-workout (shown, not stored).
    if (sheet && thread.at(-1)?.phase !== 'workout')
      messages = [
        ...thread,
        {
          createdAt: now(),
          role: 'coach',
          text: MID_SESSION_REPLY,
          source: 'rules',
          phase: 'workout',
        },
      ];
    return {
      messages,
      typing: chatTyping,
      chips: offers.quick,
      starters: trainer && !sheet ? starterChips(coachContext(tabPhase)) : undefined,
      followUps: offers.followUps,
      showAreas: offers.showAreas,
      // The Coach tab, and the Pause sheet (paused: no set is running). Never during a set.
      allowTyping: true,
      inWorkout: sheet,
      ...(claudeOfferMsgId !== null ? { claudeOffer: { messageId: claudeOfferMsgId } } : {}),
      focusBlocks: blocks,
      exerciseName,
      isFocusExercise: (exId, block) => isFocusExercise(exId, block.group, trainerCatalog),
      undoable: undoableIds(),
      justApplied,
      animateAfter: chatSeen,
      // M12 slice 2 (iPhone app only): the mic, and who answered on each coach bubble.
      mic: micProps(sheet),
      showSource: native,
      // The check-in card is answered on the Coach tab only (never in the Pause sheet).
      ...(sheet ? {} : { checkInQuestions: CHECK_IN_VIEWS, checkIns: checkInMap() }),
    };
  }

  function chatActions(): ChatActions {
    return {
      onText: (text) => void coachSend({ text }, text, phaseNow()),
      onChip: (c) =>
        void coachSend({ chip: c.id, ...(c.args ? { args: c.args } : {}) }, c.label, phaseNow()),
      onArea: (area) =>
        void coachSend({ chip: area }, area.charAt(0).toUpperCase() + area.slice(1), phaseNow()),
      onFollowUp: (index) => {
        const f = chatOffers(chatSheet !== null).followUps[index];
        if (!f) return;
        // M12 1b review: "Set a goal" / "Change my goal" opens Settings → Your goal.
        if ((f.id as string) === 'goalEdit') {
          closeChatSheet();
          openIntake('settings');
          return;
        }
        const keepId = f.id === 'keepExercise' ? f.args?.exerciseId : undefined;
        if (keepId) {
          void keepFromCoach(keepId, f.label);
          return;
        }
        void coachSend({ chip: f.id, ...(f.args ? { args: f.args } : {}) }, f.label, phaseNow());
      },
      onApply: (id) => void applyFromChat(id),
      onDismiss: (id) => dismissFromChat(id),
      onUndo: (id) => void undoFromChat(id),
      onAskAgain: (id) => askAgain(id),
      onLogFood: (id, index) => logChatFood(id, index),
      onLearn: (learnId, opener) => {
        const card = findLearnCard(LEARN_CARDS, learnId);
        if (card) openLearnCard(card, opener);
      },
      // M13c: the Claude card's two answers. Nothing is sent: the key comes in a later release.
      onClaudeWanted: () => {
        claudeOfferMsgId = null;
        coachSettings = { ...coachSettings, claudeWanted: 'yes' };
        void patchCoachRow({ claudeWanted: 'yes' }).catch(logDbError);
        renderCoachViews();
      },
      onClaudeDismiss: () => {
        claudeOfferMsgId = null;
        renderCoachViews();
      },
      onEndWorkout: () => {
        closeChatSheet();
        dispatch({ type: 'FINISH', now: now() });
      },
      micDown: () => micDown(),
      // 1.15.0 (Checkpoint J): Apple's English speech model, downloaded once on his tap.
      micInstall: () => void installSpeech(),
      onInputFocus: () => {
        // Text-box focus is a strong signal a question follows (same instructions as the ask).
        if (gymBrain)
          void gymBrain.prewarm(
            brainInstructions({ phase: phaseNow(), voice: coachVoice.persona }),
          );
      },
      micUp: () => void micUp(),
      micCancel: () => void micCancel(),
    };
  }

  /** After a render: the check morph plays once, and only newer messages rise in next time. */
  function chatRendered(): void {
    justApplied = undefined;
    chatSeen = thread.reduce((n, m) => Math.max(n, m.id ?? 0), 0);
  }

  function coachTabView(): HTMLElement {
    const el = coachTabScreen(
      chatProps(false),
      {
        ...chatActions(),
        onClearChat: () => void clearThread(),
        onCheckInDone: (id, answers) => void checkInDone(id, answers),
        onCheckInSkip: (id) => void checkInSkip(id),
      },
      tabBar('coach', (t) => goTab(t)),
    );
    coachTabEl = el;
    chatRendered();
    return el;
  }

  function renderChatSheet(): void {
    const s = chatSheet;
    if (!s) return;
    const el = chat(
      { ...chatProps(true), variant: 'sheet' },
      {
        ...chatActions(),
        onClose: closeChatSheet,
      },
    );
    chatRendered();
    if (s.el?.isConnected) s.el.replaceWith(el);
    else document.body.append(el);
    s.el = el;
    root.inert = true; // the sheet is modal
    const apply = [...el.querySelectorAll<HTMLElement>('.proposal-apply')].at(-1);
    const input = el.querySelector<HTMLElement>('#chat-input-sheet');
    (apply ?? (refocusInput ? input : null) ?? el).focus();
  }

  /** Re-renders whichever chat frame is up (keeps the text box focused while he types). */
  function renderCoachViews(): void {
    const active = document.activeElement;
    refocusInput = active instanceof HTMLInputElement && active.id.startsWith('chat-input');
    if (chatSheet) renderChatSheet();
    else if (view.screen === 'coach') {
      render();
      if (refocusInput) root.querySelector<HTMLElement>('#chat-input')?.focus();
    }
    refocusInput = false;
  }

  // ---------- M12 slice 2: Apple brain, mic, reminders (iPhone app), weekly check-in ----------
  // Nothing here makes a network request: Apple's model, speech and notifications run on the
  // phone. The PWA keeps the rules brain, shows no mic and no source badge, and has no reminders.
  const native = nativeShell();
  // M13d: a light tap on main-button presses in the iPhone app; lazy so the PWA never loads it.
  if (native) setPressFeel(() => import('../native/haptics').then((m) => m.tapLight()));
  // M13d: swipe from the left edge = the screen's Back (a light tap on commit in the iPhone app).
  // Only in the iPhone app and the home-screen web app: in a Safari tab the browser's own edge
  // swipe means "leave the page".
  const standalone = (() => {
    try {
      return window.matchMedia('(display-mode: standalone)').matches;
    } catch {
      return false;
    }
  })();
  if (native || standalone)
    installEdgeBack(root, {
      feel: () => {
        if (native) void import('../native/haptics').then((m) => m.tapLight());
      },
    });
  let gymBrain: GymBrain | null = null;
  let speech: Speech | null = null;
  let reminders: Reminders | null = null;
  /** settings 'coach' (slice 2 fields), read at startup and again on every Apple ask. */
  let coachSettings: CoachSettings = {};
  /** settings 'reminders', merged over the defaults (all off). */
  let reminderSettings: ReminderSettings = mergeReminders(undefined);
  let notifPermission: NotificationPermission = 'unknown';
  let brainStatus: BrainStatusView = native
    ? { brain: 'unknown' }
    : { brain: 'rules', reason: 'notNative' };
  let brainChecking = native;
  /** The Apple turn just answered (dev log: ids and numbers only). */
  let lastAppleTrace: AppleTrace | null = null;
  /**
   * 1.15.2: the model's context window as the phone reports it (GymBrain `measure().contextSize`,
   * iOS 26.4+; 8192 on his iPhone, 4096 before). Unknown → the 4096-token budget (context.ts).
   */
  let appleWindowTokens: number | undefined;
  let checkInRows: CheckIn[] = [];
  let coachTabEl: HTMLElement | null = null;
  let evalState: BrainEvalProps = { state: 'idle' };
  const REMINDERS_KEY = 'reminders';
  const CHECK_IN_TEXT = 'Check-in: how did this week feel?';
  const CHECK_IN_VIEWS: readonly CheckInQuestionView[] = CHECK_IN_QUESTIONS.map((q) => ({
    id: q.id,
    label: q.label,
    low: CHECK_IN_SCALE.low,
    high: CHECK_IN_SCALE.high,
  }));

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

  /** The slice 2 fields of settings 'coach' (speak replies, the M12-q1 card-reasons decision). */
  async function loadCoachSettings(): Promise<CoachSettings> {
    try {
      const v = (await db.settings.get(COACH_UI_KEY))?.value;
      const o = isRecord(v) ? v : {};
      const sr = o.speakReplies;
      coachSettings = {
        ...(sr === 'mic' || sr === 'always' || sr === 'off' ? { speakReplies: sr } : {}),
        ...(typeof o.appleCardReasons === 'boolean'
          ? { appleCardReasons: o.appleCardReasons }
          : {}),
        ...(o.claudeWanted === 'yes' || o.claudeWanted === 'later' || o.claudeWanted === 'no'
          ? { claudeWanted: o.claudeWanted }
          : {}),
      };
    } catch (err) {
      logDbError(err);
    }
    return coachSettings;
  }

  /** Merges `patch` into settings 'coach'; every other field of the row is kept. */
  async function patchCoachRow(patch: Partial<CoachSettings>): Promise<void> {
    await db.transaction('rw', db.settings, async () => {
      const prev = (await db.settings.get(COACH_UI_KEY))?.value;
      await db.settings.put({
        key: COACH_UI_KEY,
        value: { ...(isRecord(prev) ? prev : {}), ...patch },
      });
    });
  }

  /** What the Apple brain reads beyond the BrainContext (read on every ask). */
  const appleDeps: AppleDeps = {
    extras: async () => {
      const cs = await loadCoachSettings();
      const card = health.todayProps().readiness;
      return {
        lighterCard: card ? { signals: card.signals, reasons: card.reasons } : null,
        ...(intake
          ? { goalKind: intake.goalKind, ...(intake.goalText ? { goalText: intake.goalText } : {}) }
          : {}),
        goals,
        ...(cs.appleCardReasons !== undefined ? { appleCardReasons: cs.appleCardReasons } : {}),
        voice: coachVoice.persona,
      };
    },
    windowTokens: () => appleWindowTokens,
  };

  /** Reads the window size once per launch (a token count, no reply); a failure keeps 4096. */
  async function measureAppleWindow(gb: GymBrain): Promise<void> {
    try {
      const { request } = await buildAppleRequest(
        'Hi',
        { coach: coachContext(phaseNow()), turns: [] },
        appleDeps,
      );
      const counts = await gb.measure(request);
      if (counts && Number.isFinite(counts.contextSize) && counts.contextSize > 0)
        appleWindowTokens = counts.contextSize;
    } catch {
      // No count (older iOS, Apple Intelligence off): keep the 4096-token budget, quietly.
    }
  }

  /** iPhone app: load the plugins, put Apple's brain before the rules, plan reminders. */
  async function initSlice2(): Promise<void> {
    await loadCoachSettings();
    try {
      reminderSettings = mergeReminders((await db.settings.get(REMINDERS_KEY))?.value);
    } catch (err) {
      logDbError(err);
    }
    if (!native) return;
    const [gb, sp, rm] = await Promise.all([
      import('../native/gymBrain').then((m) => m.loadGymBrain()),
      import('../native/speech').then((m) => m.loadSpeech()),
      import('../native/reminders').then((m) => m.loadReminders()),
    ]);
    gymBrain = gb;
    speech = sp;

    reminders = rm;
    const apple = appleBrain(gb, appleDeps);
    router = createRouter(
      [
        {
          id: 'apple',
          status: () => apple.status(),
          // askApple = apple.ask plus its trace (ids and numbers, never text) for the dev log.
          ask: async (text, ctx) => {
            const a = await askApple(gb, text, ctx, appleDeps);
            lastAppleTrace = a.trace;
            return a.reply;
          },
        },
        rulesBrain,
      ],
      { notes: coachNoteStore(db) },
    );
    void refreshBrainStatus();
    void measureAppleWindow(gb);
    void syncReminders();
    if (view.screen === 'coach') void refreshMic();
  }

  const TOOL_NAMES = new Set(TRAINER_TOOLS.map((t) => t.name));

  /** Dev log: which brain answered, the action, latency, mic yes/no. Never any text. */
  function brainLog(source: string, mic: boolean): void {
    // 1.15.2: a rule-matched change answered inside the Apple brain has source 'rules' and a
    // trace with route 'rules' (no model call), so the log can tell it from an Apple fallback.
    const t =
      source === 'apple' || (source === 'rules' && lastAppleTrace?.route === 'rules')
        ? lastAppleTrace
        : null;
    rec((r) =>
      r.logEvent('coachBrain', {
        brain: source,
        mic,
        ...(t
          ? {
              action: t.action,
              // Only known tool names reach the log (a misbehaving bridge can't add text).
              calls: t.calls.map((c) => (TOOL_NAMES.has(c.name) ? c.name : '?')),
              latencyMs: t.latencyMs,
              replaced: t.replaced,
              route: t.route,
              ...(t.why ? { why: t.why } : {}),
            }
          : {}),
      }),
    );
  }

  // ----- the hold-to-talk mic (GymSpeech, on-device; Coach tab and Pause sheet only) -----
  type MicRun = { partial: string; level: number; started: Promise<boolean> };
  /** null: not checked yet (the mic stays hidden until it is). */
  let micAvail: { available: true } | { available: false; reason: string } | null = null;
  let micRun: MicRun | null = null;

  function micProps(sheet: boolean): MicProps {
    if (!speech || !micAvail) return { state: 'hidden' };
    // The chat is only up on the Coach tab or the Pause sheet (paused: no set running).
    if (!micAllowed({ native, inSet: false, screen: sheet ? 'pause' : 'coach' }))
      return { state: 'hidden' };
    if (micInstalling) return { state: 'downloading' };
    if (!micAvail.available) return { state: 'unavailable', reason: micAvail.reason };
    if (micRun) return { state: 'listening', partial: micRun.partial, level: micRun.level };
    return { state: 'idle' };
  }

  /** True while iOS downloads the speech model (his tap on "Download speech for the mic"). */
  let micInstalling = false;
  async function installSpeech(): Promise<void> {
    const sp = speech;
    if (!sp || micInstalling) return;
    micInstalling = true;
    renderCoachViews();
    // iOS's download can stall; after 3 minutes show "didn't finish" (Try again) instead of hanging.
    const ok = await Promise.race([
      sp.installModel().catch(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 180_000)),
    ]);
    micInstalling = false;
    if (ok) await refreshMic();
    else {
      micAvail = { available: false, reason: 'installFailed' };
      renderCoachViews();
    }
  }

  async function refreshMic(): Promise<void> {
    if (!speech) return;
    try {
      const a = await speech.availability();
      // Inside the iPhone app a missing plugin reads "unsupported", never "works in the iPhone app".
      micAvail =
        !a.available && a.reason === 'notNative' ? { available: false, reason: 'unsupported' } : a;
    } catch {
      micAvail = { available: false, reason: 'unsupported' };
    }
    renderCoachViews();
  }

  /** Partial text / level in place (about ten a second); a full render only when needed. */
  function patchMic(): void {
    const el = chatSheet?.el ?? (view.screen === 'coach' ? coachTabEl : null);
    if (!el || !updateChatMic(el, micProps(chatSheet !== null))) renderCoachViews();
  }

  function micDown(): void {
    const sp = speech;
    if (!sp || micRun || chatBusy || !micAvail?.available) return;
    // A strong signal a question follows: warm Apple's model with the same instructions.
    if (gymBrain)
      void gymBrain.prewarm(brainInstructions({ phase: phaseNow(), voice: coachVoice.persona }));
    const run: MicRun = { partial: '', level: 0, started: Promise.resolve(false) };
    micRun = run;
    run.started = sp
      .start({
        partial: (t) => {
          if (micRun !== run) return;
          run.partial = t;
          patchMic();
        },
        level: (rms) => {
          if (micRun !== run) return;
          run.level = rms;
          patchMic();
        },
        error: (code) => {
          if (micRun !== run) return;
          micRun = null;
          if (code === 'permissionDenied')
            micAvail = { available: false, reason: 'permissionDenied' };
          renderCoachViews();
        },
      })
      .then((res) => {
        if (res.ok) return true;
        if (micRun === run) micRun = null;
        if (res.code === 'permissionDenied')
          micAvail = { available: false, reason: 'permissionDenied' };
        else if (res.code === 'unavailable') void refreshMic();
        renderCoachViews();
        return false;
      })
      .catch(() => {
        if (micRun === run) micRun = null;
        renderCoachViews();
        return false;
      });
    patchMic();
  }

  /** Released on the button: what was heard is sent, marked as said with the mic. */
  async function micUp(): Promise<void> {
    const run = micRun;
    const sp = speech;
    if (!run || !sp) return;
    const ok = await run.started;
    if (micRun !== run) return; // cancelled or failed meanwhile
    micRun = null;
    let text = '';
    if (ok) {
      try {
        text = (await sp.stop()).trim();
      } catch {
        text = '';
      }
    }
    text ||= run.partial.trim();
    patchMic();
    if (text) await coachSend({ text }, text, phaseNow(), { viaMic: true });
  }

  /** Released off the button, Escape, focus lost (e.g. the iOS permission alert): nothing sent. */
  async function micCancel(): Promise<void> {
    const run = micRun;
    if (!run) return;
    micRun = null;
    patchMic();
    if (await run.started) {
      try {
        await speech?.stop();
      } catch {
        // nothing to send either way
      }
    }
  }

  // ----- reminders (local notifications; all off until he turns one on) -----
  let reminderSync: Promise<void> = Promise.resolve();

  /** Re-plans the next 14 days and hands iOS the changes (queued, one at a time). */
  function syncReminders(sets?: readonly SetRow[]): Promise<void> {
    reminderSync = reminderSync.then(() => planReminders(sets)).catch(logDbError);
    return reminderSync;
  }

  async function planReminders(given?: readonly SetRow[]): Promise<void> {
    const api = reminders;
    if (!native || !api?.available || !trainer) return;
    const sessions = await db.sessions.toArray();
    const sets =
      given ??
      (await setsForSessions(
        db,
        sessions.filter((x) => x.endedAt !== undefined).map((x) => x.sessionId),
      ));
    const ui = await getCoachUi(db);
    const pending = await api.pending();
    const plan = reminderPlan(
      reminderSettings,
      { state: trainer, sessions, sets, answeredMissed: ui.missedAnswered, pending },
      now(),
    );
    if (plan.cancel.length) await api.cancel(plan.cancel);
    if (plan.schedule.length) await api.schedule(plan.schedule, now());
  }

  async function saveReminders(): Promise<void> {
    try {
      await db.settings.put({ key: REMINDERS_KEY, value: reminderSettings });
    } catch (err) {
      logDbError(err);
    }
    void syncReminders();
  }

  async function refreshPermission(): Promise<void> {
    if (!reminders?.available) return;
    const p = await reminders.permission();
    notifPermission = p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'unknown';
    if (view.screen === 'reminders') render();
  }

  async function toggleReminder(kind: ReminderKind, on: boolean): Promise<void> {
    const s = reminderSettings;
    let next: ReminderSettings =
      kind === 'session'
        ? { ...s, session: { ...s.session, on } }
        : kind === 'missedDay'
          ? { ...s, missedDay: { on } }
          : { ...s, sundayRecap: { on } };
    reminderSettings = next;
    render();
    // iOS asks for permission only the first time one is turned on.
    if (on && !s.askedPermission && reminders?.available) {
      try {
        const p = await reminders.request();
        notifPermission = p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'unknown';
      } catch (err) {
        logDbError(err);
        notifPermission = 'unknown';
      }
      next = { ...reminderSettings, askedPermission: true };
      reminderSettings = next;
    }
    await saveReminders();
    if (view.screen === 'reminders') render();
  }

  // ----- the weekly check-in (Coach tab; answers never reach any brain) -----
  function checkInMap(): Record<string, CheckIn> {
    return Object.fromEntries(checkInRows.map((c) => [c.weekStart, c]));
  }

  async function postCheckInIfDue(): Promise<void> {
    try {
      checkInRows = await listCheckIns(db);
      const week = checkInDue(todayDate(), checkInRows);
      if (!week) return;
      // Only about a week he trained in (a fresh install or a week off gets no check-in).
      const [y, m, d] = week.split('-').map(Number) as [number, number, number];
      const weekEnd = localDate(new Date(y, m - 1, d + 6, 12).getTime());
      const trained = trainerSessions.some((x) => {
        const day = localDate(x.startedAt);
        return x.endedAt !== undefined && day >= week && day <= weekEnd;
      });
      if (!trained) return;
      if (thread.some((m) => m.card?.kind === 'checkIn' && m.card.weekStart === week)) return;
      await postMessage({
        createdAt: now(),
        role: 'coach',
        text: CHECK_IN_TEXT,
        source: 'rules',
        phase: 'today',
        card: { kind: 'checkIn', weekStart: week, status: 'pending' },
      });
      renderCoachViews();
    } catch (err) {
      logDbError(err);
    }
  }

  async function checkInDone(id: number, answers: CheckInAnswers): Promise<void> {
    const card = thread.find((m) => m.id === id)?.card;
    if (card?.kind !== 'checkIn' || card.status !== 'pending') return;
    try {
      await saveCheckIn(db, { weekStart: card.weekStart, ...answers }, now());
      checkInRows = await listCheckIns(db);
    } catch (err) {
      logDbError(err);
    }
    patchCard(id, { checkIn: 'done' });
    renderCoachViews();
  }

  async function checkInSkip(id: number): Promise<void> {
    const card = thread.find((m) => m.id === id)?.card;
    if (card?.kind !== 'checkIn' || card.status !== 'pending') return;
    try {
      await skipCheckIn(db, card.weekStart, now());
      checkInRows = await listCheckIns(db);
    } catch (err) {
      logDbError(err);
    }
    patchCard(id, { checkIn: 'skipped' });
    renderCoachViews();
  }

  // ----- Settings → Coach, Reminders, Coach eval -----
  /** Where Settings was scrolled when a sub-screen opened from it (Back returns there). */
  let settingsScrollY = 0;
  function rememberSettingsScroll(): void {
    settingsScrollY = view.screen === 'settings' ? window.scrollY : 0;
  }

  function backToSettings(): void {
    view = { screen: 'settings' };
    render();
    window.scrollTo(0, settingsScrollY);
  }

  async function refreshBrainStatus(): Promise<void> {
    if (!native) {
      brainStatus = { brain: 'rules', reason: 'notNative' };
      brainChecking = false;
      return;
    }
    const gb = gymBrain;
    if (!gb) return; // initSlice2 checks once the plugin is loaded
    brainChecking = true;
    if (view.screen === 'coachSettings') render();
    try {
      const a = await gb.availability();
      brainStatus = a.available ? { brain: 'apple' } : { brain: 'rules', reason: a.reason };
    } catch {
      // The check itself failed (plugin error, junk, timeout): not a real reason, so say so.
      brainStatus = { brain: 'unknown' };
    } finally {
      brainChecking = false;
    }
    if (view.screen === 'coachSettings') render();
  }

  function openCoachSettings(): void {
    rememberSettingsScroll();
    view = { screen: 'coachSettings' };
    render();
    window.scrollTo(0, 0);
    void refreshBrainStatus();
  }

  function coachSettingsView(): HTMLElement {
    return coachSettingsScreen(
      { status: brainStatus, speakReplies: coachSettings.speakReplies, checking: brainChecking },
      {
        onBack: backToSettings,
        onSpeakReplies: (v) => {
          coachSettings = { ...coachSettings, speakReplies: v };
          void patchCoachRow({ speakReplies: v }).catch(logDbError);
          render();
        },
        ...(native ? { onRecheck: () => void refreshBrainStatus() } : {}),
      },
    );
  }

  function openReminders(): void {
    rememberSettingsScroll();
    view = { screen: 'reminders' };
    render();
    window.scrollTo(0, 0);
    void refreshPermission();
  }

  function remindersView(): HTMLElement {
    return remindersScreen(
      { native, settings: reminderSettings, permission: notifPermission },
      {
        onBack: backToSettings,
        onToggle: (kind, on) => void toggleReminder(kind, on),
        onTime: (time) => {
          reminderSettings = {
            ...reminderSettings,
            session: { ...reminderSettings.session, time },
          };
          void saveReminders();
          render();
        },
      },
    );
  }

  // ----- M13: first launch (welcome → intake → permission pages) -----

  type OnboardingRun = {
    steps: OnboardingStep[];
    index: number;
    dir?: 'next' | 'prev' | undefined;
    granted: Partial<Record<OnboardingPermission, boolean>>;
    /** The first open of a release asking only what's still missing (not the welcome). */
    catchUp?: boolean;
    /** M13d: the Units page's choice (saved when you leave that page forward). */
    units?: UnitPrefs;
  };
  let onboarding: OnboardingRun | null = null;
  let onboardingEl: OnboardingScreen | null = null;

  /**
   * A fresh install (shouldOnboard) runs the flow before Today; `rerun` (route 'welcome', e.g.
   * the Published look to-do's Try it) shows it again without the intake on a used install.
   * Returns whether the flow opened.
   */
  async function startOnboarding(rerun: boolean): Promise<boolean> {
    try {
      const f = await loadOnboardingFacts(db);
      if (!rerun && !shouldOnboard(f)) return false;
      const steps = onboardingSteps({
        platform: native ? 'native' : 'web',
        fresh: f.sessions === 0 && !rerun,
        intakeDone: f.intakeDone,
        has: { health: native, mic: native, notifications: native },
      });
      // M13d: a fresh install preselects units from the phone's region; a re-run shows the saved ones.
      const units = rerun || f.sessions > 0 ? await getUnitPrefs(db) : defaultUnits(deviceLocale());
      onboarding = { steps, index: 0, granted: {}, units };
      showOnboardingStep();
      return true;
    } catch (err) {
      logDbError(err);
      return false;
    }
  }

  // Loaded lazily: the web build never fetches native modules.
  const nativePermissions = async () => (await import('../native/permissions')).nativePermissions();
  const requestMicPermission = async () =>
    (await import('../native/permissions')).requestMicPermission();

  /**
   * iPhone app, first open of each release: the permission pages for what's still undecided
   * (camera, Health, mic + speech download, notifications) when the welcome didn't run. Once per
   * release, Allow or Not now; denied ones stay in Self-check (iOS can't ask again).
   */
  async function startPermissionCatchUp(): Promise<boolean> {
    if (!native) return false;
    try {
      // Already asked this release: return before any native call, so launches stay fast.
      const seen = await loadPermissionCatchUp(db);
      if (seen === APP_RELEASE) return false;
      await slice2Ready;
      const [perms, notif, healthOn, sp] = await Promise.all([
        nativePermissions(),
        reminders?.available ? reminders.permission().catch(() => undefined) : undefined,
        import('../data/health/store')
          .then(async (m) => Object.values((await m.getHealthSettings(db)).enabled).some(Boolean))
          .catch(() => undefined),
        speech ? speech.availability().catch(() => undefined) : undefined,
      ]);
      const steps = permissionCatchUpSteps({
        platform: 'native',
        release: APP_RELEASE,
        seenRelease: seen,
        onboarding: onboarding !== null,
        states: {
          ...(perms ? { camera: perms.camera, mic: perms.mic } : {}),
          ...(notif ? { notifications: notif } : {}),
          ...(healthOn === undefined ? {} : { health: healthOn ? 'connected' : 'not-connected' }),
        },
        // A mic turned off in iOS Settings can't be asked again: Self-check says where to turn it on.
        speechInstalled:
          sp && perms?.mic !== 'denied'
            ? sp.available || sp.reason !== 'modelNotInstalled'
            : undefined,
      });
      if (steps.length === 0) {
        await markPermissionCatchUp(db, APP_RELEASE);
        return false;
      }
      // Leave a tour (or a workout) that opened while we waited; the next launch asks (nothing is marked).
      if (view.screen !== 'today' || onboarding || tour || tourChecking) return false;
      onboarding = { steps, index: 0, granted: {}, catchUp: true };
      showOnboardingStep();
      return true;
    } catch (err) {
      logDbError(err);
      return false;
    }
  }

  function showOnboardingStep(): void {
    const run = onboarding;
    if (!run) return;
    if (run.steps[run.index]?.kind === 'intake') {
      openIntake('first');
      return;
    }
    if (run.steps[run.index]?.kind === 'fuelSetup') {
      // M13d: Set up Fuel is a step of the first run (never a jump to the Fuel tab).
      const goal = flowFuelGoal;
      if (!goal) {
        onboardingGo(run.dir === 'prev' ? -1 : 1);
        return;
      }
      fuel.setupForGoal(goal, {
        inFlow: true,
        onLeave: (how) => {
          if (how === 'skip') {
            // "Not now": no Fuel targets; the step is dropped and the flow moves on.
            flowFuelGoal = null;
            run.steps = run.steps.filter((s) => s.kind !== 'fuelSetup');
            run.dir = 'next';
            if (run.index >= run.steps.length) finishOnboarding('done');
            else showOnboardingStep();
            return;
          }
          if (how === 'back') intakeAtSummary = true;
          onboardingGo(how === 'saved' ? 1 : -1);
        },
      });
      return;
    }
    view = { screen: 'welcome' };
    render();
    window.scrollTo(0, 0);
  }

  function onboardingGo(delta: 1 | -1): void {
    const run = onboarding;
    if (!run) return;
    if (delta > 0 && run.steps[run.index]?.kind === 'units' && run.units) saveUnits(run.units);
    const next = run.index + delta;
    if (next >= run.steps.length) {
      finishOnboarding('done');
      return;
    }
    run.index = Math.max(0, next);
    run.dir = delta > 0 ? 'next' : 'prev';
    showOnboardingStep();
  }

  /** M13d: the Units page's choice applies now (Set up Fuel and Measurements read it next). */
  function saveUnits(u: UnitPrefs): void {
    unit = u.weight;
    lengthUnit = u.length;
    void setUnitPrefs(db, u).catch(logDbError);
  }

  function finishOnboarding(how: 'done' | 'skipped'): void {
    const run0 = onboarding;
    // Skip-all from the Units page still keeps the units shown there.
    if (how === 'skipped' && run0?.units && run0.steps[run0.index]?.kind === 'units')
      saveUnits(run0.units);
    const catchUp = onboarding?.catchUp === true;
    flowFuelGoal = null;
    intakeAtSummary = false;
    onboarding = null;
    onboardingEl?.dispose();
    onboardingEl = null;
    if (catchUp) void markPermissionCatchUp(db, APP_RELEASE).catch(logDbError);
    else void markOnboarding(db, how, now()).catch(logDbError);
    goToday();
    if (catchUp) void maybeShowTour();
  }

  /** The permission page's action: ask (or connect / switch on), then show it as allowed. */
  async function onboardingAllow(p: OnboardingPermission): Promise<void> {
    let ok = false;
    try {
      if (p === 'camera') {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        for (const t of stream.getTracks()) t.stop(); // asked only: nothing is kept
        ok = true;
      } else if (p === 'health') {
        await health.connect();
        ok = true;
      } else if (p === 'mic') {
        // Ask for the mic only while iOS hasn't decided; then fetch the on-phone speech model.
        // null = an older native build without the read: move on, the first mic hold still asks.
        const before = await nativePermissions();
        const mic = before?.mic === 'prompt' ? (await requestMicPermission())?.mic : before?.mic;
        await slice2Ready;
        const a = speech ? await speech.availability().catch(() => null) : null;
        if (a && !a.available && a.reason === 'modelNotInstalled') void installSpeech();
        ok = mic === 'granted';
      } else if (p === 'notifications') {
        await toggleReminder('session', true); // the switch asks iOS the first time
        ok = notifPermission === 'granted';
      }
    } catch (err) {
      console.warn('Permission not given', err);
    }
    const run = onboarding;
    if (!run) return;
    if (ok) run.granted = { ...run.granted, [p]: true };
    if (ok) {
      run.dir = undefined;
      if (view.screen === 'welcome') render();
    } else onboardingGo(1);
  }

  function welcomeView(): HTMLElement {
    const run = onboarding;
    if (!run) {
      // Not in a flow (e.g. a stale render): Today, and the route says so (tab state follows).
      view = { screen: 'today', upNextDayId: null, stats: null };
      return todayScreen(null, null);
    }
    onboardingEl?.dispose();
    const ob = onboardingScreen(
      { steps: run.steps, index: run.index, granted: run.granted, dir: run.dir, units: run.units },
      {
        onUnits: (u) => {
          run.units = u;
        },
        onNext: () => onboardingGo(1),
        onBack: () => onboardingGo(-1),
        onSkipAll: () => finishOnboarding('skipped'),
        onDone: () => finishOnboarding('done'),
        onAllow: (p) => void onboardingAllow(p),
        onNotNow: () => onboardingGo(1),
      },
    );
    onboardingEl = ob;
    return ob.el;
  }

  // ----- M13: About, open-source credits, owner tools -----

  function openAbout(): void {
    rememberSettingsScroll();
    view = { screen: 'about' };
    render();
    window.scrollTo(0, 0);
  }

  function aboutView(): HTMLElement {
    return aboutScreen(
      { version: versionLine(ownerOn()), owner: ownerOn(), now: () => now() },
      {
        onBack: backToSettings,
        onLicenses: () => openLicenses(),
        onOwnerChange: (on) => {
          void setOwnerMode(db, on, now())
            .then((m) => {
              ownerMode = m;
              void todos.refresh();
              if (view.screen === 'about') render();
            })
            .catch(logDbError);
        },
      },
    );
  }

  /** The credits list loads once per visit (a dynamic import); re-renders keep it. */
  let licensesEl: HTMLElement | null = null;
  function openLicenses(): void {
    licensesEl = null;
    view = { screen: 'licenses' };
    render();
    window.scrollTo(0, 0);
  }

  function licensesScreenView(): HTMLElement {
    licensesEl ??= licensesView({ onBack: () => openAbout() });
    return licensesEl;
  }

  /** 1.15.0: is the app ready for the gym? Runs once per visit; Run again on the screen. */
  let selfCheckEl: HTMLElement | null = null;
  function openSelfCheck(): void {
    rememberSettingsScroll();
    selfCheckEl = null;
    view = { screen: 'selfCheck' };
    render();
    window.scrollTo(0, 0);
  }

  function selfCheckView(): HTMLElement {
    selfCheckEl ??= selfCheckScreen(
      {
        checks: selfCheckRuns(
          defaultSelfCheckDeps(db, {
            release: APP_RELEASE,
            // The build hash is an owner surface: owner off → no build in the row or the copy.
            build: isVisible('buildHash', ownerOn()) ? APP_BUILD : '',
            native,
          }),
        ),
        // The build hash is an owner surface (M13); the version line follows owner mode.
        version: versionLine(ownerOn()),
      },
      { onBack: backToSettings },
    );
    return selfCheckEl;
  }

  function openBrainEval(): void {
    if (!isVisible('evalScreen', ownerOn())) {
      goTab('settings');
      return;
    }
    rememberSettingsScroll();
    view = { screen: 'brainEval' };
    render();
    window.scrollTo(0, 0);
    void measureEvalTokens();
  }

  /** Token counts for one real request (iOS 26.4+; null elsewhere), for the Checkpoint J budget check. */
  let evalTokens: BrainEvalTokens | null = null;
  async function measureEvalTokens(): Promise<void> {
    const gb = gymBrain;
    if (!gb) return;
    try {
      const phase = phaseNow();
      const { request } = await buildAppleRequest(
        "How's my week?",
        { coach: coachContext(phase), turns: thread },
        appleDeps,
      );
      evalTokens = await gb.measure(request);
      if (evalTokens && Number.isFinite(evalTokens.contextSize) && evalTokens.contextSize > 0)
        appleWindowTokens = evalTokens.contextSize;
    } catch (err) {
      logDbError(err);
      evalTokens = null;
    }
    if (view.screen === 'brainEval') render();
  }

  function brainEvalView(): HTMLElement {
    return brainEvalScreen(
      { ...evalState, tokens: evalTokens },
      {
        onBack: backToSettings,
        onRun: () => void runEval(),
        onExport: () => exportEval(),
      },
    );
  }

  async function runEval(): Promise<void> {
    if (evalState.state === 'running') return;
    const gb = gymBrain;
    if (!gb) {
      evalState = { state: 'unavailable', reason: 'notNative' };
      render();
      return;
    }
    const prev = evalState.report;
    // No progress line until the runner knows the item count (no "0 of 0").
    evalState = { state: 'running', ...(prev ? { report: prev } : {}) };
    render();
    try {
      const res = await runBrainEval({
        bridge: gb,
        program,
        catalog: trainerCatalog,
        now: () => now(),
        ...(appleWindowTokens !== undefined && { windowTokens: appleWindowTokens }),
        onProgress: (done, total) => {
          if (total <= 0) return;
          evalState = { ...evalState, progress: { done, total } };
          if (view.screen === 'brainEval') render();
        },
      });
      evalState = res.ok
        ? { state: 'done', report: res.report }
        : { state: 'unavailable', reason: res.reason };
    } catch (err) {
      logDbError(err);
      evalState = { state: 'idle', ...(prev ? { report: prev } : {}) };
    }
    if (view.screen === 'brainEval') render();
  }

  /** The eval report (ids, actions, pass/safe, latency; no text) as a file on this phone. */
  /** The share sheet in the iPhone app (an <a download> click does nothing there). */
  function exportEval(): void {
    const report = evalState.report;
    if (!report) return;
    void saveFile(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
      `gym-clean-coach-eval-${localDate(report.at)}.json`,
      'Coach eval',
    ).catch(logDbError);
  }

  // ---------- M12 slice 1c: What's New tour + to-dos (todo/todoHost.ts) ----------
  // Facts + auto ticks on open, foreground and entering To-dos; the tour only over Today on open
  // / foreground (or Settings → What's new), never over a workout, its preview or the camera.
  const todos = createTodoHost({
    db,
    now: () => now(),
    platform: nativeShell() ? 'native' : 'web',
    onChange: () => {
      if (view.screen === 'today' || view.screen === 'todos' || view.screen === 'todoTopic')
        render();
    },
    logError: (err) => logDbError(err),
    owner: () => ownerOn(),
  });
  let tour: WhatsNewTour | null = null;
  let tourChecking = false;

  /** Removes the tour without marking it seen (forced: a workout or the camera took over). */
  function closeTour(): void {
    const t = tour;
    tour = null;
    if (!t) return;
    t.dispose();
    t.el.remove();
  }

  function showTour(pages: readonly WhatsNewPage[]): void {
    if (tour || pages.length === 0 || camera) return;
    if (view.screen === 'session' || view.screen === 'preview') return;
    const t = todos.createTour(pages, {
      onClosed: () => {
        if (tour !== t) return;
        tour = null;
        t.el.remove();
      },
      onTryIt: (route) => goRoute(route),
      onOpenTodos: () => goRoute('todos'),
    });
    tour = t;
    root.append(t.el);
  }

  /** On open / foreground: the unseen release's tour, over Today only. */
  async function maybeShowTour(found?: Promise<WhatsNewPage[]>): Promise<void> {
    if (tour || tourChecking) return;
    tourChecking = true;
    try {
      const pages = await (found ?? todos.pendingTour());
      if (view.screen === 'today' && !camera) showTour(pages);
    } finally {
      tourChecking = false;
      todos.tourChecked(); // e2e ready signal (data-tour-checks / data-todo-ready)
    }
  }

  /** A Try it deep link (tour page or to-do step). */
  function goRoute(route: AppRoute | string): void {
    if (!isAppRoute(route)) return;
    switch (route) {
      case 'today':
      case 'fuel':
      case 'coach':
      case 'calendar':
      case 'settings':
        goTab(route);
        return;
      case 'settings/health':
        setEnter('settings');
        view = { screen: 'healthSettings' };
        render();
        window.scrollTo(0, 0);
        return;
      case 'settings/myGym':
        setEnter('settings');
        view = { screen: 'myGym' };
        render();
        window.scrollTo(0, 0);
        return;
      case 'settings/foodPhotos':
        openSettingsAt('food-photos');
        return;
      case 'settings/devlog':
        // M13: owner tools only; off → plain Settings.
        if (isVisible('devlog', ownerOn())) openSettingsAt('devlog');
        else goTab('settings');
        return;
      case 'todos':
        openTodos(tabOf(view) === 'settings' ? 'settings' : 'today');
        return;
      // M12 slice 1b.
      case 'settings/goal':
        openIntake('settings');
        return;
      case 'settings/progressPhotos':
        // Only while the switch is on; off → Settings at the switch.
        if (progressPhotosOn) openProgressPhotos();
        else openSettingsAt('progress-photos');
        return;
      case 'fuel/measurements':
        setEnter('fuel');
        void fuel.openMeasurements().then(() => {
          view = { screen: 'fuel' };
          render();
          window.scrollTo(0, 0);
        });
        return;
      case 'intake':
        openIntake(tabOf(view) === 'settings' ? 'settings' : 'today');
        return;
      // M13: the welcome / About / Licenses screens land in tasks 30–31; Settings until then.
      case 'welcome':
        void startOnboarding(true);
        return;
      case 'settings/about':
        setEnter('settings');
        openAbout();
        return;
      case 'settings/licenses':
        setEnter('settings');
        openLicenses();
        return;
      case 'settings/selfcheck':
        setEnter('settings');
        openSelfCheck();
        return;
      // M12 slice 2.
      case 'settings/coach':
        setEnter('settings');
        openCoachSettings();
        return;
      case 'settings/reminders':
        setEnter('settings');
        openReminders();
        return;
      default: {
        const unhandled: never = route;
        throw new Error(`Unhandled route: ${String(unhandled)}`);
      }
    }
  }

  /** Settings scrolled to one section (its top; the page top when it isn't shown). */
  function openSettingsAt(section: string): void {
    setEnter('settings');
    view = { screen: 'settings' };
    render();
    const el = root.querySelector(`[data-section="${section}"]`);
    if (el) el.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }

  function openTodos(from: 'today' | 'settings'): void {
    // M13: the to-dos are owner tools; off → where they came from.
    if (!isVisible('todos', ownerOn())) {
      goTab(from);
      return;
    }
    setEnter(from);
    view = { screen: 'todos', from };
    render();
    window.scrollTo(0, 0);
    void todos.refresh();
  }

  function todoListView(v: Extract<View, { screen: 'todos' }>): HTMLElement {
    return todos.listScreen({
      onBack: () => (v.from === 'settings' ? goTab('settings') : goToday()),
      onOpenTopic: (topicId, stepIndex) => {
        view = { screen: 'todoTopic', from: v.from, topicId, stepIndex };
        render();
        window.scrollTo(0, 0);
      },
    });
  }

  function todoTopicView(v: Extract<View, { screen: 'todoTopic' }>): HTMLElement {
    const list = { screen: 'todos', from: v.from } as const;
    return (
      todos.guideScreen(v.topicId, v.stepIndex, {
        onTryIt: (route) => goRoute(route),
        onStep: (i) => {
          if (view.screen !== 'todoTopic' || view.topicId !== v.topicId) return;
          view = { ...view, stepIndex: i };
          render();
          window.scrollTo(0, 0);
        },
        onClose: () => openTodos(v.from),
      }) ?? todoListView(list)
    );
  }

  // ----- M12 Calendar (replaces History; per-exercise history is one tap deeper) -----

  function openCalendar(): void {
    // M12 slice 1c: "Calendar opened after a training day" (to-do topic 1).
    void noteSignal(db, 'calendarAfterSession', now()).catch(logDbError);
    view = {
      screen: 'calendar',
      month: todayDate().slice(0, 7),
      date: null,
      exerciseId: null,
      data: null,
    };
    calCounted = false;
    render();
    void loadCalendar();
  }

  async function loadCalendar(): Promise<void> {
    const t = now();
    try {
      await trainerReady;
      const sessions = await db.sessions.toArray();
      trainerSessions = sessions;
      const finished = sessions.filter((x) => x.endedAt !== undefined);
      const sets = await setsForSessions(
        db,
        finished.map((x) => x.sessionId),
      );
      if (view.screen !== 'calendar') return;
      view = { ...view, data: { sessions, finished, sets, t } };
    } catch (err) {
      logDbError(err);
      if (view.screen !== 'calendar') return;
      view = { ...view, data: 'error' };
    }
    render();
  }

  function completionInput(d: CalendarData): CompletionInput {
    return {
      state: trainer ?? seedPlan(program),
      sessions: d.sessions,
      sets: d.sets,
      today: localDate(d.t),
      catalog: trainerCatalog,
    };
  }

  const dayNameOf = (id: string) => planDays().find((d) => d.id === id)?.name ?? id;
  const blockGroupOf = (blockId: string) =>
    trainer?.blocks?.find((b) => b.id === blockId)?.group ?? null;

  function calendarView(v: Extract<View, { screen: 'calendar' }>): HTMLElement {
    const tabs = tabBar('calendar', (t) => goTab(t));
    const d = v.data !== null && v.data !== 'error' ? v.data : null;
    if (d && sharePrev) return sharePreviewView(v.month, d);
    if (d && v.exerciseId) {
      return renderHistory(
        {
          unit,
          days: [],
          exercises: [],
          detail: exerciseHistory(d.sets, v.exerciseId, d.t),
          // M12 1b: the estimated 1-rep max per session (working sets only).
          e1rm: e1rmSeries(v.exerciseId, d.sets, d.sessions, { formula: kit.e1rmFormula }),
          dayName: dayNameOf,
          name: exerciseName,
          backLabel: 'Calendar',
        },
        {
          onOpenExercise: () => {},
          onBack: () => {
            if (view.screen !== 'calendar') return;
            view = { ...view, exerciseId: null };
            render();
          },
          onTab: (t) => goTab(t),
        },
      );
    }
    const animate = !calCounted && d !== null;
    if (d) calCounted = true;
    if (d && v.date) {
      const day = dayCompletion(completionInput(d), v.date);
      const group = day.blockId ? blockGroupOf(day.blockId) : null;
      return calendarDayScreen(
        {
          day,
          today: localDate(d.t),
          dayName: dayNameOf,
          name: exerciseName,
          focusGroup: group,
          isFocus: group ? (id) => isFocusExercise(id, group, trainerCatalog) : undefined,
          animate,
          tabs,
        },
        {
          onBack: () => {
            if (view.screen !== 'calendar') return;
            view = { ...view, date: null };
            render();
          },
          onStart: () => {
            const eff = trainer ? effDay(trainer, todayDate()) : null;
            if (eff?.day) void openPreview(eff.day);
          },
          onMove: (dt) => moveDay(dt),
          onDoToday: () => {
            if (day.dayId)
              void openCoachTab('today', { chip: 'doToday', args: { dayId: day.dayId } });
          },
          onHistory: (id) => {
            if (view.screen !== 'calendar') return;
            view = { ...view, exerciseId: id };
            render();
          },
        },
      );
    }
    const input = d ? completionInput(d) : null;
    const today = localDate(d?.t ?? now());
    const empty: PeriodScore = {
      from: today,
      to: today,
      sessionsPlanned: 0,
      sessionsDone: 0,
      setsPlanned: 0,
      setsDone: 0,
      extra: 0,
    };
    return calendarScreen(
      {
        month: v.month,
        today,
        days: input ? monthCompletion(input, v.month) : [],
        week: input ? weekScore(input, today) : empty,
        monthScore: input ? monthScore(input, v.month) : empty,
        streakWeeks: d ? weeklyStreak(d.finished, d.t, STREAK_MIN_PER_WEEK) : 0,
        blockGroup: trainer?.blocks?.length ? blockGroupOf : undefined,
        dayName: dayNameOf,
        animate,
        cardioMinutes: health.cardioMinutes(),
        loading: v.data === null,
        error: v.data === 'error',
        tabs,
      },
      {
        onPrevMonth: () => shiftCalendar(-1),
        onNextMonth: () => shiftCalendar(1),
        onOpenDay: (date) => {
          if (view.screen !== 'calendar') return;
          view = { ...view, date };
          render();
        },
        onShare: () => void shareCalendarMonth(),
        onSearch: (opener) => openLibrary(opener),
        onRetry: () => {
          if (view.screen !== 'calendar') return;
          view = { ...view, data: null };
          render();
          void loadCalendar();
        },
      },
    );
  }

  function shiftCalendar(n: number): void {
    if (view.screen !== 'calendar') return;
    view = { ...view, month: shiftMonth(view.month, n) };
    render();
  }

  /**
   * Move (Calendar day): today → Not today in the coach; a later planned date → the coach's
   * moveDay, which asks "Move X to which day?" with date chips.
   */
  function moveDay(date: string): void {
    if (date === todayDate()) {
      void openCoachTab('today', { chip: 'notToday' });
      return;
    }
    void openCoachTab('today', { chip: 'moveDay', args: { from: date } });
  }

  /**
   * The missed-day card's first button: a focus-block date → Move it (Do it today proposal); a
   * rotation date → Start it (the rotation already carried the day forward).
   */
  function missedActionOf(m: MissedDay | null): 'move' | 'start' {
    return m && trainer && blockAt(trainer, m.date) ? 'move' : 'start';
  }

  /**
   * Start it (Today's missed-day card, a rotation miss): today's workout's preview when there is
   * one to do (the rotation carries a missed day forward, so it usually is that day), else the
   * missed day's preview, whose Start runs it today.
   */
  function startMissed(dayId: string): void {
    const eff = trainer ? effDay(trainer, todayDate()) : null;
    if (eff?.day && !eff.rest && !eff.done) {
      void openPreview(eff.day);
      return;
    }
    const day = planDays().find((d) => d.id === dayId);
    if (day) void openPreview(day);
  }

  // ----- Calendar → Share: the preview (Post / Story size, lead), then the share sheet -----

  type SharePrev = {
    size: ShareSize;
    wanted?: ShareLead | undefined;
    png: Blob | null;
    url: string | null;
    busy: boolean;
  };
  let sharePrev: SharePrev | null = null;
  let shareSeq = 0;

  function shareStatsFor(month: string, d: CalendarData) {
    const stats = shareStats(month, d.finished, d.sets, d.t);
    return { stats, leads: leadOptions(stats), lead: pickLead(stats, sharePrev?.wanted) };
  }

  /** Builds the image for the current size / lead; a newer request wins. */
  async function makeSharePng(): Promise<void> {
    const prev = sharePrev;
    if (!prev || view.screen !== 'calendar' || view.data === null || view.data === 'error') return;
    const d = view.data;
    const month = view.month;
    const seq = ++shareSeq;
    try {
      const input = completionInput(d);
      const completion = monthCompletion(input, month);
      const { stats, lead } = shareStatsFor(month, d);
      const layout =
        prev.size === 'story'
          ? shareStoryLayout(month, completion, { stats, lead, unit })
          : shareMonthLayout(month, completion, {
              month: monthScore(input, month),
              streakWeeks: weeklyStreak(d.finished, d.t, STREAK_MIN_PER_WEEK),
            });
      const png = await renderShareMonth(layout);
      if (seq !== shareSeq || sharePrev !== prev) return;
      if (prev.url) URL.revokeObjectURL(prev.url);
      prev.png = png;
      prev.url = URL.createObjectURL(png);
      prev.busy = false;
    } catch (err) {
      console.warn('Could not make the month image', err);
      closeSharePreview();
      showNotice("Couldn't make the image.");
      return;
    }
    if (view.screen === 'calendar') render();
  }

  function closeSharePreview(): void {
    if (sharePrev?.url) URL.revokeObjectURL(sharePrev.url);
    sharePrev = null;
    shareSeq++;
    if (view.screen === 'calendar') render();
  }

  async function shareCalendarMonth(): Promise<void> {
    if (view.screen !== 'calendar' || view.data === null || view.data === 'error') return;
    sharePrev = { size: 'post', png: null, url: null, busy: true };
    render();
    window.scrollTo(0, 0);
    await makeSharePng();
  }

  function sharePreviewView(month: string, d: CalendarData): HTMLElement {
    const prev = sharePrev as SharePrev;
    const { leads, lead } = shareStatsFor(month, d);
    const [y, m] = month.split('-').map(Number);
    const monthLabel = new Date(y ?? 2000, (m ?? 1) - 1, 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
    const remake = () => {
      prev.busy = true;
      render();
      void makeSharePng();
    };
    return sharePreview(
      {
        monthLabel,
        size: prev.size,
        leads,
        lead,
        ...(prev.url && !prev.busy ? { image: prev.url } : {}),
        busy: prev.busy,
      },
      {
        onSize: (size) => {
          if (size === prev.size) return;
          prev.size = size;
          remake();
        },
        onLead: (l) => {
          prev.wanted = l;
          remake();
        },
        onShare: () => {
          const png = prev.png;
          if (!png || prev.busy) return;
          void shareMonth(png, month, undefined, prev.size)
            .then((result) => {
              if (result === 'downloaded') showNotice('Image saved.');
            })
            .catch((err: unknown) => {
              console.warn('Could not share the month image', err);
              showNotice("Couldn't share the image.");
            });
        },
        onClose: () => closeSharePreview(),
      },
    );
  }

  // ----- M12 Today prompts: missed day (once) and recaps posted into the chat (once) -----

  async function coachPrompts(sets: readonly SetRow[]): Promise<void> {
    if (promptsBusy || !trainer) return;
    promptsBusy = true;
    try {
      coachUi = await getCoachUi(db);
      const input: CompletionInput = {
        state: trainer,
        sessions: trainerSessions,
        sets,
        today: todayDate(),
        catalog: trainerCatalog,
      };
      missedPrompt = coreMissedDay(input, coachUi.missedAnswered);
      // M12 slice 2: the week recap adds that week's check-in line.
      checkInRows = await listCheckIns(db);
      const due = recapDue(
        input,
        {
          ...(coachUi.lastWeekRecap !== undefined ? { week: coachUi.lastWeekRecap } : {}),
          ...(coachUi.lastBlockRecap !== undefined ? { block: coachUi.lastBlockRecap } : {}),
        },
        checkInRows,
      );
      if (due.length) await ensureThread();
      for (const r of due) {
        // Memory first: a recap is never posted twice, even if the app closes mid-way.
        await patchCoachUi(
          db,
          r.period === 'week'
            ? { lastWeekRecap: r.from }
            : r.blockId !== undefined
              ? { lastBlockRecap: r.blockId }
              : {},
        );
        await postMessage({
          createdAt: now(),
          role: 'coach',
          text: r.text,
          say: r.say,
          source: 'rules',
          phase: 'today',
          card: { kind: 'recap', period: r.period, from: r.from, to: r.to },
          ...(r.chips.length ? { chips: r.chips.map((c) => ({ ...c })) } : {}),
        });
        trainerLog('recap', r.period, 'shown', 'rules');
      }
      await postTrainerKitPrompts(sets);
    } catch (err) {
      logDbError(err);
    } finally {
      promptsBusy = false;
    }
    // M12 slice 2: reminders re-planned on open / foreground (iPhone app; nothing on the web).
    void syncReminders(sets);
    if (view.screen === 'today') render();
  }

  /**
   * M12 1b, posted in the chat once each (like recaps): the goal review every `reviewWeeks`, and
   * a deload-week suggestion after hard weeks or stalls. The time is stored first.
   */
  async function postTrainerKitPrompts(sets: readonly SetRow[]): Promise<void> {
    if (!trainer) return;
    const today = todayDate();
    const open = (await listGoals(db)).filter((g) => g.doneAt === undefined);
    const h = await goalHistory();
    const progress = open.map((g) =>
      goalProgress(g, h.sets, h.measurements, h.weighIns, today, { formula: kit.e1rmFormula }),
    );
    const review = reviewDue(open, coachUi.lastReviewAt, kit.reviewWeeks, today, {
      progress,
      ...(intake ? { since: intake.at } : {}),
    });
    if (review) {
      await ensureThread();
      const at = now();
      coachUi = { ...coachUi, lastReviewAt: at };
      await patchCoachUi(db, { lastReviewAt: at });
      await postMessage({
        createdAt: now(),
        role: 'coach',
        text: review.text,
        say: review.say,
        source: 'rules',
        phase: 'today',
        chips: review.chips.map((c) => ({ id: c.id, label: c.label })),
      });
      trainerLog('review', review.offer, 'shown', 'rules');
    }
    const deload = deloadSuggested(trainerSessions, trainer, today, coachUi.lastDeloadOfferAt, {
      sets,
      stallSince: stallSince(changes),
      name: exerciseName,
    });
    if (deload) {
      await ensureThread();
      coachUi = { ...coachUi, lastDeloadOfferAt: today };
      await patchCoachUi(db, { lastDeloadOfferAt: today });
      await postMessage({
        createdAt: now(),
        role: 'coach',
        text: deload.text,
        say: deload.say,
        source: 'rules',
        phase: 'today',
        chips: deload.chips.map((c) => ({ id: c.id, label: c.label })),
      });
      trainerLog('deloadSuggest', deload.reason, 'shown', 'rules');
    }
  }

  /** Stores the answer (once per missed date) before the caller re-renders or navigates. */
  async function answerMissed(m: MissedDay): Promise<void> {
    missedPrompt = null;
    coachUi = { ...coachUi, missedAnswered: [...coachUi.missedAnswered, m.date] };
    try {
      await patchCoachUi(db, { missedAnswered: coachUi.missedAnswered });
    } catch (err) {
      logDbError(err);
    }
  }

  // ---------- M12 slice 1b: trainer kit (intake, goals, feel today, photos, gym file) ----------

  /** The settings key of the Progress photos switch (off by default). */
  const PROGRESS_PHOTOS_KEY = 'progressPhotos';

  /** Intake, switch and today's feel, read once at start (Settings and Today read them). */
  async function loadTrainerKitState(): Promise<void> {
    try {
      intake = (await getIntake(db)) ?? null;
      progressPhotosOn = (await db.settings.get(PROGRESS_PHOTOS_KEY))?.value === true;
    } catch (err) {
      logDbError(err);
    }
  }

  /** The ActionContext the 1b proposals build on (the plan as written, like the coach's). */
  function actionCtx(): ActionContext {
    return {
      state: trainer ?? seedPlan(program),
      sessions: trainerSessions,
      today: todayDate(),
      unit,
      lastWeightKg: easyLastKg,
      exerciseName,
    };
  }

  /**
   * Apply a proposal now (his tap was the decision: intake Apply, Settings Remove): through
   * changes.ts with the usual Undo toast and Plan changes entry. False when it can't apply.
   */
  async function applyNow(proposal: Proposal, intent: string): Promise<boolean> {
    if (!trainer) return false;
    const r = applyProposal(trainer, proposal, now(), 'chip');
    if (!r.ok) return false;
    trainer = r.state;
    const change = await saveChangeRecord(r.state, r.change);
    changes = [change, ...changes];
    trainerLog(intent, proposal.action, 'applied', 'chip');
    expireStale();
    showUndoToast(proposal.say ?? `Done. ${proposal.title}.`, change.id);
    if (view.screen !== 'intake') refreshAfterChange();
    return true;
  }

  /** Settings → Go easy on → Remove: the list change, applied with Undo (changes.ts). */
  async function removeEasyOn(area: BodyArea): Promise<void> {
    await trainerReady;
    const r = proposeEasyOn(actionCtx(), { remove: [area] }, trainerCatalog);
    if (!r.ok || !(await applyNow(r.proposal, 'easyOn'))) showNotice(UNDO_FAILED);
    if (view.screen === 'settings') render();
  }

  // ----- intake -----

  /** The intake element stays while it is open (it keeps its own answers and step). */
  let intakeEl: { from: string; el: HTMLElement } | null = null;
  /** The goal kind stored when the intake was opened (undefined on a first run). */
  let intakeKindAtOpen: GoalKind | undefined;
  /** Proposals the intake's last screen showed, applied as shown on Apply. */
  const intakeOffers = new Map<IntakeChangeId, Proposal>();

  function openIntake(from: 'first' | 'today' | 'settings'): void {
    intakeEl = null;
    // Each visit starts clean; Back from the first run's Set up Fuel restores it in intakeChanges.
    pendingFuelSetup = null;
    if (from !== 'first') setEnter(from === 'settings' ? 'settings' : 'today');
    view = { screen: 'intake', from };
    render();
    window.scrollTo(0, 0);
  }

  function leaveIntake(from: 'first' | 'today' | 'settings'): void {
    intakeEl = null;
    intakeOffers.clear();
    // Skip / Close: nothing about Fuel carries on (M13d: and no Set up Fuel step in the flow).
    pendingFuelSetup = null;
    if (from === 'first' && onboarding) {
      flowFuelGoal = null;
      onboarding.steps = onboarding.steps.filter((s) => s.kind !== 'fuelSetup');
    }
    // M13: the intake is one step of the first-launch flow.
    if (from === 'first' && onboarding) {
      onboardingGo(1);
      return;
    }
    if (from === 'settings') {
      view = { screen: 'settings' };
      render();
      openSettingsAt('goal');
      return;
    }
    goToday();
  }

  const lineText = (l: { before: string; after: string }) =>
    l.before ? `${l.before} → ${l.after}` : l.after;

  /** Core's offers for these answers, as rows; each proposal is built now and kept for Apply. */
  async function intakeChanges(answers: Intake): Promise<IntakeChange[]> {
    await trainerReady;
    await fuel.ensureLoaded();
    intakeOffers.clear();
    const a = normalizeIntake(answers);
    const { rows, proposals } = buildIntakeOffers(a);
    for (const [id, p] of proposals) intakeOffers.set(id, p);
    // M13d: back from the first run's Set up Fuel with the same goal: its row stays applied.
    // An applied Fuel row for another goal no longer counts once the answers change.
    if (pendingFuelSetup !== null && pendingFuelSetup !== a.goalKind) pendingFuelSetup = null;
    const fuelRow = rows.find((r) => r.id === 'fuel');
    if (fuelRow && flowFuelGoal && flowFuelGoal === a.goalKind && fuel.fuelGoal() === null) {
      fuelRow.applied = true;
      pendingFuelSetup = flowFuelGoal;
    }
    return rows;
  }

  /** The rows and their proposals, built from the plan as it is now. */
  function buildIntakeOffers(a: Intake): {
    rows: IntakeChange[];
    proposals: Map<IntakeChangeId, Proposal>;
  } {
    const proposals = new Map<IntakeChangeId, Proposal>();
    const state = trainer ?? seedPlan(program);
    const offers = intakeToChanges(a, {
      hasHistory: trainerSessions.some((x) => x.endedAt !== undefined),
      planEdited: state.plan.edited || changes.some((c) => c.undoneAt === undefined),
      easyOn: state.easyOn ?? [],
      fuel: fuel.fuelGoal(),
    });
    const rows: IntakeChange[] = [];
    for (const o of offers) {
      if (o.kind === 'starterPlan') {
        const r = proposeStarterPlan({ state, today: todayDate(), catalog: trainerCatalog }, a);
        if (!r.ok) continue;
        proposals.set('plan', r.proposal);
        rows.push({
          id: 'plan',
          title: o.primary ? PLAN_TITLE_STARTER : PLAN_TITLE_REBUILD,
          lines: [r.proposal.title, ...r.proposal.lines.map(lineText)],
        });
      } else if (o.kind === 'easyOn') {
        const r = proposeEasyOn(actionCtx(), { add: o.add, remove: o.remove }, trainerCatalog);
        if (!r.ok) continue;
        proposals.set('easyOn', r.proposal);
        rows.push({ id: 'easyOn', title: EASY_ON_TITLE, lines: [areaList(o.areas) || 'None'] });
      } else if (o.needsSetup) {
        rows.push({ id: 'fuel', title: FUEL_TITLE, lines: [o.label] });
      } else {
        const c = fuel.goalChange(o.goalKind);
        const kcal = c?.ok ? c.lines.find((l) => l.label === 'Calories') : undefined;
        rows.push({
          id: 'fuel',
          title: FUEL_TITLE,
          lines: [o.label],
          ...(kcal ? { before: kcal.before, after: kcal.after } : {}),
        });
      }
    }
    return { rows, proposals };
  }

  async function applyIntakeChange(id: IntakeChangeId, answers: Intake): Promise<boolean> {
    if (id === 'fuel') {
      const a = normalizeIntake(answers);
      if (fuel.fuelGoal() === null) {
        // Fuel isn't set up: its setup opens after Done, saved with this goal.
        pendingFuelSetup = a.goalKind;
        return true;
      }
      return fuel.applyGoal(a.goalKind);
    }
    let p = intakeOffers.get(id);
    // M13d: applying one summary row moves the plan on; the other row's proposal was built from
    // the older plan and would be refused as stale, so it is rebuilt from the plan as it is now.
    // The rebuilt lines can differ a little from the row shown (e.g. the starter plan now keeps
    // the go-easy list just applied); the row is not re-rendered.
    const now = trainer ?? seedPlan(program);
    if (p && p.baseVersion !== now.version) {
      p = buildIntakeOffers(normalizeIntake(answers)).proposals.get(id);
      if (p) intakeOffers.set(id, p);
    }
    if (!p) return false;
    return applyNow(p, id === 'plan' ? 'starterPlan' : 'easyOn');
  }

  /** Set by the intake's "Set up Fuel for this goal": Fuel's setup opens after Done. */
  let pendingFuelSetup: Intake['goalKind'] | null = null;
  /** M13d: the goal the first run's Set up Fuel step saves with (kept so Back from the next page reopens it). */
  let flowFuelGoal: Intake['goalKind'] | null = null;
  /** M13d: Back from the first run's Set up Fuel reopens the intake on its last screen. */
  let intakeAtSummary = false;

  /** Done: goals suggested from the answers (replacing the open ones), then Today / Settings. */
  async function intakeDone(answers: Intake, from: 'first' | 'today' | 'settings'): Promise<void> {
    // A second Done tap while the first is saving would move the flow on twice.
    if (intakeFinishing) return;
    intakeFinishing = true;
    try {
      await finishIntake(answers, from);
    } finally {
      intakeFinishing = false;
    }
  }
  let intakeFinishing = false;

  async function finishIntake(
    answers: Intake,
    from: 'first' | 'today' | 'settings',
  ): Promise<void> {
    const a = normalizeIntake(answers);
    try {
      const history = await goalHistory();
      const suggested = suggestGoals(a, history).goals;
      const open = (await listGoals(db)).filter((g) => g.doneAt === undefined);
      // Re-running the intake keeps the goals he has unless the goal kind changed.
      const kindChanged = intakeKindAtOpen !== undefined && intakeKindAtOpen !== a.goalKind;
      if (suggested.length > 0 && (open.length === 0 || kindChanged)) {
        for (const g of open) await deleteGoal(db, g.id);
        for (const g of suggested) await saveGoal(db, g);
      }
    } catch (err) {
      logDbError(err);
    }
    const goal = pendingFuelSetup;
    pendingFuelSetup = null;
    const run = onboarding;
    if (from === 'first' && run) {
      // M13d: Set up Fuel is the next step of the flow when its row was applied, else it is dropped.
      intakeEl = null;
      intakeOffers.clear();
      flowFuelGoal = goal;
      run.steps = goal
        ? insertAfterIntake(run.steps, run.index, { kind: 'fuelSetup' })
        : run.steps.filter((s) => s.kind !== 'fuelSetup');
      onboardingGo(1);
      return;
    }
    if (goal) {
      intakeEl = null;
      intakeOffers.clear();
      fuel.setupForGoal(goal);
      return;
    }
    leaveIntake(from);
  }

  function intakeView(v: Extract<View, { screen: 'intake' }>): HTMLElement {
    if (intakeEl?.from === v.from) return intakeEl.el;
    intakeKindAtOpen = intake?.goalKind;
    const atSummary = intakeAtSummary;
    intakeAtSummary = false;
    const el = intakeScreen(
      {
        initial: intake,
        changes: (a) => intakeChanges(a),
        now: () => now(),
        ...(atSummary ? { startStep: 'summary' as const } : {}),
      },
      {
        onSave: (a) => {
          intake = normalizeIntake(a);
          void saveIntake(db, intake).catch(logDbError);
        },
        onApply: (id, a) => applyIntakeChange(id, a),
        onDone: (a) => void intakeDone(a, v.from),
        // M13c: Why? on "Add abs to your plan?".
        onLearn: (learnId, opener) => {
          const card = findLearnCard(LEARN_CARDS, learnId);
          if (card) openLearnCard(card, opener);
        },
        onSkip: () => {
          if (v.from === 'first')
            void db.settings.put({ key: INTAKE_SKIPPED_KEY, value: now() }).catch(logDbError);
          leaveIntake(v.from);
        },
        ...(v.from === 'first' ? {} : { onClose: () => leaveIntake(v.from) }),
      },
    );
    intakeEl = { from: v.from, el };
    return el;
  }

  // ----- goals (Today's Goal card, the review) -----

  /** What suggestGoals / goalProgress read: finished sessions' sets, measurements, weigh-ins. */
  async function goalHistory() {
    await fuel.ensureLoaded();
    const finished = trainerSessions.filter((x) => x.endedAt !== undefined);
    const sets = await setsForSessions(
      db,
      finished.map((x) => x.sessionId),
    );
    const names: Record<string, string> = {};
    for (const d of planDays())
      for (const p of d.exercises) names[p.exerciseId] = exerciseName(p.exerciseId);
    return {
      today: todayDate(),
      now: now(),
      sets,
      sessions: finished,
      measurements: fuel.measurementList(),
      weighIns: fuel.weighInList(),
      exerciseNames: names,
      unit,
      lengthUnit,
      sites: kit.measurementSites,
      formula: kit.e1rmFormula,
      preferLifts: Object.keys(names),
    };
  }

  /**
   * Today's Goal card: open goals with progress. With answers but no goal yet (nothing logged
   * to base a number on), goals are suggested once something is logged.
   */
  async function loadGoals(): Promise<void> {
    try {
      goals = (await listGoals(db)).filter((g) => g.doneAt === undefined);
      const h = await goalHistory();
      if (goals.length === 0 && intake) {
        const suggested = suggestGoals(intake, h).goals;
        for (const g of suggested) await saveGoal(db, g);
        goals = suggested;
      }
      goalItems = goals.map((g) => {
        const p = goalProgress(g, h.sets, h.measurements, h.weighIns, h.today, {
          formula: kit.e1rmFormula,
        });
        return {
          goal: g,
          pct: p.pct ?? 0,
          status: p.status === 'noData' ? 'onTrack' : p.status,
          // The card already shows % and on track / behind; words only when there's no data yet.
          ...(p.status === 'noData' ? { now: goalProgressText(p) } : {}),
        };
      });
    } catch (err) {
      logDbError(err);
    }
  }

  /** The Goal card: goals, or "Set your goal" before any intake; hidden with answers and no goal. */
  function goalCardProps(): GoalCardProps | null {
    if (goalItems === null) return null;
    if (goalItems.length === 0 && intake) return null;
    return { goals: goalItems, today: todayDate() };
  }

  // ----- feel today -----

  async function loadFeels(): Promise<void> {
    try {
      feels = await listDayFeels(db, addDate(todayDate(), -7));
    } catch (err) {
      logDbError(err);
    }
  }

  function saveFeel(feel: DayFeel): void {
    feels = [...feels.filter((f) => f.date !== feel.date), feel];
    feelOpen = false;
    render();
    void saveDayFeel(db, feel)
      .then(() => getDayFeel(db, feel.date))
      .then((row) => {
        feels = [...feels.filter((f) => f.date !== feel.date), ...(row ? [row] : [])];
        // The "Lighter today?" card weighs it in (never spoken).
        void health.sync();
        if (view.screen === 'today') render();
      })
      .catch(logDbError);
  }

  /** "Go easy on <area> today?": today's avoid-area proposal in the coach. */
  function easyOnToday(area: BodyArea): void {
    void openCoachTab('today', {
      chip: area,
    });
  }

  // ----- progress photos (this phone only: never backed up, logged or shown to a coach) -----

  let photosView: ProgressPhotosView | null = null;

  function openProgressPhotos(): void {
    setEnter('settings');
    void listProgressPhotos(db)
      .then((photos) => {
        photosView?.dispose();
        photosView = null;
        view = { screen: 'progressPhotos' };
        photosCache = photos;
        render();
        window.scrollTo(0, 0);
      })
      .catch(logDbError);
  }

  let photosCache: Awaited<ReturnType<typeof listProgressPhotos>> = [];

  function progressPhotosScreen(): HTMLElement {
    if (photosView) return photosView.el;
    const reload = async () => {
      photosCache = await listProgressPhotos(db);
      photosView?.dispose();
      photosView = null;
      if (view.screen === 'progressPhotos') render();
    };
    photosView = createProgressPhotos(
      { enabled: progressPhotosOn, photos: photosCache, today: todayDate() },
      {
        onBack: () => {
          photosView?.dispose();
          photosView = null;
          photosCache = [];
          openSettingsAt('progress-photos');
        },
        onEnable: () => {
          setProgressPhotos(true);
          void reload();
        },
        onAdd: async (photo) => {
          await addProgressPhoto(db, {
            id: crypto.randomUUID(),
            createdAt: now(),
            date: photo.date,
            blob: photo.blob,
            pose: photo.pose,
          });
          await reload();
        },
        onDelete: (id) => void deleteProgressPhoto(db, id).then(reload).catch(logDbError),
        onDeleteAll: () => void deleteAllProgressPhotos(db).then(reload).catch(logDbError),
      },
    );
    return photosView.el;
  }

  function setProgressPhotos(on: boolean): void {
    progressPhotosOn = on;
    void db.settings.put({ key: PROGRESS_PHOTOS_KEY, value: on }).catch(logDbError);
  }

  // ----- Share my gym / import a gym file (equipment ids only) -----

  let gymImport: { equipment: string[]; preview: GymImportPreview } | null = null;
  let gymImportError: string | null = null;
  let gymShareNote: string | null = null;

  async function shareGym(): Promise<void> {
    const file = new File([exportGymFile(gym)], GYM_FILE_NAME, { type: GYM_FILE_MIME });
    try {
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file] }); // the phone's share sheet; the app sends nothing
      } else {
        const url = URL.createObjectURL(file);
        const a = h('a', { href: url, download: GYM_FILE_NAME, hidden: true });
        document.body.append(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      gymShareNote = GYM_SHARED_NOTE;
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) logDbError(err);
    }
    if (view.screen === 'myGym') render();
  }

  function importGymText(text: string): void {
    gymImport = null;
    gymImportError = null;
    const r = parseGymFile(text);
    if (!r.ok) {
      gymImportError = GYM_FILE_REASON_TEXT[r.reason];
    } else {
      const have = new Set(gym.equipment);
      const adds = r.equipment.filter((id) => !have.has(id));
      if (adds.length === 0) gymImportError = GYM_IMPORT_NOTHING;
      else {
        const label = new Map(equipmentItems().map((i) => [i.id, i.label]));
        gymImport = {
          equipment: [...gym.equipment, ...adds],
          preview: {
            adds: equipmentItems()
              .filter((i) => adds.includes(i.id))
              .map((i) => label.get(i.id) ?? i.id),
            unknown: r.unknown.length,
            already: r.equipment.length - adds.length,
          },
        };
      }
    }
    render();
  }

  function myGymView(): HTMLElement {
    return myGymScreen(
      {
        items: equipmentItems(),
        equipment: gym.equipment,
        importPreview: gymImport?.preview ?? null,
        importError: gymImportError,
        shareNote: gymShareNote,
      },
      {
        onBack: () => {
          gymImport = null;
          gymImportError = null;
          gymShareNote = null;
          view = { screen: 'settings' };
          render();
        },
        onChange: (equipment) => saveGym(equipment),
        onShare: () => void shareGym(),
        onImportText: (text) => importGymText(text),
        onImportApply: () => {
          const next = gymImport;
          if (!next) return;
          gymImport = null;
          // Kept in item order; only adds (import never unticks anything).
          const order = equipmentItems().map((i) => i.id);
          saveGym(order.filter((id) => next.equipment.includes(id)));
          render();
        },
        onImportCancel: () => {
          gymImport = null;
          gymImportError = null;
          render();
        },
      },
    );
  }

  // ---------- Settings ----------

  /** Settings → Voice: speak a test phrase and show what the browser reports (no sound on iOS?). */
  function voiceTest(): HTMLElement {
    const statusLine = h('p', { class: 'muted', role: 'status', 'data-voice-status': true }, '');
    const show = (text: string) => {
      statusLine.textContent = text;
    };
    const btn = settingsRowButton('speaker', 'Speaker check', 'data-voice-test', () => {
      voice.unlock(); // inside the tap
      const st = voice.status();
      if (!st.supported) {
        show('This browser has no speech. Try Safari or Chrome.');
        return;
      }
      const u = voice.speak('Voice test. One, two, three.', { kind: 'cue' });
      if (!u) return;
      show('Speaking…');
      u.addEventListener('start', () => show('Speaking… can you hear it?'));
      u.addEventListener('end', () =>
        show('Done. If you heard nothing, Silent mode is on or the volume is down.'),
      );
      u.addEventListener('error', (e) =>
        show(`Speech error: ${(e as SpeechSynthesisErrorEvent).error ?? 'unknown'}.`),
      );
      // iOS gives no event when speech is blocked: report what we know after a moment.
      window.setTimeout(() => {
        const now = voice.status();
        if (statusLine.textContent === 'Speaking…')
          show(
            `Nothing started (voices: ${now.voices}, English: ${now.english}, paused: ${now.paused ? 'yes' : 'no'}). Turn off Silent mode, turn the volume up, then tap again.`,
          );
      }, 2500);
    });
    return h(
      'div',
      { class: 'voice-test' },
      btn,
      statusLine,
      h(
        'p',
        { class: 'muted' },
        'No sound? On iPhone, Safari mutes spoken cues in Silent mode: turn Silent mode off and the volume up.',
      ),
    );
  }

  function settingsScreen(): HTMLElement {
    devLogPanel?.destroy();
    devLogPanel = createDevLogPanel({ db });
    return renderSettings(
      {
        accent,
        background,
        textSize,
        spokenCount,
        coachTips,
        handsFree,
        unit,
        lengthUnit,
        coachVoice: createCoachVoiceSettings({
          value: coachVoice,
          voices: voice.englishVoices(),
          onChange: (v) => {
            coachVoice = { ...v };
            voice.configure(coachVoice);
            void setCoachVoice(db, coachVoice).catch(logDbError);
            // No render(): the picker redraws itself, and a full Settings rebuild would fold the voice list (M13c task 10).
          },
          onTest: (v) => {
            voice.unlock(); // inside the tap (iOS)
            voice.configure(v);
            voice.speak('Keep going.', { kind: 'cue' });
          },
        }).el,
        speakerCheck: voiceTest(),
        nutrition: fuel.settingsBlock(),
        foodPhotos: foodVision.settingsEl(),
        backup: backupPanel(
          { restore: restoreStep },
          {
            onExport: () => void exportBackup(),
            onPickFile: (f) => void pickRestoreFile(f),
            onConfirmRestore: () => void confirmRestore(),
            onCancelRestore: () => {
              pendingRestore = null;
              restoreStep = { kind: 'idle' };
              render();
            },
          },
        ),
        audioTest: audioTestPanel(),
        devLog: devLogPanel.el,
        intake,
        easyOn: trainer?.easyOn ?? [],
        progressPhotos: progressPhotosOn,
        // M13: owner mode decides the owner sections; the version line follows it.
        owner: ownerOn(),
        version: versionLine(ownerOn()),
      },
      {
        onSearch: (opener) => openLibrary(opener),
        onTextSize: (s) => {
          textSize = s;
          applyTextSize(s);
          void setTextSize(db, s).catch(logDbError);
          render();
        },
        onBackground: (style) => {
          background = style;
          applyBackground(style);
          mirrorBackground(style);
          void db.settings.put({ key: 'background', value: style }).catch(logDbError);
          render();
        },
        onAccent: (a) => {
          accent = a;
          applyAccent(a); // at once, before the save
          // Mirror only once IndexedDB has it, so the two copies never disagree after a reload.
          void setAccent(db, a)
            .then(() => mirrorAccent(a))
            .catch(logDbError);
          render();
        },
        onSpokenCount: (on) => {
          spokenCount = on;
          void setSpokenCount(db, on).catch(logDbError);
          render();
        },
        onCoachTips: (on) => {
          coachTips = on;
          void setCoachTips(db, on).catch(logDbError);
          render();
        },
        onHandsFree: (on) => {
          handsFree = on;
          void setHandsFree(db, on).catch(logDbError);
          render();
        },
        onUnit: (u) => {
          unit = u;
          void setUnit(db, u)
            .then(() => getLengthUnit(db))
            .then((l) => {
              lengthUnit = l;
              render();
            })
            .catch(logDbError);
          render();
        },
        onLengthUnit: (l) => {
          lengthUnit = l;
          void setLengthUnit(db, l).catch(logDbError);
          render();
        },
        onCameraTest: () => openCameraView('Camera test'),
        onTab: (t) => goTab(t),
        onPlanChanges: () => openPlanChanges(),
        onMyGym: () => {
          view = { screen: 'myGym' };
          render();
        },
        onHealth: () => {
          view = { screen: 'healthSettings' };
          render();
          // Settings is a long page: open Health at its top, where Connect is (it kept
          // Settings' scroll position on the iPhone, 2026-11-16).
          window.scrollTo(0, 0);
        },
        onTodos: () => openTodos('settings'),
        onWhatsNew: () => showTour(todos.replay()),
        // M12 1b
        onIntake: () => openIntake('settings'),
        onEasyOnRemove: (area) => void removeEasyOn(area),
        onProgressPhotos: (on) => {
          setProgressPhotos(on);
          render();
        },
        onProgressPhotosOpen: () => openProgressPhotos(),
        // M12 slice 2
        onCoachSettings: () => openCoachSettings(),
        onReminders: () => openReminders(),
        ...(native && isVisible('evalScreen', ownerOn())
          ? { onBrainEval: () => openBrainEval() }
          : {}),
        onAbout: () => openAbout(),
        onRerunWelcome: () => goRoute('welcome'),
        onSelfCheck: () => openSelfCheck(),
      },
    );
  }

  // ----- M9 B2/B3: Back up / Restore (a local file; nothing is uploaded) -----

  let restoreStep: RestoreStep = { kind: 'idle' };
  let pendingRestore: BackupFile | null = null;

  const restoreError = (err: unknown): RestoreStep => {
    if (!(err instanceof BackupError)) logDbError(err);
    const code = err instanceof BackupError ? err.code : 'write';
    return { kind: 'message', text: backupErrorText(code), error: true };
  };

  /** Every table but the dev log, as a JSON file download (a Blob URL, never the network). */
  async function exportBackup(): Promise<void> {
    try {
      const t = now();
      const file = await exportAll(db, { now: t });
      // The share sheet in the iPhone app (an <a download> click does nothing there).
      const res = await saveFile(
        new Blob([JSON.stringify(file)], { type: 'application/json' }),
        backupFileName(t),
        `${APP_NAME} backup`,
      );
      // In the iPhone app a download link does nothing: only the share sheet saves the file.
      restoreStep =
        res === 'cancelled'
          ? { kind: 'message', text: 'Backup not saved.', error: false }
          : res === 'downloaded' && native
            ? { kind: 'message', text: "Couldn't open the share sheet. Try again.", error: true }
            : {
                kind: 'message',
                text: 'Backup ready. Keep the file somewhere safe.',
                error: false,
              };
    } catch (err) {
      logDbError(err);
      restoreStep = { kind: 'message', text: "Couldn't make the backup. Try again.", error: true };
    }
    if (view.screen === 'settings') render();
  }

  /** A picked file: checked without writing, then the two-tap question. */
  async function pickRestoreFile(f: File): Promise<void> {
    try {
      const file = validateBackup(db, await f.text());
      const n = file.tables.sessions?.length ?? 0;
      pendingRestore = file;
      restoreStep = {
        kind: 'confirm',
        fileName: f.name,
        summary: `${n} ${n === 1 ? 'workout' : 'workouts'}`,
      };
    } catch (err) {
      pendingRestore = null;
      restoreStep = restoreError(err);
    }
    if (view.screen === 'settings') render();
  }

  /** Second tap on Replace: all data replaced in one transaction, with an Undo toast. */
  async function confirmRestore(): Promise<void> {
    const file = pendingRestore;
    if (!file) return;
    pendingRestore = null;
    restoreStep = { kind: 'busy' };
    render();
    try {
      const { undo } = await importAll(db, file, { now: now() });
      await reloadStored();
      restoreStep = { kind: 'message', text: 'Restored from the backup.', error: false };
      if (view.screen === 'settings') render();
      showActionToast('Data restored.', () => void undoRestore(undo));
    } catch (err) {
      restoreStep = restoreError(err);
      if (view.screen === 'settings') render();
    }
  }

  /** The toast's Undo: puts back what was there before the restore. */
  async function undoRestore(undo: BackupFile): Promise<void> {
    try {
      await importAll(db, undo, { now: now() });
      await reloadStored();
      restoreStep = { kind: 'message', text: 'Restore undone.', error: false };
      // Said once: Settings shows it inline; elsewhere a short notice says it.
      if (view.screen !== 'settings') showNotice('Restore undone.', 'restore');
    } catch (err) {
      restoreStep = restoreError(err);
    }
    if (view.screen === 'settings') render();
  }

  /** After a restore (or its Undo): every stored setting and the plan, read again. */
  async function reloadStored(): Promise<void> {
    try {
      // M13: a restored 'ownerMode' row wins; a pre-1.15 file has none → decided from its data.
      ownerMode = await resolveOwnerMode(db, now());
      ({ weight: unit, length: lengthUnit } = await getUnitPrefs(db));
      spokenCount = await getSpokenCount(db);
      coachTips = await getCoachTips(db);
      handsFree = await getHandsFree(db);
      accent = await getAccent(db);
      applyAccent(accent);
      mirrorAccent(accent);
      background = backgroundStyle((await db.settings.get('background'))?.value);
      applyBackground(background);
      mirrorBackground(background);
      textSize = await getTextSize(db);
      applyTextSize(textSize);
      coachVoice = await getCoachVoice(db);
      voice.configure(coachVoice);
    } catch (err) {
      logDbError(err);
    }
    trainer = null;
    gym = defaultGymProfile();
    await loadTrainer();
    trainerSessions = await db.sessions.toArray().catch(() => trainerSessions);
    await fuel.refresh();
  }

  // ---------- Day preview ----------

  /** What the preview of `day` runs: today's effective day (adjusted) or the plan day. */
  function previewDayFor(day: ProgramDay): PreviewDay {
    const planDay = planDays().find((d) => d.id === day.id) ?? day;
    if (trainer) {
      const eff = effDay(trainer, todayDate());
      if (!eff.done && !eff.rest && eff.day?.id === day.id)
        return {
          day: eff.day,
          planDay,
          today: true,
          adjust: eff.adjusted,
          replaced: eff.override?.adjust?.replaced ?? [],
        };
    }
    return { day: planDay, planDay, today: false, adjust: null, replaced: [] };
  }

  async function openPreview(picked: ProgramDay): Promise<void> {
    const pd = previewDayFor(picked);
    view = { screen: 'preview', loading: true, ...pd };
    render();
    // The rows as they run plus the plan rows they replaced (for the "was …" notes).
    const ids = [
      ...new Set([...pd.day.exercises, ...pd.planDay.exercises].map((e) => e.exerciseId)),
    ];
    try {
      const [last, notes] = await Promise.all([
        lastSessionSets(db, ids),
        Promise.all(ids.map((id) => getExerciseNote(db, id))),
      ]);
      // Warm-up sets (M12 1b) never show as "last time" or set the next default.
      lastTime = Object.fromEntries(
        Object.entries(last)
          .map(([id, rows]) => [id, workingSets(rows)] as const)
          .filter(([, rows]) => rows.length > 0),
      );
      exerciseNotes = Object.fromEntries(notes.map((n) => [n.exerciseId, n]));
    } catch (err) {
      logDbError(err);
      lastTime = {};
      exerciseNotes = {};
    }
    if (view.screen === 'preview' && view.day === pd.day) {
      view = { ...view, loading: false };
      render();
    }
  }

  /**
   * The weight a set would default to (session defaultsFor): today's lighter/deload weight, else
   * last time, else the plan. null = no weight yet (a swapped-in exercise with no history).
   */
  function defaultWeightKg(p: PlannedExercise): number | null {
    if (p.weightKgToday !== undefined) return p.weightKgToday;
    const last = lastTime[p.exerciseId]?.at(-1)?.weightKg;
    if (last !== undefined) return last;
    return p.startWeightKg === undefined ? null : snapToStep(p.startWeightKg, unit);
  }

  function weightLabel(p: PlannedExercise): string {
    const wKg = defaultWeightKg(p);
    if (wKg === null) return 'pick your weight';
    return wKg > 0 ? `${w(wKg)} ${unit}` : 'bodyweight';
  }

  function previewRow(p: PlannedExercise): PreviewRow {
    const last = setsText(lastTime[p.exerciseId] ?? []);
    return {
      exerciseId: p.exerciseId,
      tracking: p.tracking,
      name: exerciseName(p.exerciseId),
      plan: `${p.sets} × ${repsRange(p)} reps · ${weightLabel(p)}`,
      machine: noteFor(p.exerciseId).machineSetting || undefined,
      last: last || undefined,
    };
  }

  function previewScreen(pd: PreviewDay, loading: boolean): HTMLElement {
    const { day, planDay } = pd;
    // Today's adjusted rows: pair each plan row with what runs instead (or nothing).
    const pairs = pd.adjust ? alignRows(planDay.exercises, day.exercises, pd.replaced) : [];
    const lastKg = (id: string) => lastTime[id]?.at(-1)?.weightKg;
    const rows = day.exercises.map((p) => {
      const row = previewRow(p);
      const pair = pairs.find((x) => x.to === p);
      const note = pair
        ? rowAdjustNote(pair.from, p, unit, exerciseName, lastKg(pair.from.exerciseId))
        : null;
      return note && pd.adjust
        ? { ...row, adjusted: p.adjusted ?? pd.adjust, adjustNote: note }
        : row;
    });
    const removedRows = pairs
      .filter((x) => x.to === null)
      .map((x): PreviewRow => ({
        ...previewRow(x.from),
        adjusted: 'removed',
        adjustNote: 'Removed today',
      }));
    const days = planDays();
    const position = days.findIndex((d) => d.id === day.id);
    return renderPreview(
      {
        day,
        position: (position < 0 ? 0 : position) + 1,
        total: days.length,
        loading,
        hint: silentHint(), // iOS mutes spoken cues in Silent mode; a page can't detect it
        rows,
        removedRows,
        adjustedToday: pd.today ? adjustedTodayText() : null,
        missingKit: dayMissingKit(day),
      },
      {
        onBack: goToday,
        onStart: (d) => startDay(d, pd.today ? pd.adjust : null),
        onCoach: trainer ? () => void openCoach('preview') : undefined,
        onUndoAdjust: () => void undoNewest('banner'),
        onSeeGymSwap: (id) => seeGymSwap('preview', id),
        onKeepExercise: (id) => keepGymExercise(id),
        // M13c: badges open their sheets before a workout; a row opens the exercise detail.
        onBadge: (kind, id, opener) => openBadge(kind, id, opener),
        onOpenExercise: (id) => openExerciseDetail(id),
      },
    );
  }

  function startDay(day: ProgramDay, adjust: ProposalAction | null = null): void {
    voice.unlock(); // must happen inside the tap
    closeCameraInfo(); // M13c: a badge sheet never stays over a workout
    const t = now();
    liftsForWarmups ??= warmupLifts(catalogExercises());
    const s = startSession(day, crypto.randomUUID(), t, {
      unit,
      lastWeightKg: lastWeights(lastTime),
      // M12 1b: warm-up sets from the trainer-kit rule (off = none). The gym profile has no kit
      // steps yet, so the default steps for the unit apply.
      ...(kit.warmups === 'off' ? {} : { warmups: { rule: kit.warmups, lifts: liftsForWarmups } }),
    });
    view = { screen: 'session', s, sheet: null };
    todayNotes = {};
    setupCuesSaid = [];
    betweenSetsKey = '';
    mealIdea = null;
    lastCueElapsedMs = 0;
    placementSpoken = new Set();
    correction = null;
    sessionAdjust = adjust ? [adjust] : [];
    startDevLog(s, day.id);
    void wakeLock.hold();
    void startSessionRow(db, {
      sessionId: s.sessionId,
      dayId: day.id,
      startedAt: t,
      ...(sessionAdjust.length ? { adjust: [...sessionAdjust] } : {}),
    }).catch(logDbError);
    startTicker();
    render();
    speakFocusCue(null, s);
    speakSideStart(null, s);
    speakBetweenSets(s);
  }

  function startDevLog(s: SessionState, dayId: string): void {
    const old = recorder;
    if (old) void old.dispose();
    recorder = null;
    // M13: the developer log never records while owner mode is off (the saved switch is kept).
    if (!isVisible('devlog', ownerOn())) {
      recorderReady = Promise.resolve(null);
      beginLoggedSet(s);
      return;
    }
    recorderReady = startDevLogSession(db, {
      id: s.sessionId,
      dayId,
      // App state only: never notes or other free text.
      settings: { unit, spokenCount },
    }).then((r) => {
      recorder = r.active ? r : null;
      return recorder;
    });
    // Ask iOS not to evict the workout data and the log under storage pressure.
    void navigator.storage?.persist?.().catch(() => undefined);
    beginLoggedSet(s);
  }

  /** Dev-log set boundaries: a set starts when an exercise phase starts, ends when it's logged. */
  /**
   * Remember the set that just started. It is only opened in the dev log once it's used
   * (camera opened, or the set logged), so sets skipped or jumped over leave no empty rows.
   */
  function beginLoggedSet(s: SessionState): void {
    lastCounted = null;
    cameraThisSet = false;
    if (s.phase !== 'exercise') {
      pendingSet = null;
      return;
    }
    const p = currentPlanned(s);
    pendingSet = {
      exerciseId: p.exerciseId,
      setIndex: s.setIndex,
      targetReps: p.targetReps,
      weightKg: s.weightKg,
      startedAt: s.setStartedAt ?? now(), // an auto start is backdated to the first rep
    };
  }

  function openLoggedSet(opts: { prerollFromT?: number } = {}): void {
    const set = pendingSet;
    if (!set) return;
    pendingSet = null;
    // M4f: camera sets record their rule's status (learning/tuned) in the dev log.
    const status = cameraThisSet ? ruleStatus(set.exerciseId) : undefined;
    const info = status === undefined ? set : { ...set, ruleStatus: status };
    rec((r) => r.beginSet(info, opts));
  }

  function logToDevLog(prev: SessionState, s: SessionState, e: SessionEvent): void {
    rec((r) => r.logEvent(e.type, e));
    if (e.type === 'SET_COUNTED') lastCounted = { reps: e.reps, partials: e.partials };
    const newLog = s.logs.length > prev.logs.length ? s.logs.at(-1) : undefined;
    if (newLog) {
      openLoggedSet();
      lastLogLearning = cameraThisSet && ruleStatus(newLog.exerciseId) === 'learning';
      const counted = lastCounted ?? (cameraThisSet ? { reps: 0, partials: 0 } : undefined);
      rec(
        (r) =>
          void r.endSet({
            ...(counted ? { counted } : {}),
            logged: { reps: newLog.reps, partials: newLog.partials ?? 0 },
            weightKg: newLog.weightKg,
            endedAt: newLog.endedAt,
            restTakenSec: newLog.restTakenSec,
          }),
      );
      if (newLog.focusScore !== undefined) logFocusScore(newLog);
    }
    const newSet =
      s.phase === 'exercise' &&
      (prev.phase !== 'exercise' || prev.exIndex !== s.exIndex || prev.setIndex !== s.setIndex);
    if (newSet) beginLoggedSet(s);
  }

  function speakFocusCue(prev: SessionState | null, s: SessionState): void {
    if (shouldSpeakFocusCue(prev, s)) voice.speak(cueFor(currentPlanned(s).exerciseId));
  }

  // ---------- Session ----------

  function setSheet(sheet: Sheet): void {
    if (view.screen !== 'session') return;
    view = { ...view, sheet };
    render();
  }

  function dispatch(e: SessionEvent): void {
    if (view.screen !== 'session') return;
    const prev = view.s;
    const s = next(prev, e);
    if (s === prev) return;
    view = { screen: 'session', s, sheet: null };

    for (const log of s.logs.slice(prev.logs.length)) void saveSet(db, log).catch(logDbError);
    // M12 1b: SET_EFFORT replaces the last log in place (no new log), so its row is updated here.
    if (e.type === 'SET_EFFORT') {
      const last = s.logs.at(-1);
      if (last)
        void updateSetRow(last, (r) => {
          if (last.effort === undefined) delete r.effort;
          else r.effort = last.effort;
        }).catch(logDbError);
    }
    logToDevLog(prev, s, e);
    // A set starts: an open learn card (effort "Why?") never stays over it.
    if (s.phase === 'exercise' && !s.paused && shouldSpeakFocusCue(prev, s)) {
      closeLearnCard();
      closeCameraInfo();
    }
    if (prev.phase !== 'rest' && s.phase === 'rest') lastCueElapsedMs = 0;
    if (s.phase === 'summary' && prev.phase !== 'summary') onFinished(s);
    syncCamera(); // before render: the rest screen leaves the tip/Fix to the camera's rest panel
    render();
    // Pause sheet: move focus into the dialog (the Pause button it came from is gone).
    if (s.paused && !prev.paused) root.querySelector<HTMLElement>('[data-pause="resume"]')?.focus();
    // Back from the sheet: focus the Pause button it came from (the sheet is gone).
    if (prev.paused && !s.paused) root.querySelector<HTMLElement>('[data-pause-open]')?.focus();
    if (camera) camera.el.inert = s.paused; // the Pause sheet is modal over the camera too
    // The effort row was re-rendered: keep focus on the option he chose (tap or arrow keys).
    if (e.type === 'SET_EFFORT' && e.effort !== null)
      root.querySelector<HTMLElement>(`[data-effort-opt="${e.effort}"]`)?.focus();
    speakFocusCue(prev, s);
    speakBetweenSets(s);
    speakSideStart(prev, s);
  }

  /**
   * M13b: a one-sided set starts on the right, said out loud (voice over screen) whenever a set
   * comes up: workout start, after rest, the exercise list or Skip.
   */
  function speakSideStart(prev: SessionState | null, s: SessionState): void {
    if (autoStarting || !shouldSpeakFocusCue(prev, s) || s.doneSide) return;
    const limb = oneSidedLimb(currentPlanned(s)?.exerciseId ?? '');
    if (limb) voice.speak(ONE_SIDED_COPY[limb].spokenStart, { kind: 'cue' });
  }

  /**
   * M12 1b: one logged row, matched exactly. Warm-up sets reuse set indexes 0, 1, … (setIndex
   * stays 0 during warm-ups), so the warm-up flag is part of the match.
   */
  function updateSetRow(log: SetLog, change: (row: SetRow) => void): Promise<number> {
    return db.sets
      .where('sessionId')
      .equals(log.sessionId)
      .filter(
        (r) =>
          r.exerciseId === log.exerciseId &&
          r.setIndex === log.setIndex &&
          isWarmup(r) === isWarmup(log),
      )
      .modify(change);
  }

  /**
   * M12 1b, between sets only (on Rest, or as the workout starts, before set 1): the upcoming
   * warm-up set's line ("Warm-up: 20 kilos for 8."), else the setup checks before an exercise's
   * first working set (once per workout). Queued cues (never a count, never cancelling), said once
   * per upcoming set. Deferred a tick: a hands-free "Start next set" logs and starts in one go,
   * and then nothing is said over the running set.
   */
  function speakBetweenSets(s: SessionState): void {
    if (s.paused || s.phase === 'summary') return;
    // The set-up moment of an exercise nothing has been logged for yet (workout start, or the
    // next exercise after Skip exercise): its warm-up line or set-up checks are said as he
    // gets into position (Decision "M12 1b review": accepted at the first set's start).
    const exId = currentPlanned(s).exerciseId;
    const atStart =
      s.phase === 'exercise' && s.setIndex === 0 && !s.logs.some((l) => l.exerciseId === exId);
    if (s.phase !== 'rest' && !atStart) return;
    const w = currentWarmup(s);
    const key = `${s.sessionId}:${s.exIndex}:${s.setIndex}:${w ? w.index : 'work'}`;
    if (key === betweenSetsKey) return;
    betweenSetsKey = key;
    window.setTimeout(() => {
      if (view.screen !== 'session' || view.s.sessionId !== s.sessionId) return;
      const cur = view.s;
      if (
        cur.paused ||
        (cur.phase !== 'rest' && !(atStart && !cur.logs.some((l) => l.exerciseId === exId)))
      )
        return;
      if (cur.exIndex !== s.exIndex || cur.setIndex !== s.setIndex) return;
      const exerciseId = currentPlanned(cur).exerciseId;
      const warm = currentWarmup(cur);
      if (warm) {
        voice.speak(warmupLine(warm, unit), { kind: 'cue' });
        rec((r) => r.logEvent('warmupLine', { exerciseId, index: warm.index, of: warm.of }));
        return;
      }
      const lines = setupCuesFor(exerciseId, { logs: cur.logs, setupCuesSaid });
      if (lines.length === 0) return;
      setupCuesSaid = [...setupCuesSaid, exerciseId];
      for (const line of lines) voice.speak(line, { kind: 'cue' });
      rec((r) => r.logEvent('setupCues', { exerciseId, lines: lines.length }));
    }, 0);
  }

  function onFinished(s: SessionState): void {
    stopTicker();
    void wakeLock.release();
    saveTotals(s);
    void loadSummaryHistory(s);
    // M7: today's protein vs target on Summary (read fresh: this workout counts for "post-workout").
    void fuel.refresh().then(() => {
      if (mealIdea?.sessionId !== s.sessionId) pickMealIdea(s);
      if (view.screen === 'session' && view.s.phase === 'summary') render();
    });
    // Keep the dev log open on Summary so a last-set fix there still reaches it;
    // it is finished when leaving Summary (goToday). Flush now in case the app is closed here.
    rec((r) => void r.flush());
  }

  function finishDevLog(): void {
    const endedAt = view.screen === 'session' ? (view.s.endedAt ?? now()) : now();
    rec((r) => void r.finish(endedAt));
    recorder = null;
    recorderReady = Promise.resolve(null);
  }

  function saveTotals(s: SessionState): void {
    const { setsDone, totalVolumeKg, restOverruns } = summarize(s);
    void finishSession(db, s.sessionId, s.endedAt ?? now(), {
      setsDone,
      totalVolumeKg,
      restOverruns,
    })
      // M12 slice 2: today's session reminder and missed-day nudge go once it's done.
      .then(() => syncReminders())
      .catch(logDbError);
  }

  /** Rest + Summary: fix the last set's count (the true numbers for the dev log). */
  function lastSetFix(s: SessionState): HTMLElement | null {
    const last = s.logs.at(-1);
    if (!last || s.paused) return null;
    const key = `${s.sessionId}:${s.logs.length}`;
    if (correction?.key !== key) {
      correction = {
        key,
        handle: createLastSetCorrection({
          reps: last.reps,
          partials: last.partials ?? 0,
          learning: lastLogLearning,
          // M13b: a one-sided set fixes each side ("Right arm" / "Left arm").
          sides: last.sides,
          limb: oneSidedLimb(last.exerciseId),
          onCorrect: (reps, partials, side) => correctLastSet(reps, partials, side),
        }),
      };
    }
    return correction.handle.el;
  }

  /** Dev log (M5): ids and numbers only; logged at the save, so it lands after the set's end. */
  function logFocusScore(log: SetLog): void {
    rec((r) =>
      r.logEvent('focusScore', {
        score: log.focusScore ?? null,
        cues: log.cues?.length ?? 0,
        partials: log.partials ?? 0,
      }),
    );
  }

  function correctLastSet(reps: number, partials: number, side?: WorkSide): void {
    dispatch({ type: 'CORRECT_LAST_SET', reps, partials, ...(side ? { side } : {}) });
    if (view.screen !== 'session') return;
    const s = view.s;
    const last = s.logs.at(-1);
    if (!last) return;
    const counts = { reps: last.reps, partials: last.partials ?? 0 };
    // The reducer recomputed the focus score from the stored cues; null removes it (0 reps).
    // Matched with the warm-up flag (warm-ups reuse set indexes), like db.updateSet otherwise.
    void updateSetRow(last, (r) => {
      r.reps = Math.max(0, Math.round(counts.reps));
      if (counts.partials > 0) r.partials = Math.round(counts.partials);
      else delete r.partials;
      // M13b: the reducer's per-side counts (a fix without a side drops them).
      if (last.sides) r.sides = last.sides;
      else delete r.sides;
      if (last.focusScore === undefined) delete r.focusScore;
      else r.focusScore = Math.min(100, Math.max(0, Math.round(last.focusScore)));
    }).catch(logDbError);
    const sideCounts = side ? last.sides?.[side] : undefined;
    rec(
      (r) =>
        void r.correctSet(
          counts,
          undefined,
          side && sideCounts ? { side, logged: sideCounts } : undefined,
        ),
    );
    if (last.cues) logFocusScore(last);
    if (s.phase === 'summary') saveTotals(s);
  }

  function startTicker(): void {
    stopTicker();
    ticker = window.setInterval(tick, TICK_MS);
  }

  function stopTicker(): void {
    if (ticker !== undefined) window.clearInterval(ticker);
    ticker = undefined;
  }

  function tick(): void {
    if (view.screen !== 'session') return;
    const s = view.s;
    if (s.phase !== 'rest' || s.paused) return;
    const elapsed = restElapsedMs(s, now());
    const cues = restCuesBetween(s.restTargetSec, lastCueElapsedMs, elapsed);
    const key = `${s.sessionId}:${s.logs.length}`;
    if (adviceSpokenKey !== key && adviceSpeakDue(lastCueElapsedMs, elapsed, s.restTargetSec)) {
      adviceSpokenKey = key; // once per logged set; a later Fix updates the text only
      const advice = currentAdvice(s);
      if (advice) {
        voice.speak(advice.say, { kind: 'cue' });
        rec((r) =>
          r.logEvent('advice', { rule: advice.rule, exerciseId: advice.exerciseId, spoken: true }),
        );
      }
    }
    lastCueElapsedMs = elapsed;
    // If the tab was throttled and several cues piled up, only the latest is still relevant.
    const cue = cues.at(-1);
    if (cue) voice.speak(restCueText(cue.kind, upcoming(s)));
    restView?.update(s.restTargetSec * 1000 - elapsed, s.restTargetSec * 1000);
    if (camera?.mode === 'rest') updateCameraRest(s);
  }

  function upcoming(s: SessionState) {
    return { name: exerciseName(currentPlanned(s).exerciseId), setNumber: s.setIndex + 1 };
  }

  function sessionScreen(s: SessionState, sheet: Sheet): HTMLElement {
    if (s.phase !== 'rest' && restView) {
      restView.dispose(); // M13: stops the 3D watcher
      restView = null; // the tick only updates a live Rest screen
    }
    if (s.phase === 'summary') return summaryScreen(s);
    const body = s.phase === 'rest' ? restScreen(s) : exerciseScreen(s);
    if (s.paused) {
      body.inert = true; // the Pause sheet is modal: nothing behind it takes taps or focus
      return h('div', { class: 'stack' }, body, pausedOverlay(s));
    }
    if (sheet?.kind === 'list') return h('div', { class: 'stack' }, body, listSheet(s));
    if (sheet?.kind === 'notes')
      return h('div', { class: 'stack' }, body, notesSheet(s, sheet.exerciseId));
    if (sheet?.kind === 'body')
      return h('div', { class: 'stack' }, body, bodySheet(sheet.exerciseId));
    return body;
  }

  function exerciseScreen(s: SessionState): HTMLElement {
    const p = currentPlanned(s);
    const id = p.exerciseId;
    const note = noteFor(id);
    const today = setsText(workingSets(s.logs).filter((l) => l.exerciseId === id));
    const last = setsText(lastTime[id] ?? []);
    const warm = currentWarmup(s);
    return renderExercise(
      {
        dayName: s.day.name,
        exIndex: s.exIndex,
        exTotal: s.day.exercises.length,
        exerciseId: id,
        tracking: p.tracking,
        name: exerciseName(id),
        repsRange: repsRange(p),
        setIndex: s.setIndex,
        sets: p.sets,
        reps: s.reps,
        weightText: w(s.weightKg),
        unit,
        cue: cueFor(id),
        figure: muscleSlot(id, 'inline'),
        machine: note.machineSetting || undefined,
        note: note.note || undefined,
        hasNotes: Boolean(note.note || todayNotes[id]),
        today: today || undefined,
        last: last || undefined,
        warmup: warm ? { index: warm.index, total: warm.of } : undefined,
        side: oneSidedView(id, s),
      },
      {
        onList: () => setSheet({ kind: 'list' }),
        onCamera: p.tracking === 'pose' ? () => openCameraView(exerciseName(id), id) : undefined,
        onPause: () => dispatch({ type: 'PAUSE', now: now() }),
        onSkipWarmups: warm ? () => dispatch({ type: 'SKIP_WARMUPS', now: now() }) : undefined,
        onHowTo: (opener) => openHowTo(p, opener),
        onNotes: () => setSheet({ kind: 'notes', exerciseId: id }),
        onAdjust: (field, dir) =>
          dispatch({
            type: 'ADJUST',
            field,
            delta: dir * (field === 'reps' ? 1 : stepFor(s.unit)),
          }),
        onSetDone: () => dispatch({ type: 'SET_DONE', now: now() }),
        onNextSide: () => nextSide(s),
      },
    );
  }

  /** M13b: the first side is done: log it, then NEXT_SIDE (the counter flips via syncCamera). */
  function nextSide(s: SessionState): void {
    const from = currentSide(s);
    if (!from || s.doneSide || s.phase !== 'exercise' || s.paused) return;
    const counts = { reps: s.reps, partials: s.partials };
    rec(
      (r) =>
        void r.nextSide({
          from,
          to: otherSide(from),
          logged: counts,
          ...(cameraThisSet ? { counted: counts } : {}),
        }),
    );
    dispatch({ type: 'NEXT_SIDE', now: now() });
    // The camera counts the left from 0: nothing counted there must not log the right's reps.
    if (camera && cameraThisSet) dispatch({ type: 'SET_COUNTED', reps: 0, partials: 0 });
  }

  /**
   * M12 set ring: after an exercise's last set the next set is set 1 of the next exercise, so the
   * ring shows the sets just finished (none when that exercise was skipped).
   */
  function finishedExerciseSets(s: SessionState): { done: number; total: number } | undefined {
    if (s.setIndex !== 0 || s.exIndex === 0) return undefined;
    const prev = s.day.exercises[s.exIndex - 1];
    if (!prev) return undefined;
    const done = workingSets(s.logs).filter((l) => l.exerciseId === prev.exerciseId).length;
    return done > 0 ? { done, total: prev.sets } : undefined;
  }

  function restScreen(s: SessionState): HTMLElement {
    const p = currentPlanned(s);
    const id = p.exerciseId;
    const note = noteFor(id);
    const today = setsText(workingSets(s.logs).filter((l) => l.exerciseId === id));
    const last = setsText(lastTime[id] ?? []);
    const targetMs = s.restTargetSec * 1000;
    const warm = currentWarmup(s);
    // M12 1b: the effort row rates the working set just logged (none after a warm-up).
    const lastLog = s.logs.at(-1);
    const rate = lastLog && !isWarmup(lastLog) ? lastLog : null;
    // Hands-free rest on the camera shows the Fix and tip in its own panel (one element, one place).
    const onCamera = camera?.mode === 'rest';
    const v = renderRest(
      {
        dayName: s.day.name,
        exIndex: s.exIndex,
        exTotal: s.day.exercises.length,
        remainingMs: targetMs - restElapsedMs(s, now()),
        targetMs,
        exerciseId: id,
        name: exerciseName(id),
        setIndex: s.setIndex,
        sets: p.sets,
        reps: s.reps,
        weightText: w(s.weightKg),
        unit,
        cue: cueFor(id),
        figure: muscleSlot(id, 'rest'),
        fixEl: onCamera ? null : lastSetFix(s),
        coachTipEl: onCamera ? null : coachTipFor(s),
        machine: note.machineSetting || undefined,
        note: note.note || undefined,
        hasNotes: Boolean(note.note || todayNotes[id]),
        today: today || undefined,
        last: last || undefined,
        setsDone: finishedExerciseSets(s),
        effort: rate ? (rate.effort ?? null) : undefined,
        warmup: warm ? { index: warm.index, total: warm.of } : undefined,
      },
      {
        onList: () => setSheet({ kind: 'list' }),
        onCamera: p.tracking === 'pose' ? () => openCameraView(exerciseName(id), id) : undefined,
        onPause: () => dispatch({ type: 'PAUSE', now: now() }),
        onExtend: () => dispatch({ type: 'EXTEND_REST', sec: 30, now: now() }),
        onNotes: () => setSheet({ kind: 'notes', exerciseId: id }),
        onStartSet: () => dispatch({ type: 'START_SET', now: now() }),
        onEffort: rate
          ? (effort: SetEffort) => dispatch({ type: 'SET_EFFORT', setIndex: rate.setIndex, effort })
          : undefined,
        onEffortWhy: (opener) => {
          const card = findLearnCard(LEARN_CARDS, 'effort');
          if (card) openLearnCard(card, opener);
        },
      },
    );
    restView?.dispose(); // the previous Rest render (replaced by this one)
    restView = v;
    return v.el;
  }

  function bodySheet(exerciseId: string): HTMLElement {
    const { primary, secondary } = musclesOf(exerciseId);
    return h(
      'div',
      { class: 'overlay sheet body-sheet', role: 'dialog', 'aria-label': 'Target muscles' },
      h(
        'header',
        { class: 'top-bar' },
        h('p', { class: 'page-title small-title' }, exerciseName(exerciseId)),
        h('button', { class: 'ghost-btn', onclick: () => setSheet(null) }, 'Close'),
      ),
      muscleSlot(exerciseId, 'full'),
      h(
        'p',
        { class: 'legend' },
        h('span', { class: 'swatch primary' }),
        ` ${primary.join(', ') || '—'}`,
        secondary.length ? h('span', { class: 'swatch secondary' }) : null,
        secondary.length ? ` ${secondary.join(', ')}` : null,
      ),
      h('p', { class: 'muted small' }, body3d ? 'Drag to rotate.' : ''),
    );
  }

  function listSheet(s: SessionState): HTMLElement {
    return h(
      'div',
      { class: 'overlay sheet', role: 'dialog', 'aria-label': 'Exercise list' },
      h(
        'header',
        { class: 'top-bar' },
        h('p', { class: 'page-title' }, s.day.name),
        h('button', { class: 'ghost-btn', onclick: () => setSheet(null) }, 'Close'),
      ),
      h(
        'ol',
        { class: 'ex-list' },
        ...s.day.exercises.map((p, i) => {
          const done = workingSets(s.logs).filter((l) => l.exerciseId === p.exerciseId).length;
          const finished = done >= p.sets;
          const skipped = s.skipped.includes(p.exerciseId);
          const current = i === s.exIndex;
          const status = finished ? 'done' : current ? 'current' : skipped ? 'skipped' : 'todo';
          const label: string | HTMLElement = finished
            ? doneMark()
            : current
              ? s.phase === 'rest'
                ? 'up next'
                : 'now'
              : skipped
                ? 'skipped'
                : '';
          return h(
            'li',
            {},
            h(
              'button',
              {
                class: `ex-row-btn ${status}`,
                'data-ex-index': i,
                disabled: finished || current,
                onclick: () => dispatch({ type: 'GO_TO_EXERCISE', exIndex: i, now: now() }),
              },
              h('strong', {}, exerciseName(p.exerciseId)),
              badgesFor({ exerciseId: p.exerciseId, tracking: p.tracking }),
              h('span', { class: 'muted' }, `${done}/${p.sets} sets · ${repsRange(p)} reps`),
              label ? h('span', { class: `status ${status}` }, label) : null,
            ),
          );
        }),
      ),
    );
  }

  function notesSheet(s: SessionState, exerciseId: string): HTMLElement {
    const note = noteFor(exerciseId);
    const machine = h('input', {
      id: 'machine-input',
      type: 'text',
      value: note.machineSetting,
      placeholder: 'e.g. Seat 4, pad 2',
      autocomplete: 'off',
      enterkeyhint: 'done',
    });
    const lasting = h('textarea', {
      id: 'note-input',
      rows: 2,
      placeholder: 'Shows every time you do this exercise',
    });
    lasting.value = note.note;
    const today = h('textarea', {
      id: 'today-input',
      rows: 2,
      placeholder: 'Only for this workout',
    });
    today.value = todayNotes[exerciseId] ?? '';

    const save = () => {
      const row = { exerciseId, machineSetting: machine.value.trim(), note: lasting.value.trim() };
      exerciseNotes[exerciseId] = row;
      const todayText = today.value.trim();
      todayNotes[exerciseId] = todayText;
      void saveExerciseNote(db, row).catch(logDbError);
      void saveSessionNote(db, s.sessionId, exerciseId, todayText).catch(logDbError);
      setSheet(null);
    };

    return h(
      'div',
      { class: 'overlay sheet', role: 'dialog', 'aria-label': 'Notes' },
      h(
        'header',
        { class: 'top-bar' },
        h('p', { class: 'page-title small-title' }, exerciseName(exerciseId)),
        h('button', { class: 'ghost-btn', onclick: () => setSheet(null) }, 'Cancel'),
      ),
      h('label', { class: 'field-label', for: 'machine-input' }, 'Machine setting'),
      machine,
      h('label', { class: 'field-label', for: 'note-input' }, 'Exercise note'),
      lasting,
      h('label', { class: 'field-label', for: 'today-input' }, 'Today’s note'),
      today,
      h('button', { class: 'primary-btn cta-btn', onclick: save }, icon('check', 'lg'), 'Save'),
    );
  }

  function pausedOverlay(s: SessionState): HTMLElement {
    const p = currentPlanned(s);
    return renderPauseSheet(
      {
        context:
          s.phase === 'rest'
            ? `Resting · next ${exerciseName(p.exerciseId)}`
            : `${exerciseName(p.exerciseId)} · set ${s.setIndex + 1} of ${p.sets}`,
      },
      {
        onResume: () => dispatch({ type: 'RESUME', now: now() }),
        // The reducer only accepts RESUME while paused: resume, then skip.
        onSkip: () => {
          dispatch({ type: 'RESUME', now: now() });
          dispatch({ type: 'SKIP_EXERCISE', now: now() });
        },
        onEnd: () => dispatch({ type: 'FINISH', now: now() }),
        // M10: the coach, typing allowed (paused: no set is running). Not from the camera view
        // (SPEC M10): the row is hidden while it's open.
        onCoach: trainer && !camera ? () => void openCoach('workout') : undefined,
      },
    );
  }

  function summaryScreen(s: SessionState): HTMLElement {
    const sum = summarize(s);
    const hist = summaryHistory?.sessionId === s.sessionId ? summaryHistory : null;
    // M12 1b: Summary counts working sets only (warm-ups are not sets, volume or bests).
    const logs = workingSets(s.logs);
    const idea = mealIdea?.sessionId === s.sessionId ? mealIdea.idea : null;
    return renderSummary(
      {
        dayName: s.day.name,
        date: s.startedAt,
        durationSec: sum.durationSec,
        unit,
        logs,
        plannedExercises: s.day.exercises.length,
        restOverruns: sum.restOverruns,
        skipped: sum.skipped,
        vsLastPct: hist ? volumeVsLast(logs, hist.prevLogs) : null,
        last: hist?.last ?? null,
        bests: hist ? newBests(logs, hist.history) : [],
        name: exerciseName,
        todayNotes,
        fixEl: lastSetFix(s),
        coachEl: createCoachSummary(coachSummary(s, lastTime, exerciseName), exerciseName),
        focusEl: createFocusSummary(logs, exerciseName),
        stalls: summaryStalls?.sessionId === s.sessionId ? summaryStalls.stalls : [],
        fuel: fuel.summaryFuel(),
        mealIdea: idea,
      },
      {
        onDone: goToday,
        onLogMealIdea: (suggestion) => logMealIdea(s.sessionId, suggestion),
        onStallOption: (exerciseId, option) =>
          void openCoach('today', { chip: 'stallFix', args: { exerciseId, option } }),
      },
    );
  }

  /** M12 1b: the post-workout meal idea, chosen once as Summary opens (none without targets). */
  function pickMealIdea(s: SessionState): void {
    const cf = fuel.coachFuel();
    const suggestion = summaryFoodIdea(cf.totals, cf.targets, cf);
    mealIdea = { sessionId: s.sessionId, idea: suggestion ? { suggestion } : null };
  }

  /** Log on the meal idea: the entry, the row reads "Logged"; the toast's Undo takes both back. */
  function logMealIdea(sessionId: string, suggestion: FoodSuggestion): void {
    const set = (logged: boolean) => {
      if (mealIdea?.sessionId !== sessionId || !mealIdea.idea) return;
      mealIdea = { sessionId, idea: { ...mealIdea.idea, logged } };
      if (view.screen === 'session' && view.s.phase === 'summary') render();
    };
    set(true);
    void fuel
      .logSuggestion(suggestion, () => set(false))
      .catch((err: unknown) => {
        logDbError(err);
        set(false);
      });
  }

  /** Summary extras: the same day last time (volume / reps) and today's new bests. */
  async function loadSummaryHistory(s: SessionState): Promise<void> {
    try {
      const t = now();
      const sessions = await sessionsSince(db, t - STATS_WEEKS * 7 * 24 * 3600 * 1000);
      const prev = previousSameDaySession(sessions, s.sessionId);
      // Working sets only on both sides (M12 1b warm-ups are not volume or reps).
      const prevLogs = prev ? workingSets(await setsForSessions(db, [prev.sessionId])) : [];
      const ids = [...new Set(s.logs.map((l) => l.exerciseId))];
      const history = await setsForExercises(db, ids);
      // M10: lifts stalled for 3 sessions (shown under the coach line with their two fixes).
      if (trainer) {
        // This session's own row may not be saved as finished yet: count it as it ended.
        trainerSessions = (await db.sessions.toArray()).map((row) =>
          row.sessionId === s.sessionId
            ? {
                ...row,
                endedAt: s.endedAt ?? t,
                ...(sessionAdjust.length ? { adjust: [...sessionAdjust] } : {}),
              }
            : row,
        );
        const stalls = detectStalls(history, trainerSessions, trainer.plan, {
          since: stallSince(changes),
        }).filter((st) => ids.includes(st.exerciseId));
        summaryStalls = {
          sessionId: s.sessionId,
          stalls: stalls.map((st) => ({
            exerciseId: st.exerciseId,
            line: stallLine(st, exerciseName),
            options: st.options,
          })),
        };
      }
      summaryHistory = {
        sessionId: s.sessionId,
        prevLogs,
        history,
        last: prev
          ? {
              volumeKg: sessionVolume(prevLogs),
              reps: prevLogs.reduce((n, l) => n + l.reps, 0),
            }
          : null,
      };
      if (
        view.screen === 'session' &&
        view.s.sessionId === s.sessionId &&
        view.s.phase === 'summary'
      )
        render();
    } catch (err) {
      console.warn('Could not read history for Summary', err);
    }
  }

  /** A sync copy of the accent for index.html's pre-paint script (IndexedDB stays the source). */
  function mirrorBackground(b: BackgroundStyle): void {
    try {
      localStorage.setItem('gc-background', b);
    } catch {
      // private mode / storage off: the style still applies once IndexedDB loads
    }
  }

  function mirrorAccent(a: Accent): void {
    try {
      localStorage.setItem('gc-accent', a);
    } catch {
      // private mode / storage off: the accent still applies once IndexedDB loads
    }
  }

  function logDbError(err: unknown): void {
    console.error('Saving to IndexedDB failed', err);
  }

  render();
  // M13: owner mode first (fresh install → off; his existing data → on), before the What's New
  // fresh-install marking and anything that could add a session or a to-do answer.
  const ownerReady = resolveOwnerMode(db, now())
    .then((m) => {
      ownerMode = m;
      if (view.screen === 'today' || view.screen === 'settings') render();
    })
    .catch(logDbError);
  // M12 slice 1c, first DB reads: the fresh-install rule (no session, no 'whatsNew' row → the
  // tour is marked seen without showing) runs before anything else can add a session.
  const firstTour = ownerReady.then(() => todos.pendingTour());
  void getUnitPrefs(db)
    .then((u) => {
      unit = u.weight;
      lengthUnit = u.length;
      if (view.screen !== 'session') render();
    })
    .catch(logDbError);
  void getSpokenCount(db)
    .then((on) => {
      spokenCount = on;
      if (view.screen === 'settings') render();
    })
    .catch(logDbError);
  void getCoachTips(db)
    .then((on) => {
      coachTips = on;
      if (view.screen === 'settings') render();
    })
    .catch(logDbError);
  void getAccent(db)
    .then((a) => {
      accent = a;
      applyAccent(a);
      mirrorAccent(a); // keeps the pre-paint copy in sync (e.g. after clearing site data)
      if (view.screen === 'settings') render();
    })
    .catch(logDbError);
  // M13c: the background style (Moving glow by default) and the glow's pause watcher.
  watchAmbient();
  void db.settings
    .get('background')
    .then((row) => {
      background = backgroundStyle(row?.value);
      applyBackground(background);
      mirrorBackground(background);
      if (view.screen === 'settings') render();
    })
    .catch(logDbError);
  void getTextSize(db)
    .then((s) => {
      textSize = s;
      applyTextSize(s);
      if (view.screen === 'settings') render();
    })
    .catch(logDbError);
  void db.settings
    .get('claudeOffer')
    .then((row) => {
      const v = row?.value as ClaudeOffer | undefined;
      if (v && typeof v.lastShownDate === 'string')
        claudeOffer = { lastShownDate: v.lastShownDate };
    })
    .catch(logDbError);
  void getCoachVoice(db)
    .then((v) => {
      coachVoice = v;
      voice.configure(v);
      if (view.screen === 'settings') render();
    })
    .catch(logDbError);
  // iOS loads its voice list late: refresh the picker when it arrives.
  voice.onVoicesChanged(() => {
    if (view.screen === 'settings') render();
  });
  void getHandsFree(db)
    .then((on) => {
      handsFree = on;
      if (view.screen === 'settings') render();
    })
    .catch(logDbError);
  // M10: the trainer state first (Today's calendar and up next read it).
  const trainerReady = loadTrainer();
  // M12 slice 2: settings, then (iPhone app) Apple's brain, the mic and reminders.
  const slice2Ready = trainerReady.then(() => initSlice2()).catch(logDbError);
  document.addEventListener('visibilitychange', () => {
    // Leaving the app ends a hold: nothing heard is sent (the plugin also stops itself).
    if (document.visibilityState === 'hidden') void micCancel();
  });
  // M12: the chat thread pruned to 30 days on start; prompts re-checked when the app comes back.
  void trainerReady.then(() => ensureThread());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || view.screen !== 'today') return;
    const t = now();
    void sessionsSince(db, t - STATS_WEEKS * 7 * 24 * 3600 * 1000)
      .then(async (sessions) => {
        trainerSessions = await db.sessions.toArray();
        const sets = await setsForSessions(
          db,
          sessions.map((x) => x.sessionId),
        );
        await coachPrompts(sets);
      })
      .catch(logDbError);
  });
  // M12 1b: intake / switch first; a fresh install opens the intake before Today.
  const kitReady = loadTrainerKitState();
  // M11: the first Health sync once Today's plan and sessions are known.
  void kitReady
    .then(async () =>
      view.screen === 'today'
        ? (await startOnboarding(false)) || (await startPermissionCatchUp())
        : false,
    )
    .then(() => loadUpNext())
    .then(() => {
      health.start();
      // M12 slice 1c: the What's New tour once Today is up (an update with unseen pages).
      void maybeShowTour(firstTour);
    });
  // M12 slice 1c: the build id (iPhone app, re-sign clock), facts and auto ticks.
  void ownerReady.then(() => todos.start());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || view.screen === 'session') return;
    void todos.refresh();
    if (view.screen === 'today') void maybeShowTour();
  });
  // M7: targets / today's totals for the Today nudge (no seeding until Fuel is opened).
  void fuel.refresh().then(() => {
    if (view.screen === 'today' || view.screen === 'settings') render();
  });
}
