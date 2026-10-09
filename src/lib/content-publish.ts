import type { CoreResponse, createV3Client } from '../../packages/fetch/src/v3'

type Client = Pick<ReturnType<typeof createV3Client>, 'proxy'>
type RefType = 'post' | 'note'

export interface RevisionSnapshot {
  content?: string | null
  contentFormat: 'markdown' | 'lexical'
  title: string
  text: string
  images?: unknown[] | null
  meta?: Record<string, unknown> | null
  typeSpecificData?: Record<string, any> | null
}
export interface PublicationBase {
  revisionId: string
  snapshot: RevisionSnapshot
}
interface DraftBranch {
  id: string
  headRevisionId: string
  headRevision: RevisionSnapshot
  relationToPublished: 'same' | 'ancestor' | 'descendant' | 'diverged' | null
  document: { publishedRevisionId: string | null; refId: string | null }
}
export interface PublicationState {
  branchId: string
  revisionId: string
  baseRevisionId: string | null
  snapshotKey: string
  taskId?: string
  submitting?: boolean
}
interface PublishTask {
  id: string
  status: string
  error?: string
  payload: { branchId: string; revisionId: string }
  result?: {
    articleCommitted: boolean
    articleId: string
    publishedRevisionId: string
  }
}
export type EditingArticle = Record<string, any> & {
  id?: string
  title: string
  text: string
  publicationBase?: PublicationBase
}

export const getPublicationBase = async (
  client: Client,
  type: RefType,
  id: string,
): Promise<PublicationBase> => {
  const { data } = await client.proxy.drafts.context(type)(id).get<
    CoreResponse<{
      publishedRevision: (RevisionSnapshot & { id: string }) | null
    }>
  >()
  if (!data.publishedRevision)
    throw new Error('找不到已发布修订，请在 Core 控制台检查内容状态')
  return {
    revisionId: data.publishedRevision.id,
    snapshot: data.publishedRevision,
  }
}

export const snapshotFromEditor = (
  type: RefType,
  article: EditingArticle,
): RevisionSnapshot => {
  const base = article.publicationBase?.snapshot
  if (
    article.contentFormat === 'lexical' ||
    base?.contentFormat === 'lexical'
  ) {
    throw new Error('请在 Core 控制台编辑这篇富文本内容')
  }
  const specific = { ...base?.typeSpecificData }
  const keys =
    type === 'post'
      ? [
          'slug',
          'categoryId',
          'copyright',
          'tags',
          'summary',
          'pinOrder',
          'relatedId',
          'isPremium',
        ]
      : [
          'slug',
          'mood',
          'weather',
          'bookmark',
          'coordinates',
          'location',
          'topicId',
          'publicAt',
        ]
  for (const key of keys)
    if (article[key] !== undefined) specific[key] = article[key]
  if (article.created) specific.created = article.created
  if (type === 'post' && article.pin !== undefined)
    specific.pin = Boolean(article.pin)
  // An untouched protected note must retain its password; only an explicit
  // clear sends null. Core deliberately omits passwords from revision views.
  if (type === 'note' && article.password !== undefined)
    specific.password = article.password || null
  return {
    title: article.title,
    text: article.text,
    contentFormat: 'markdown',
    images: article.images ?? base?.images ?? [],
    meta: article.meta ?? null,
    typeSpecificData: specific,
  }
}

export const editorFromPublication = <T extends EditingArticle>(
  article: T,
  base: PublicationBase,
): T => {
  const { snapshot } = base
  const specific = snapshot.typeSpecificData ?? {}
  return {
    ...article,
    ...specific,
    title: snapshot.title,
    text: snapshot.text,
    images: snapshot.images ?? [],
    meta: snapshot.meta,
    contentFormat: snapshot.contentFormat,
    content: snapshot.content,
    publicationBase: base,
    // The old editor uses a date for pinned posts, the revision uses boolean.
    ...('categoryId' in article
      ? { pin: specific.pin ? article.pin || article.created : null }
      : { password: undefined }),
  }
}

const serializeSnapshot = (value: unknown): string =>
  JSON.stringify(value, (_key, child) =>
    child && typeof child === 'object' && !Array.isArray(child)
      ? Object.fromEntries(
          Object.entries(child).sort(([a], [b]) => a.localeCompare(b)),
        )
      : child,
  )

