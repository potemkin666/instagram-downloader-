export const API_CLIENT_MODES = {
  BACKEND: 'backend',
  INSTAGRAM_SESSION: 'instagram-session',
};

function createUnsupportedInstagramSessionProvider() {
  return {
    async fetchLiveLines(target, cmd) {
      return [
        ['prompt', `oceangram@osint:~$ python3 main.py ${target} --command ${cmd}`],
        ['dim', '════════════════════════════════════════════════'],
        ['warn', '[!] Direct Instagram session mode is not wired into this static build yet.'],
        ['info', '  Keep using the backend API provider, or add a local authenticated provider in src/api-client.js.'],
      ];
    },
    async loadProfileSummary() {
      return null;
    },
    async checkApiHealth() {
      return false;
    },
  };
}

export function createApiClient({ backend, initialMode = API_CLIENT_MODES.BACKEND } = {}) {
  let mode = initialMode;

  const providers = {
    [API_CLIENT_MODES.BACKEND]: backend,
    [API_CLIENT_MODES.INSTAGRAM_SESSION]: createUnsupportedInstagramSessionProvider(),
  };

  function getProvider() {
    return providers[mode] || providers[API_CLIENT_MODES.BACKEND];
  }

  return {
    getMode() {
      return mode;
    },
    setMode(nextMode) {
      if (providers[nextMode]) mode = nextMode;
      return mode;
    },
    listModes() {
      return Object.keys(providers);
    },
    async fetchLiveLines(...args) {
      return getProvider().fetchLiveLines(...args);
    },
    async loadProfileSummary(...args) {
      return getProvider().loadProfileSummary(...args);
    },
    async checkApiHealth(...args) {
      return getProvider().checkApiHealth(...args);
    },
  };
}
