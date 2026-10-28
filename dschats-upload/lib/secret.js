'use strict';

/**
 * 敏感字段加解密
 *
 * 用户的 API Key 不能明文躺在 data/db.json 里。
 * 这里用 AES-256-GCM 加密后存储，密钥来自服务器本地自动生成的随机串：
 *   data/.secret   （首次启动自动创建，权限 0600，不进 git、不进部署包）
 *
 * 好处：部署包里不需要任何密钥配置，运维零负担；
 *      即使 db.json 被拿走，没有 .secret 也解不开。
 * 注意：.secret 必须和 data/ 一起备份，丢失后用户需要重新填一次 Key。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SECRET_FILE = path.join(DATA_DIR, '.secret');
const PREFIX = 'enc:v1:';

let masterKey = null;

function loadMasterKey() {
  if (masterKey) return masterKey;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (_) {}
  let raw = '';
  try {
    raw = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch (_) {
    raw = '';
  }
  if (!raw) {
    raw = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(SECRET_FILE, raw + '\n', { mode: 0o600 });
    } catch (e) {
      console.error('[secret] 无法写入 data/.secret，密钥将无法持久化:', e.message);
    }
  }
  masterKey = crypto.createHash('sha256').update(raw).digest();
  return masterKey;
}

function encrypt(plain) {
  const text = String(plain == null ? '' : plain);
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadMasterKey(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload) {
  const raw = String(payload == null ? '' : payload);
  if (!raw) return '';
  if (!raw.startsWith(PREFIX)) return raw; // 兼容历史明文
  try {
    const buf = Buffer.from(raw.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', loadMasterKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('[secret] 解密失败（.secret 可能已更换）:', e.message);
    return '';
  }
}

function isEncrypted(value) {
  return String(value || '').startsWith(PREFIX);
}

/** 生成给前端看的掩码，例如 gsk_••••••••a1b2 */
function maskKey(key) {
  const k = String(key || '');
  if (!k) return '';
  if (k.length <= 10) return k.slice(0, 2) + '••••';
  return `${k.slice(0, 4)}••••••••${k.slice(-4)}`;
}

/**
 * 启动时主动初始化主密钥：
 * 提前创建 data/.secret 并把权限问题暴露在启动日志里，
 * 而不是等用户点「保存」时才失败。
 */
function ensureReady() {
  loadMasterKey();
  let ok = false;
  try {
    ok = fs.existsSync(SECRET_FILE) && fs.readFileSync(SECRET_FILE, 'utf8').trim().length >= 32;
  } catch (_) {
    ok = false;
  }
  return { ok, file: SECRET_FILE };
}

module.exports = { encrypt, decrypt, isEncrypted, maskKey, ensureReady, SECRET_FILE };
