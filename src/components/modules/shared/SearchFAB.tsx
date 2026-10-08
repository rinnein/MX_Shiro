'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { atom, useAtomValue, useSetAtom } from 'jotai'
import { AnimatePresence, m } from 'motion/react'
import Link from 'next/link'
import type { KeyboardEventHandler } from 'react'
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { EmptyIcon } from '~/components/icons/empty'
import { FABPortable } from '~/components/ui/fab'
import { microDampingPreset } from '~/constants/spring'
import useDebounceValue from '~/hooks/common/use-debounce-value'
import { useIsClient } from '~/hooks/common/use-is-client'
import { noopArr } from '~/lib/noop'
import { apiClient } from '~/lib/request'
import { jotaiStore } from '~/lib/store'

const searchPanelOpenAtom = atom(false)
const isComposingAtom = atom(false)
export const SearchFAB = () => {
  const isClient = useIsClient()
  if (!isClient) return null
  return (
    <>
      <FABPortable
        onClick={() => {
          jotaiStore.set(searchPanelOpenAtom, true)
        }}
      >
        <i className="i-mingcute-search-line" />
      </FABPortable>
    </>
  )
}

export const SearchPanelWithHotKey = () => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        jotaiStore.set(searchPanelOpenAtom, true)
      }

      if (
        e.key === 'Escape' &&
        jotaiStore.get(searchPanelOpenAtom) &&
        !jotaiStore.get(isComposingAtom)
      ) {
        e.preventDefault()
        jotaiStore.set(searchPanelOpenAtom, false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
    }
  }, [])
  return <SearchPanel />
}

