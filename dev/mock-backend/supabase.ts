// Local stand-in for src/lib/supabase.ts, used only by `npm run dev:mock`
// (vite.mock.config.ts swaps it in). It keeps demo data in this browser's
// localStorage and never contacts Supabase, Resend or any other server, so
// the UI can be reviewed and regression-tested without touching production.
//
// It mirrors the database rules that shape the UI (admin-only actions, the
// designer column/status rules of posts_workflow_rules, versioned updates and
// request_post_changes) closely enough to exercise the same code paths. The
// real enforcement lives in supabase/migrations and is not changed by this.
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSeed, placeholderImage, QUICK_ROLES, USERS, type MockDb } from './seed'

export const ARTWORK_BUCKET = 'social-media-assets'
export type SupabaseConfigProblem = 'missing' | 'secret-key' | null
export const supabaseConfigProblem: SupabaseConfigProblem = null

const DB_KEY = 'tae-mock-db-v1'
const SESSION_KEY = 'tae-mock-session'
const LATENCY_MS = 150

type Row = Record<string, unknown>
type TableName = keyof MockDb
interface MockError {
  message: string
  code: string
  details: string | null
  hint: string | null
}
interface Result {
  data: unknown
  error: MockError | null
  count?: number | null
}

const delay = (ms = LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms))
const fail = (message: string, code = 'P0001'): MockError => ({ message, code, details: null, hint: null })
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

// ---------------------------------------------------------------------------
// Storage of the demo database and session
// ---------------------------------------------------------------------------

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStore(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Private mode: the demo still works for this page load.
  }
}

const params = new URLSearchParams(window.location.search)
if (params.has('reset')) writeStore(DB_KEY, null)
const quickRole = params.get('as')
if (quickRole !== null) writeStore(SESSION_KEY, quickRole === 'none' ? null : (QUICK_ROLES[quickRole] ?? quickRole))
if (params.has('reset') || quickRole !== null) {
  params.delete('reset')
  params.delete('as')
  const query = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
}

let db: MockDb = (() => {
  const saved = readStore(DB_KEY)
  if (saved) {
    try {
      return JSON.parse(saved) as MockDb
    } catch {
      // Fall through to a fresh seed.
    }
  }
  return buildSeed()
})()

function persist() {
  writeStore(DB_KEY, JSON.stringify(db))
}
persist()

/** Uploaded files live only for this page load (object URLs). */
const objects = new Map<string, string>()

let sessionUserId: string | null = readStore(SESSION_KEY)

function currentMember(): Row | undefined {
  return db.team_members.find((m) => m.user_id === sessionUserId)
}
const isAdmin = () => {
  const m = currentMember()
  return m?.role === 'admin' && m.active === true
}
const isDesigner = () => {
  const m = currentMember()
  return m?.role === 'designer' && m.active === true
}

