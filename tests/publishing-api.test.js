import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'publishing-tests-'))
process.env.BLOG_DATA_DIR=dir
process.env.NODE_ENV='production'
process.env.PUBLISHING_API_ENABLED='true'
const {default:db,initDatabase}=await import('../server/db/index.js')
const {migratePublishing}=await import('../server/db/migrations/publishing.js')
const service=await import('../server/services/integrationService.js')
initDatabase();migratePublishing(db)
test.after(/* 关闭发布测试数据库并清理临时目录。 */ ()=>{db.close();fs.rmSync(dir,{recursive:true,force:true})})
test('migration is repeatable and sources retain deleted identity',/* 验证重复迁移及删除文章后的来源墓碑。 */ ()=>{
  migratePublishing(db)
  const i=service.createIntegration({name:'测试'})
  db.prepare("INSERT INTO articles(id,title,slug,created_at,updated_at) VALUES('gone','title','gone',1,1)").run()
  db.prepare('INSERT INTO article_sources VALUES(?,?,?,0)').run(i.id,'external','gone')
  db.prepare("DELETE FROM articles WHERE id='gone'").run()
  assert.equal(db.prepare("SELECT tombstone FROM article_sources WHERE article_id='gone'").get().tombstone,1)
  assert.deepEqual(db.pragma('foreign_key_check'),[])
})
test('hashed credentials, independent scopes, rotation and revocation',/* 验证凭据哈希、独立权限与轮换撤销。 */ ()=>{
  const integration=service.createIntegration({name:'凭据测试'})
  const key=service.createKey(integration.id,{scopes:['articles:write']})
  const stored=db.prepare('SELECT * FROM integration_keys WHERE key_id=?').get(key.key_id)
  assert.ok(!JSON.stringify(stored).includes(key.key.split('.')[1]))
  const actor=service.authenticate('Bearer '+key.key)
  assert.throws(/* 尝试使用仅写权限执行发布。 */ ()=>service.verifyActor(actor,'articles:publish'),{status:403})
  assert.throws(/* 尝试在轮换时扩大凭据权限。 */ ()=>service.rotateKey(integration.id,key.key_id,{scopes:['articles:publish']}),{status:422})
  const next=service.rotateKey(integration.id,key.key_id)
  assert.equal(service.authenticate('Bearer '+next.key).integrationId,integration.id)
  assert.throws(/* 使用已轮换的旧凭据尝试认证。 */ ()=>service.authenticate('Bearer '+key.key),{status:401})
  db.prepare('UPDATE integrations SET enabled=0 WHERE id=?').run(integration.id)
  assert.throws(/* 使用已禁用集成的凭据尝试认证。 */ ()=>service.authenticate('Bearer '+next.key),{status:401})
})
test('default scopes empty, expiry bounded, flag denies authentication and issuance',/* 验证默认权限、有效期与功能开关边界。 */ ()=>{
  const i=service.createIntegration({name:'限额'})
  const key=service.createKey(i.id)
  assert.deepEqual(service.authenticate('Bearer '+key.key).scopes,[])
  for(const expires_in_days of [0,366,null])assert.throws(/* 尝试创建有效期越界的凭据。 */ ()=>service.createKey(i.id,{expires_in_days}),{status:422})
  process.env.PUBLISHING_API_ENABLED='false'
  assert.throws(/* 在发布功能关闭后尝试认证。 */ ()=>service.authenticate('Bearer '+key.key),{status:401})
  assert.throws(/* 在发布功能关闭后尝试签发凭据。 */ ()=>service.createKey(i.id),{status:404})
  process.env.PUBLISHING_API_ENABLED='true'
})
test('image decode, durable dedupe and orphan recovery preserve legacy files',/* 验证图片解码、持久去重及孤儿回收兼容性。 */ async()=>{
  const sharp=(await import('sharp')).default
  const media=await import('../server/services/mediaService.js')
  const i=service.createIntegration({name:'媒体'})
  const buffer=await sharp({create:{width:8,height:5,channels:3,background:'red'}}).png().toBuffer()
  const prepared=await media.prepareMedia({buffer,size:buffer.length,mimetype:'image/png'})
  const first=db.transaction(/* 在事务内首次登记媒体。 */ ()=>media.storeMedia({integrationId:i.id},prepared))()
  const second=db.transaction(/* 在事务内重复登记同一媒体。 */ ()=>media.storeMedia({integrationId:i.id},prepared))()
  assert.equal(first.id,second.id)
  await assert.rejects(media.prepareMedia({buffer,size:buffer.length,mimetype:'image/jpeg'}),{status:415})
  fs.writeFileSync(path.join(media.uploadDir,'legacy.jpg'),'keep')
  fs.writeFileSync(path.join(media.uploadDir,'publishing-dead.jpg'),'orphan')
  const report=media.cleanupPublishing(Date.now()+8*86400000)
  assert.equal(report.orphan_files_removed,2)
  assert.ok(fs.existsSync(path.join(media.uploadDir,'legacy.jpg')))
})
test('HTTP article lifecycle, ownership, idempotency and independent publish scope',/* 验证发布接口生命周期、归属及幂等权限边界。 */ async()=>{
  const express=(await import('express')).default
  const router=(await import('../server/routes/publishing.js')).default
  const app=express();app.use('/api/v1',router)
  const server=app.listen(0,'127.0.0.1');await new Promise(/* 等待发布测试服务开始监听。 */ r=>server.once('listening',r))
  const root=`http://127.0.0.1:${server.address().port}/api/v1`
  const i=service.createIntegration({name:'HTTP'}),key=service.createKey(i.id,{scopes:service.SCOPES})
  let n=0
  const request=/* 携带凭据与幂等头请求发布接口。 */ async(method,url,body,headers={},token=key.key)=>{
    const response=await fetch(root+url,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{}),...(!['GET'].includes(method)?{'Idempotency-Key':`request-${++n}`} :{}),...headers},body:body?JSON.stringify(body):undefined})
    return {status:response.status,body:await response.json(),etag:response.headers.get('etag'),replayed:response.headers.get('idempotency-replayed')}
  }
  try{
    assert.equal((await request('GET','/connection')).status,200)
    const headers={'If-None-Match':'*','Idempotency-Key':'create-original'}
    const first=await request('PUT','/articles/by-external-id/source',{title:' 标题 ',body_markdown:'# code\r\n\n',tags:['t']},headers)
    assert.equal(first.status,201,JSON.stringify(first.body))
    const id=first.body.data.id,tag=first.etag
    const replay=await request('PUT','/articles/by-external-id/source',{title:' 标题 ',body_markdown:'# code\r\n\n',tags:['t']},headers)
    assert.equal(replay.replayed,'true');assert.deepEqual(replay.body,first.body)
    assert.equal((await request('PUT','/articles/by-external-id/source',{title:'different',body_markdown:''},headers)).status,409)
    assert.equal((await request('PATCH',`/articles/${id}`,{title:'bad'})).status,428)
    assert.equal((await request('PATCH',`/articles/${id}`,{status:'published'},{'If-Match':tag})).status,422)
    const published=await request('POST',`/articles/${id}/publish`,undefined,{'If-Match':tag})
    assert.equal(published.status,200,JSON.stringify(published.body))
    const writeKey=service.createKey(i.id,{scopes:['articles:write']})
    const saved=await request('PATCH',`/articles/${id}`,{body_markdown:'private replacement'},{'If-Match':published.etag},writeKey.key)
    assert.equal(saved.status,200,JSON.stringify(saved.body))
    assert.equal(db.prepare('SELECT content FROM articles WHERE id=?').get(id).content,'# code\r\n\n')
    assert.equal((await request('POST',`/articles/${id}/publish`,undefined,{'If-Match':saved.etag},writeKey.key)).status,403)
    assert.equal((await request('PATCH',`/articles/${id}`,{title:'stale'},{'If-Match':tag})).status,412)
    const other=service.createIntegration({name:'其他'}),otherKey=service.createKey(other.id,{scopes:service.SCOPES})
    assert.equal((await request('GET',`/articles/${id}`,undefined,{},otherKey.key)).status,404)
    assert.equal((await request('GET','/articles?external_id=source')).body.data.length,1)
    assert.equal((await request('GET',`/articles/${id}`)).body.data.body_markdown,'private replacement')
    const publishOnly=service.createKey(i.id,{scopes:['articles:publish']})
    const republished=await request('POST',`/articles/${id}/publish`,undefined,{'If-Match':saved.etag},publishOnly.key)
    assert.equal(republished.status,200,JSON.stringify(republished.body))
    const unpublish=await request('POST',`/articles/${id}/unpublish`,undefined,{'If-Match':republished.etag},publishOnly.key)
    assert.equal(unpublish.status,200)
    db.prepare('DELETE FROM articles WHERE id=?').run(id)
    assert.equal((await request('PUT','/articles/by-external-id/source',{title:'resurrect',body_markdown:''},{'If-None-Match':'*'})).status,410)
    db.prepare('UPDATE integration_keys SET revoked_at=? WHERE key_id=?').run(Date.now(),key.key_id)
    assert.equal((await request('PUT','/articles/by-external-id/source',{title:' 标题 ',body_markdown:'# code\r\n\n',tags:['t']},headers)).status,401)
  }finally{await new Promise(/* 等待发布测试服务关闭。 */ r=>server.close(r))}
})
test('failed idempotency commit rolls back article, source and success audit together',/* 验证幂等提交失败时文章、来源与审计一同回滚。 */ async()=>{
  const {mutateArticle}=await import('../server/services/publishingService.js')
  const i=service.createIntegration({name:'原子性'}),key=service.createKey(i.id,{scopes:['articles:write']})
  const req={actor:service.authenticate('Bearer '+key.key),method:'PUT',path:'/articles/by-external-id/atomic',params:{externalId:'atomic'},route:{path:'/articles/by-external-id/:externalId'},body:{title:'rollback',body_markdown:'private'},requestId:'atomic-request',ip:'127.0.0.1',/* 提供原子性测试所需的幂等及创建条件头。 */ get(name){return {'Idempotency-Key':'atomic-first','If-None-Match':'*'}[name]}}
  const before=db.prepare('SELECT count(*) n FROM articles').get().n
  db.exec("CREATE TRIGGER fail_idempotency BEFORE INSERT ON publishing_idempotency BEGIN SELECT RAISE(ABORT,'injected failure'); END")
  try{assert.throws(/* 触发幂等记录写入故障。 */ ()=>mutateArticle(req,'put'),/injected failure/)}finally{db.exec('DROP TRIGGER fail_idempotency')}
  assert.equal(db.prepare('SELECT count(*) n FROM articles').get().n,before)
  assert.equal(db.prepare('SELECT count(*) n FROM article_sources WHERE integration_id=?').get(i.id).n,0)
  assert.equal(db.prepare('SELECT count(*) n FROM integration_audit WHERE integration_id=?').get(i.id).n,0)
  assert.equal(mutateArticle(req,'put').status,201)
})
test('replay checks current scope and tombstone; expired create key cannot duplicate',/* 验证重放重新检查权限、过期记录及墓碑。 */ async()=>{
  const {mutateArticle}=await import('../server/services/publishingService.js')
  const i=service.createIntegration({name:'重放生命周期'}),key=service.createKey(i.id,{scopes:['articles:write']})
  const req={actor:service.authenticate('Bearer '+key.key),method:'PUT',params:{externalId:'expiry'},route:{path:'/articles/by-external-id/:externalId'},body:{title:'test',body_markdown:''},requestId:'replay-test',/* 提供重放测试的固定幂等及创建条件头。 */ get(name){return {'Idempotency-Key':'expiry-first','If-None-Match':'*'}[name]}}
  const first=mutateArticle(req,'put')
  db.prepare('UPDATE integration_keys SET scopes=? WHERE key_id=?').run('[]',key.key_id)
  assert.throws(/* 尝试使用已撤销写权限的请求重放。 */ ()=>mutateArticle(req,'put'),{status:403})
  db.prepare('UPDATE integration_keys SET scopes=? WHERE key_id=?').run('["articles:write"]',key.key_id)
  db.prepare('UPDATE publishing_idempotency SET created_at=? WHERE integration_id=?').run(Date.now()-86400001,i.id)
  assert.throws(/* 尝试重放过期幂等记录的创建请求。 */ ()=>mutateArticle(req,'put'),{status:412})
  db.prepare('DELETE FROM articles WHERE id=?').run(first.body.data.id)
  assert.throws(/* 尝试重新创建已删除来源对应的文章。 */ ()=>mutateArticle(req,'put'),{status:410})
})
test('independent processes serialize source upsert and replay under writer contention',/* 验证多进程写入竞争下来源与重放串行化。 */ async()=>{
  const {fork}=await import('node:child_process')
  for(const sharedKey of [false,true]){
    const i=service.createIntegration({name:'进程竞争'}),key=service.createKey(i.id,{scopes:['articles:write']})
    const actor=service.authenticate('Bearer '+key.key)
    const workers=[0,1].map(/* 启动隔离的发布竞争子进程。 */ ()=>fork(new URL('./publishing-race-worker.js',import.meta.url),[],{env:{...process.env,BLOG_DATA_DIR:dir},stdio:['ignore','ignore','pipe','ipc']}))
    const waitFor=/* 等待子进程发出符合条件的消息。 */ (worker,predicate)=>new Promise(/* 注册消息及异常监听并设置超时。 */ (resolve,reject)=>{
      const timeout=setTimeout(/* 超时后移除监听并拒绝等待。 */ ()=>{cleanup();reject(new Error('worker timed out'))},10000)
      const onMessage=/* 收到匹配消息后清理监听并返回结果。 */ message=>{if(predicate(message)){cleanup();resolve(message)}}
      const onError=/* 收到子进程错误后清理并拒绝等待。 */ error=>{cleanup();reject(error)}
      /** 移除子进程监听器与超时计时器。 */
      function cleanup(){clearTimeout(timeout);worker.off('message',onMessage);worker.off('error',onError)}
      worker.on('message',onMessage);worker.on('error',onError)
    })
    try{
      await Promise.all(workers.map(/* 等待每个子进程准备完成。 */ w=>waitFor(w,/* 识别子进程就绪消息。 */ m=>m.ready)))
      const results=workers.map(/* 等待每个子进程的发布结果。 */ w=>waitFor(w,/* 识别含状态码的结果消息。 */ m=>m.status))
      const attempting=workers.map(/* 等待每个子进程开始尝试写入。 */ w=>waitFor(w,/* 识别开始写入消息。 */ m=>m.attempting))
      db.exec('BEGIN IMMEDIATE')
      try{
        workers.forEach(/* 向竞争子进程发送来源与幂等条件。 */ (w,index)=>w.send({actor,key:sharedKey?'same-request':`request-${index}`,externalId:'concurrent'}))
        await Promise.all(attempting)
        await new Promise(/* 短暂保持写锁以制造可重复竞争。 */ resolve=>setTimeout(resolve,100))
      }finally{db.exec('COMMIT')}
      const outcomes=await Promise.all(results)
      assert.deepEqual(outcomes.map(/* 提取竞争请求的响应状态。 */ r=>r.status).sort(),sharedKey?[201,201]:[201,412])
      if(sharedKey){assert.equal(outcomes[0].id,outcomes[1].id);assert.equal(outcomes.filter(/* 筛选发生幂等重放的竞争结果。 */ r=>r.replayed).length,1)}
      assert.equal(db.prepare('SELECT count(*) n FROM article_sources WHERE integration_id=?').get(i.id).n,1)
      assert.equal(db.prepare('SELECT count(*) n FROM articles a JOIN article_sources s ON s.article_id=a.id WHERE s.integration_id=?').get(i.id).n,1)
    }finally{for(const worker of workers)worker.kill()}
  }
})
test('cleanup rollback and all durable references protect registered and orphan files',/* 验证回收回滚及各类持久引用保护媒体。 */ async()=>{
  const media=await import('../server/services/mediaService.js')
  const sharp=(await import('sharp')).default
  const i=service.createIntegration({name:'回收安全'})
  const buffer=await sharp({create:{width:9,height:5,channels:3,background:'blue'}}).png().toBuffer()
  const prepared=await media.prepareMedia({buffer,size:buffer.length,mimetype:'image/png'})
  const item=db.transaction(/* 在事务内登记用于回收验证的媒体。 */ ()=>media.storeMedia({integrationId:i.id},prepared))()
  const filename=path.basename(item.url),target=path.join(media.uploadDir,filename)
  const future=Date.now()+8*86400000
  db.exec("CREATE TRIGGER fail_cleanup BEFORE DELETE ON integration_audit BEGIN SELECT RAISE(ABORT,'cleanup rollback'); END")
  try{assert.throws(/* 触发媒体回收事务的审计删除故障。 */ ()=>media.cleanupPublishing(Date.now()+100*86400000),/cleanup rollback/)}finally{db.exec('DROP TRIGGER fail_cleanup')}
  assert.ok(fs.existsSync(target));assert.ok(db.prepare('SELECT 1 FROM integration_media WHERE id=?').get(item.id))
  assert.throws(/* 尝试在外部事务内调用媒体回收。 */ ()=>db.transaction(/* 执行受独立事务约束的媒体回收。 */ ()=>media.cleanupPublishing(future))(),/独立事务/)
  const settings=path.join(dir,'settings.json')
  fs.writeFileSync(settings,JSON.stringify({background:{url:'https://blog.example'+item.url}}))
  media.cleanupPublishing(future)
  assert.ok(fs.existsSync(target));assert.ok(db.prepare('SELECT 1 FROM integration_media WHERE id=?').get(item.id))
  // A rolled-back registration or hand-written Markdown can still reference a URL.
  db.prepare('DELETE FROM integration_media WHERE id=?').run(item.id)
  media.cleanupPublishing(future);assert.ok(fs.existsSync(target))
  fs.writeFileSync(settings,'{}')
  const {createDraft,saveDraft,publish}=await import('../server/services/articleService.js')
  const admin={kind:'user',role:'admin'}
  const draft=createDraft({title:'orphan reference',content:`![](${item.url})`},admin)
  media.cleanupPublishing(future);assert.ok(fs.existsSync(target))
  const published=publish(draft.id,draft.revision,admin)
  saveDraft(draft.id,{content:'changed draft without image'},published.revision,admin)
  media.cleanupPublishing(future);assert.ok(fs.existsSync(target))
  db.prepare('DELETE FROM articles WHERE id=?').run(draft.id)
  media.cleanupPublishing(future);assert.ok(!fs.existsSync(target))
})
test('v1 rejects JSON over 2 MiB before the later global 10 MiB parser',/* 验证发布接口先于全局解析器拒绝超大 JSON。 */ async()=>{
  const express=(await import('express')).default
  const router=(await import('../server/routes/publishing.js')).default
  const app=express()
  app.use('/api/v1',router)
  app.use(express.json({limit:'10mb'}))
  const server=app.listen(0,'127.0.0.1');await new Promise(/* 等待监听成功并传播启动错误。 */ (resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)})
  const i=service.createIntegration({name:'JSON限额'}),key=service.createKey(i.id,{scopes:['articles:write']})
  try{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/articles/by-external-id/oversized`,{method:'PUT',headers:{Authorization:'Bearer '+key.key,'Content-Type':'application/json','Idempotency-Key':'oversize-request','If-None-Match':'*'},body:JSON.stringify({title:'too big',body_markdown:'x'.repeat(2*1024*1024)})})
    assert.equal(response.status,413)
    const body=await response.json()
    assert.equal(body.error.code,'PAYLOAD_TOO_LARGE')
    assert.equal(response.headers.get('x-request-id'),body.request_id)
    assert.equal(db.prepare('SELECT count(*) n FROM article_sources WHERE integration_id=?').get(i.id).n,0)
  }finally{await new Promise(/* 等待超大请求测试服务关闭。 */ resolve=>server.close(resolve))}
})

test('v1 category accepts only an existing positive integer or null', /* 验证分类编号严格遵守整数协议而非 SQLite 隐式转换。 */ async () => {
  const { normalize } = await import('../server/services/publishingService.js')
  const category = Number(db.prepare("INSERT INTO categories(name,slug,created_at) VALUES('严格分类校验','strict-category-validation',1)").run().lastInsertRowid)
  const actor = { integrationId: 'category-validation-only' }
  for (const value of [String(category), category + 0.5, true, {}, 0, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(/* 拒绝类型错误或越界编号，避免分类被隐式接受。 */ () => normalize({ category: value }, false, 'category-test', actor), { status: 422 })
  }
  assert.equal(normalize({ category }, false, 'category-test', actor).category_id, category)
  assert.equal(normalize({ category: null }, false, 'category-test', actor).category_id, null)
})
