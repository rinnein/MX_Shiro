import {
  BusinessEvents,
  InvalidSignatureError,
  verifyWebhook,
  verifyWebhookSha1,
} from '@mx-space/webhook'

export const readCoreWebhook = (
  headers: Headers,
  body: unknown,
  secret: string,
) => {
  const sha1 = headers.get('x-webhook-signature') || ''
  const sha256 = headers.get('x-webhook-signature256') || ''
  // Validate lengths before timingSafeEqual, and never log incoming headers.
  if (!/^[a-f\d]{40}$/i.test(sha1) || !/^[a-f\d]{64}$/i.test(sha256))
    throw new InvalidSignatureError()
  const payload = JSON.stringify(body)
  if (
    !verifyWebhook(secret, payload, sha256) ||
    !verifyWebhookSha1(secret, payload, sha1)
  )
    throw new InvalidSignatureError()
  return { type: headers.get('x-webhook-event'), payload: body }
}

const knownEvents = new Set<string>([
  ...Object.values(BusinessEvents),
  'post.unpublish',
  'post.republish',
  'note.unpublish',
  'note.republish',
])
export const invalidatesContent = (type: string | null) =>
  Boolean(
    type &&
      knownEvents.has(type) &&
      (/^(?:post|note|page|say|recently|category|topic|comment|translation|insights)\./.test(
        type,
      ) ||
        [
          BusinessEvents.AGGREGATE_UPDATE,
          BusinessEvents.CONTENT_REFRESH,
          BusinessEvents.SUMMARY_GENERATED,
        ].includes(type as BusinessEvents)),
  )
