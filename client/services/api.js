const API_BASE = "http://localhost:4000/api";
let csrfToken = "";
let unauthorizedHandler = null;

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    if (res.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new Error(payload.error || "Request failed");
  }
  if (res.status === 204) {
    return null;
  }
  return res.json();
}

export const api = {
  onUnauthorized: (handler) => {
    unauthorizedHandler = handler;
  },
  getCsrfToken: async () => {
    const data = await request("/auth/csrf-token");
    csrfToken = data.csrfToken;
    return data;
  },
  preLogin: (body) => request("/auth/prelogin", { method: "POST", body: JSON.stringify(body) }),
  register: (body) => request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  refresh: () => request("/auth/refresh", { method: "POST" }),
  logout: () => request("/auth/logout", { method: "POST" }),
  setupMfa: () => request("/auth/mfa/setup", { method: "POST" }),
  requestRecovery: (body) => request("/auth/recovery/request", { method: "POST", body: JSON.stringify(body) }),
  submitRecoveryShare: (body) => request("/auth/recovery/submit-share", { method: "POST", body: JSON.stringify(body) }),
  listVault: () => request("/vault"),
  createVaultItem: (body) => request("/vault", { method: "POST", body: JSON.stringify(body) }),
  updateVaultItem: (id, body) => request(`/vault/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteVaultItem: (id) => request(`/vault/${id}`, { method: "DELETE" }),
  reportVaultTamper: (reason, vaultItemId) =>
    request("/vault/tamper-detected", { method: "POST", body: JSON.stringify({ reason, vaultItemId }) })
};
