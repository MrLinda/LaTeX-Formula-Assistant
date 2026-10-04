// 私有服务端（LaTeX Formula Assistant Server）API 客户端
//
// 负责：会话与令牌、模型列表、识别、反馈、账号信息、兑换码、公告。
// 桌面版与网页版走同一条「直连服务端」路径，令牌统一存 localStorage。
//
// 约定：
// - 服务端地址来自 config.js 的 getServerBaseUrl()（localStorage 覆盖 serverConfig.baseUrl）。
// - 除登录/刷新/公告外，所有请求带 `Authorization: Bearer <access_token>`；
//   access 过期前自动用 refresh 换新（refresh 会轮换，需回写）。
// - 不打印令牌与图片内容。

// ---- 存储键 ----
const SERVER_KEYS = {
    baseUrl: 'serverBaseUrl',
    access: 'server_access_token',
    refresh: 'server_refresh_token',
    expiry: 'server_token_expiry',
    account: 'server_account',
    user: 'server_user',
    models: 'serverModels',
    modelId: 'selectedServerModelId'
};

// 内存态会话（页面加载时由 restoreServerSession 从 localStorage 恢复）
let serverSession = { accessToken: '', expiresAt: 0 };

// 服务端统一错误：携带 HTTP 状态码与服务端 error.code
class ServerAPIError extends Error {
    constructor(message, status, code) {
        super(message);
        this.name = 'ServerAPIError';
        this.status = status || 0;
        this.code = code || '';
    }
}

// ---- 存储小工具（localStorage 不可用时全部降级为无操作）----

function serverStorageGet(key) {
    try { return localStorage.getItem(key) || ''; } catch (_) { return ''; }
}

function serverStorageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_) { /* 忽略 */ }
}

function serverStorageRemove(key) {
    try { localStorage.removeItem(key); } catch (_) { /* 忽略 */ }
}

function serverStorageGetJSON(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
}

function serverStorageSetJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* 忽略 */ }
}

// ---- 地址与会话 ----

function serverBaseUrl() {
    if (typeof getServerBaseUrl === 'function') return getServerBaseUrl();
    // 兜底：config.js 未加载时直接读存储/默认配置
    const saved = serverStorageGet(SERVER_KEYS.baseUrl);
    const fallback = (typeof serverConfig !== 'undefined' && serverConfig.baseUrl) || '';
    return (saved || fallback).trim().replace(/\/+$/, '');
}

function serverRequestID() {
    try { return crypto.randomUUID(); } catch (_) {
        return 'req-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    }
}

function getServerUser() {
    return serverStorageGetJSON(SERVER_KEYS.user);
}

function getServerAccount() {
    return serverStorageGet(SERVER_KEYS.account);
}

// 登录/刷新成功后统一落盘：access、refresh、过期时间、用户信息
function applyTokenResponse(data) {
    serverSession.accessToken = (data && data.access_token) || '';
    const ttl = data && Number(data.expires_in) > 0 ? Number(data.expires_in) : 0;
    serverSession.expiresAt = ttl ? Date.now() + ttl * 1000 : 0;

    if (serverSession.accessToken) serverStorageSet(SERVER_KEYS.access, serverSession.accessToken);
    if (serverSession.expiresAt) serverStorageSet(SERVER_KEYS.expiry, String(serverSession.expiresAt));
    if (data && data.refresh_token) serverStorageSet(SERVER_KEYS.refresh, data.refresh_token);
    if (data && data.user) {
        serverStorageSetJSON(SERVER_KEYS.user, data.user);
        const label = data.user.email || data.user.username || '';
        if (label) serverStorageSet(SERVER_KEYS.account, label);
    }
}

function clearServerSession() {
    serverSession = { accessToken: '', expiresAt: 0 };
    [SERVER_KEYS.access, SERVER_KEYS.refresh, SERVER_KEYS.expiry, SERVER_KEYS.account]
        .forEach(serverStorageRemove);
}

function isServerLoggedIn() {
    return !!(serverSession.accessToken || serverStorageGet(SERVER_KEYS.refresh));
}

// 页面加载时把上次的 access 与过期时间恢复到内存
function restoreServerSession() {
    serverSession.accessToken = serverStorageGet(SERVER_KEYS.access);
    serverSession.expiresAt = Number(serverStorageGet(SERVER_KEYS.expiry)) || 0;
}

// 有效期剩余不足 30 秒即视为过期
function serverAccessTokenValid() {
    return !!serverSession.accessToken && Date.now() < serverSession.expiresAt - 30000;
}

// 取得可用 access token；force=true 时强制刷新（401 重试用）
async function serviceEnsureAccessToken(force) {
    if (!force && serverAccessTokenValid()) return serverSession.accessToken;

    const refresh = serverStorageGet(SERVER_KEYS.refresh);
    const base = serverBaseUrl();
    if (!refresh || !base) return '';

    let resp;
    try {
        resp = await fetch(base + '/api/v1/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Request-ID': serverRequestID() },
            body: JSON.stringify({ refresh_token: refresh })
        });
    } catch (_) {
        return '';
    }
    if (!resp.ok) {
        // 刷新令牌失效：清掉本地会话，让用户重新登录
        clearServerSession();
        return '';
    }
    const data = await resp.json().catch(() => null);
    if (!data || !data.access_token) {
        clearServerSession();
        return '';
    }
    applyTokenResponse(data);
    return data.access_token;
}

