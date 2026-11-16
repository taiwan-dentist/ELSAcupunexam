import {normalizeAnswer} from './quiz.js';

const searchKey=value=>normalizeAnswer(value).toLocaleLowerCase('zh-TW');

// Search only reviewed, selectable markers. Ranking keeps exact names and codes first.
export function searchOverviewPoints(points,query='',meridianCode=''){
 const key=searchKey(query),codeKey=key.replace(/[-_]/gu,'');
 return points.filter(point=>point.quizEligible&&(!meridianCode||point.meridianCode===meridianCode)).map((point,index)=>{
  const names=[point.name,...point.variants].map(searchKey),code=searchKey(point.id).replace(/[-_]/gu,'');
  const rank=!key?0:names.includes(key)||code===codeKey?0:names.some(name=>name.startsWith(key))||code.startsWith(codeKey)?1:names.some(name=>name.includes(key))||code.includes(codeKey)?2:Infinity;
  return {point,index,rank};
 }).filter(row=>Number.isFinite(row.rank)).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(row=>row.point);
}
