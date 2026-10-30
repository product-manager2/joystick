// A first result may update an untouched view. Any interaction keeps its current order.
export function mayRefreshRecommendation(state) {
  return Boolean(state.scores && state.accountId === state.currentAccountId
    && state.view === state.currentView
    && state.fingerprint === state.currentFingerprint
    && state.navigation === state.currentNavigation
    && state.interaction === state.currentInteraction
    && state.atTop && !state.editing && !state.focusedInput);
}
