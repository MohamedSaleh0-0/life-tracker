// Central registry of independently-toggleable UI features (REQ-C006).
// Each flag controls ONE optional piece of UI — not a whole module
// (that's REQ-C004, module enable/disable, still separate) — so a
// user can keep Money Management on but hide just the Essential /
// Judgment fields, for example.
//
// Defaults favor "usable immediately without configuration" (REQ-C007)
// — everything defaults ON except the two genuinely opinionated,
// judgment-heavy fields (essential/judgment tracking), which are the
// clearest example of "some users find this insightful, others find
// it intrusive," so those default OFF and are opt-in.

export interface FeatureFlags {
  // --- Money Management ---
  moneyEssentialJudgment: boolean;   // "Essential?" + Judgment rating on expenses
  moneyTransactionNotes: boolean;    // free-text Note field on transactions
  moneyTransactionQuantity: boolean; // Quantity field on transactions/shopping items
  moneyTransactionTimeOfDay: boolean;// explicit time field (off = always "now"/00:00)
  moneyShoppingDueDates: boolean;    // due-date field on shopping items
  moneyBudgetChecking: boolean;      // category budgets + the over-budget warning
  moneyRecurringEntries: boolean;    // "Needs attention" recurring section
  moneyDebts: boolean;               // Debts section
  moneyPriceHistory: boolean;        // getPriceHistory-driven UI (once surfaced)

  // --- Habit Tracking ---
  habitReminders: boolean;           // reminder step in the wizard + scheduling
  habitCommitmentPhase: boolean;     // "Start new phase" / "Clear phase" buttons
  habitOverallHeatmap: boolean;      // the aggregate commitment heatmap on the main view
  habitLevelsType: boolean;          // 'levels' as a selectable habit type in the wizard

  // --- Data Point Tracking ---
  dataPointTemplates: boolean;       // the quick-template buttons in the wizard
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  moneyEssentialJudgment: false,
  moneyTransactionNotes: true,
  moneyTransactionQuantity: true,
  moneyTransactionTimeOfDay: true,
  moneyShoppingDueDates: true,
  moneyBudgetChecking: true,
  moneyRecurringEntries: true,
  moneyDebts: true,
  moneyPriceHistory: true,

  habitReminders: true,
  habitCommitmentPhase: true,
  habitOverallHeatmap: true,
  habitLevelsType: true,

  dataPointTemplates: true,
};

export type FeaturePreset = 'minimal' | 'standard' | 'power';

/** A preset is just a named starting point — applying one overwrites every flag at once; the user can still flip individual ones afterward. */
export const FEATURE_PRESETS: Record<FeaturePreset, FeatureFlags> = {
  minimal: {
    ...DEFAULT_FEATURE_FLAGS,
    moneyEssentialJudgment: false,
    moneyTransactionQuantity: false,
    moneyTransactionTimeOfDay: false,
    moneyShoppingDueDates: false,
    moneyBudgetChecking: false,
    moneyRecurringEntries: false,
    moneyDebts: false,
    moneyPriceHistory: false,
    habitReminders: false,
    habitCommitmentPhase: false,
    habitOverallHeatmap: false,
    habitLevelsType: false,
    dataPointTemplates: false,
  },
  standard: DEFAULT_FEATURE_FLAGS,
  power: {
    ...DEFAULT_FEATURE_FLAGS,
    moneyEssentialJudgment: true, // the one default-off flag, turned on for power users who opted in
  },
};