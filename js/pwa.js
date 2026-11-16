let registration=null,failed=false;

export async function registerPwa(){
 if(!isSecureContext||!('serviceWorker' in navigator))return;
 try{
  // Relative URLs keep this app inside its GitHub Pages project, including local previews.
  registration=await navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{scope:new URL('../',import.meta.url).href,updateViaCache:'none'});
  const watch=()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='redundant'&&!registration.active)failed=true;});};
  watch();registration.addEventListener('updatefound',watch);
 }catch(error){failed=true;console.warn('離線資料尚未備妥：',error);}
}

export function offlineStatus(){
 if(!isSecureContext)return '需使用 HTTPS 或本機預覽';
 if(!('serviceWorker' in navigator))return '此瀏覽器不支援離線使用';
 if(registration?.waiting)return '可離線使用；關閉所有分頁後套用更新';
 if(registration?.active)return navigator.serviceWorker.controller?'可離線使用':'資料已備妥，重新開啟後可離線使用';
 return failed?'準備失敗，請連線後重新開啟':'正在準備離線資料…';
}
