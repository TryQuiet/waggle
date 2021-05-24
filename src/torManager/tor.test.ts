/* eslint import/first: 0 */
import { Tor } from './index'
import { ZBAY_DIR_PATH } from '../constants'
import os from 'os'
import { doesNotMatch } from 'assert'

jest.setTimeout(30_000)



test('start tor, do not kill tor process and start again', async () => {
  const torPath = `${process.cwd()}/tor/tor`
  const libPath = `${process.cwd()}/tor`
  const tor = new Tor({
    torPath: torPath,
    controlPort: 9999,
    options: {
      env: {
        LD_LIBRARY_PATH: libPath,
        HOME: ZBAY_DIR_PATH
      },
      detached: true
    }
  })

  await tor.init()

  const torSecondInstance = new Tor({
    torPath: torPath,
    controlPort: 9999,
    options: {
      env: {
        LD_LIBRARY_PATH: libPath,
        HOME: ZBAY_DIR_PATH
      },
      detached: true
    }
  })
  await torSecondInstance.init()
  await torSecondInstance.kill()
})

test('start and close tor', async () => {
  const torPath = `${process.cwd()}/tor/tor`
  const libPath = `${process.cwd()}/tor`
  const tor = new Tor({
    torPath: torPath,
    controlPort: 9999,
    options: {
      env: {
        LD_LIBRARY_PATH: libPath,
        HOME: ZBAY_DIR_PATH
      },
      detached: true
    }
  })
  await tor.init()
  await tor.kill()
})