// ---- 通用请求：带令牌、401 自动刷新重试一次 ----

async function serviceRequest(path, options) {
    const base = serverBaseUrl();
    if (!base) throw new ServerAPIError('未配置服务端地址', 0, 'no_base_url');

    const opts = options || {};
    const headers = Object.assign({}, opts.headers || {});
    headers['X-Request-ID'] = serverRequestID();

    const token = await serviceEnsureAccessToken(false);
    if (token) headers['Authorization'] = 'Bearer ' + token;

    let resp;
    try {
        resp = await fetch(base + path, Object.assign({}, opts, { headers }));
    } catch (_) {
        throw new ServerAPIError('网络连接失败，请检查服务端地址与网络', 0, 'network_error');
    }

    if (resp.status === 401) {
        const fresh = await serviceEnsureAccessToken(true);
        if (fresh) {
            headers['Authorization'] = 'Bearer ' + fresh;
            try {
                resp = await fetch(base + path, Object.assign({}, opts, { headers }));
            } catch (_) {
                throw new ServerAPIError('网络连接失败，请检查服务端地址与网络', 0, 'network_error');
            }
        }
    }
    return resp;
}

// 解析服务端的 {"error":{"code","message"}} 结构
async function serverParseError(resp) {
    let code = '';
    let message = '';
    try {
        const data = await resp.json();
        if (data && data.error) {
            code = data.error.code || '';
            message = data.error.message || '';
        }
    } catch (_) { /* 非 JSON 响应 */ }
    return { code, message };
}

async function serverRequireOK(resp, fallbackMessage) {
    if (resp.ok) return;
    const info = await serverParseError(resp);
    throw new ServerAPIError(info.message || fallbackMessage, resp.status, info.code);
}

// ---- 认证 ----

async function serviceLogin(identifier, password) {
    const base = serverBaseUrl();
    if (!base) throw new ServerAPIError('未配置服务端地址', 0, 'no_base_url');

    let resp;
    try {
        resp = await fetch(base + '/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Request-ID': serverRequestID() },
            body: JSON.stringify({
                email: identifier,
                password: password,
                device_name: 'LaTeX公式助手'
            })
        });
    } catch (_) {
        throw new ServerAPIError('网络连接失败，请检查服务端地址与网络', 0, 'network_error');
    }

    if (!resp.ok) {
        const info = await serverParseError(resp);
        throw new ServerAPIError(info.message || '登录失败', resp.status, info.code);
    }
    const data = await resp.json().catch(() => null);
    if (!data || !data.access_token) {
        throw new ServerAPIError('登录响应异常', resp.status, 'bad_response');
    }
    applyTokenResponse(data);
    return getServerUser();
}

async function serviceLogout() {
    const refresh = serverStorageGet(SERVER_KEYS.refresh);
    const base = serverBaseUrl();
    if (refresh && base) {
        try {
            await fetch(base + '/api/v1/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Request-ID': serverRequestID() },
                body: JSON.stringify({ refresh_token: refresh })
            });
        } catch (_) { /* 服务端不可达也要完成本地登出 */ }
    }
    clearServerSession();
}

// ---- 注册与密码重置（免登录接口）----

// 免登录的 JSON POST：注册、验证码、重置密码共用
async function serverPostJSON(path, payload, fallbackMessage) {
    const base = serverBaseUrl();
    if (!base) throw new ServerAPIError('未配置服务端地址', 0, 'no_base_url');

    let resp;
    try {
        resp = await fetch(base + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Request-ID': serverRequestID() },
            body: JSON.stringify(payload || {})
        });
    } catch (_) {
        throw new ServerAPIError('网络连接失败，请检查服务端地址与网络', 0, 'network_error');
    }
    await serverRequireOK(resp, fallbackMessage);
    return resp.json().catch(() => ({}));
}

