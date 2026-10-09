import type { PaginateResult, PostModel, TagModel } from '@mx-space/api-client'

import {
  editorFromPublication,
  getPublicationBase,
} from '~/lib/content-publish'
import { apiClient, coreClient } from '~/lib/request'
import type { PostDto } from '~/models/writing'

import { defineQuery } from '../helper'
import { usePublishArticle } from '../hooks/publication'

export const post = {
  bySlug: (category: string, slug: string) =>
    defineQuery({
      queryKey: ['post', category, slug],

      queryFn: async ({ queryKey }) => {
        const [, category, slug] = queryKey

        const data = await apiClient.post.getPost(category, slug)

        return data.$serialized
      },
    }),
}

export const postAdmin = {
  paginate: (page?: number) =>
    defineQuery({
      queryKey: ['postAdmin', 'paginate', page],
      queryFn: async ({ pageParam }: any) => {
        const data = await apiClient.post.getList(pageParam ?? page)

        return data.$serialized
      },
    }),

  allCategories: () =>
    defineQuery({
      queryKey: ['postAdmin', 'allCategories'],
      queryFn: async () => {
        const data = await apiClient.category.getAllCategories()

        return data.$serialized
      },
    }),

  getPost: (id: string) =>
    defineQuery({
      queryKey: ['postAdmin', 'getPost', id],
      queryFn: async () => {
        const data = await apiClient.post.getPost(id)

        const base = await getPublicationBase(coreClient, 'post', id)
        const dto = editorFromPublication(
          {
            ...data.$serialized,
            relatedId: data.related?.map((i) => i.id) || [],
          } as PostDto,
          base,
        )

        return dto
      },
    }),

  getAllTags: () =>
    defineQuery({
      queryKey: ['postAdmin', 'getAllTags'],
      queryFn: async () => {
        const { data } = await apiClient.proxy.categories.get<{
          data: TagModel[]
        }>({
          params: { type: 'Tag' },
        })
        return data.map((i) => ({
          label: `${i.name} (${i.count})`,
          value: i.name,
          key: i.name,
        }))
      },
    }),

  getRelatedList: () =>
    defineQuery({
      queryKey: ['postAdmin', 'getRelatedList'],

      queryFn: async ({ pageParam }: any) => {
        return apiClient.proxy.posts.get({
          params: {
            page: pageParam || 1,
            size: 50,
            select: 'id title _id slug category categoryId',
          },
        }) as Promise<
          PaginateResult<
            Pick<PostModel, 'id' | 'title' | 'slug' | 'category' | 'categoryId'>
          >
        >
      },
    }),
}

export const useCreatePost = () => usePublishArticle('post')
export const useUpdatePost = () => usePublishArticle('post')
