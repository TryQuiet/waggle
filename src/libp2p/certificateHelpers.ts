export function formatPEM(tag: 'CERTIFICATE' | 'PRIVATE KEY', pemString: string): string {
  const stringLength = pemString.length
  let resultString = ''
  for (let i = 0, count = 0; i < stringLength; i++, count++) {
    if (count > 63) {
      resultString = `${resultString}\n`
      count = 0
    }
    resultString = `${resultString}${pemString[i]}`
  }
  return `-----BEGIN ${tag}-----\n` + `${resultString}\n` + `-----END ${tag}-----\n`
}
