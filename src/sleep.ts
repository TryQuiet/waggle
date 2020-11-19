export const sleep = (time = 5000) =>
  new Promise<void>(resolve => {
    setTimeout(() => {
      resolve()
    }, time)
  })
