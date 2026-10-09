import type {
  NoteWrappedPayload,
  NoteWrappedWithLikedPayload,
} from '@mx-space/api-client'

import {
  editorFromPublication,
  getPublicationBase,
} from '~/lib/content-publish'
import { apiClient, coreClient } from '~/lib/request'
import type { NoteDto } from '~/models/writing'

import { defineQuery } from '../helper'
import { usePublishArticle } from '../hooks/publication'

const LATEST_KEY = 'latest'
export const note = {
  byNid: (nid: string, password?: string | null, token?: string) =>
    defineQuery({
      queryKey: ['note', nid, token],

      queryFn: async ({ queryKey }) => {
        const [, id] = queryKey

        if (id === LATEST_KEY) {
          return (await apiClient.note.getLatest()).$serialized
        }
        // const data = await apiClient.note.getNoteById(+queryKey[1], password!)
        const data = await apiClient.note.proxy
          .nid(id)
          .get<NoteWrappedWithLikedPayload>({
            params: {
              password,
              token,
            },
          })

        return { ...data } as NoteWrappedPayload
      },
    }),
}

export const noteAdmin = {
  paginate: (page?: number) =>
    defineQuery({
      queryKey: ['noteAdmin', 'paginate', page],
      queryFn: async ({ pageParam }: any) => {
        const data = await apiClient.note.getList(pageParam ?? page)

        return data.$serialized
      },
    }),

  allTopic: () =>
    defineQuery({
      queryKey: ['noteAdmin', 'allTopic'],
      queryFn: async () => {
        const data = await apiClient.topic.getAll()

        return data.$serialized.data
      },
    }),

  getNote: (id: string) =>
    defineQuery({
      queryKey: ['noteAdmin', 'getNote', id],
      queryFn: async () => {
        const data = await apiClient.note.getNoteById(id)

        const base = await getPublicationBase(coreClient, 'note', id)
        const dto = editorFromPublication(data.$serialized as NoteDto, base)

        return dto
      },
    }),
}

export const useCreateNote = () => usePublishArticle('note')
export const useUpdateNote = () => usePublishArticle('note')
