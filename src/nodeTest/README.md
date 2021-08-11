## Replication test

### Installation

* `npm install`

### Testing on host

There are two basic tests. Each runs two nodes - first one generates snapshot and saves it to db, second connects to it, retrieves the snapshot and tries to load it.

`ts-node src/snaphotTestTor.ts` - using WebsocketOverTor (custom libp2p transport)

`ts-node src/snaphotTest.ts` - without tor, just connecting on localhost

After each run one may have to kill tor process.


### Testing docker <-> host

Dockerfile contains node's configuration for the one that generates snapshot. The second node may be run from host.

ENV CREATE_SNAPSHOT - if 'true' be the node that creates a snapshot rather than replicates it
ENV USE_SNAPSHOT - use snapshots in general

### Notes

* `StorageTestSnapshot` simplified version of our Storage, uses the orbitdb snapshots mechanism.