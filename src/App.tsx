import { useAuth0 } from '@auth0/auth0-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  approveLesson as approveLessonRequest,
  createManualLesson as createManualLessonRequest,
  createPreflight as createPreflightRequest,
  createTranscriptImport,
  fetchImportJob,
  fetchLessons as fetchLessonsRequest,
  fetchMe,
  hasApiAudience,
  rejectLesson as rejectLessonRequest,
  updateLesson as updateLessonRequest,
  type ApiSession,
  type CreateManualLessonInput,
  type CreatePreflightResult,
  type CreateImportInput,
  type CreateImportResult,
  type ImportJob as ApiImportJob,
  type Lesson as ApiLesson,
  type PreflightMemory,
  type PreflightResult,
  type UpdateLessonInput,
} from './lib/api'

type ViewKey = 'dashboard' | 'import' | 'review' | 'memory' | 'preflight'

type AppProps = {
  authEnabled: boolean
}

type WorkspaceProps = AppProps & {
  apiActions: ApiActions | null
  apiSession: ApiSession
}

type ApiActions = {
  approveLesson: (lessonId: string) => Promise<Lesson>
  createManualLesson: (input: CreateManualLessonInput) => Promise<Lesson>
  createPreflight: (projectIdea: string) => Promise<CreatePreflightResult>
  createImport: (input: CreateImportInput) => Promise<CreateImportResult>
  fetchJob: (jobId: string) => Promise<ApiImportJob>
  fetchLessons: (status?: string) => Promise<Lesson[]>
  rejectLesson: (lessonId: string) => Promise<Lesson>
  updateLesson: (lessonId: string, input: UpdateLessonInput) => Promise<Lesson>
}

type Lesson = {
  backboardMemoryId: string | null
  createdAt: string
  id: string
  importId: string | null
  title: string
  category: string
  confidence: number
  evidence: string
  problemPattern: string
  projectName: string
  rule: string
  status: string
}

type LessonState = {
  lessons: Lesson[]
  message: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
}

type ProcessingState = {
  importId: string | null
  job: ApiImportJob | null
  message: string | null
  projectName: string | null
  status: 'idle' | 'polling' | 'ready' | 'error'
}

const navItems: Array<{ id: ViewKey; label: string; shortcut: string }> = [
  { id: 'dashboard', label: 'Workspace', shortcut: '01' },
  { id: 'import', label: 'Import', shortcut: '02' },
  { id: 'review', label: 'Review', shortcut: '03' },
  { id: 'memory', label: 'Memory Ledger', shortcut: '04' },
  { id: 'preflight', label: 'Preflight', shortcut: '05' },
]

const pipeline = [
  { label: 'Import', value: 'R2' },
  { label: 'Normalize', value: 'Worker' },
  { label: 'Chunk', value: 'D1' },
  { label: 'Reduce', value: 'Review' },
  { label: 'Memory', value: 'Backboard' },
]

const apiAudienceMissingSession: ApiSession = {
  message: 'Create an Auth0 API and set VITE_AUTH0_AUDIENCE to enable /api/me.',
  status: 'skipped',
  user: null,
}

function App({ authEnabled }: AppProps) {
  if (!authEnabled) {
    return (
      <Workspace
        apiActions={null}
        apiSession={{
          message: 'Add VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID to enable login.',
          status: 'skipped',
          user: null,
        }}
        authEnabled={false}
      />
    )
  }

  return <AuthenticatedWorkspace />
}

function AuthenticatedWorkspace() {
  const { error, getAccessTokenSilently, isAuthenticated, isLoading, loginWithRedirect } =
    useAuth0()
  const [apiSession, setApiSession] = useState<ApiSession>({
    message: 'Waiting for Auth0 session.',
    status: 'loading',
    user: null,
  })
  const apiActions = useMemo<ApiActions | null>(() => {
    if (!hasApiAudience) return null

    return {
      approveLesson: async (lessonId) => {
        const token = await getAccessTokenSilently()
        const row = await approveLessonRequest(token, lessonId)
        return toLesson(row)
      },
      createManualLesson: async (input) => {
        const token = await getAccessTokenSilently()
        const row = await createManualLessonRequest(token, input)
        return toLesson(row)
      },
      createPreflight: async (projectIdea) => {
        const token = await getAccessTokenSilently()
        return createPreflightRequest(token, projectIdea)
      },
      createImport: async (input) => {
        const token = await getAccessTokenSilently()
        return createTranscriptImport(token, input)
      },
      fetchJob: async (jobId) => {
        const token = await getAccessTokenSilently()
        return fetchImportJob(token, jobId)
      },
      fetchLessons: async (status) => {
        const token = await getAccessTokenSilently()
        const rows = await fetchLessonsRequest(token, status)
        return rows.map(toLesson)
      },
      rejectLesson: async (lessonId) => {
        const token = await getAccessTokenSilently()
        const row = await rejectLessonRequest(token, lessonId)
        return toLesson(row)
      },
      updateLesson: async (lessonId, input) => {
        const token = await getAccessTokenSilently()
        const row = await updateLessonRequest(token, lessonId, input)
        return toLesson(row)
      },
    }
  }, [getAccessTokenSilently])

  useEffect(() => {
    if (!isAuthenticated || !hasApiAudience) return

    let isActive = true

    async function loadApiSession() {
      setApiSession({
        message: 'Binding Auth0 identity to Never Again.',
        status: 'loading',
        user: null,
      })

      const token = await getAccessTokenSilently()
      const session = await fetchMe(token)

      if (isActive) setApiSession(session)
    }

    void loadApiSession().catch((sessionError: unknown) => {
      if (!isActive) return

      setApiSession({
        message:
          sessionError instanceof Error
            ? sessionError.message
            : 'Unable to load API session.',
        status: 'error',
        user: null,
      })
    })

    return () => {
      isActive = false
    }
  }, [getAccessTokenSilently, isAuthenticated])

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

  return (
    <Workspace
      apiActions={apiActions}
      apiSession={hasApiAudience ? apiSession : apiAudienceMissingSession}
      authEnabled
    />
  )
}

