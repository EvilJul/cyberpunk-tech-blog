import { app } from '../../server/index.js'
import db from '../../server/db/index.js'
import { installLifecycle } from '../../server/utils/lifecycle.js'
const server = app.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }))
installLifecycle(server, db)
process.on('message', message => {
  if (message === 'close-database') {
    db.close()
    process.send({ closed: true })
  }
  if (message === 'fatal') throw new Error('injected test fatal error')
  if (message === 'rejection') Promise.reject(new Error('injected rejection'))
})
