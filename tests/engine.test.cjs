const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const E=require('../dist/engine.js');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname,'../dist/data/question-bank.js'),'utf8'),sandbox);
const D=JSON.parse(JSON.stringify(sandbox.window.PHARM_DATA));
const rng=()=>0.42;
test('all 17 chapters and 6 documents contribute both requested quiz types',()=>{
  assert.equal(D.chapters.length,17);assert.equal(D.sources.length,6);
  assert.equal(D.questions.length,D.cards.length*2);
  for(const ch of D.chapters){assert(D.cards.some(c=>c.chapter===ch.id));}
  for(const c of D.cards){const qs=D.questions.filter(q=>q.cardId===c.id);assert.equal(qs.length,2);assert.deepEqual(qs.map(q=>q.type).sort(),['ab','match']);}
});
test('matching requires BOTH a correct MOA and use, for every authored question',()=>{
  for(const q of D.questions.filter(q=>q.type==='match')){
    assert(E.isCorrect(q,{moa:q.moa.answer,use:q.use.answer}));
    for(let i=0;i<4;i++){
      assert.equal(E.isCorrect(q,{moa:i,use:q.use.answer}),i===q.moa.answer);
      assert.equal(E.isCorrect(q,{moa:q.moa.answer,use:i}),i===q.use.answer);
    }
    assert(!E.validSelection(q,{moa:q.moa.answer}));
  }
});
test('A/B uses exact requested truth table; all four answers are represented',()=>{
  assert.deepEqual(E.AB_LABELS,['A만 정답','B만 정답','모두 정답','정답 없음']);
  const patterns=new Set();
  for(const q of D.questions.filter(q=>q.type==='ab')){
    const expected=q.truth[0]?(q.truth[1]?2:0):(q.truth[1]?1:3);
    assert.equal(q.answer,expected);patterns.add(expected);
    for(let i=0;i<4;i++)assert.equal(E.isCorrect(q,{ab:i}),i===expected);
  }
  assert.equal(patterns.size,4);
});
test('chapter/type filters, count cap, unique questions and shuffled options',()=>{
  const s=E.createSession(D,{chapters:[10],type:'match',count:30},rng);
  assert(s.items.length>0&&s.items.length<30);
  assert.equal(new Set(s.items.map(i=>i.questionId)).size,s.items.length);
  for(const item of s.items){const q=D.questions.find(q=>q.id===item.questionId);assert.equal(q.chapter,10);assert.equal(q.type,'match');assert.deepEqual([...item.moaOrder].sort(),[0,1,2,3]);}
  assert.equal(E.createSession(D,{chapters:[99]},rng),null);
  assert.equal(E.createSession(D,{questionIds:[]},rng),null);
});
test('double submission does not rescore; wrong answers clear only after correct retry',()=>{
  const q=D.questions.find(q=>q.type==='ab'), state=E.emptyState();
  state.session=E.createSession(D,{questionIds:[q.id],count:1},rng,1000);
  assert(E.answer(state,D,{ab:(q.answer+1)%4},2000));
  assert(!E.answer(state,D,{ab:q.answer},2001));
  assert.equal(state.progress[q.id].attempts,1);assert.deepEqual(E.wrongIds(state),[q.id]);
  assert(E.next(state,3000));assert(!E.next(state,3001));assert.equal(state.history.length,1);
  state.session=E.createSession(D,{questionIds:E.wrongIds(state),count:'all'},rng,4000);
  E.answer(state,D,{ab:q.answer},5000);E.next(state,6000);
  assert.equal(E.wrongIds(state).length,0);assert.equal(state.progress[q.id].attempts,2);assert.equal(E.stats(state,D).accuracy,50);
});
test('mid-session reload preserves option ordering, submitted answers and progress',()=>{
  const state=E.emptyState();state.session=E.createSession(D,{type:'match',count:3},rng,1000);
  const q=D.questions.find(q=>q.id===state.session.items[0].questionId);
  E.answer(state,D,{moa:q.moa.answer,use:q.use.answer},1500);
  const restored=E.restore(JSON.parse(JSON.stringify(state)),D);
  assert.deepEqual(restored,state);assert(!E.answer(restored,D,{moa:q.moa.answer,use:q.use.answer}));
  E.next(restored,2000);assert.equal(restored.session.index,1);
});
test('restore rejects invalid versions and sanitizes unknown or malicious state',()=>{
  assert.throws(()=>E.restore({version:99},D));assert.throws(()=>E.restore(null,D));
  const state=E.emptyState();state.progress.unknown={attempts:1,correct:1,lastCorrect:true,lastAt:1};
  state.bookmarks=['not-a-card',D.cards[0].id,D.cards[0].id];
  state.history=[{id:'bad',total:-1,correct:3}];
  state.session={items:[{questionId:'missing'}]};
  const restored=E.restore(state,D);
  assert.deepEqual(restored.progress,{});assert.equal(restored.bookmarks.length,1);assert.equal(restored.session,null);assert.equal(restored.history.length,0);
});
test('completion score/history survives restore without counting unfinished questions',()=>{
  const state=E.emptyState();state.session=E.createSession(D,{type:'ab',count:3},rng,1000);
  assert(!E.next(state));
  for(let i=0;i<3;i++){const q=D.questions.find(q=>q.id===state.session.items[i].questionId);E.answer(state,D,{ab:i===1?(q.answer+1)%4:q.answer},2000+i);E.next(state,3000+i);}
  assert.equal(state.history[0].correct,2);assert.equal(state.history[0].bestStreak,1);
  assert.deepEqual(E.restore(JSON.parse(JSON.stringify(state)),D),state);
});