function Workspace({ apiActions, apiSession, authEnabled }: WorkspaceProps) {
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [lessonState, setLessonState] = useState<LessonState>({
    lessons: [],
    message: apiActions ? null : 'Connect the API to load lesson drafts.',
    status: 'idle',
  })
  const [memoryState, setMemoryState] = useState<LessonState>({
    lessons: [],
    message: apiActions ? null : 'Connect the API to load saved memories.',
    status: 'idle',
  })
  const [processingState, setProcessingState] = useState<ProcessingState>({
    importId: null,
    job: null,
    message: null,
    projectName: null,
    status: 'idle',
  })

  const displayLessons = lessonState.lessons
  const displayMemories = memoryState.lessons
  const activeJobId = processingState.job?.id ?? null
  const savedLessons = displayMemories.length
  const draftLessons = displayLessons.length
  const latestMemory = displayMemories[0] || null
  const refreshLessons = useCallback(async () => {
    if (!apiActions) return

    setLessonState((current) => ({
      ...current,
      message: 'Loading lesson drafts.',
      status: 'loading',
    }))

    try {
      const freshLessons = await apiActions.fetchLessons('draft')

      setLessonState({
        lessons: freshLessons,
        message: null,
        status: 'ready',
      })
    } catch (lessonError) {
      setLessonState((current) => ({
        ...current,
        message:
          lessonError instanceof Error
            ? lessonError.message
            : 'Unable to load lesson drafts.',
        status: 'error',
      }))
    }
  }, [apiActions])

  const refreshMemories = useCallback(async () => {
    if (!apiActions) return

    setMemoryState((current) => ({
      ...current,
      message: 'Loading saved memories.',
      status: 'loading',
    }))

    try {
      const freshMemories = await apiActions.fetchLessons('saved')

      setMemoryState({
        lessons: freshMemories,
        message: null,
        status: 'ready',
      })
    } catch (memoryError) {
      setMemoryState((current) => ({
        ...current,
        message:
          memoryError instanceof Error
            ? memoryError.message
            : 'Unable to load saved memories.',
        status: 'error',
      }))
    }
  }, [apiActions])

  useEffect(() => {
    if (apiSession.status !== 'ready') return
    void refreshLessons()
    void refreshMemories()
  }, [apiSession.status, refreshLessons, refreshMemories])

  const handleImportQueued = useCallback((result: CreateImportResult) => {
    setActiveView('review')
    setLessonState({
      lessons: [],
      message: 'Analysis has started. Draft lessons will appear here when reduction finishes.',
      status: 'loading',
    })
    setProcessingState({
      importId: result.import.id,
      job: result.job,
      message: 'Import queued. Watching the background analysis job.',
      projectName: result.project.name,
      status: 'polling',
    })
  }, [])

  useEffect(() => {
    if (!apiActions || !activeJobId || processingState.status !== 'polling') {
      return
    }

    let isActive = true
    const jobId = activeJobId

    async function pollJob() {
      if (!apiActions) return

      try {
        const job = await apiActions.fetchJob(jobId)

        if (!isActive) return

        const nextStatus = jobUiStatus(job)

        setProcessingState((current) => {
          if (current.job?.id !== job.id) return current

          return {
            ...current,
            job,
            message: jobStatusMessage(job),
            status: nextStatus,
          }
        })

        if (nextStatus === 'ready') {
          await refreshLessons()
        }
      } catch (jobError) {
        if (!isActive) return

        setProcessingState((current) => ({
          ...current,
          message:
            jobError instanceof Error
              ? jobError.message
              : 'Unable to check analysis progress.',
          status: 'error',
        }))
      }
    }

    void pollJob()
    const timer = window.setInterval(() => {
      void pollJob()
    }, 2500)

    return () => {
      isActive = false
      window.clearInterval(timer)
    }
  }, [activeJobId, apiActions, processingState.status, refreshLessons])

  const handleUpdateLesson = useCallback(
    async (lessonId: string, input: UpdateLessonInput) => {
      if (!apiActions) return

      setLessonState((current) => ({
        ...current,
        message: 'Saving lesson edits.',
        status: 'loading',
      }))

      try {
        await apiActions.updateLesson(lessonId, input)
        await refreshLessons()
      } catch (lessonError) {
        setLessonState((current) => ({
          ...current,
          message:
            lessonError instanceof Error
              ? lessonError.message
              : 'Unable to save lesson edits.',
          status: 'error',
        }))
      }
    },
    [apiActions, refreshLessons],
  )

  const handleCreateManualLesson = useCallback(
    async (input: CreateManualLessonInput) => {
      if (!apiActions) return

      setLessonState((current) => ({
        ...current,
        message: 'Adding manual lesson draft.',
        status: 'loading',
      }))

      try {
        await apiActions.createManualLesson(input)
        await refreshLessons()
        setLessonState((current) => ({
          ...current,
          message: 'Manual lesson added. Review it before saving to memory.',
          status: 'ready',
        }))
      } catch (lessonError) {
        setLessonState((current) => ({
          ...current,
          message:
            lessonError instanceof Error
              ? lessonError.message
              : 'Unable to add manual lesson.',
          status: 'error',
        }))
      }
    },
    [apiActions, refreshLessons],
  )

  const handleRejectLesson = useCallback(
    async (lessonId: string) => {
      if (!apiActions) return

      setLessonState((current) => ({
        ...current,
        message: 'Rejecting lesson draft.',
        status: 'loading',
      }))

      try {
        await apiActions.rejectLesson(lessonId)
        await refreshLessons()
      } catch (lessonError) {
        setLessonState((current) => ({
          ...current,
          message:
            lessonError instanceof Error
              ? lessonError.message
              : 'Unable to reject lesson.',
          status: 'error',
        }))
      }
    },
    [apiActions, refreshLessons],
  )

  const handleApproveLesson = useCallback(
    async (lessonId: string) => {
      if (!apiActions) return

      setLessonState((current) => ({
        ...current,
        message: 'Saving approved lesson into Backboard memory.',
        status: 'loading',
      }))

      try {
        await apiActions.approveLesson(lessonId)
        await refreshLessons()
        await refreshMemories()
        setLessonState((current) => ({
          ...current,
          message: 'Saved to Backboard memory. Continue reviewing the remaining drafts.',
          status: 'ready',
        }))
      } catch (lessonError) {
        setLessonState((current) => ({
          ...current,
          message:
            lessonError instanceof Error
              ? lessonError.message
              : 'Unable to save lesson into memory.',
          status: 'error',
        }))
      }
    },
    [apiActions, refreshLessons, refreshMemories],
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
            <AuthStatus apiSession={apiSession} />
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
            <h1>{processingState.projectName || 'Builder memory workspace'}</h1>
          </div>
          <div className="topbar-actions">
            <span className={processingSummaryClass(processingState)}>
              {processingSummaryLabel(processingState, displayLessons.length)}
            </span>
            {authEnabled && <AuthControls apiSession={apiSession} />}
            <button className="primary-action" onClick={() => setActiveView('import')} type="button">
              New import
            </button>
          </div>
        </header>

        <section className="view-surface">
          {renderView(
            activeView,
            apiActions,
            lessonState,
            memoryState,
            processingState,
            handleImportQueued,
            refreshLessons,
            refreshMemories,
            handleCreateManualLesson,
            handleUpdateLesson,
            handleRejectLesson,
            handleApproveLesson,
            displayLessons,
            displayMemories,
          )}
        </section>
      </main>

      <aside className="inspector" aria-label="Builder memory inspector">
        <div className="inspector-section">
          <p className="eyebrow">Builder profile</p>
          <h2>{latestMemory ? latestMemory.title : 'No saved pattern yet'}</h2>
          <p>{latestMemory ? latestMemory.problemPattern : 'Approve a lesson to build the durable profile.'}</p>
        </div>

        <div className="metric-stack">
          <div>
            <span>Draft lessons</span>
            <strong>{draftLessons}</strong>
          </div>
          <div>
            <span>Saved memories</span>
            <strong>{savedLessons}</strong>
          </div>
          <div>
            <span>Manual memories</span>
            <strong>{displayMemories.filter(isManualLesson).length}</strong>
          </div>
        </div>

        <div className="inspector-section">
          <p className="eyebrow">Latest rule</p>
          <p className="warning-copy">
            {latestMemory
              ? latestMemory.rule
              : 'Saved memories will appear here as reusable guidance.'}
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

function AuthStatus({ apiSession }: { apiSession: ApiSession }) {
  const { user } = useAuth0()
  const label =
    apiSession.user?.backboardAssistantId ||
    apiSession.user?.email ||
    user?.email ||
    user?.name ||
    user?.sub ||
    'authenticated_user'

  return (
    <>
      <code>{label}</code>
      <span className={apiStatusClass(apiSession.status)}>
        {apiStatusLabel(apiSession.status)}
      </span>
      {apiSession.message && <p className="microcopy">{apiSession.message}</p>}
    </>
  )
}

function AuthControls({ apiSession }: { apiSession: ApiSession }) {
  const { logout, user } = useAuth0()

  return (
    <div className="user-control">
      <span>{user?.name || user?.email || 'Signed in'}</span>
      <span className={apiStatusClass(apiSession.status)}>
        {apiStatusLabel(apiSession.status)}
      </span>
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

function apiStatusClass(status: ApiSession['status']): string {
  if (status === 'ready') return 'status-pill is-good'
  if (status === 'pending' || status === 'loading') return 'status-pill is-warn'
  if (status === 'error') return 'status-pill is-danger'
  return 'status-pill is-muted'
}

function apiStatusLabel(status: ApiSession['status']): string {
  if (status === 'ready') return 'Memory bound'
  if (status === 'pending') return 'API pending'
  if (status === 'loading') return 'API loading'
  if (status === 'error') return 'API error'
  return 'API skipped'
}

function renderView(
  activeView: ViewKey,
  apiActions: ApiActions | null,
  lessonState: LessonState,
  memoryState: LessonState,
  processingState: ProcessingState,
  onImportQueued: (result: CreateImportResult) => void,
  onRefreshLessons: () => Promise<void>,
  onRefreshMemories: () => Promise<void>,
  onCreateManualLesson: (input: CreateManualLessonInput) => Promise<void>,
  onUpdateLesson: (lessonId: string, input: UpdateLessonInput) => Promise<void>,
  onRejectLesson: (lessonId: string) => Promise<void>,
  onApproveLesson: (lessonId: string) => Promise<void>,
  lessons: Lesson[],
  memories: Lesson[],
) {
  if (activeView === 'import') {
    return <ImportView apiActions={apiActions} onImportQueued={onImportQueued} />
  }
  if (activeView === 'review') {
    return (
      <ReviewView
        lessonState={lessonState}
        onApprove={onApproveLesson}
        onCreateManualLesson={onCreateManualLesson}
        onRefresh={onRefreshLessons}
        onReject={onRejectLesson}
        onUpdate={onUpdateLesson}
        processingState={processingState}
      />
    )
  }
  if (activeView === 'memory') {
    return (
      <MemoryView
        memoryState={memoryState}
        memories={memories}
        onRefresh={onRefreshMemories}
      />
    )
  }
  if (activeView === 'preflight') {
    return <PreflightView apiActions={apiActions} memories={memories} />
  }
  return <DashboardView lessons={lessons} memories={memories} />
}

function DashboardView({
  lessons,
  memories,
}: {
  lessons: Lesson[]
  memories: Lesson[]
}) {
  const latestMemory = memories[0] || null

  return (
    <div className="screen-grid">
      <section className="panel workspace-panel">
        <div>
          <p className="eyebrow">Workspace state</p>
          <h2>{workspaceHeadline(lessons.length, memories.length)}</h2>
          <p>
            Import a stalled build conversation, review the lessons, and approve
            only the rules worth carrying into future projects.
          </p>
        </div>
        <div className="workspace-stats">
          <div>
            <span>Drafts waiting</span>
            <strong>{lessons.length}</strong>
          </div>
          <div>
            <span>Saved memories</span>
            <strong>{memories.length}</strong>
          </div>
          <div>
            <span>Manual captures</span>
            <strong>{memories.filter(isManualLesson).length}</strong>
          </div>
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

      <section className="dashboard-grid">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Review queue</p>
              <h2>Lessons waiting for approval</h2>
            </div>
            <span className="status-pill is-warn">Human gate</span>
          </div>
          <LessonList
            emptyMessage="No draft lessons waiting for review."
            lessons={lessons.slice(0, 3)}
            mode="compact"
          />
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Latest memory</p>
              <h2>{latestMemory ? latestMemory.title : 'No memory saved yet'}</h2>
            </div>
            <span className={latestMemory ? 'status-pill is-good' : 'status-pill is-muted'}>
              {latestMemory ? 'Backboard' : 'Empty'}
            </span>
          </div>
          {latestMemory ? (
            <div className="compact-memory">
              <p>{latestMemory.rule}</p>
              <code>{latestMemory.backboardMemoryId || 'memory_pending'}</code>
            </div>
          ) : (
            <div className="empty-state">
              <strong>Approve a lesson to start the ledger.</strong>
            </div>
          )}
        </div>
      </section>

      <section className="panel next-actions">
        <div>
          <p className="eyebrow">Next actions</p>
          <h2>Build the memory trail before preflight</h2>
        </div>
        <div className="action-strip">
          <span>Import a transcript</span>
          <span>Approve strong lessons</span>
          <span>Add missed manual lessons</span>
          <span>Run preflight with saved memory</span>
        </div>
      </section>
    </div>
  )
}

function ImportView({
  apiActions,
  onImportQueued,
}: {
  apiActions: ApiActions | null
  onImportQueued: (result: CreateImportResult) => void
}) {
  const [projectName, setProjectName] = useState('')
  const [sourcePlatform, setSourcePlatform] = useState('cursor')
  const [transcript, setTranscript] = useState('')
  const [importStatus, setImportStatus] = useState<{
    message: string
    tone: 'idle' | 'success' | 'error'
  }>({
    message: 'Paste a conversation export from Cursor, Claude Code, ChatGPT, Windsurf, or similar tools.',
    tone: 'idle',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!apiActions) {
      setImportStatus({
        message: 'API is not connected. Check VITE_AUTH0_AUDIENCE and VITE_API_BASE_URL.',
        tone: 'error',
      })
      return
    }

    if (!projectName.trim() || !transcript.trim()) {
      setImportStatus({
        message: 'Add a project name and paste the transcript before queueing analysis.',
        tone: 'error',
      })
      return
    }

    setIsSubmitting(true)
    setImportStatus({
      message: 'Writing transcript to R2 and creating queued job.',
      tone: 'idle',
    })

    try {
      const result = await apiActions.createImport({
        projectName,
        sourcePlatform,
        transcript,
      })

      setImportStatus({
        message: `Queued ${result.job.id.slice(0, 8)} for ${result.project.name}. Normalized transcript stored with ${result.import.redacted_secret_count} redactions.`,
        tone: 'success',
      })
      onImportQueued(result)
    } catch (submitError) {
      setImportStatus({
        message:
          submitError instanceof Error
            ? submitError.message
            : 'Unable to queue import.',
        tone: 'error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="screen-grid">
      <form className="panel" onSubmit={submitImport}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Conversation import</p>
            <h2>Import a build conversation</h2>
            <p className="microcopy">
              Use exported chat text when possible. Code blocks can stay in;
              normalization compresses code and keeps workflow-relevant commands.
            </p>
          </div>
          <span className={importStatusClass(importStatus.tone)}>
            {importStatusLabel(importStatus.tone)}
          </span>
        </div>

        <div className="form-grid">
          <label>
            <span>Project name</span>
            <input
              placeholder="Project or postmortem name"
              onChange={(event) => setProjectName(event.target.value)}
              required
              value={projectName}
            />
          </label>
          <label>
            <span>Source</span>
            <select
              onChange={(event) => setSourcePlatform(event.target.value)}
              value={sourcePlatform}
            >
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
            placeholder="Paste the conversation turns here. Look for moments with corrections, regressions, scope changes, missed assumptions, or next-time rules."
            onChange={(event) => setTranscript(event.target.value)}
            required
            value={transcript}
          />
        </label>

        <div className="form-footer">
          <span>Code blocks compressed</span>
          <span>Secrets redacted before analysis</span>
          <button className="primary-action" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Queueing' : 'Queue analysis'}
          </button>
        </div>
        <p className="form-message">{importStatus.message}</p>
      </form>

      <section className="panel">
        <p className="eyebrow">What to include</p>
        <div className="signal-list">
          <span>User corrections</span>
          <span>Repeated failures</span>
          <span>Scope changes</span>
          <span>Testing gaps</span>
          <span>Agent missteps</span>
          <span>Next-time rules</span>
        </div>
      </section>
    </div>
  )
}

function importStatusClass(tone: 'idle' | 'success' | 'error'): string {
  if (tone === 'success') return 'status-pill is-good'
  if (tone === 'error') return 'status-pill is-danger'
  return 'status-pill is-muted'
}

function importStatusLabel(tone: 'idle' | 'success' | 'error'): string {
  if (tone === 'success') return 'Import queued'
  if (tone === 'error') return 'Needs attention'
  return 'Ready'
}

function ReviewView({
  lessonState,
  onApprove,
  onCreateManualLesson,
  onRefresh,
  onReject,
  onUpdate,
  processingState,
}: {
  lessonState: LessonState
  onApprove: (lessonId: string) => Promise<void>
  onCreateManualLesson: (input: CreateManualLessonInput) => Promise<void>
  onRefresh: () => Promise<void>
  onReject: (lessonId: string) => Promise<void>
  onUpdate: (lessonId: string, input: UpdateLessonInput) => Promise<void>
  processingState: ProcessingState
}) {
  return (
    <div className="screen-grid">
      <ProcessingPanel processingState={processingState} />
      <ManualLessonPanel onCreate={onCreateManualLesson} />
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Review queue</p>
            <h2>Lesson drafts from reduction</h2>
            {lessonState.message && <p className="microcopy">{lessonState.message}</p>}
          </div>
          <div className="section-actions">
            <span className={lessonStatusClass(lessonState.status)}>
              {lessonState.status === 'loading'
                ? 'Loading'
                : `${lessonState.lessons.length} drafts`}
            </span>
            <button
              disabled={lessonState.status === 'loading'}
              onClick={() => {
                void onRefresh()
              }}
              type="button"
            >
              Refresh
            </button>
          </div>
        </div>
        <LessonList
          emptyMessage={
            processingState.status === 'polling'
              ? 'Analysis is still running. Draft lessons will appear here soon.'
              : 'No draft lessons yet.'
          }
          lessons={lessonState.lessons}
          mode="review"
          onApprove={onApprove}
          onReject={onReject}
          onUpdate={onUpdate}
        />
      </section>
    </div>
  )
}

function ManualLessonPanel({
  onCreate,
}: {
  onCreate: (input: CreateManualLessonInput) => Promise<void>
}) {
  const [draft, setDraft] = useState({
    category: 'agent_behavior',
    evidence: '',
    futureRule: '',
    problemPattern: '',
    projectName: '',
    title: '',
  })
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  async function submitManualLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)

    try {
      await onCreate(draft)
      setDraft({
        category: 'agent_behavior',
        evidence: '',
        futureRule: '',
        problemPattern: '',
        projectName: '',
        title: '',
      })
      setIsOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="panel manual-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Manual capture</p>
          <h2>Add the lesson the model missed</h2>
        </div>
        <button
          className={isOpen ? 'secondary-action' : 'primary-action'}
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          {isOpen ? 'Close' : 'Add manual lesson'}
        </button>
      </div>
      {isOpen && (
        <form className="manual-form" onSubmit={submitManualLesson}>
          <div className="form-grid">
            <label>
              <span>Title</span>
              <input
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
                required
                value={draft.title}
              />
            </label>
            <label>
              <span>Category</span>
              <select
                onChange={(event) =>
                  setDraft((current) => ({ ...current, category: event.target.value }))
                }
                value={draft.category}
              >
                <option value="scope">Scope</option>
                <option value="architecture">Architecture</option>
                <option value="agent_behavior">Agent behavior</option>
                <option value="prompting">Prompting</option>
                <option value="domain_knowledge">Domain knowledge</option>
                <option value="testing">Testing</option>
                <option value="ux">UX</option>
                <option value="tooling">Tooling</option>
                <option value="deployment">Deployment</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
          </div>
          <label>
            <span>Pattern</span>
            <textarea
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  problemPattern: event.target.value,
                }))
              }
              required
              value={draft.problemPattern}
            />
          </label>
          <label>
            <span>Future rule</span>
            <textarea
              onChange={(event) =>
                setDraft((current) => ({ ...current, futureRule: event.target.value }))
              }
              required
              value={draft.futureRule}
            />
          </label>
          <label>
            <span>Evidence</span>
            <textarea
              onChange={(event) =>
                setDraft((current) => ({ ...current, evidence: event.target.value }))
              }
              value={draft.evidence}
            />
          </label>
          <label>
            <span>Project</span>
            <input
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  projectName: event.target.value,
                }))
              }
              value={draft.projectName}
            />
          </label>
          <div className="form-footer">
            <span>Saved as draft</span>
            <button className="primary-action" disabled={isSaving} type="submit">
              {isSaving ? 'Adding' : 'Add draft'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function ProcessingPanel({
  processingState,
}: {
  processingState: ProcessingState
}) {
  if (!processingState.job) return null

  const progress = clampProgress(processingState.job.progress)

  return (
    <section className="panel processing-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Active analysis</p>
          <h2>{processingState.projectName || 'Transcript import'}</h2>
          {processingState.message && (
            <p className="microcopy">{processingState.message}</p>
          )}
        </div>
        <span className={processingStatusClass(processingState.status)}>
          {formatStatus(processingState.job.status)}
        </span>
      </div>
      <div
        aria-label="Analysis progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress}
        className="progress-track"
        role="progressbar"
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="job-meta">
        <code>{processingState.job.id}</code>
        <span>{progress}% complete</span>
      </div>
      {processingState.job.error_message && (
        <p className="form-message is-error">{processingState.job.error_message}</p>
      )}
    </section>
  )
}

function MemoryView({
  memories,
  memoryState,
  onRefresh,
}: {
  memories: Lesson[]
  memoryState: LessonState
  onRefresh: () => Promise<void>
}) {
  const manualCount = memories.filter(isManualLesson).length
  const transcriptCount = memories.length - manualCount

  return (
    <div className="screen-grid">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Memory ledger</p>
            <h2>Saved builder rules</h2>
            {memoryState.message && <p className="microcopy">{memoryState.message}</p>}
          </div>
          <div className="section-actions">
            <span className={lessonStatusClass(memoryState.status)}>
              {memories.length} saved
            </span>
            <button
              disabled={memoryState.status === 'loading'}
              onClick={() => {
                void onRefresh()
              }}
              type="button"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="memory-summary">
          <div>
            <span>Total memories</span>
            <strong>{memories.length}</strong>
          </div>
          <div>
            <span>Transcript-derived</span>
            <strong>{transcriptCount}</strong>
          </div>
          <div>
            <span>Manual captures</span>
            <strong>{manualCount}</strong>
          </div>
        </div>

        {memories.length === 0 ? (
          <div className="empty-state">
            <strong>No saved memories yet.</strong>
          </div>
        ) : (
          <div className="memory-list">
            {memories.map((memory) => (
              <article className="memory-card" key={memory.id}>
                <div className="memory-card-header">
                  <div>
                    <p className="eyebrow">{memorySourceLabel(memory)}</p>
                    <h3>{memory.title}</h3>
                  </div>
                  <span className="status-pill is-good">Saved</span>
                </div>
                <div className="memory-meta">
                  <span>{formatCategory(memory.category)}</span>
                  <span>{formatConfidence(memory.confidence)}% confidence</span>
                  <span>{memory.projectName}</span>
                  <span>{formatDate(memory.createdAt)}</span>
                </div>
                <div className="rule-block">
                  <span>Future rule</span>
                  <strong>{memory.rule}</strong>
                </div>
                <div className="memory-detail-grid">
                  <div>
                    <span>Pattern</span>
                    <p>{memory.problemPattern}</p>
                  </div>
                  <div>
                    <span>Evidence</span>
                    <p>{memory.evidence}</p>
                  </div>
                </div>
                <code>{memory.backboardMemoryId || 'memory_pending'}</code>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PreflightView({
  apiActions,
  memories,
}: {
  apiActions: ApiActions | null
  memories: Lesson[]
}) {
  const [projectIdea, setProjectIdea] = useState('')
  const [preflightState, setPreflightState] = useState<{
    memories: PreflightMemory[]
    message: string | null
    preflightId: string | null
    result: PreflightResult | null
    status: 'idle' | 'loading' | 'ready' | 'error'
  }>({
    memories: [],
    message: null,
    preflightId: null,
    result: null,
    status: 'idle',
  })

  async function submitPreflight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!apiActions) {
      setPreflightState((current) => ({
        ...current,
        message: 'API is not connected. Check VITE_AUTH0_AUDIENCE and VITE_API_BASE_URL.',
        status: 'error',
      }))
      return
    }

    if (!projectIdea.trim()) {
      setPreflightState((current) => ({
        ...current,
        message: 'Describe the next project before running preflight.',
        status: 'error',
      }))
      return
    }

    setPreflightState({
      memories: [],
      message: 'Searching saved memory and generating a readonly preflight brief.',
      preflightId: null,
      result: null,
      status: 'loading',
    })

    try {
      const run = await apiActions.createPreflight(projectIdea)

      setPreflightState({
        memories: run.memories,
        message: `Preflight ${run.preflight.id.slice(0, 8)} created from ${run.memories.length} memory matches.`,
        preflightId: run.preflight.id,
        result: run.result,
        status: 'ready',
      })
    } catch (preflightError) {
      setPreflightState((current) => ({
        ...current,
        message:
          preflightError instanceof Error
            ? preflightError.message
            : 'Unable to run preflight.',
        status: 'error',
      }))
    }
  }

  return (
    <div className="screen-grid">
      <form className="panel preflight-form" onSubmit={submitPreflight}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">New project preflight</p>
            <h2>Check a fresh idea against builder memory</h2>
            <p className="microcopy">
              Use this before giving an agent the build. It searches your saved rules,
              then asks the Backboard assistant for a readonly risk brief.
            </p>
          </div>
          <span className={preflightStatusClass(preflightState.status)}>
            {preflightStatusLabel(preflightState.status)}
          </span>
        </div>
        <label className="transcript-box">
          <span>Project idea</span>
          <textarea
            onChange={(event) => setProjectIdea(event.target.value)}
            placeholder="Describe what you want to build next, the deadline, the demo target, and any risky features you are tempted to include."
            value={projectIdea}
          />
        </label>
        <div className="form-footer">
          <span>{memories.length} saved memories available locally</span>
          <span>Backboard memory readonly</span>
          <button
            className="primary-action"
            disabled={preflightState.status === 'loading'}
            type="submit"
          >
            {preflightState.status === 'loading' ? 'Running' : 'Run preflight'}
          </button>
        </div>
        {preflightState.message && (
          <p
            className={
              preflightState.status === 'error'
                ? 'form-message is-error'
                : 'form-message'
            }
          >
            {preflightState.message}
          </p>
        )}
      </form>

      {preflightState.result ? (
        <PreflightResultView
          memories={preflightState.memories}
          preflightId={preflightState.preflightId}
          result={preflightState.result}
        />
      ) : (
        <section className="panel preflight-empty">
          <div>
            <p className="eyebrow">Expected output</p>
            <h2>Scope risks, MVP shape, and agent guardrails</h2>
          </div>
          <div className="preflight-preview-grid">
            <span>Matched memories</span>
            <span>Risk patterns</span>
            <span>Smallest vertical slice</span>
            <span>Starter prompt</span>
          </div>
          <p className="microcopy">
            Save at least a few strong memories first for sharper warnings. Manual
            lessons count too.
          </p>
        </section>
      )}
    </div>
  )
}

function PreflightResultView({
  memories,
  preflightId,
  result,
}: {
  memories: PreflightMemory[]
  preflightId: string | null
  result: PreflightResult
}) {
  return (
    <>
      <section className="panel preflight-brief">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Generated brief</p>
            <h2>{result.summary || 'Preflight complete'}</h2>
          </div>
          {preflightId && <code>{preflightId}</code>}
        </div>

        <div className="preflight-result-grid">
          <div className="brief-block mvp-block">
            <p className="eyebrow">Recommended MVP</p>
            <h3>{result.recommendedMvp.goal || 'No MVP goal returned'}</h3>
            <p>{result.recommendedMvp.firstVerticalSlice}</p>
          </div>
          <div className="brief-block">
            <p className="eyebrow">Must have</p>
            <TextList emptyMessage="No must-have list returned." items={result.recommendedMvp.mustHave} />
          </div>
          <div className="brief-block">
            <p className="eyebrow">Defer</p>
            <TextList emptyMessage="No defer list returned." items={result.recommendedMvp.defer} />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Risk patterns</p>
            <h2>Warnings from previous builds</h2>
          </div>
          <span className="status-pill is-warn">
            {result.riskPatterns.length} risks
          </span>
        </div>
        {result.riskPatterns.length === 0 ? (
          <div className="empty-state">
            <strong>No risk patterns returned.</strong>
          </div>
        ) : (
          <div className="risk-list">
            {result.riskPatterns.map((risk) => (
              <article className="risk-card" key={`${risk.title}-${risk.severity}`}>
                <div className="lesson-topline">
                  <span className={severityClass(risk.severity)}>
                    {risk.severity}
                  </span>
                  <span>{risk.matchedMemoryIds.length} memory links</span>
                </div>
                <h3>{risk.title}</h3>
                <p>{risk.explanation}</p>
                {risk.matchedMemoryIds.length > 0 && (
                  <div className="memory-id-list">
                    {risk.matchedMemoryIds.map((id) => (
                      <code key={id}>{id}</code>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel prompt-grid">
        <div className="brief-block">
          <div className="copy-heading">
            <p className="eyebrow">Agent rules</p>
            <CopyButton
              label="Copy rules"
              value={formatAgentRulesForCopy(result.agentRules)}
            />
          </div>
          <TextList emptyMessage="No agent rules returned." items={result.agentRules} />
        </div>
        <div className="brief-block prompt-block">
          <div className="copy-heading">
            <p className="eyebrow">Starter prompt</p>
            <CopyButton
              label="Copy prompt"
              value={result.starterPrompt || 'No starter prompt returned.'}
            />
          </div>
          <pre>{result.starterPrompt || 'No starter prompt returned.'}</pre>
        </div>
        <div className="brief-block prompt-block">
          <div className="copy-heading">
            <p className="eyebrow">AGENTS.md seed</p>
            <CopyButton
              label="Copy AGENTS.md"
              value={result.agentsMd || 'No AGENTS.md content returned.'}
            />
          </div>
          <pre>{result.agentsMd || 'No AGENTS.md content returned.'}</pre>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Memory matches</p>
            <h2>What the brief was grounded on</h2>
          </div>
          <span className="status-pill is-good">{memories.length} matches</span>
        </div>
        {memories.length === 0 ? (
          <div className="empty-state">
            <strong>No saved memory was retrieved for this idea.</strong>
          </div>
        ) : (
          <div className="memory-match-list">
            {memories.map((memory) => (
              <article className="memory-match-card" key={memory.id}>
                <div className="lesson-topline">
                  <span className="category">
                    {memory.category ? formatCategory(memory.category) : 'Memory'}
                  </span>
                  <span>{memory.source}</span>
                </div>
                <h3>{memory.title || memory.id}</h3>
                <p>{truncateText(memory.content, 420)}</p>
                <code>{memory.id}</code>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function TextList({
  emptyMessage,
  items,
}: {
  emptyMessage: string
  items: string[]
}) {
  if (items.length === 0) {
    return <p>{emptyMessage}</p>
  }

  return (
    <ul className="tight-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function CopyButton({
  label,
  value,
}: {
  label: string
  value: string
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1600)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 2200)
    }
  }

  return (
    <button
      className={copyState === 'error' ? 'copy-action is-error' : 'copy-action'}
      disabled={!value.trim()}
      onClick={() => {
        void copyValue()
      }}
      type="button"
    >
      {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : label}
    </button>
  )
}

function formatAgentRulesForCopy(rules: string[]): string {
  if (rules.length === 0) return 'No agent rules returned.'

  return rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n')
}

function preflightStatusClass(
  status: 'idle' | 'loading' | 'ready' | 'error',
): string {
  if (status === 'loading') return 'status-pill is-warn'
  if (status === 'ready') return 'status-pill is-good'
  if (status === 'error') return 'status-pill is-danger'
  return 'status-pill is-muted'
}

function preflightStatusLabel(status: 'idle' | 'loading' | 'ready' | 'error'): string {
  if (status === 'loading') return 'Running'
  if (status === 'ready') return 'Brief ready'
  if (status === 'error') return 'Needs attention'
  return 'Ready'
}

function severityClass(severity: 'low' | 'medium' | 'high'): string {
  if (severity === 'high') return 'status-pill is-danger'
  if (severity === 'medium') return 'status-pill is-warn'
  return 'status-pill is-good'
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength).trim()}...`
}

function LessonList({
  emptyMessage = 'No draft lessons yet.',
  lessons,
  mode,
  onApprove,
  onReject,
  onUpdate,
}: {
  emptyMessage?: string
  lessons: Lesson[]
  mode: 'compact' | 'review'
  onApprove?: (lessonId: string) => Promise<void>
  onReject?: (lessonId: string) => Promise<void>
  onUpdate?: (lessonId: string, input: UpdateLessonInput) => Promise<void>
}) {
  if (lessons.length === 0) {
    return (
      <div className="empty-state">
        <strong>{emptyMessage}</strong>
      </div>
    )
  }

  return (
    <div className="lesson-list">
      {lessons.map((lesson) => (
        <LessonCard
          key={lesson.id}
          lesson={lesson}
          mode={mode}
          onApprove={onApprove}
          onReject={onReject}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  )
}

function LessonCard({
  lesson,
  mode,
  onApprove,
  onReject,
  onUpdate,
}: {
  lesson: Lesson
  mode: 'compact' | 'review'
  onApprove?: (lessonId: string) => Promise<void>
  onReject?: (lessonId: string) => Promise<void>
  onUpdate?: (lessonId: string, input: UpdateLessonInput) => Promise<void>
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState({
    category: lesson.category,
    evidence: lesson.evidence,
    problemPattern: lesson.problemPattern,
    rule: lesson.rule,
    title: lesson.title,
  })

  async function saveEdits() {
    if (!onUpdate) return

    await onUpdate(lesson.id, {
      category: draft.category,
      evidence: draft.evidence,
      futureRule: draft.rule,
      problemPattern: draft.problemPattern,
      title: draft.title,
    })
    setIsEditing(false)
  }

  return (
    <article className="lesson-item">
      <div className="lesson-topline">
        <span className="category">{formatCategory(lesson.category)}</span>
        <span>{formatConfidence(lesson.confidence)}% confidence</span>
      </div>
      {isEditing ? (
        <div className="edit-grid">
          <label>
            <span>Title</span>
            <input
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              value={draft.title}
            />
          </label>
          <label>
            <span>Category</span>
            <select
              onChange={(event) =>
                setDraft((current) => ({ ...current, category: event.target.value }))
              }
              value={draft.category}
            >
              <option value="scope">Scope</option>
              <option value="architecture">Architecture</option>
              <option value="agent_behavior">Agent behavior</option>
              <option value="prompting">Prompting</option>
              <option value="domain_knowledge">Domain knowledge</option>
              <option value="testing">Testing</option>
              <option value="ux">UX</option>
              <option value="tooling">Tooling</option>
              <option value="deployment">Deployment</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label>
            <span>Pattern</span>
            <textarea
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  problemPattern: event.target.value,
                }))
              }
              value={draft.problemPattern}
            />
          </label>
          <label>
            <span>Evidence</span>
            <textarea
              onChange={(event) =>
                setDraft((current) => ({ ...current, evidence: event.target.value }))
              }
              value={draft.evidence}
            />
          </label>
          <label>
            <span>Future rule</span>
            <textarea
              onChange={(event) =>
                setDraft((current) => ({ ...current, rule: event.target.value }))
              }
              value={draft.rule}
            />
          </label>
        </div>
      ) : (
        <>
          <h3>{lesson.title}</h3>
          <p>{lesson.evidence}</p>
          {mode === 'review' && (
            <>
              <div className="rule-block">
                <span>Pattern</span>
                <strong>{lesson.problemPattern}</strong>
              </div>
              <div className="rule-block">
                <span>Future rule</span>
                <strong>{lesson.rule}</strong>
              </div>
            </>
          )}
        </>
      )}
      <div className="lesson-actions">
        <span className={isSavedLesson(lesson) ? 'status-pill is-good' : 'status-pill is-muted'}>
          {formatStatus(lesson.status)}
        </span>
        {mode === 'review' && (
          <div>
            {isEditing ? (
              <>
                <button onClick={() => setIsEditing(false)} type="button">
                  Cancel
                </button>
                <button className="primary-action" onClick={saveEdits} type="button">
                  Save edit
                </button>
              </>
            ) : (
              <>
                <button
                  className="secondary-action"
                  onClick={() => setIsEditing(true)}
                  type="button"
                >
                  Edit draft
                </button>
                <button
                  className="danger-action"
                  onClick={() => {
                    void onReject?.(lesson.id)
                  }}
                  type="button"
                >
                  Reject
                </button>
                <button
                  className="primary-action"
                  onClick={() => {
                    void onApprove?.(lesson.id)
                  }}
                  type="button"
                >
                  Save to memory
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

function toLesson(row: ApiLesson): Lesson {
  return {
    backboardMemoryId: row.backboard_memory_id,
    category: row.category,
    confidence: row.confidence,
    createdAt: row.created_at,
    evidence: row.evidence,
    id: row.id,
    importId: row.import_id,
    problemPattern: row.problem_pattern,
    projectName: row.project_name,
    rule: row.future_rule,
    status: row.status,
    title: row.title,
  }
}

function formatCategory(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatConfidence(value: number): number {
  if (value <= 1) return Math.round(value * 100)
  return Math.round(value)
}

function formatStatus(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function isSavedLesson(lesson: Lesson): boolean {
  return lesson.status === 'saved' || lesson.status === 'approved'
}

function isManualLesson(lesson: Lesson): boolean {
  return !lesson.importId
}

function workspaceHeadline(draftCount: number, memoryCount: number): string {
  if (draftCount > 0) return `${draftCount} lesson drafts need your call.`
  if (memoryCount > 0) return `${memoryCount} memories ready for preflight.`
  return 'Start by importing one messy build conversation.'
}

function memorySourceLabel(lesson: Lesson): string {
  return isManualLesson(lesson) ? 'Manual memory' : 'Transcript memory'
}

function formatDate(value: string): string {
  if (!value) return 'Unknown date'

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function lessonStatusClass(status: LessonState['status']): string {
  if (status === 'ready') return 'status-pill is-good'
  if (status === 'loading') return 'status-pill is-warn'
  if (status === 'error') return 'status-pill is-danger'
  return 'status-pill is-muted'
}

function jobUiStatus(job: ApiImportJob): ProcessingState['status'] {
  if (job.status === 'failed') return 'error'
  if (job.status === 'ready_for_review') return 'ready'
  return 'polling'
}

function jobStatusMessage(job: ApiImportJob): string {
  if (job.status === 'queued') return 'Queued. Waiting for the worker to start.'
  if (job.status === 'chunking') return 'Normalizing and chunking the transcript.'
  if (job.status === 'ready_for_analysis') return 'Chunks are ready for Backboard analysis.'
  if (job.status === 'analyzing') return 'Backboard is extracting chunk findings.'
  if (job.status === 'findings_ready') return 'Findings are ready. Reducing into lesson drafts.'
  if (job.status === 'reducing') return 'Merging findings into high-quality draft lessons.'
  if (job.status === 'ready_for_review') return 'Draft lessons are ready for review.'
  if (job.status === 'failed') return 'Analysis failed. Check the error below.'
  return `Job status: ${job.status}`
}

function processingStatusClass(status: ProcessingState['status']): string {
  if (status === 'ready') return 'status-pill is-good'
  if (status === 'error') return 'status-pill is-danger'
  if (status === 'polling') return 'status-pill is-warn'
  return 'status-pill is-muted'
}

function processingSummaryClass(processingState: ProcessingState): string {
  if (processingState.status === 'polling') return 'status-pill is-warn'
  if (processingState.status === 'error') return 'status-pill is-danger'
  return 'status-pill is-good'
}

function processingSummaryLabel(
  processingState: ProcessingState,
  lessonCount: number,
): string {
  if (processingState.status === 'polling') {
    return `${clampProgress(processingState.job?.progress || 0)}% processing`
  }

  if (processingState.status === 'error') return 'Analysis failed'
  return `${lessonCount} lessons found`
}

function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

export default App
