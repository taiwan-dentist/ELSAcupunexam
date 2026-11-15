export function parseScope(text,data){
 if(typeof text!=='string'||text.length>1000000)throw new Error('檔案超過 1 MB，請選擇範圍 JSON。');
 let value;try{value=JSON.parse(text);}catch{throw new Error('無法讀取 JSON，請確認檔案內容。');}
 if(!value||Array.isArray(value)||value.schema!=='acupoint-quiz-scope'||value.version!==1)throw new Error('檔案不是支援的穴位範圍格式（版本 1）。');
 if(typeof value.dataVersion!=='string'||![10,20].includes(value.questionCount)||!Array.isArray(value.selectedPointIds)||value.selectedPointIds.length>5000||value.selectedPointIds.some(id=>typeof id!=='string'||id.length>100))throw new Error('範圍資料欄位不正確，原有選取已保留。');
 const points=new Map(data.points.map(p=>[p.id,p])),selectedPointIds=[];let unknown=0,excluded=0;
 for(const id of new Set(value.selectedPointIds)){const point=points.get(id);if(!point){unknown++;continue;}if(!point.quizEligible){excluded++;continue;}selectedPointIds.push(id);}
 return {selectedPointIds,questionCount:value.questionCount,unknown,excluded,versionMismatch:value.dataVersion!==data.dataVersion};
}
export function serializeScope(config,dataVersion){return JSON.stringify({schema:'acupoint-quiz-scope',version:1,dataVersion,selectedPointIds:[...new Set(config.selectedPointIds)],questionCount:config.questionCount},null,2)+'\n';}
export function scopeFilename(date=new Date()){const n=v=>String(v).padStart(2,'0');return `acupoint-scope-${date.getFullYear()}${n(date.getMonth()+1)}${n(date.getDate())}.json`;}
