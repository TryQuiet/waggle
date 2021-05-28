import { DataServer } from './DataServer'

test('start and stop data server', async () => {
    const dataServer = new DataServer()
    await dataServer.listen()
    await dataServer.close()
})