import * as IPFS from 'ipfs-core'
import tmp from 'tmp'
import getPort from 'get-port'
import OrbitDB from 'orbit-db'

export const createTmpDir = () => {
  return tmp.dirSync({ mode: 0o750, prefix: 'TestTmp_', unsafeCleanup: true })
}

const main = async () => {
  const dir1 = createTmpDir()
  const dir2 = createTmpDir()
  const port1 = await getPort()
  const port2 = await getPort()
  const port3 = await getPort()
  const port4 = await getPort()
  const port5 = await getPort()
  const port6 = await getPort()
  const port7 = await getPort()
  const port8 = await getPort()

  const ipfs1 = await IPFS.create({
    repo: dir1.name,
    config: {
      Addresses: {
        Swarm: [`/ip4/0.0.0.0/tcp/${port1}`, `/ip4/127.0.0.1/tcp/${port2}/ws`],
        API: `/ip4/127.0.0.1/tcp/${port3}`,
        Gateway: `/ip4/127.0.0.1/tcp/${port4}`
      }
    }
  })
  const ipfs2 = await IPFS.create({
    repo: dir2.name,
    config: {
      Addresses: {
        Swarm: [`/ip4/0.0.0.0/tcp/${port5}`, `/ip4/127.0.0.1/tcp/${port6}/ws`],
        API: `/ip4/127.0.0.1/tcp/${port7}`,
        Gateway: `/ip4/127.0.0.1/tcp/${port8}`
      }
    }
  })

  const orbitdb1 = await OrbitDB.createInstance(ipfs1, { directory: dir1.name })
  const orbitdb2 = await OrbitDB.createInstance(ipfs2, { directory: dir2.name })

  const kev = await orbitdb1.keyvalue('kev', {
    accessController: {
      write: ['*']
    }
  })
  await orbitdb2.keyvalue('kev', {
    accessController: {
      write: ['*']
    }
  })

  await orbitdb1.stop()
  await orbitdb2.stop()
  await ipfs1.stop()
  await ipfs2.stop()
}

main()
