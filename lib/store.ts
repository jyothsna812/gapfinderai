"use client";
// Persistence: accounts + session in localStorage, each student's data in IndexedDB
// (large PDFs don't fit in localStorage's ~5 MB). No external database needed.
import type { StudentData, User } from "./types";
import { buildDemoData, DEMO_EMAIL, DEMO_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD } from "./seed";
import { summarizeStudent } from "./admin-summary";
export { DEMO_EMAIL, DEMO_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD } from "./seed";
import SHA256 from "crypto-js/sha256";
import { getSupabaseBrowserClient } from "./supabase/client";


const USERS_KEY = "gf_users";
const SESSION_KEY = "gf_session";
const DB_NAME = "gapfinder";
const STORE = "students";

const inMemoryStorage = new Map<string, string>();

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
      const val = localStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch {
    /* storage unavailable */
  }
  return inMemoryStorage.get(key) ?? null;
}

function safeSet(key: string, val: string | null) {
  if (val === null) inMemoryStorage.delete(key);
  else inMemoryStorage.set(key, val);
  try {
    if (typeof localStorage !== "undefined") {
      if (val === null) localStorage.removeItem(key);
      else localStorage.setItem(key, val);
    }
  } catch {
    /* storage unavailable (private mode or Node environment) — app still works */
  }
}

// ---------- IndexedDB (tiny promise wrapper) ----------
let dbPromise: Promise<IDBDatabase> | null = null;
const memoryFallback = new Map<string, StudentData>();

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          if (!req.result.objectStoreNames.contains(STORE)) {
            req.result.createObjectStore(STORE);
          }
        } catch {
          /* store already created or upgrading */
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error || new Error("Failed to open IndexedDB"));
      };
      req.onblocked = () => {
        dbPromise = null;
        reject(new Error("IndexedDB connection blocked by another window or tab."));
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });
  return dbPromise;
}


// ---------- Supabase sync (best-effort; IndexedDB stays the fast local cache) ----------
// Table: public.student_state(user_id uuid pk, data jsonb, updated_at timestamptz) with RLS.
async function remote(email: string) {
  try {
    if (email.toLowerCase() === DEMO_EMAIL) return null; // demo stays local
    const sb = getSupabaseBrowserClient();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    return user ? { sb, uid: user.id } : null;
  } catch {
    return null;
  }
}

async function pullRemote(email: string): Promise<any | null> {
  const r = await remote(email);
  if (!r) return null;
  try {
    const { data } = await r.sb.from("student_state").select("data").eq("user_id", r.uid).maybeSingle();
    return data?.data ?? null;
  } catch {
    return null;
  }
}

async function pushRemote(email: string, d: StudentData): Promise<void> {
  const r = await remote(email);
  if (!r) return;
  try {
    await r.sb.from("student_state").upsert({ user_id: r.uid, data: d, updated_at: new Date().toISOString() });
  } catch {
    /* offline or table missing: local copy still works */
  }
}

/** Fills fields added in later versions so older saved data keeps working. */
function normalize(d: any): StudentData {
  return {
    ...d,
    version: 2,
    agentRuns: d.agentRuns ?? [],
    planPrefs: d.planPrefs ?? { days: 5, hoursPerDay: 2 },
    materials: (d.materials ?? []).map((m: any) => ({ status: "ready", hash: "", wordCount: 0, headings: [], warnings: [], ...m })),
    topics: (d.topics ?? []).map((t: any) => ({ description: "", learningObjectives: [], prerequisites: [], ...t })),
    pastQuestions: (d.pastQuestions ?? []).map((q: any) => ({ confidence: 1, needsReview: false, marks: null, qtype: "other", difficulty: "medium", ...q })),
    reports: (d.reports ?? []).filter((r: any) => r.coverage), // old-format reports are regenerated on the next quiz
  };
}

export async function loadData(email: string): Promise<StudentData | null> {
  const raw = await loadRaw(email);
  if (!raw) return null;
  // the demo account is simply rebuilt when its saved format is outdated
  if (raw.version !== 2 && email.toLowerCase() === DEMO_EMAIL) return null;
  return normalize(raw);
}

async function loadRaw(email: string): Promise<any | null> {
  let local: any | null = null;
  try {
    const db = await openDb();
    local = await new Promise((resolve, reject) => {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(email.toLowerCase());
      r.onsuccess = () => resolve((r.result as StudentData) ?? null);
      r.onerror = () => reject(r.error);
    });
  } catch {
    local = memoryFallback.get(email.toLowerCase()) ?? null;
  }
  if (local) return local;
  // new device / cleared browser: restore from Supabase and re-cache locally
  const cloud = await pullRemote(email);
  if (cloud) await saveLocal(email, cloud);
  return cloud;
}