function session() {
  const user = USERS.find((u) => u.id === sessionUserId)
  if (!user) return null
  return {
    access_token: 'mock-token',
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'mock-refresh',
    user: { id: user.id, email: user.email, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
  }
}

type AuthListener = (event: string, next: ReturnType<typeof session>) => void
const listeners = new Set<AuthListener>()
const emitAuth = (event: string) => listeners.forEach((fn) => fn(event, session()))

// ---------------------------------------------------------------------------
// Database rules mirrored from supabase/migrations
// ---------------------------------------------------------------------------

const UNFINISHED = ['Planned', 'In Design', 'Ready for Review']
const DESIGNER_LOCKED_COLUMNS = ['title', 'publish_date', 'program', 'platforms', 'format', 'published_url']

function designerName(id: unknown): string {
  const m = db.team_members.find((t) => t.user_id === id)
  if (!m) return ''
  return String(m.display_name || m.email)
}

/** posts_workflow_rules: returns an error message, or null when allowed. */
function checkPostWrite(oldRow: Row | null, next: Row): string | null {
  if (!isAdmin()) {
    if (!oldRow) return 'Only administrators can create posts.'
    if (next.designer_id !== oldRow.designer_id) return 'Only administrators can assign designers.'
    if (!UNFINISHED.includes(String(oldRow.status))) {
      return 'This post is Approved or Published and is read-only. Ask an administrator to reopen it.'
    }
    if (!UNFINISHED.includes(String(next.status))) return 'Designers can only set Planned, In Design or Ready for Review.'
    for (const column of DESIGNER_LOCKED_COLUMNS) {
      if (JSON.stringify(next[column]) !== JSON.stringify(oldRow[column])) {
        return 'Only administrators can change the title, date, program, platforms, format or published link.'
      }
    }
  }
  if (next.designer_id) {
    const m = db.team_members.find((t) => t.user_id === next.designer_id)
    if (!m || m.active !== true) return 'The assigned designer must be an active account.'
  }
  return null
}

function applyPostDefaults(oldRow: Row | null, next: Row): Row {
  const now = new Date().toISOString()
  const row = { ...next }
  if (['Ready for Review', 'Approved', 'Published'].includes(String(row.status)) && (!oldRow || oldRow.status !== row.status)) {
    row.changes_requested_at = null
  }
  if (row.designer_id) row.designer = designerName(row.designer_id)
  else if (oldRow?.designer_id && row.status !== 'Published') row.designer = ''
  row.version = oldRow ? Number(oldRow.version) + 1 : 1
  row.updated_at = now
  if (!oldRow) row.created_at = now
  return row
}

function canWriteAssetsFor(postId: unknown): boolean {
  if (isAdmin()) return true
  const post = db.posts.find((p) => p.id === postId)
  return isDesigner() && !!post && UNFINISHED.includes(String(post.status))
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

// ---------------------------------------------------------------------------
// Query builder (the subset of PostgREST used by the app)
// ---------------------------------------------------------------------------

type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert'

class Query implements PromiseLike<Result> {
  private op: Op = 'select'
  private values: Row[] = []
  private patch: Row = {}
  private filters: [string, unknown][] = []
  private orders: [string, boolean][] = []
  private limitTo: number | null = null
  private rangeFrom: number | null = null
  private rangeTo: number | null = null
  private columns: string | null = null
  private mode: 'many' | 'single' | 'maybe' = 'many'
  private wantsRows = false
  private table: TableName

  constructor(table: string) {
    this.table = table as TableName
  }

  select(columns = '*') {
    this.columns = columns
    this.wantsRows = true
    return this
  }
  insert(values: Row | Row[]) {
    this.op = 'insert'
    this.values = Array.isArray(values) ? values : [values]
    return this
  }
  upsert(values: Row | Row[]) {
    this.op = 'upsert'
    this.values = Array.isArray(values) ? values : [values]
    return this
  }
  update(patch: Row) {
    this.op = 'update'
    this.patch = patch
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value])
    return this
  }
  order(column: string, options?: { ascending?: boolean; referencedTable?: string }) {
    if (!options?.referencedTable) this.orders.push([column, options?.ascending !== false])
    return this
  }
  limit(n: number) {
    this.limitTo = n
    return this
  }
  range(from: number, to: number) {
    this.rangeFrom = from
    this.rangeTo = to
    return this
  }
  single() {
    this.mode = 'single'
    return this
  }
  maybeSingle() {
    this.mode = 'maybe'
    return this
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return delay()
      .then(() => this.run())
      .then(onfulfilled, onrejected)
  }

  private rows(): Row[] {
    return db[this.table] as Row[]
  }

  private matches(row: Row): boolean {
    return this.filters.every(([column, value]) => row[column] === value)
  }

  private shape(rows: Row[]): Row[] {
    const embedAssets = this.table === 'posts' && (this.columns ?? '').includes('post_assets')
    const plain = (this.columns ?? '*').replace(/post_assets\([^)]*\)/, '').split(',').map((c) => c.trim()).filter(Boolean)
    return rows.map((row) => {
      let out: Row = plain.includes('*') ? clone(row) : Object.fromEntries(plain.map((c) => [c, clone(row[c])]))
      if (embedAssets) {
        out = { ...out, post_assets: clone(db.post_assets.filter((a) => a.post_id === row.id)) }
      }
      return out
    })
  }

  private finish(rows: Row[]): Result {
    let list = rows
    for (const [column, asc] of [...this.orders].reverse()) {
      list = [...list].sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')) * (asc ? 1 : -1))
    }
    if (this.rangeFrom !== null && this.rangeTo !== null) list = list.slice(this.rangeFrom, this.rangeTo + 1)
    if (this.limitTo !== null) list = list.slice(0, this.limitTo)
    const data = this.wantsRows || this.op === 'select' ? this.shape(list) : null
    if (this.mode === 'many') return { data, error: null }
    if (!data || data.length === 0) {
      return this.mode === 'maybe' ? { data: null, error: null } : { data: null, error: fail('No rows found', 'PGRST116') }
    }
    return { data: data[0], error: null }
  }

  private run(): Result {
    if (!sessionUserId) return { data: null, error: fail('JWT expired', 'PGRST301') }
    const member = currentMember()
    // Only active team members pass is_team_member(); the access check itself may read its own row.
    if (this.table !== 'team_members' && !(member?.active === true)) {
      return { data: this.mode === 'many' ? [] : null, error: null }
    }
    try {
      switch (this.op) {
        case 'select':
          return this.finish(this.rows().filter((r) => this.matches(r)))
        case 'insert':
        case 'upsert':
          return this.runInsert()
        case 'update':
          return this.runUpdate()
        case 'delete':
          return this.runDelete()
      }
    } finally {
      persist()
    }
  }

  private runInsert(): Result {
    const inserted: Row[] = []
    for (const value of this.values) {
      if (this.table === 'posts') {
        if (!isAdmin()) return { data: null, error: fail('new row violates row-level security policy for table "posts"', '42501') }
        if (this.op === 'upsert' && value.legacy_id && db.posts.some((p) => p.legacy_id === value.legacy_id)) continue
        const base: Row = {
          id: newId('p'),
          caption: '',
          creative_wording: '',
          design_brief: '',
          reel_script: '',
          designer: '',
          designer_id: null,
          notes: '',
          artwork_url: '',
          published_url: '',
          review_note: '',
          changes_requested_at: null,
          ...value,
        }
        const problem = checkPostWrite(null, base)
        if (problem) return { data: null, error: fail(problem, '42501') }
        const row = applyPostDefaults(null, base)
        db.posts.push(row)
        inserted.push(row)
      } else if (this.table === 'post_assets') {
        if (!canWriteAssetsFor(value.post_id)) return { data: null, error: fail('new row violates row-level security policy', '42501') }
        const row = { id: newId('a'), created_at: new Date().toISOString(), ...value }
        db.post_assets.push(row)
        inserted.push(row)
      } else if (this.table === 'email_recipients' || this.table === 'email_schedules') {
        if (!isAdmin()) return { data: null, error: fail('new row violates row-level security policy', '42501') }
        if (this.table === 'email_recipients' && db.email_recipients.some((r) => r.email === value.email)) {
          return { data: null, error: fail('duplicate key value violates unique constraint "email_recipients_email_key"', '23505') }
        }
        if (this.table === 'email_schedules' && db.email_schedules.some((s) => String(s.send_time).slice(0, 5) === String(value.send_time).slice(0, 5))) {
          return { data: null, error: fail('duplicate key value violates unique constraint', '23505') }
        }
        const row =
          this.table === 'email_recipients'
            ? {
                id: newId('r'),
                active: true,
                receives_digest: true,
                receives_notifications: true,
                receives_assignments: false,
                designer_name: '',
                created_at: new Date().toISOString(),
                ...value,
              }
            : { id: newId('s'), active: true, ...value, send_time: `${String(value.send_time).slice(0, 5)}:00` }
        ;(db[this.table] as Row[]).push(row)
        inserted.push(row)
      } else {
        return { data: null, error: fail('permission denied', '42501') }
      }
    }
    return this.finish(inserted)
  }

  private runUpdate(): Result {
    const targets = this.rows().filter((r) => this.matches(r))
    const updated: Row[] = []
    for (const row of targets) {
      if (this.table === 'posts') {
        if (!isAdmin() && !isDesigner()) continue
        const next = { ...row, ...this.patch }
        const problem = checkPostWrite(row, next)
        if (problem) return { data: null, error: fail(problem) }
        const saved = applyPostDefaults(row, next)
        Object.assign(row, saved)
        updated.push(row)
      } else if (this.table === 'post_assets') {
        if (!canWriteAssetsFor(row.post_id)) continue
        Object.assign(row, this.patch)
        updated.push(row)
      } else if (this.table.startsWith('email_')) {
        if (!isAdmin()) continue
        const patch = { ...this.patch }
        if (this.table === 'email_schedules' && patch.send_time) patch.send_time = `${String(patch.send_time).slice(0, 5)}:00`
        if (this.table === 'email_settings') patch.updated_at = new Date().toISOString()
        Object.assign(row, patch)
        updated.push(row)
      }
    }
    return this.finish(updated)
  }

  private runDelete(): Result {
    const targets = this.rows().filter((r) => this.matches(r))
    const removable = targets.filter((row) => {
      if (this.table === 'posts') return isAdmin()
      if (this.table === 'post_assets') return canWriteAssetsFor(row.post_id)
      if (this.table === 'email_recipients' || this.table === 'email_schedules') return isAdmin()
      return false
    })
    ;(db[this.table] as Row[]) = this.rows().filter((r) => !removable.includes(r))
    if (this.table === 'posts') {
      const ids = new Set(removable.map((r) => r.id))
      db.post_assets = db.post_assets.filter((a) => !ids.has(a.post_id))
    }
    return this.finish(removable)
  }
}

