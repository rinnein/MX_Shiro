import { useMutation } from '@tanstack/react-query'

import { useResetAutoSaverData } from '~/components/modules/dashboard/writing/BaseWritingProvider'
import { API_URL } from '~/constants/env'
import type { EditingArticle, PublicationState } from '~/lib/content-publish'
import { publishArticle } from '~/lib/content-publish'
import { coreClient } from '~/lib/request'
import { toast } from '~/lib/toast'

export const usePublishArticle = (type: 'post' | 'note') => {
  const resetAutoSaver = useResetAutoSaverData()
  return useMutation({
    retry: false,
    mutationFn: (article: EditingArticle) => {
      const key = `@shiro/publish/${encodeURIComponent(API_URL)}/${type}/${article.id || 'new'}`
      const saved = localStorage.getItem(key)
      const state = saved ? (JSON.parse(saved) as PublicationState) : undefined
      return publishArticle(coreClient, type, article, {
        state,
        saveState(next) {
          if (next) localStorage.setItem(key, JSON.stringify(next))
          else localStorage.removeItem(key)
        },
      })
    },
    onSuccess(result, article) {
      if (result.published) {
        toast.success('发布任务已完成')
        resetAutoSaver(type, article.id || undefined)
      } else {
        toast.success('草稿已保存；线上内容未改变')
      }
    },
  })
}