async function saveLocal(email: string, data: StudentData): Promise<void> {
  memoryFallback.set(email.toLowerCase(), data);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(data, email.toLowerCase());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* keep in memory */
  }
}

export async function saveData(email: string, data: StudentData): Promise<void> {
  await saveLocal(email, data);
  void pushRemote(email, data); // fire-and-forget so the UI never waits on the network
}

// ---------- accounts ----------
async function sha256(s: string): Promise<string> {
  return SHA256(s).toString();
}

export function readUsers(): User[] {
  try {
    return JSON.parse(safeGet(USERS_KEY) || "[]");
  } catch {
    return [];
  }
}
export function writeUsers(u: User[]) {
  safeSet(USERS_KEY, JSON.stringify(u));
}

export function syncLocalUser(u: { email: string; name: string; id?: string; role?: "student" | "teacher" | "admin" }): User {
  const users = readUsers();
  const normalized = u.email.trim().toLowerCase();
  let existing = users.find((x) => x.email.toLowerCase() === normalized);
  const now = Date.now();
  if (!existing) {
    existing = {
      email: normalized,
      name: u.name || normalized.split("@")[0],
      passHash: "",
      role: u.role || "student",
      createdAt: now,
      lastLoginAt: now,
      loginCount: 1,
    };
    users.push(existing);
  } else {
    existing.name = u.name || existing.name;
    if (u.role) existing.role = u.role;
    existing.lastLoginAt = now;
    existing.loginCount = (existing.loginCount || 0) + 1;
  }
  writeUsers(users);
  safeSet(SESSION_KEY, normalized);
  return existing;
}

function cloneAndCustomizeData(
  mastery: number,
  completedBlocks: number,
  weakTopicNames: string[],
  scoreMultiplier: number
): StudentData {
  const base = buildDemoData();
  const now = Date.now();

  // Adjust reports
  if (base.reports && base.reports.length > 0) {
    const lastReport = base.reports[base.reports.length - 1];
    lastReport.overallMastery = mastery;
    lastReport.topics = lastReport.topics.map((t) => {
      const isWeak = weakTopicNames.includes(t.name);
      return {
        ...t,
        level: isWeak ? ("weak" as const) : mastery >= 0.8 ? ("strong" as const) : ("medium" as const),
      };
    });
  }

  // Adjust attempts evaluations
  if (base.attempts) {
    base.attempts = base.attempts.map((a, idx) => ({
      ...a,
      evaluations: a.evaluations.map((ev) => ({
        ...ev,
        score: Math.min(1, Math.max(0, ev.score * scoreMultiplier)),
      })),
      createdAt: now - (idx + 1) * 86400 * 1000 * 2,
    }));
  }

  // Adjust completed plan blocks for study time tracking
  if (base.plan && base.plan.schedule) {
    let remainingToComplete = completedBlocks;
    for (const day of base.plan.schedule) {
      for (const block of day.blocks) {
        if (remainingToComplete > 0) {
          block.done = true;
          remainingToComplete--;
        } else {
          block.done = false;
        }
      }
    }
  }

  return base;
}