export const publishArticle = async (
  client: Client,
  type: RefType,
  article: EditingArticle,
  options: {
    state?: PublicationState
    saveState: (state?: PublicationState) => void
    wait?: () => Promise<void>
    attempts?: number
  },
) => {
  const snapshot = snapshotFromEditor(type, article)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(serializeSnapshot(snapshot)),
  )
  const key = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  let { state } = options
  const expected = article.id ? article.publicationBase?.revisionId : null
  if (article.id && !expected)
    throw new Error('这份本地草稿没有修订基准，请重新加载文章后合并内容再保存')

  if (state?.taskId || state?.submitting) {
    if (state.snapshotKey !== key)
      throw new Error(
        '上次发布尚待确认，当前内容已变化。请先在 Core 任务列表确认上次发布，保留当前草稿',
      )
  } else {
    let branch: DraftBranch
    if (state) {
      if (state.baseRevisionId !== expected)
        throw new Error('草稿基准已变化，请在 Core 控制台合并修订后再发布')
      const response = await client.proxy
        .drafts(state.branchId)
        .put<CoreResponse<DraftBranch>>({
          data: { expectedHeadRevisionId: state.revisionId, data: snapshot },
        })
      branch = response.data
    } else {
      const response = await client.proxy.drafts.post<
        CoreResponse<DraftBranch>
      >({
        data: {
          refType: type,
          ...(article.id
            ? { refId: article.id, baseRevisionId: expected }
            : {}),
          data: snapshot,
        },
      })
      branch = response.data
    }
    state = {
      branchId: branch.id,
      revisionId: branch.headRevisionId,
      baseRevisionId: expected ?? null,
      snapshotKey: key,
    }
    options.saveState(state)
    // Save hidden notes as drafts. Publishing then hiding would briefly expose
    // private content and emit public notifications.
    if (type === 'note' && article.hide) {
      return {
        id: article.id || '',
        draftId: branch.id,
        published: false as const,
      }
    }
    if (
      branch.document.publishedRevisionId !== expected ||
      branch.relationToPublished === 'diverged' ||
      branch.relationToPublished === 'descendant'
    ) {
      throw new Error(
        '线上内容已有其他修订，请在 Core 控制台合并后发布；当前草稿已保留',
      )
    }
    state = { ...state, submitting: true }
    options.saveState(state)
    try {
      const { data } = await client
        .proxy('publish-jobs')
        .post<CoreResponse<{ taskId: string }>>({
          data: {
            branchId: state.branchId,
            revisionId: state.revisionId,
            expectedPublishedRevisionId: expected,
            confirmDiverged: false,
            aiResources: [],
          },
        })
      state = { ...state, taskId: data.taskId, submitting: false }
      options.saveState(state)
    } catch (error: any) {
      if (
        error.status >= 400 &&
        error.status < 500 &&
        ![408, 429].includes(error.status)
      ) {
        state = { ...state, submitting: false }
        options.saveState(state)
      }
      throw error
    }
  }

  if (!state.taskId) {
    // A lost POST response is not permission to publish twice. Recover the
    // existing job by its frozen branch/revision before making any new write.
    const { data } = await client.proxy.tasks.get<CoreResponse<PublishTask[]>>({
      params: { type: 'content:publish', scope: 'content', size: 100 },
    })
    const task = data.find(
      (task) =>
        task.payload.branchId === state!.branchId &&
        task.payload.revisionId === state!.revisionId,
    )
    if (!task)
      throw new Error(
        '未能确认上次发布结果，请在 Core 任务列表核对；不会自动重复发布',
      )
    state = { ...state, taskId: task.id, submitting: false }
    options.saveState(state)
  }
  for (let attempt = 0; attempt < (options.attempts ?? 60); attempt++) {
    const { data: task } = await client.proxy
      .tasks(state.taskId)
      .get<CoreResponse<PublishTask>>()
    if (
      task.payload.branchId !== state.branchId ||
      task.payload.revisionId !== state.revisionId
    ) {
      throw new Error('返回的发布任务不属于当前修订，请在 Core 控制台检查')
    }
    if (
      task.result?.articleCommitted &&
      task.result.publishedRevisionId === state.revisionId
    ) {
      const result = {
        id: task.result.articleId,
        published: true as const,
        publicationBase: { revisionId: state.revisionId, snapshot },
      }
      options.saveState()
      return result
    }
    if (
      ['failed', 'partial_failed', 'cancelled', 'completed'].includes(
        task.status,
      )
    ) {
      options.saveState({ ...state, taskId: undefined, submitting: false })
      throw new Error(task.error || '发布任务未完成内容提交，草稿已保留')
    }
    await (options.wait?.() ??
      new Promise((resolve) => setTimeout(resolve, 1000)))
  }
  throw new Error(
    `发布任务 ${state.taskId} 仍在处理中，草稿已保留；再次保存会查询原任务`,
  )
}