// 注册要求（是否必须邀请码、是否要邮箱验证码）；拿不到时按最严格处理
async function serviceFetchRegisterPolicy() {
    const base = serverBaseUrl();
    const fallback = { require_invite: true, email_verification: false };
    if (!base) return fallback;

    let resp;
    try {
        resp = await fetch(base + '/api/v1/auth/register-policy', {
            method: 'GET',
            headers: { 'X-Request-ID': serverRequestID() }
        });
    } catch (_) {
        return fallback;
    }
    if (!resp.ok) return fallback;

    const data = await resp.json().catch(() => null);
    return {
        require_invite: !data || data.require_invite !== false,
        email_verification: !!(data && data.email_verification)
    };
}

// 注册验证码（服务端未配 SMTP 时返回 503 smtp_disabled，调用方按「无需验证」处理）
async function serviceSendEmailCode(email) {
    return serverPostJSON('/api/v1/auth/email/send-code', { email: email }, '验证码发送失败');
}

// 注册；服务端不签发令牌，调用方随后自行调 serviceLogin 实现「注册即登录」
async function serviceRegister(payload) {
    const p = payload || {};
    return serverPostJSON('/api/v1/auth/register', {
        email: p.email || '',
        username: p.username || '',
        password: p.password || '',
        invite_code: p.inviteCode || '',
        email_code: p.emailCode || ''
    }, '注册失败');
}

// 发送密码重置验证码
async function serviceSendResetCode(email) {
    return serverPostJSON('/api/v1/auth/forgot-password', { email: email }, '重置码发送失败');
}

// 重置密码；服务端会吊销该账号的全部会话
async function serviceResetPassword(payload) {
    const p = payload || {};
    return serverPostJSON('/api/v1/auth/reset-password', {
        email: p.email || '',
        code: p.code || '',
        new_password: p.newPassword || ''
    }, '密码重置失败');
}

// ---- 账号 / 模型 ----

async function serviceFetchMe() {
    const resp = await serviceRequest('/api/v1/me', { method: 'GET' });
    await serverRequireOK(resp, '获取账号信息失败');
    const data = await resp.json();
    serverStorageSetJSON(SERVER_KEYS.user, data);
    const label = data.email || data.username || '';
    if (label) serverStorageSet(SERVER_KEYS.account, label);
    return data;
}

async function serviceFetchModels() {
    const resp = await serviceRequest('/api/v1/models', { method: 'GET' });
    await serverRequireOK(resp, '获取模型列表失败');
    const data = await resp.json();
    const models = data && Array.isArray(data.models) ? data.models : [];
    serverStorageSetJSON(SERVER_KEYS.models, models);
    return models;
}

function getServerModelsFromCache() {
    return serverStorageGetJSON(SERVER_KEYS.models) || [];
}

function getSelectedServerModelId() {
    return serverStorageGet(SERVER_KEYS.modelId);
}

function saveSelectedServerModelId(modelId) {
    serverStorageSet(SERVER_KEYS.modelId, modelId || '');
}

// ---- 识别 ----

function serverBase64ToBlob(base64Data) {
    const raw = atob(base64Data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: 'image/jpeg' });
}

async function serviceRecognize(base64Data, modelId, clientRequestId) {
    const form = new FormData();
    form.append('model_id', modelId);
    form.append('client_request_id', clientRequestId || serverRequestID());
    form.append('image', serverBase64ToBlob(base64Data), 'formula.jpg');

    const resp = await serviceRequest('/api/v1/recognitions', { method: 'POST', body: form });
    await serverRequireOK(resp, '识别失败');
    return resp.json();
}

// ---- 反馈 ----

async function serviceSendFeedback(recognitionId, payload) {
    const p = payload || {};
    const rating = p.rating === 'bad' ? 'bad' : 'good';

    const form = new FormData();
    form.append('rating', rating);
    if (rating === 'bad') {
        // 差评必须明确同意内部测试用途并带原图
        form.append('consent', 'true');
        if (p.imageBlob) form.append('image', p.imageBlob, 'formula.png');
    }
    if (p.correctionLatex) form.append('correction_latex', p.correctionLatex);
    if (p.problemType) form.append('problem_type', p.problemType);
    if (p.comment) form.append('comment', p.comment);

    const path = '/api/v1/recognitions/' + encodeURIComponent(recognitionId) + '/feedback';
    const resp = await serviceRequest(path, { method: 'POST', body: form });
    await serverRequireOK(resp, '反馈提交失败');
    return resp.json();
}