/** Makes sure the demo accounts, admin credentials, and pre-loaded study data exist. */
export async function ensureDemo(): Promise<void> {
  const users = readUsers();
  let changed = false;
  const now = Date.now();

  // 1. Student demo credentials (strictly preserved demo@gapfinder.ai / demo1234)
  let studentUser = users.find((u) => u.email.toLowerCase() === DEMO_EMAIL.toLowerCase());
  if (!studentUser) {
    studentUser = {
      id: "usr_demo_student",
      email: DEMO_EMAIL,
      name: "Demo Student",
      passHash: await sha256(DEMO_PASSWORD),
      role: "student",
      demo: true,
      createdAt: now - 7 * 86400 * 1000,
      lastLoginAt: now - 25 * 60 * 1000,
      loginCount: 8,
    };
    users.push(studentUser);
    changed = true;
  } else if (!studentUser.role) {
    studentUser.role = "student";
    changed = true;
  }

  // 2. Admin credentials (admin@gapfinder.ai / admin1234)
  let adminUser = users.find((u) => u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  if (!adminUser) {
    adminUser = {
      id: "usr_admin",
      email: ADMIN_EMAIL,
      name: "System Admin",
      passHash: await sha256(ADMIN_PASSWORD),
      role: "admin",
      createdAt: now - 14 * 86400 * 1000,
      lastLoginAt: now - 5 * 60 * 1000,
      loginCount: 15,
    };
    users.push(adminUser);
    changed = true;
  } else if (adminUser.role !== "admin") {
    adminUser.role = "admin";
    changed = true;
  }

  // 3. Benchmark student: Sarah Chen (High performer)
  const sarahEmail = "sarah.chen@gapfinder.ai";
  if (!users.find((u) => u.email.toLowerCase() === sarahEmail)) {
    users.push({
      id: "usr_sarah",
      email: sarahEmail,
      name: "Sarah Chen",
      passHash: await sha256("sarah1234"),
      role: "student",
      createdAt: now - 12 * 86400 * 1000,
      lastLoginAt: now - 2 * 3600 * 1000,
      loginCount: 12,
    });
    changed = true;
  }

  // 4. Benchmark student: Marcus Vance (Needs attention)
  const marcusEmail = "marcus.v@gapfinder.ai";
  if (!users.find((u) => u.email.toLowerCase() === marcusEmail)) {
    users.push({
      id: "usr_marcus",
      email: marcusEmail,
      name: "Marcus Vance",
      passHash: await sha256("marcus1234"),
      role: "student",
      createdAt: now - 9 * 86400 * 1000,
      lastLoginAt: now - 28 * 3600 * 1000,
      loginCount: 4,
    });
    changed = true;
  }

  // 5. Benchmark student: Elena Rostova (Steady progress)
  const elenaEmail = "elena.rostova@gapfinder.ai";
  if (!users.find((u) => u.email.toLowerCase() === elenaEmail)) {
    users.push({
      id: "usr_elena",
      email: elenaEmail,
      name: "Elena Rostova",
      passHash: await sha256("elena1234"),
      role: "student",
      createdAt: now - 15 * 86400 * 1000,
      lastLoginAt: now - 14 * 3600 * 1000,
      loginCount: 7,
    });
    changed = true;
  }

  if (changed) writeUsers(users);

  // Populate benchmark student study states if missing
  if (!(await loadData(DEMO_EMAIL))) {
    const d = buildDemoData();
    // Mark first 2 blocks completed for realistic initial study time
    if (d.plan?.schedule?.[0]?.blocks?.[0]) d.plan.schedule[0].blocks[0].done = true;
    if (d.plan?.schedule?.[0]?.blocks?.[1]) d.plan.schedule[0].blocks[1].done = true;
    await saveData(DEMO_EMAIL, d);
  }

  if (!(await loadData(sarahEmail))) {
    await saveData(sarahEmail, cloneAndCustomizeData(0.85, 4, ["Photosynthesis photolysis"], 1.15));
  }

  if (!(await loadData(marcusEmail))) {
    await saveData(marcusEmail, cloneAndCustomizeData(0.44, 1, ["Nephron Filtration", "Double Circulation"], 0.65));
  }

  if (!(await loadData(elenaEmail))) {
    await saveData(elenaEmail, cloneAndCustomizeData(0.68, 2, ["Stomatal Gas Exchange"], 0.9));
  }
}

export async function resetDemo(): Promise<StudentData> {
  const d = buildDemoData();
  if (d.plan?.schedule?.[0]?.blocks?.[0]) d.plan.schedule[0].blocks[0].done = true;
  if (d.plan?.schedule?.[0]?.blocks?.[1]) d.plan.schedule[0].blocks[1].done = true;
  await saveData(DEMO_EMAIL, d);
  return d;
}

export async function login(email: string, password: string): Promise<User> {
  await ensureDemo();
  const normalized = email.trim().toLowerCase();
  const users = readUsers();
  const u = users.find((x) => x.email.toLowerCase() === normalized);
  if (!u || u.passHash !== (await sha256(password))) throw new Error("Wrong email or password.");
  u.lastLoginAt = Date.now();
  u.loginCount = (u.loginCount || 0) + 1;
  writeUsers(users);
  safeSet(SESSION_KEY, u.email);
  return u;
}

export async function register(name: string, email: string, password: string): Promise<User> {
  const e = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(e)) throw new Error("Enter a valid email.");
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");
  const users = readUsers();
  if (users.find((x) => x.email === e)) throw new Error("An account with this email already exists.");
  const now = Date.now();
  const u: User = {
    id: `usr_${Math.random().toString(36).slice(2, 9)}`,
    email: e,
    name: name.trim() || e.split("@")[0],
    passHash: await sha256(password),
    role: "student",
    createdAt: now,
    lastLoginAt: now,
    loginCount: 1,
  };
  writeUsers([...users, u]);
  safeSet(SESSION_KEY, e);
  return u;
}

export function currentUser(): User | null {
  const e = safeGet(SESSION_KEY);
  if (!e) return null;
  return readUsers().find((u) => u.email === e) ?? null;
}

export function logout() {
  safeSet(SESSION_KEY, null);
}

// ---------- Admin Monitoring Telemetry Helpers ----------

