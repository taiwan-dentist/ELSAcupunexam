// The canvas stays mounted. Native snapshots animate only opacity and transforms.
export function createPageTransition(doc,reducedMotion){
 let sequence=0,active=null;
 return async function transitionPage(from,to,update,{animate=true}={}){
  const request=++sequence;
  active?.skipTransition();active=null;
  const pair=(from==='home'&&to==='overview')||(from==='overview'&&to==='home');
  if(!animate||!pair||reducedMotion()||typeof doc.startViewTransition!=='function'){
   delete doc.documentElement.dataset.pageTransition;update();return;
  }
  doc.documentElement.dataset.pageTransition=to==='overview'?'overview':'home';
  let committed=false,transition;
  const commit=()=>{if(request===sequence){committed=true;update();}};
  try{
   transition=doc.startViewTransition(commit);active=transition;
   transition.ready.catch(()=>{});
   await transition.updateCallbackDone;
   await transition.finished;
  }catch{
   if(!committed&&request===sequence)commit();
  }finally{
   if(request===sequence){active=null;delete doc.documentElement.dataset.pageTransition;}
  }
 };
}
