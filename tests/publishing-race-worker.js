// Test fixture: parent supplies an already migrated disposable BLOG_DATA_DIR.
import db from '../server/db/index.js'
import {mutateArticle} from '../server/services/publishingService.js'
process.send({ready:true})
process.on('message',/* 接收父进程的竞争写入参数并回传发布结果。 */ ({actor,key,externalId})=>{
  const req={actor,method:'PUT',params:{externalId},route:{path:'/articles/by-external-id/:externalId'},body:{title:'race',body_markdown:'content'},requestId:`worker-${process.pid}`,/* 返回竞争请求的幂等键及首次创建条件头。 */ get(name){return {'Idempotency-Key':key,'If-None-Match':'*'}[name]}}
  process.send({attempting:true})
  try{const result=mutateArticle(req,'put');process.send({status:result.status,replayed:!!result.replayed,id:result.body.data.id})}
  catch(error){process.send({status:error.status||500,code:error.code})}
  db.close();process.disconnect()
})
