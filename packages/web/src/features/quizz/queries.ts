import { api, unwrap, unwrapEmpty } from "@razzia/web/lib/api"
import { queryOptions } from "@tanstack/react-query"

export const mediaKeys = {
  all: ["media"] as const,
  catalog: (quizId?: string) => ["media", "catalog", quizId ?? "all"] as const,
}

export const mediaListQuery = () =>
  queryOptions({
    queryKey: mediaKeys.all,
    queryFn: () => unwrap(api.media.$get()),
  })

export const uploadMedia = (file: File) =>
  unwrap(api.media.$post({ form: { file } }), "errors:media.uploadFailed")

export const deleteMedia = (name: string, options?: { detach?: boolean }) =>
  unwrapEmpty(
    api.media[":name"].$delete({
      param: { name },
      ...(options?.detach ? { query: { detach: "true" } } : {}),
    }),
  )
