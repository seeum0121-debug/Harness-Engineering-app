(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PharmEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const AB_LABELS = ['A만 정답', 'B만 정답', '모두 정답', '정답 없음'];
  const emptyState = () => ({version:1, progress:{}, bookmarks:[], history:[], session:null});
  function shuffle(array, rng = Math.random) {
    const out = [...array];
    for (let i=out.length-1;i>0;i--) { const j=Math.floor(rng()*(i+1)); [out[i],out[j]]=[out[j],out[i]]; }
    return out;
  }
  function pool(bank, {chapters=[],type='all',questionIds=null}={}) {
    return bank.questions.filter(q => (!chapters.length || chapters.includes(q.chapter)) &&
      (type==='all' || q.type===type) && (!questionIds || questionIds.includes(q.id)));
  }
  function createSession(bank, settings={}, rng=Math.random, now=Date.now()) {
    const selected = shuffle(pool(bank,settings),rng).slice(0,settings.count === 'all' ? undefined : Number(settings.count||10));
    if (!selected.length) return null;
    return {id:String(now)+'-'+Math.floor(rng()*1e8),startedAt:now,completedAt:null,index:0,
      title:settings.title || '맞춤 퀴즈',type:settings.type||'all',
      items:selected.map(q => ({questionId:q.id,moaOrder:shuffle([0,1,2,3],rng),useOrder:shuffle([0,1,2,3],rng),selection:null,correct:null})),
      streak:0,bestStreak:0};
  }
  function isCorrect(question, selection) {
    if (question.type==='match') return selection?.moa===question.moa.answer && selection?.use===question.use.answer;
    return selection?.ab===question.answer;
  }
  function validSelection(question, selection) {
    const valid = x => Number.isInteger(x) && x >= 0 && x < 4;
    return !!selection && (question.type==='match' ? valid(selection.moa)&&valid(selection.use) : valid(selection.ab));
  }
  function answer(state, bank, selection, now=Date.now()) {
    const s=state.session;
    if (!s || s.completedAt) return false;
    const item=s.items[s.index], question=bank.questions.find(q=>q.id===item.questionId);
    if (!question || item.selection!==null || !validSelection(question,selection)) return false;
    item.selection={...selection}; item.correct=isCorrect(question,selection);
    s.streak=item.correct?s.streak+1:0; s.bestStreak=Math.max(s.streak,s.bestStreak);
    const old=state.progress[question.id] || {attempts:0,correct:0,lastCorrect:false,lastAt:0};
    state.progress[question.id]={attempts:old.attempts+1,correct:old.correct+(item.correct?1:0),lastCorrect:item.correct,lastAt:now};
    return true;
  }
  function next(state, now=Date.now()) {
    const s=state.session;
    if (!s || s.completedAt || s.items[s.index].selection===null) return false;
    if (s.index<s.items.length-1) s.index++;
    else {
      s.completedAt=now;
      state.history.unshift({id:s.id,at:now,total:s.items.length,correct:s.items.filter(i=>i.correct).length,bestStreak:s.bestStreak,title:s.title});
      state.history=state.history.slice(0,30);
    }
    return true;
  }
  function wrongIds(state) { return Object.keys(state.progress).filter(id=>!state.progress[id].lastCorrect); }
  function stats(state, bank) {
    const values=Object.values(state.progress), attempts=values.reduce((sum,p)=>sum+p.attempts,0), correct=values.reduce((sum,p)=>sum+p.correct,0);
    return {answered:values.length,total:bank.questions.length,attempts,correct,accuracy:attempts?Math.round(correct/attempts*100):0,wrong:wrongIds(state).length};
  }
  // Restore only known IDs and well-formed data; never trust a backup or localStorage.
  function restore(input, bank) {
    if (!input || typeof input!=='object' || input.version!==1) throw new Error('지원하지 않는 학습 기록 파일입니다.');
    const out=emptyState(), questions=new Map(bank.questions.map(q=>[q.id,q])), cardIds=new Set(bank.cards.map(c=>c.id));
    if (input.progress && typeof input.progress==='object' && !Array.isArray(input.progress)) {
      for (const [id,p] of Object.entries(input.progress)) {
        if (questions.has(id) && p && Number.isSafeInteger(p.attempts) && p.attempts>0 && Number.isSafeInteger(p.correct) && p.correct>=0 && p.correct<=p.attempts && typeof p.lastCorrect==='boolean' && Number.isFinite(p.lastAt)) {
          out.progress[id]={attempts:p.attempts,correct:p.correct,lastCorrect:p.lastCorrect,lastAt:p.lastAt};
        }
      }
    }
    out.bookmarks=[...new Set((Array.isArray(input.bookmarks)?input.bookmarks:[]).filter(id=>cardIds.has(id)))];
    out.history=(Array.isArray(input.history)?input.history:[]).filter(h=>h && typeof h.id==='string' && Number.isFinite(h.at) && Number.isSafeInteger(h.total) && h.total>0 && h.total<=bank.questions.length && Number.isSafeInteger(h.correct) && h.correct>=0 && h.correct<=h.total && Number.isSafeInteger(h.bestStreak) && h.bestStreak>=0 && h.bestStreak<=h.total && typeof h.title==='string').slice(0,30).map(h=>({id:h.id,at:h.at,total:h.total,correct:h.correct,bestStreak:h.bestStreak,title:h.title.slice(0,100)}));
    const s=input.session;
    const orderOK=a=>Array.isArray(a)&&a.length===4&&new Set(a).size===4&&a.every(n=>Number.isInteger(n)&&n>=0&&n<4);
    if (s && typeof s.id==='string' && Number.isFinite(s.startedAt) && (s.completedAt===null || Number.isFinite(s.completedAt)) && Array.isArray(s.items) && s.items.length>0 && s.items.length<=questions.size && new Set(s.items.map(i=>i?.questionId)).size===s.items.length && Number.isInteger(s.index) && s.index>=0 && s.index<s.items.length && s.items.every((i,n)=> i && questions.has(i.questionId) && orderOK(i.moaOrder) && orderOK(i.useOrder) && (i.selection===null || validSelection(questions.get(i.questionId),i.selection)) && (n>=s.index || i.selection!==null) && (n<=s.index || i.selection===null)) && (!s.completedAt || (s.index===s.items.length-1 && s.items.every(i=>i.selection!==null)))) {
      let streak=0,bestStreak=0;
      const items=s.items.map(i=>{
        const q=questions.get(i.questionId), selection=i.selection===null?null:q.type==='match'?{moa:i.selection.moa,use:i.selection.use}:{ab:i.selection.ab};
        const correct=selection===null?null:isCorrect(q,selection);
        if(selection!==null){streak=correct?streak+1:0;bestStreak=Math.max(bestStreak,streak);}
        return {questionId:i.questionId,moaOrder:i.moaOrder,useOrder:i.useOrder,selection,correct};
      });
      out.session={id:s.id,startedAt:s.startedAt,completedAt:s.completedAt,index:s.index,title:typeof s.title==='string'?s.title.slice(0,100):'맞춤 퀴즈',type:['match','ab','all'].includes(s.type)?s.type:'all',items,streak,bestStreak};
    }
    return out;
  }
  return {AB_LABELS,emptyState,shuffle,pool,createSession,isCorrect,validSelection,answer,next,wrongIds,stats,restore};
});
