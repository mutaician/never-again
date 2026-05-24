import { useAuth0 } from '@auth0/auth0-react'
import { useMemo, useState } from 'react'
import './App.css'

type ViewKey = 'dashboard' | 'import' | 'review' | 'memory' | 'preflight'

type AppProps = {
  authEnabled: boolean
}

type Lesson = {
  title: string
  category: string
  confidence: number
  evidence: string
  rule: string
  status: 'Draft' | 'Saved'
}

const navItems: Array<{ id: ViewKey; label: string; shortcut: string }> = [
  { id: 'dashboard', label: 'Workspace', shortcut: '01' },
  { id: 'import', label: 'Import', shortcut: '02' },
  { id: 'review', label: 'Review', shortcut: '03' },
  { id: 'memory', label: 'Memory Ledger', shortcut: '04' },
  { id: 'preflight', label: 'Preflight', shortcut: '05' },
]

const lessons: Lesson[] = [
  {
    title: 'Start simulation ideas with one playable slice',
    category: 'Scope',
    confidence: 91,
    evidence:
      'The Artemis project expanded across physics, camera systems, assets, mission sequence, and realism before one interaction was proven.',
    rule:
      'For game-like projects, validate one scene, one control mode, and one success condition first.',
    status: 'Draft',
  },
  {
    title: 'Challenge hidden domain complexity before coding',
    category: 'Domain',
    confidence: 86,
    evidence:
      'The build depended on game development concepts that were discovered only after implementation began.',
    rule:
      'Before coding an unfamiliar domain, ask the agent for a complexity map and a reduced vertical slice.',
    status: 'Draft',
  },
  {
    title: 'Stop agents from rewriting working surfaces',
    category: 'Agent behavior',
    confidence: 82,
    evidence:
      'Several fixes introduced regressions because the agent changed nearby behavior while chasing a single bug.',
    rule:
      'Constrain repair prompts to the failing module, require a diff summary, and test before broad edits.',
    status: 'Saved',
  },
]

const pipeline = [
  { label: 'Normalize', value: 'done' },
  { label: 'Redact', value: 'done' },
  { label: 'Chunk', value: '18 chunks' },
  { label: 'Analyze', value: 'running' },
  { label: 'Reduce', value: 'queued' },
]

function App({ authEnabled }: AppProps) {
  if (!authEnabled) return <Workspace authEnabled={false} />
  return <AuthenticatedWorkspace />
}

function AuthenticatedWorkspace() {
  const { error, isAuthenticated, isLoading, loginWithRedirect } = useAuth0()

  if (isLoading) {
    return <AuthGate detail="Checking your Auth0 session." title="Loading workspace" />
  }

  if (error) {
    return (
      <AuthGate
        detail={error.message}
        onSignIn={() => loginWithRedirect()}
        title="Auth needs attention"
      />
    )
  }

  if (!isAuthenticated) {
    return (
      <AuthGate
        detail="Sign in to bind this workspace to your builder memory."
        onSignIn={() => loginWithRedirect()}
        title="Enter Never Again"
      />
    )
  }

  return <Workspace authEnabled />
}

