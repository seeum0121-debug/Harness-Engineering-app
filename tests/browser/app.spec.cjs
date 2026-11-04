const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const shots=path.resolve(__dirname,'../../.work/screenshots');
test.beforeAll(()=>fs.mkdirSync(shots,{recursive:true}));
async function currentQuestion(page){const id=await page.locator('[data-question-id]').getAttribute('data-question-id');return page.evaluate(id=>window.PHARM_DATA.questions.find(q=>q.id===id),id);}
async function choose(page,q,wrong=false){
  if(q.type==='match'){
    await page.locator(`[data-kind="moa"][data-value="${q.moa.answer}"]`).click();
    await page.locator(`[data-kind="use"][data-value="${wrong?(q.use.answer+1)%4:q.use.answer}"]`).click();
  }else await page.locator(`[data-kind="ab"][data-value="${wrong?(q.answer+1)%4:q.answer}"]`).click();
  await page.getByRole('button',{name:'정답 확인하기'}).click();
}
async function seededSession(page,type,answer=null){
  await page.evaluate(({type,answer})=>{
    const D=window.PHARM_DATA,E=window.PharmEngine;
    const q=D.questions.find(q=>q.type===type&&(answer===null||q.answer===answer));
    const state=E.emptyState();state.session=E.createSession(D,{questionIds:[q.id],count:1});
    localStorage.setItem('pharmnote:v1',JSON.stringify(state));
  },{type,answer});
  await page.goto('/#quiz');await page.reload();
  return currentQuestion(page);
}
test('desktop: matching quiz, reload, score, wrong-note retry, and reference',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:'오늘도, 하나씩 연결해요'})).toBeVisible();
  await page.screenshot({path:path.join(shots,'desktop-home.png'),fullPage:true});
  await page.getByRole('button',{name:'약물·MOA·용도 매칭',exact:false}).click();
  await page.getByRole('button',{name:'퀴즈 시작하기'}).click();
  await expect(page.locator('#submit-button')).toBeDisabled();
  let q=await currentQuestion(page);await page.locator(`[data-kind="moa"][data-value="${q.moa.answer}"]`).click();
  await expect(page.locator('#submit-button')).toBeDisabled();
  await page.locator(`[data-kind="use"][data-value="${(q.use.answer+1)%4}"]`).click();
  await page.screenshot({path:path.join(shots,'desktop-matching.png'),fullPage:true});
  await page.getByRole('button',{name:'정답 확인하기'}).click();
  await expect(page.locator('.feedback')).toContainText('한 번 더');
  const before=await page.locator('[data-question-id]').getAttribute('data-question-id');
  await page.reload();await expect(page.locator('[data-question-id]')).toHaveAttribute('data-question-id',before);
  await expect(page.locator('.feedback')).toBeVisible();
  await page.locator('.source-ref').click();await expect(page.getByRole('dialog')).toContainText('PDF');await page.getByRole('button',{name:'닫기',exact:true}).click();
  await page.getByRole('button',{name:'다음 문제'}).click();
  for(let i=1;i<10;i++){q=await currentQuestion(page);await choose(page,q);await page.getByRole('button',{name:i===9?'결과 보기':'다음 문제'}).click();}
  await expect(page.locator('.result-score')).toContainText('90');
  await page.screenshot({path:path.join(shots,'desktop-results.png'),fullPage:true});
  await page.getByRole('button',{name:'1개 오답 다시 풀기'}).click();
  q=await currentQuestion(page);await choose(page,q);await page.getByRole('button',{name:'결과 보기'}).click();
  await page.getByRole('link',{name:'오답노트'}).click();await expect(page.getByRole('heading',{name:'복습할 오답이 없어요'})).toBeVisible();
  expect(errors).toEqual([]);
});
test('all four A/B combinations preserve exact option numbering and keyboard grading',async({page})=>{
  await page.goto('/');
  for(let answer=0;answer<4;answer++){
    const q=await seededSession(page,'ab',answer);
    const labels=['A만 정답','B만 정답','모두 정답','정답 없음'];
    for(let i=0;i<4;i++)await expect(page.locator(`[data-kind="ab"][data-value="${i}"]`)).toContainText(`${i+1}${labels[i]}`);
    if(answer===0)await page.screenshot({path:path.join(shots,'desktop-ab.png'),fullPage:true});
    await page.keyboard.press(String(q.answer+1));await page.keyboard.press('Enter');
    await expect(page.locator('.feedback')).toContainText('정확하게 연결했어요');
    await page.getByRole('button',{name:'결과 보기'}).click();await expect(page.locator('.result-score')).toContainText('100');
  }
});
test('library search, bookmarks, chapter filters, backup export/import and invalid input',async({page})=>{
  await page.goto('/#library');await page.getByRole('searchbox').fill('Rocuronium');
  const rocuronium=page.locator('.drug-card').filter({has:page.getByRole('heading',{name:'Rocuronium',exact:true})});
  await expect(rocuronium).toHaveCount(1);
  await rocuronium.getByRole('button',{name:'약물 저장',exact:true}).click();
  await page.getByRole('searchbox').fill('');await page.getByRole('button',{name:'저장한 약물',exact:true}).click();
  await expect(page.locator('.drug-card')).toHaveCount(1);
  await page.reload();await page.getByRole('button',{name:'저장한 약물',exact:true}).click();
  await expect(page.locator('.drug-card')).toHaveCount(1);
  await page.locator('.drug-card summary').click();await expect(page.locator('.drug-fact').first()).toBeVisible();
  await page.getByRole('link',{name:'자료·기록',exact:true}).first().click();
  const dlPromise=page.waitForEvent('download');await page.getByRole('button',{name:'학습 기록 내보내기'}).click();
  const dl=await dlPromise;const file=path.join(shots,'test-backup.json');await dl.saveAs(file);
  const original=await page.evaluate(()=>localStorage.getItem('pharmnote:v1'));
  await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{bad json')});
  await expect(page.locator('#toast')).toContainText('올바른 약리노트 백업');
  expect(await page.evaluate(()=>localStorage.getItem('pharmnote:v1'))).toEqual(original);
  await page.getByRole('button',{name:'학습 기록 초기화'}).click();await page.getByRole('button',{name:'초기화',exact:true}).click();
  await page.locator('#import-file').setInputFiles(file);await page.getByRole('button',{name:'가져오기',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pharmnote:v1')).bookmarks.length)).toEqual(1);
});
test('mobile: no overflow, matching and A/B usable at 390px and 320px',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const noOverflow=async()=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await noOverflow();await page.screenshot({path:path.join(shots,'mobile-home.png'),fullPage:true});
  let q=await seededSession(page,'match');await noOverflow();await choose(page,q);await expect(page.locator('.feedback')).toContainText('정확하게 연결했어요');
  await page.screenshot({path:path.join(shots,'mobile-matching.png'),fullPage:true});
  await page.getByRole('button',{name:'결과 보기'}).click();
  q=await seededSession(page,'ab');await noOverflow();await page.screenshot({path:path.join(shots,'mobile-ab.png'),fullPage:true});
  await choose(page,q);await page.getByRole('button',{name:'결과 보기'}).click();
  await page.setViewportSize({width:320,height:700});await page.goto('/#home');await noOverflow();
  await page.getByRole('link',{name:'약물 카드',exact:true}).click();await noOverflow();
});
test('chapter scope, empty selection, pause/resume and new-session confirmation',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Ch.10–11',exact:true}).click();
  await page.locator('#chapter-details summary').click();
  await page.locator('[data-chapter="10"]').uncheck();await page.locator('[data-chapter="11"]').uncheck();
  await expect(page.getByRole('button',{name:'퀴즈 시작하기'})).toBeDisabled();
  await page.locator('[data-chapter="10"]').check();await page.getByRole('button',{name:'퀴즈 시작하기'}).click();
  const q=await currentQuestion(page);expect(q.chapter).toBe(10);
  await page.getByRole('button',{name:'학습 홈',exact:false}).click();await expect(page.getByRole('button',{name:'이어서 풀기'})).toBeVisible();
  await page.getByRole('button',{name:'퀴즈 시작하기'}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'취소',exact:true}).click();await page.getByRole('button',{name:'이어서 풀기'}).click();
  expect((await currentQuestion(page)).id).toEqual(q.id);
});
test('downloaded app works directly from index.html without a web server',async({page})=>{
  const url=require('node:url').pathToFileURL(path.resolve(__dirname,'../../dist/index.html')).href;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await expect(page.getByRole('heading',{name:'오늘도, 하나씩 연결해요'})).toBeVisible();
  await page.getByRole('button',{name:'A/B 설명 판정',exact:false}).click();
  await page.getByRole('button',{name:'퀴즈 시작하기'}).click();
  const q=await currentQuestion(page);await choose(page,q);await expect(page.locator('.feedback')).toContainText('정확하게 연결했어요');
  expect(errors).toEqual([]);
});
test('storage-disabled browser still permits a complete answer with a visible notice',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage blocked');}});});
  await page.goto('/');await expect(page.locator('.storage-warning')).toBeVisible();
  await page.getByRole('button',{name:'퀴즈 시작하기'}).click();
  const q=await currentQuestion(page);await choose(page,q);await expect(page.locator('.feedback')).toContainText('정확하게 연결했어요');
});
