import { formatPEM } from '@zbayapp/identity'
import { Certificate } from 'pkijs'

export function dumpPEM(tag: string, body: string | Certificate | CryptoKey) {
  let result
  if (typeof body === 'string') {
    result = (
      `-----BEGIN ${tag}-----\n` +
      `${formatPEM(body)}\n` +
      `-----END ${tag}-----\n`
    )
  } else {
    result = (
      `-----BEGIN ${tag}-----\n` +
      `${formatPEM(Buffer.from(body).toString('base64'))}\n` +
      `-----END ${tag}-----\n`
    )
  }

  return Buffer.from(result)
}