const SearchPanel = () => {
  const panelOpen = useAtomValue(searchPanelOpenAtom)

  return (
    <Dialog.Root open>
      {panelOpen && <Dialog.Overlay />}
      <AnimatePresence>
        {panelOpen && (
          <Dialog.Portal>
            <Dialog.Content>
              <div className="center fixed inset-0 z-20 flex">
                <div
                  className="fixed inset-0 z-[-1]"
                  onClick={() => {
                    jotaiStore.set(searchPanelOpenAtom, false)
                  }}
                  tabIndex={-1}
                />
                <SearchPanelImpl />
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

type SearchListType = {
  title: string
  subtitle?: string
  url: string
  id: string
}
const currentSelectAtom = atom(0)

const SearchPanelImpl = () => {
  const [keyword, setKeyword] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  const setCurrentSelect = useSetAtom(currentSelectAtom)
  const debouncedKeyword = useDebounceValue(keyword, 360)

  const {
    data: _data,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['search', debouncedKeyword],
    queryFn: ({ queryKey }) => {
      const [, keyword] = queryKey
      if (!keyword) {
        return
      }
      return apiClient.search.proxy.get({
        params: {
          keyword,
        },
      })
    },
    select: useCallback(
      (data: any) => {
        if (!data?.data) {
          return
        }

        const _list: SearchListType[] = data?.data.map((item: any) => {
          switch (item.type) {
            case 'post': {
              return {
                title: item.title,
                subtitle: item.category.name,
                id: item.id,
                url: `/posts/${item.category.slug}/${item.slug}`,
              }
            }
            case 'note': {
              return {
                title: item.title,
                subtitle: '手记',
                id: item.id,
                url: `/notes/${item.nid}`,
              }
            }
            case 'page': {
              return {
                title: item.title,
                subtitle: '页面',
                id: item.id,
                url: `/${item.slug}`,
              }
            }
          }
        })
        setCurrentSelect(0)

        return _list
      },
      [setCurrentSelect],
    ),
  })
  const data = _data || noopArr
  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      if (!listRef.current) {
        return
      }
      const $ = listRef.current
      const currentSelect = jotaiStore.get(currentSelectAtom)

      switch (e.key) {
        case 'Enter': {
          ;(
            ($.children.item(currentSelect) as HTMLLIElement).children.item(
              0,
            ) as HTMLLinkElement
          )?.click()

          break
        }
        case 'ArrowDown': {
          setCurrentSelect((currentSelect) => {
            const index = currentSelect + 1
            return index ? index % data.length : 0
          })

          break
        }
        case 'ArrowUp': {
          setCurrentSelect((currentSelect) => {
            const index = currentSelect - 1
            return index < 0 ? data.length - 1 : index
          })

          break
        }
      }

      $.children.item(currentSelect)?.scrollIntoView({
        behavior: 'smooth',
      })
    },
    [data.length],
  )

  return (
    <m.div
      className={clsx(
        'h-[600px] max-h-[80vh] w-[800px] max-w-screen rounded-none md:h-screen md:max-h-[60vh] md:max-w-[80vw]',
        'min-h-50 flex flex-col bg-zinc-50/80 shadow-2xl backdrop-blur-md dark:bg-neutral-900/80 md:rounded-xl',
        'border-0 border-zinc-200 dark:border-zinc-800 md:border',
      )}
      onKeyDown={handleKeyDown}
      role="dialog"
      initial={true}
      exit={{
        y: 20,
        opacity: 0,
      }}
      animate={{
        y: 0,
        transition: microDampingPreset,
      }}
    >
      <input
        autoFocus
        className="w-full shrink-0 border-b border-zinc-200 bg-transparent p-4 px-5 text-lg leading-4 dark:border-neutral-700"
        placeholder="Search..."
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onCompositionStart={() => {
          jotaiStore.set(isComposingAtom, true)
        }}
        onCompositionEnd={() => {
          jotaiStore.set(isComposingAtom, false)
        }}
        onKeyDown={(e) => {
          if (
            e.key === 'ArrowDown' ||
            e.key === 'ArrowUp' ||
            e.key === 'Enter'
          ) {
            e.preventDefault()
          }
        }}
      />
      <div />
      <div className="relative h-0 shrink grow overflow-auto">
        <ul className="h-full px-2 py-4" ref={listRef}>
          {data.length === 0 && !isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center space-y-2">
                {!keyword ? (
                  <i className="i-mingcute-search-line text-[60px]" />
                ) : (
                  <EmptyIcon />
                )}

                {!data && isLoading && isFetching && (
                  <div className="loading-dots text-[30px]" />
                )}
                <span>{!!keyword && '无内容'}</span>
              </div>
            </div>
          ) : (
            data.map((item, index) => {
              return <SearchItem key={item.id} {...item} index={index} />
            })
          )}

          {data.length === 0 && isLoading && (
            <div className="center flex h-full grow">
              <div className="loading loading-spinner" />
            </div>
          )}
        </ul>
      </div>

      <div className="px-4 py-2 text-right text-sm opacity-60">站内搜索</div>
    </m.div>
  )
}

const SearchItem = memo(function Item({
  index,
  ...item
}: {
  index: number
} & SearchListType) {
  const selectIndex = useAtomValue(currentSelectAtom)
  const isSelect = selectIndex === index
  return (
    <li
      className={clsx(
        'relative flex w-full justify-between px-1',
        'before:content-auto before:absolute before:inset-0 before:rounded-md',
        'before:z-0 hover:before:bg-zinc-200/80 dark:hover:before:bg-zinc-800/80',
        isSelect && 'before:bg-zinc-200/80 dark:before:bg-zinc-800/80',
      )}
      key={item.id}
      onMouseOver={() => {
        startTransition(() => {
          jotaiStore.set(currentSelectAtom, index)
        })
      }}
    >
      <Link
        href={item.url}
        className="relative z-10 flex w-full justify-between p-3"
      >
        <span className="block min-w-0 flex-1 shrink-0 truncate">
          {item.title}
        </span>
        <span className="block min-w-0 shrink-0 grow-0 text-zinc-800 dark:text-slate-200/80">
          {item.subtitle}
        </span>
      </Link>
    </li>
  )
})
