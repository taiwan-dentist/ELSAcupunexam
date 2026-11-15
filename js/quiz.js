export const MAX_ATTEMPTS=3;
export function normalizeAnswer(value){return String(value).normalize('NFKC').replace(/\s/gu,'');}
export function matchesName(point,value){const answer=normalizeAnswer(value);return answer.length>0&&[point.name,...point.variants].some(name=>normalizeAnswer(name)===answer);}
export function shuffled(items,rng=Math.random){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
export function createExam(config,data,rng=Math.random){
 if(!['name','location'].includes(config.mode)||![10,20].includes(config.questionCount))throw new Error('測驗設定不正確。');
 const eligible=new Set(data.points.filter(p=>p.quizEligible).map(p=>p.id));
 const scopeIds=[...new Set(config.selectedPointIds)].filter(id=>eligible.has(id));
 if(!scopeIds.length)throw new Error('請至少選擇一個可出題穴位。');
 const order=shuffled(scopeIds,rng).slice(0,config.questionCount);
 return {version:1,dataVersion:data.dataVersion,mode:config.mode,questionCount:config.questionCount,scopeIds,order,index:0,status:'active',responses:order.map(id=>({id,attempts:[],resolved:false,correct:false}))};
}
export function answerExam(exam,value,points){
 if(exam.status!=='active')return exam;
 const current=exam.responses[exam.index];if(current.resolved)return exam;
 const input=String(value);if(!normalizeAnswer(input)||input.length>64)return exam;
 if(exam.mode==='location'&&!points.get(input)?.quizEligible)return exam;
 const correct=exam.mode==='name'?matchesName(points.get(current.id),input):input===current.id;
 const next=structuredClone(exam),response=next.responses[next.index];
 response.attempts.push({value:input,correct});response.correct=correct;response.resolved=correct||response.attempts.length>=MAX_ATTEMPTS;
 return next;
}
export function nextQuestion(exam){
 if(exam.status!=='active'||!exam.responses[exam.index]?.resolved)return exam;
 const next=structuredClone(exam);next.index++;if(next.index===next.order.length)next.status='complete';return next;
}
export function examResult(exam,points){
 const correct=exam.responses.filter(r=>r.correct).length;
 const wrong=[...new Set(exam.responses.filter(r=>r.resolved&&!r.correct).map(r=>points.get(r.id).name))];
 return {correct,total:exam.order.length,score:Math.round(correct/exam.order.length*100),wrong};
}
export function restoreExam(serialized,data){
 try{
  if(typeof serialized!=='string'||serialized.length>100000)return null;
  const value=JSON.parse(serialized),eligible=new Map(data.points.filter(p=>p.quizEligible).map(p=>[p.id,p]));
  if(value.version!==1||value.dataVersion!==data.dataVersion||value.status!=='active'||!['name','location'].includes(value.mode)||![10,20].includes(value.questionCount))return null;
  if(!Array.isArray(value.scopeIds)||value.scopeIds.length>396||!value.scopeIds.length||new Set(value.scopeIds).size!==value.scopeIds.length||value.scopeIds.some(id=>!eligible.has(id)))return null;
  if(!Array.isArray(value.order)||value.order.length!==Math.min(value.questionCount,value.scopeIds.length)||new Set(value.order).size!==value.order.length||value.order.some(id=>!value.scopeIds.includes(id)))return null;
  if(!Number.isInteger(value.index)||value.index<0||value.index>=value.order.length||!Array.isArray(value.responses)||value.responses.length!==value.order.length)return null;
  let restored={version:1,dataVersion:data.dataVersion,mode:value.mode,questionCount:value.questionCount,scopeIds:[...value.scopeIds],order:[...value.order],index:0,status:'active',responses:value.order.map(id=>({id,attempts:[],resolved:false,correct:false}))};
  for(let i=0;i<value.order.length;i++){
   const row=value.responses[i];if(!row||row.id!==value.order[i]||!Array.isArray(row.attempts)||row.attempts.length>3||(i>value.index&&row.attempts.length))return null;
   if(i>value.index)continue;
   for(const attempt of row.attempts){
    if(typeof attempt?.value!=='string'||restored.responses[i].resolved)return null;
    const next=answerExam(restored,attempt.value,eligible);if(next===restored)return null;restored=next;
   }
   if(i<value.index){if(!restored.responses[i].resolved)return null;restored=nextQuestion(restored);}
  }
  if(restored.index!==value.index)return null;return restored;
 }catch{return null;}
}