// ---------------------------------------------------------------------------
// RPC, storage, functions and auth
// ---------------------------------------------------------------------------

async function rpc(name: string, args: Row): Promise<Result> {
  await delay()
  if (name !== 'request_post_changes') return { data: null, error: fail(`Unknown function ${name}`, 'PGRST202') }
  if (!isAdmin()) return { data: null, error: fail('Only administrators can request changes.', '42501') }
  const note = String(args.p_note ?? '').trim()
  if (!note) return { data: null, error: fail('A note describing the requested changes is required.') }
  const post = db.posts.find((p) => p.id === args.p_post_id)
  if (!post) return { data: 'not_found', error: null }
  if (args.p_expected_version !== null && args.p_expected_version !== undefined && post.version !== args.p_expected_version) {
    return { data: 'conflict', error: null }
  }
  if (post.status !== 'Ready for Review' && post.status !== 'Approved') return { data: 'invalid_status', error: null }
  Object.assign(post, {
    status: 'In Design',
    review_note: note,
    changes_requested_at: new Date().toISOString(),
    version: Number(post.version) + 1,
    updated_at: new Date().toISOString(),
  })
  persist()
  return { data: 'ok', error: null }
}

const storage = {
  from() {
    return {
      async upload(path: string, file: Blob) {
        await delay(400)
        objects.set(path, URL.createObjectURL(file))
        return { data: { path }, error: null }
      },
      async remove(paths: string[]) {
        await delay()
        paths.forEach((p) => objects.delete(p))
        return { data: paths.map((name) => ({ name })), error: null }
      },
      async createSignedUrls(paths: string[]) {
        await delay()
        return {
          data: paths.map((path) => {
            const asset = db.post_assets.find((a) => a.storage_path === path)
            const fallback = path.startsWith('seed/') && asset ? placeholderImage(String(asset.file_name).replace('.png', ''), Number(asset.position)) : null
            return { path, signedUrl: objects.get(path) ?? fallback, error: null }
          }),
          error: null,
        }
      },
    }
  },
}