function Workspace({ authEnabled }: AppProps) {
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')

  const savedLessons = useMemo(
    () => lessons.filter((lesson) => lesson.status === 'Saved').length,
    [],
  )

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          <div className="brand-mark">NA</div>
          <div>
            <p className="brand-name">Never Again</p>
            <p className="brand-subtitle">Builder memory console</p>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              className={activeView === item.id ? 'nav-item is-active' : 'nav-item'}
              key={item.id}
              onClick={() => setActiveView(item.id)}
              type="button"
            >
              <span>{item.label}</span>
              <span>{item.shortcut}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-status">
          <p className="eyebrow">Identity binding</p>
          {authEnabled ? (
            <AuthStatus />
          ) : (
            <>
              <code>missing_auth_env</code>
              <span className="status-pill is-muted">Auth disabled</span>
            </>
          )}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Current project</p>
            <h1>Artemis Recovery Postmortem</h1>
          </div>
          <div className="topbar-actions">
            <span className="status-pill is-good">3 lessons found</span>
            {authEnabled && <AuthControls />}
            <button className="primary-action" onClick={() => setActiveView('import')} type="button">
              New import
            </button>
          </div>
        </header>

        <section className="view-surface">{renderView(activeView)}</section>
      </main>

      <aside className="inspector" aria-label="Builder memory inspector">
        <div className="inspector-section">
          <p className="eyebrow">Builder profile</p>
          <h2>Risk pattern: ambitious unfamiliar systems</h2>
          <p>
            The current mock profile flags broad interactive builds as high-risk
            until a vertical slice is defined.
          </p>
        </div>

        <div className="metric-stack">
          <div>
            <span>Draft lessons</span>
            <strong>{lessons.length - savedLessons}</strong>
          </div>
          <div>
            <span>Saved memories</span>
            <strong>{savedLessons}</strong>
          </div>
          <div>
            <span>Redactions</span>
            <strong>7</strong>
          </div>
        </div>

        <div className="inspector-section">
          <p className="eyebrow">Next warning</p>
          <p className="warning-copy">
            New simulation or game-like ideas should begin with one contained
            scene and a clear stop condition.
          </p>
        </div>
      </aside>
    </div>
  )
}

function AuthGate({
  detail,
  onSignIn,
  title,
}: {
  detail: string
  onSignIn?: () => Promise<void>
  title: string
}) {
  return (
    <main className="auth-gate">
      <section className="panel auth-panel">
        <div className="brand">
          <div className="brand-mark">NA</div>
          <div>
            <p className="brand-name">Never Again</p>
            <p className="brand-subtitle">Builder memory console</p>
          </div>
        </div>
        <div>
          <p className="eyebrow">Authentication</p>
          <h1>{title}</h1>
          <p>{detail}</p>
        </div>
        {onSignIn && (
          <button
            className="primary-action"
            onClick={() => {
              void onSignIn()
            }}
            type="button"
          >
            Sign in
          </button>
        )}
      </section>
    </main>
  )
}

function AuthStatus() {
  const { user } = useAuth0()

  return (
    <>
      <code>{user?.email || user?.name || user?.sub || 'authenticated_user'}</code>
      <span className="status-pill is-good">Auth0 signed in</span>
    </>
  )
}

function AuthControls() {
  const { logout, user } = useAuth0()

  return (
    <div className="user-control">
      <span>{user?.name || user?.email || 'Signed in'}</span>
      <button
        onClick={() =>
          logout({ logoutParams: { returnTo: window.location.origin } })
        }
        type="button"
      >
        Sign out
      </button>
    </div>
  )
}

function renderView(activeView: ViewKey) {
  if (activeView === 'import') return <ImportView />
  if (activeView === 'review') return <ReviewView />
  if (activeView === 'memory') return <MemoryView />
  if (activeView === 'preflight') return <PreflightView />
  return <DashboardView />
}