export interface StudentMonitoringRecord {
  id: string;
  email: string;
  fullName: string;
  role: "student" | "teacher" | "admin";
  createdAt: number;
  lastSignIn: number | null;
  loginCount: number;
  subject: string;
  materials: number;
  topics: number;
  quizzes: number;
  mastery: number | null;
  level: "strong" | "medium" | "weak" | "untested";
  avgScore: number | null;
  weakTopics: string[];
  timeSpentMinutes: number;
  studyMinutes: number;
  quizMinutes: number;
  planDays: number;
  completedBlocksCount: number;
  lastActive: number | null;
}

export async function getStudentMonitoringList(): Promise<StudentMonitoringRecord[]> {
  await ensureDemo();
  const users = readUsers();
  const records: StudentMonitoringRecord[] = [];

  for (const u of users) {
    const rawData = await loadData(u.email);
    const summary = summarizeStudent(rawData);
    const lastActive = summary.attempts.length
      ? summary.attempts[summary.attempts.length - 1].at
      : u.lastLoginAt ?? null;

    records.push({
      id: u.id || u.email,
      email: u.email,
      fullName: u.name,
      role: (u.role as "student" | "teacher" | "admin") || "student",
      createdAt: u.createdAt ?? Date.now() - 7 * 86400 * 1000,
      lastSignIn: u.lastLoginAt ?? null,
      loginCount: u.loginCount ?? 1,
      subject: summary.subject || (rawData?.subject ?? ""),
      materials: summary.materials.length,
      topics: summary.topicCount,
      quizzes: summary.attempts.length,
      mastery: summary.mastery,
      level: summary.level,
      avgScore: summary.avgScore,
      weakTopics: summary.weakTopics,
      timeSpentMinutes: summary.totalTimeMinutes,
      studyMinutes: summary.studyMinutes,
      quizMinutes: summary.quizMinutes,
      planDays: summary.planDays,
      completedBlocksCount: summary.completedBlocksCount,
      lastActive,
    });
  }

  return records;
}

export async function getStudentMonitoringDetail(idOrEmail: string) {
  await ensureDemo();
  const users = readUsers();
  const u = users.find((x) => x.email.toLowerCase() === idOrEmail.toLowerCase() || x.id === idOrEmail);
  if (!u) return null;
  const rawData = await loadData(u.email);
  const summary = summarizeStudent(rawData);
  return {
    profile: {
      id: u.id || u.email,
      email: u.email,
      fullName: u.name,
      role: (u.role as "student" | "teacher" | "admin") || "student",
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    auth: {
      lastSignIn: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
      loginCount: u.loginCount ?? 1,
      confirmed: true,
    },
    study: rawData
      ? {
          ...summary,
          plan: rawData.plan,
          savedAt: new Date().toISOString(),
        }
      : null,
  };
}

export async function adminCreateStudent(payload: { email: string; fullName: string; password: string; role: "student" | "teacher" | "admin" }) {
  const users = readUsers();
  const email = payload.email.trim().toLowerCase();
  if (users.some((x) => x.email.toLowerCase() === email)) {
    throw new Error("An account with this email already exists.");
  }
  const now = Date.now();
  const newUser: User = {
    id: `usr_${Math.random().toString(36).slice(2, 9)}`,
    email,
    name: payload.fullName.trim() || email.split("@")[0],
    passHash: await sha256(payload.password),
    role: payload.role,
    createdAt: now,
    lastLoginAt: null,
    loginCount: 0,
  };
  users.push(newUser);
  writeUsers(users);
  return newUser;
}

export async function adminUpdateStudent(idOrEmail: string, payload: { fullName?: string; email?: string; password?: string; role?: "student" | "teacher" | "admin" }) {
  const users = readUsers();
  const u = users.find((x) => x.email.toLowerCase() === idOrEmail.toLowerCase() || x.id === idOrEmail);
  if (!u) throw new Error("User not found.");
  if (payload.fullName) u.name = payload.fullName.trim();
  if (payload.role) u.role = payload.role;
  if (payload.password) u.passHash = await sha256(payload.password);
  if (payload.email && payload.email.toLowerCase() !== u.email.toLowerCase()) {
    const oldEmail = u.email;
    u.email = payload.email.trim().toLowerCase();
    const oldData = await loadData(oldEmail);
    if (oldData) await saveData(u.email, oldData);
  }
  writeUsers(users);
  return u;
}

export async function adminDeleteStudent(idOrEmail: string) {
  let users = readUsers();
  const u = users.find((x) => x.email.toLowerCase() === idOrEmail.toLowerCase() || x.id === idOrEmail);
  if (!u) throw new Error("User not found.");
  if (u.email.toLowerCase() === DEMO_EMAIL.toLowerCase()) {
    throw new Error("Cannot delete primary demo student account.");
  }
  if (u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    throw new Error("Cannot delete primary administrator account.");
  }
  users = users.filter((x) => x.email.toLowerCase() !== u.email.toLowerCase());
  writeUsers(users);
}