const functions = {
  async invoke(name: string, options: { body: { recipientIds: string[] } }) {
    await delay(900)
    if (name !== 'email-send-test' || !isAdmin()) return { data: null, error: fail('Not allowed') }
    const results = options.body.recipientIds.map((id) => {
      const r = db.email_recipients.find((x) => x.id === id)
      const email = String(r?.email ?? 'unknown')
      db.email_delivery_logs.unshift({
        id: newId('l'),
        kind: 'test',
        recipient_email: email,
        subject: '[Test] TAE social media digest (mock — not sent)',
        status: 'sent',
        attempts: 1,
        retryable: false,
        next_attempt_at: null,
        resend_message_id: `mock-${crypto.randomUUID().slice(0, 8)}`,
        error: null,
        scheduled_for: null,
        created_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
      })
      return { email, outcome: 'sent' as const, messageId: 'mock' }
    })
    persist()
    return { data: { results }, error: null }
  },
}

const auth = {
  async getSession() {
    await delay(60)
    return { data: { session: session() }, error: null }
  },
  onAuthStateChange(callback: AuthListener) {
    listeners.add(callback)
    return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } }
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    await delay(500)
    const user = USERS.find((u) => u.email === email.trim().toLowerCase() && u.password === password)
    if (!user) return { data: { session: null, user: null }, error: { message: 'Invalid login credentials', status: 400 } }
    sessionUserId = user.id
    writeStore(SESSION_KEY, user.id)
    emitAuth('SIGNED_IN')
    return { data: { session: session(), user: session()?.user }, error: null }
  },
  async signOut() {
    await delay(100)
    sessionUserId = null
    writeStore(SESSION_KEY, null)
    emitAuth('SIGNED_OUT')
    return { error: null }
  },
}

const client = {
  from: (table: string) => new Query(table),
  rpc,
  storage,
  functions,
  auth,
}

export const supabase = client as unknown as SupabaseClient

export function getSupabase(): SupabaseClient {
  return supabase
}

/** Resets the demo data (also available as ?reset in the URL). */
export function resetMockDatabase() {
  db = buildSeed()
  persist()
}