function DashboardView() {
  return (
    <div className="screen-grid">
      <section className="panel hero-panel">
        <div>
          <p className="eyebrow">Analysis pipeline</p>
          <h2>Failed project conversations become reusable operating rules.</h2>
        </div>
        <div className="pipeline">
          {pipeline.map((step) => (
            <div className="pipeline-step" key={step.label}>
              <span>{step.label}</span>
              <strong>{step.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Latest extraction</p>
            <h2>Lessons waiting for review</h2>
          </div>
          <span className="status-pill is-warn">Manual approval</span>
        </div>
        <LessonList mode="compact" />
      </section>

      <section className="panel split-panel">
        <div>
          <p className="eyebrow">Memory strategy</p>
          <h2>One user, one durable assistant</h2>
          <p>
            Raw transcript analysis stays temporary. Approved lessons are saved
            into the user's Backboard assistant memory.
          </p>
        </div>
        <div className="callout">
          <span>Backboard mode</span>
          <strong>analysis: memory off</strong>
          <strong>preflight: memory search</strong>
        </div>
      </section>
    </div>
  )
}

function ImportView() {
  return (
    <div className="screen-grid">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Conversation import</p>
            <h2>Paste the messy build log</h2>
          </div>
          <span className="status-pill is-muted">Mock form</span>
        </div>

        <div className="form-grid">
          <label>
            <span>Project name</span>
            <input defaultValue="Artemis Recovery Postmortem" />
          </label>
          <label>
            <span>Source</span>
            <select defaultValue="claude-code">
              <option value="cursor">Cursor</option>
              <option value="claude-code">Claude Code</option>
              <option value="chatgpt">ChatGPT</option>
              <option value="windsurf">Windsurf</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <label className="transcript-box">
          <span>Transcript</span>
          <textarea
            defaultValue={
              'User: I think the Artemis II simulator is getting too complex.\nAssistant: We can simplify the scene.\nUser: Next time we should have started with one launch sequence before the whole mission.'
            }
          />
        </label>

        <div className="form-footer">
          <span>Code blocks compressed</span>
          <span>Secrets redacted before analysis</span>
          <button className="primary-action" type="button">
            Queue analysis
          </button>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">Expected signals</p>
        <div className="signal-list">
          <span>Corrections</span>
          <span>Scope drift</span>
          <span>Agent loops</span>
          <span>Regressions</span>
          <span>Next-time rules</span>
          <span>Architecture regrets</span>
        </div>
      </section>
    </div>
  )
}

function ReviewView() {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Review queue</p>
          <h2>Approve only the lessons worth remembering</h2>
        </div>
        <span className="status-pill is-warn">2 drafts</span>
      </div>
      <LessonList mode="review" />
    </section>
  )
}

function MemoryView() {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Memory ledger</p>
          <h2>Saved builder rules</h2>
        </div>
        <span className="status-pill is-good">Backboard ready</span>
      </div>
      <div className="ledger-table">
        <div className="ledger-row ledger-head">
          <span>Rule</span>
          <span>Category</span>
          <span>Source</span>
          <span>Status</span>
        </div>
        <div className="ledger-row">
          <span>Stop agents from rewriting working surfaces</span>
          <span>Agent behavior</span>
          <span>Artemis Recovery</span>
          <span>Saved</span>
        </div>
      </div>
    </section>
  )
}

function PreflightView() {
  return (
    <div className="screen-grid">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">New project preflight</p>
            <h2>Check a fresh idea against builder memory</h2>
          </div>
          <span className="status-pill is-danger">High scope risk</span>
        </div>
        <label className="transcript-box">
          <span>Project idea</span>
          <textarea defaultValue="A realistic browser-based mission simulator where users experience launch, orbit, lunar flyby, and re-entry." />
        </label>
      </section>

      <section className="panel">
        <p className="eyebrow">Generated brief</p>
        <div className="brief-block">
          <h2>Recommended MVP</h2>
          <p>
            Build one launch sequence with a cockpit view, one interactive
            control, and one completion state before adding orbit or re-entry.
          </p>
        </div>
        <div className="brief-block">
          <h2>Agent rules</h2>
          <p>
            Keep changes scoped. Preserve working UI. Ask for confirmation
            before adding physics, assets, or mission phases.
          </p>
        </div>
      </section>
    </div>
  )
}

function LessonList({ mode }: { mode: 'compact' | 'review' }) {
  return (
    <div className="lesson-list">
      {lessons.map((lesson) => (
        <article className="lesson-item" key={lesson.title}>
          <div className="lesson-topline">
            <span className="category">{lesson.category}</span>
            <span>{lesson.confidence}% confidence</span>
          </div>
          <h3>{lesson.title}</h3>
          <p>{lesson.evidence}</p>
          {mode === 'review' && (
            <div className="rule-block">
              <span>Future rule</span>
              <strong>{lesson.rule}</strong>
            </div>
          )}
          <div className="lesson-actions">
            <span className={lesson.status === 'Saved' ? 'status-pill is-good' : 'status-pill is-muted'}>
              {lesson.status}
            </span>
            {mode === 'review' && (
              <div>
                <button type="button">Reject</button>
                <button className="primary-action" type="button">
                  Approve
                </button>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

export default App