// ---- 兑换码 / 签到抽奖 ----

// 余额/抽奖次数有变化时同步进本地缓存的用户对象，getServerUser 读到的始终是最新值
function applyServerAccountSnapshot(data) {
    if (!data) return;
    const user = getServerUser() || {};
    if (typeof data.balance_points !== 'undefined') user.balance_points = data.balance_points;
    if (typeof data.balance_units !== 'undefined') user.balance_units = data.balance_units;
    if (typeof data.lottery_chances !== 'undefined') user.lottery_chances = data.lottery_chances;
    serverStorageSetJSON(SERVER_KEYS.user, user);
}

async function serviceCheckIn() {
    const resp = await serviceRequest('/api/v1/checkins', { method: 'POST' });
    await serverRequireOK(resp, '签到失败');
    const data = await resp.json().catch(() => ({}));
    applyServerAccountSnapshot(data);
    return data;
}

async function serviceDrawLottery() {
    const resp = await serviceRequest('/api/v1/lottery/draw', { method: 'POST' });
    await serverRequireOK(resp, '抽奖失败');
    const data = await resp.json().catch(() => ({}));
    applyServerAccountSnapshot(data);
    return data;
}

async function serviceRedeemCode(code) {
    const resp = await serviceRequest('/api/v1/redemptions/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': serverRequestID() },
        body: JSON.stringify({ code: code })
    });
    await serverRequireOK(resp, '兑换失败');
    const data = await resp.json();

    // 兑换成功顺手把缓存里的余额刷新掉
    applyServerAccountSnapshot(data);
    return data;
}

// ---- 公告（公开接口，失败静默返回空）----

async function serviceFetchAnnouncements(limit) {
    const base = serverBaseUrl();
    if (!base) return [];

    let resp;
    try {
        resp = await fetch(base + '/api/v1/announcements?limit=' + (limit || 10), {
            method: 'GET',
            headers: { 'X-Request-ID': serverRequestID() }
        });
    } catch (_) { return []; }
    if (!resp.ok) return [];

    const data = await resp.json().catch(() => null);
    return data && Array.isArray(data.announcements) ? data.announcements : [];
}

restoreServerSession();

// ---- 导出 ----
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ServerAPIError,
        serviceLogin,
        serviceLogout,
        serviceEnsureAccessToken,
        serviceFetchRegisterPolicy,
        serviceSendEmailCode,
        serviceRegister,
        serviceSendResetCode,
        serviceResetPassword,
        serviceFetchMe,
        serviceFetchModels,
        serviceRecognize,
        serviceSendFeedback,
        serviceRedeemCode,
        serviceCheckIn,
        serviceDrawLottery,
        serviceFetchAnnouncements,
        getServerUser,
        getServerAccount,
        isServerLoggedIn,
        getServerModelsFromCache,
        getSelectedServerModelId,
        saveSelectedServerModelId,
        serverBase64ToBlob,
        clearServerSession,
        restoreServerSession
    };
} else if (typeof window !== 'undefined') {
    window.ServerAPIError = ServerAPIError;
    window.serviceLogin = serviceLogin;
    window.serviceLogout = serviceLogout;
    window.serviceEnsureAccessToken = serviceEnsureAccessToken;
    window.serviceFetchRegisterPolicy = serviceFetchRegisterPolicy;
    window.serviceSendEmailCode = serviceSendEmailCode;
    window.serviceRegister = serviceRegister;
    window.serviceSendResetCode = serviceSendResetCode;
    window.serviceResetPassword = serviceResetPassword;
    window.serviceFetchMe = serviceFetchMe;
    window.serviceFetchModels = serviceFetchModels;
    window.serviceRecognize = serviceRecognize;
    window.serviceSendFeedback = serviceSendFeedback;
    window.serviceRedeemCode = serviceRedeemCode;
    window.serviceCheckIn = serviceCheckIn;
    window.serviceDrawLottery = serviceDrawLottery;
    window.serviceFetchAnnouncements = serviceFetchAnnouncements;
    window.getServerUser = getServerUser;
    window.getServerAccount = getServerAccount;
    window.isServerLoggedIn = isServerLoggedIn;
    window.getServerModelsFromCache = getServerModelsFromCache;
    window.getSelectedServerModelId = getSelectedServerModelId;
    window.saveSelectedServerModelId = saveSelectedServerModelId;
    window.serverBase64ToBlob = serverBase64ToBlob;
    window.clearServerSession = clearServerSession;
    window.restoreServerSession = restoreServerSession;
}
