// --------- Tab router ----------
document.querySelectorAll('.tab').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('show'));
    document.getElementById(btn.dataset.tab).classList.add('show');
    if(btn.dataset.tab==='insights') renderInsights();
  };
});

// --------- Theme / Font ----------
const themeBtn = document.getElementById('themeToggle');
const fontBtn = document.getElementById('fontToggle');
const savedTheme = localStorage.getItem('theme') || 'light';
const savedFont = localStorage.getItem('font') || 'normal';
document.documentElement.setAttribute('data-theme', savedTheme);
if(savedFont==='large') document.documentElement.setAttribute('data-font','large');
themeBtn.textContent = savedTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
themeBtn.setAttribute('aria-pressed', savedTheme==='dark');
themeBtn.onclick = ()=>{
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  themeBtn.textContent = next === 'dark' ? '☀️ Light' : '🌙 Dark';
  themeBtn.setAttribute('aria-pressed', next==='dark');
};
fontBtn.setAttribute('aria-pressed', savedFont==='large');
fontBtn.onclick=()=>{
  const cur = document.documentElement.getAttribute('data-font') || 'normal';
  const next = cur === 'large' ? 'normal' : 'large';
  if(next==='large') document.documentElement.setAttribute('data-font','large');
  else document.documentElement.removeAttribute('data-font');
  localStorage.setItem('font', next);
  fontBtn.setAttribute('aria-pressed', next==='large');
};

// --------- Helpers ----------
const todayISO = ()=>new Date().toISOString().slice(0,10);
const last = (arr)=> (Array.isArray(arr) && arr.length ? arr[arr.length-1] : null);

// --------- State ----------
const defaults = { waterTarget: 2000, hideZeroDays: false };
const state = {
  foods: [],
  today: todayISO(),
  settings: JSON.parse(localStorage.getItem('settings')||'{}'),
  logs: JSON.parse(localStorage.getItem('logs')||'{}'), // { [date]: { meals:[], waterEntries:[], mood:'', wellness:[], workouts:[] } }
  focusHistory: JSON.parse(localStorage.getItem('focusHistory')||'[]'),
  macroStats: JSON.parse(localStorage.getItem('macroStats')||'{"rounds":[],"bestAcc":null,"totalCorrect":0,"totalAttempts":0}'),
  echoes: JSON.parse(localStorage.getItem('echoes')||'{"history":[]}')
};
state.settings = { ...defaults, ...state.settings };
// migrate & guards
for(const d of Object.keys(state.logs)){
  const v = state.logs[d];
  if(v && typeof v.water_ml === 'number' && !Array.isArray(v.waterEntries)){
    v.waterEntries = v.water_ml>0 ? [{ml:v.water_ml, ts:Date.now()}] : [];
    delete v.water_ml;
  }
  if(!Array.isArray(v.waterEntries)) v.waterEntries = [];
  if(!Array.isArray(v.workouts)) v.workouts = [];
  if(!Array.isArray(v.wellness)) v.wellness = [];
}
if(!state.logs[state.today]) state.logs[state.today] = { meals:[], waterEntries:[], mood:'😐 Neutral', wellness:[], workouts:[] };

function save(){
  localStorage.setItem('logs', JSON.stringify(state.logs));
  localStorage.setItem('settings', JSON.stringify(state.settings));
  localStorage.setItem('focusHistory', JSON.stringify(state.focusHistory.slice(-5)));
  localStorage.setItem('macroStats', JSON.stringify(state.macroStats));
  localStorage.setItem('echoes', JSON.stringify(state.echoes));
  render();
}

// --------- Load foods DB ----------
fetch('data/foods-large.json')
  .then(r=>r.json())
  .then(data=>{
    state.foods = data;
    populateFoodSelect();
    games_macro_init();
    render();
  })
  .catch(()=>{
    const m = document.getElementById('foodMeta');
    if(m) m.textContent = 'Could not load data/foods-large.json — check the path/case.';
  });

// --------- Utility: clear helpers (day / last 7 days) ----------
function clearTodayField(field){
  if(!state.logs[state.today]) state.logs[state.today] = { meals:[], waterEntries:[], mood:'😐 Neutral', wellness:[], workouts:[] };
  const obj = state.logs[state.today];
  if(Array.isArray(obj[field])) obj[field] = [];
  save();
}
function clearLast7DaysField(field){
  if(!confirm(`Reset ${field} for the last 7 days?`)) return;
  for(let i=0;i<7;i++){
    const d = new Date(Date.now()-i*86400000).toISOString().slice(0,10);
    if(!state.logs[d]) continue;
    if(Array.isArray(state.logs[d][field])) state.logs[d][field] = [];
  }
  save();
}

// --------- FOOD ----------
function populateFoodSelect(){
  const sel = document.getElementById('foodSelect');
  const byCat = {};
  state.foods.forEach(f=>{
    const cat = f.category || 'Other';
    (byCat[cat] ||= []).push(f);
  });
  sel.innerHTML = '<option value="">Select a food…</option>';
  Object.keys(byCat).sort().forEach(cat=>{
    const grp = document.createElement('optgroup'); grp.label = cat;
    byCat[cat].sort((a,b)=>a.name.localeCompare(b.name)).forEach(f=>{
      const opt = document.createElement('option');
      opt.value = f.name; opt.textContent = f.name;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  });
  document.getElementById('foodMeta').textContent = `${state.foods.length.toLocaleString()} foods available`;
  const selectedEl = document.getElementById('selectedFood');
  sel.onchange = ()=>{
    const name = sel.value;
    if(!name){ selectedEl.textContent = 'No food selected'; selectedEl.className='pill pill-muted'; return; }
    selectedEl.textContent = name;
    selectedEl.className = 'pill';
  };

  document.getElementById('addFood').onclick=()=>{
    const name = sel.value;
    if(!name){ alert('Select a food'); return; }
    const grams = +document.getElementById('grams').value || 0;
    if(grams<=0){ alert('Enter grams > 0'); return; }
    const f = state.foods.find(x=>x.name===name);
    const p = f.per_100g; const factor = grams/100;
    const entry = {
      meal: document.getElementById('mealType').value,
      name: f.name, grams,
      kcal: +(p.calories*factor).toFixed(1),
      protein_g: +(p.protein_g*factor).toFixed(1),
      carbs_g: +(p.carbs_g*factor).toFixed(1),
      fat_g: +(p.fat_g*factor).toFixed(1)
    };
    state.logs[state.today].meals.push(entry);
    save();
  };

  // Clear / Reset
  document.getElementById('clearToday').onclick=()=>{
    if(confirm('Clear today’s meals?')){ state.logs[state.today].meals=[]; save(); }
  };
  document.getElementById('resetWeekMeals').onclick=()=> clearLast7DaysField('meals');
}

// --------- HYDRATION & MOOD ----------
document.querySelectorAll('.chip[data-water]').forEach(b=>{
  b.onclick=()=> addWater(+b.dataset.water);
});
document.getElementById('addWater').onclick=()=> addWater(+document.getElementById('waterMl').value||0);
document.getElementById('saveMood').onclick=()=>{
  state.logs[state.today].mood = document.getElementById('moodSel').value;
  save();
};
document.getElementById('deleteLastWater').onclick=()=>{
  const arr = state.logs[state.today].waterEntries;
  if(arr.length){ arr.pop(); save(); }
};
document.getElementById('clearWater').onclick=()=>{
  if(confirm('Clear all water entries today?')){
    state.logs[state.today].waterEntries = []; save();
  }
};
document.getElementById('resetWeekWater').onclick=()=> clearLast7DaysField('waterEntries');
document.getElementById('saveWaterTarget').onclick=()=>{
  const val = +document.getElementById('waterTarget').value || 2000;
  state.settings.waterTarget = Math.max(0, val);
  save();
};
document.getElementById('hideZeroDays').onchange=(e)=>{
  state.settings.hideZeroDays = e.target.checked;
  save();
};
function addWater(ml){
  if(ml<=0) return;
  state.logs[state.today].waterEntries.push({ml, ts: Date.now()});
  save();
}

// --------- WELLNESS ----------
document.getElementById('saveWellness').onclick=()=>{
  const w = {
    sleep:+document.getElementById('sleepH').value||0,
    stress:+document.getElementById('stress').value||0,
    energy:+document.getElementById('energy').value||0,
    notes:document.getElementById('notes').value||""
  };
  state.logs[state.today].wellness.push(w);
  save();
};
document.getElementById('addDemoDay').onclick=()=>{
  const days = 6;
  for(let i=days;i>=1;i--){
    const d = new Date(Date.now()-i*86400000).toISOString().slice(0,10);
    if(!state.logs[d]) state.logs[d]={meals:[],waterEntries:[],mood:'😐 Neutral',wellness:[],workouts:[]};
    const kcal = 1700 + Math.round(Math.random()*700);
    state.logs[d].meals = [
      {meal:"Breakfast",name:"Oats (cup)",grams:80,kcal:kcal*0.25,protein_g:12,carbs_g:60,fat_g:8},
      {meal:"Lunch",name:"Chicken breast",grams:150,kcal:kcal*0.35,protein_g:38,carbs_g:10,fat_g:9},
      {meal:"Dinner",name:"Rice",grams:200,kcal:kcal*0.30,protein_g:8,carbs_g:70,fat_g:4}
    ];
    const entries = 3+Math.floor(Math.random()*3);
    state.logs[d].waterEntries = Array.from({length:entries}, ()=>({ml:400+Math.floor(Math.random()*500), ts:Date.now()}));
    state.logs[d].wellness.push({sleep:6+Math.random()*2,stress:1+Math.floor(Math.random()*5),energy:1+Math.floor(Math.random()*5),notes:""});
  }
  save();
};
document.getElementById('clearWellnessToday').onclick=()=> clearTodayField('wellness');
document.getElementById('resetWeekWellness').onclick=()=> clearLast7DaysField('wellness');

// --------- WORKOUTS ----------
const plans = {
  "Beginner Full-body": [
    {name:"Bodyweight Squats", sets:3, reps:12},
    {name:"Knee Push-ups", sets:3, reps:10},
    {name:"Glute Bridges", sets:3, reps:12},
    {name:"Plank", sets:3, mins:0.5}
  ],
  "Core Booster": [
    {name:"Plank", sets:3, mins:0.75},
    {name:"Side Plank (each)", sets:2, mins:0.5},
    {name:"Dead Bug", sets:3, reps:10},
    {name:"Bird-Dog (each)", sets:3, reps:10}
  ],
  "Cardio Intervals": [
    {name:"Brisk Walk / Jog", sets:6, mins:2},
    {name:"Easy Pace", sets:6, mins:1},
    {name:"Stretching", sets:1, mins:5}
  ]
};
document.querySelectorAll('.plan-add').forEach(btn=>{
  btn.onclick=()=>{
    const plan = plans[btn.dataset.plan] || [];
    state.logs[state.today].workouts.push(...plan);
    save();
    renderPlans();
  };
});
document.getElementById('addExercise').onclick=()=>{
  const name = document.getElementById('exName').value.trim();
  const sets = +document.getElementById('exSets').value||0;
  const reps = +document.getElementById('exReps').value||0;
  const mins = +document.getElementById('exMins').value||0;
  if(!name){ alert('Enter exercise name'); return; }
  if(sets<=0 && reps<=0 && mins<=0){ alert('Enter sets/reps or minutes'); return; }
  state.logs[state.today].workouts.push({name, sets:sets||undefined, reps:reps||undefined, mins:mins||undefined});
  document.getElementById('exName').value='';
  document.getElementById('exSets').value='';
  document.getElementById('exReps').value='';
  document.getElementById('exMins').value='';
  save();
};
document.getElementById('clearWorkout').onclick=()=>{
  if(confirm('Clear today’s workout?')){ state.logs[state.today].workouts=[]; save(); }
};
document.getElementById('resetWeekWorkout').onclick=()=> clearLast7DaysField('workouts');

// --------- Games: Macro Match ----------
let macroRound = { cards:[], score:[0,0] }; // [correct,total]
document.getElementById('macroNewRound').onclick=()=>games_macro_newRound();

function dominantMacro(food){
  const p = food.per_100g?.protein_g||0, c = food.per_100g?.carbs_g||0, f = food.per_100g?.fat_g||0;
  const kcalP = p*4, kcalC = c*4, kcalF = f*9;
  const max = Math.max(kcalP,kcalC,kcalF);
  if(max===kcalP) return 'protein';
  if(max===kcalC) return 'carbs';
  return 'fat';
}
function sampleUnique(arr, n){
  const copy = arr.slice(); const out=[];
  while(out.length<n && copy.length){
    const i = Math.floor(Math.random()*copy.length);
    out.push(copy.splice(i,1)[0]);
  }
  return out;
}
function games_macro_init(){ games_macro_newRound(); }
function games_macro_newRound(){
  if(!state.foods.length) return;
  const foods = state.foods.filter(f=>f.per_100g && f.per_100g.calories>0);
  const prot = foods.filter(f=>dominantMacro(f)==='protein');
  const carb = foods.filter(f=>dominantMacro(f)==='carbs');
  const fat  = foods.filter(f=>dominantMacro(f)==='fat');
  let picks = [];
  picks.push(...sampleUnique(prot,2));
  picks.push(...sampleUnique(carb,2));
  picks.push(...sampleUnique(fat,2));
  if(picks.length<6) picks.push(...sampleUnique(foods, 6-picks.length));
  picks = picks.sort(()=>Math.random()-0.5);
  macroRound.cards = picks.map(f=>({ name:f.name, macro: dominantMacro(f) }));
  macroRound.score = [0,0];
  const wrap = document.getElementById('macroCards');
  wrap.innerHTML = '';
  macroRound.cards.forEach((c,idx)=>{
    const card = document.createElement('div');
    card.className = 'macro-card'; card.draggable = true; card.textContent = c.name;
    card.dataset.idx = idx;
    card.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', idx); });
    wrap.appendChild(card);
  });
  updateMacroLabels();
  // bins dnd
  document.querySelectorAll('.macro-bin').forEach(bin=>{
    bin.ondragover = e=>{ e.preventDefault(); bin.classList.add('over'); };
    bin.ondragleave = ()=> bin.classList.remove('over');
    bin.ondrop = e=>{
      e.preventDefault(); bin.classList.remove('over');
      const idx = +e.dataTransfer.getData('text/plain');
      const c = macroRound.cards[idx];
      if(!c) return;
      const guess = bin.dataset.bin;
      macroRound.score[1] += 1;
      if(guess===c.macro){
        macroRound.score[0] += 1;
        const el = document.querySelector(`.macro-card[data-idx="${idx}"]`);
        if(el) el.remove();
      }else{
        bin.animate([{transform:'translateX(0)'},{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}], {duration:200});
      }
      updateMacroLabels(true);
    };
  });
}
function updateMacroLabels(){
  const [corr, tot] = macroRound.score;
  document.getElementById('macroScore').textContent = `Score: ${corr}/${tot}`;
  if(document.querySelectorAll('.macro-card').length===0 && tot>0){
    const acc = Math.round((corr/tot)*100);
    state.macroStats.rounds.push({timestamp:Date.now(), correct:corr, total:tot, accuracy:acc});
    state.macroStats.totalCorrect += corr;
    state.macroStats.totalAttempts += tot;
    state.macroStats.bestAcc = state.macroStats.bestAcc==null ? acc : Math.max(state.macroStats.bestAcc, acc);
    save();
  }
  const best = state.macroStats.bestAcc==null ? '–' : `${state.macroStats.bestAcc}%`;
  document.getElementById('macroBest').textContent = `Best acc: ${best}`;
}

// --------- Games: Focus Zap ----------
let focusTimer = null, focusArmed = false, focusStartTs = 0;
const pad = document.getElementById('focusPad');
const focusState = document.getElementById('focusState');
const focusLast = document.getElementById('focusLast');
const focusAvg = document.getElementById('focusAvg');

document.getElementById('focusStart').onclick=()=>{
  if(focusTimer) clearTimeout(focusTimer);
  focusArmed = false; pad.className='focus-pad'; pad.textContent='Get ready…'; focusState.textContent='Ready'; pad.classList.add('ready');
  const delay = 1000 + Math.random()*2000; // 1-3s
  focusTimer = setTimeout(()=>{
    pad.classList.remove('ready'); pad.classList.add('go'); pad.textContent='CLICK!';
    focusArmed = true; focusStartTs = performance.now();
    focusState.textContent='Go!';
  }, delay);
};
pad.onclick=()=>{
  if(!focusArmed){
    if(focusTimer){ clearTimeout(focusTimer); focusTimer=null; }
    pad.className='focus-pad'; pad.textContent='False start 😅';
    focusState.textContent='False start';
    return;
  }
  const rt = Math.max(0, Math.round(performance.now()-focusStartTs));
  state.focusHistory.push(rt); state.focusHistory = state.focusHistory.slice(-5);
  save();
  focusArmed = false; pad.className='focus-pad'; pad.textContent='Nice!';
  focusState.textContent='Done';
  focusLast.textContent = rt+'';
  const avg = Math.round(state.focusHistory.reduce((s,x)=>s+x,0)/state.focusHistory.length);
  focusAvg.textContent = isFinite(avg)? avg : '–';
};

// --------- Echoes of Change ----------
const ECHO_SCENARIOS = {
  community_fund: {
    title: "Community Fund",
    steps: [
      { text: "Your campus gets a small grant. Where do you allocate first?",
        choices: [
          {label:"Mental health peer support", delta:{emp:15, eq:5, aw:10}, note:"You prioritized emotional safety."},
          {label:"Sports equipment upgrade", delta:{emp:4, eq:3, aw:2}, note:"Popular, but limited reach."},
          {label:"Accessibility ramps & captions", delta:{emp:8, eq:18, aw:12}, note:"Inclusion measurably improved."}
        ]},
      { text: "A committee member argues the ramps are too expensive.",
        choices: [
          {label:"Share data on inclusion benefits", delta:{emp:8, eq:10, aw:10}, note:"Evidence builds awareness."},
          {label:"Compromise: pilot in key buildings", delta:{emp:6, eq:7, aw:5}, note:"Practical step forward."},
          {label:"Drop the request for now", delta:{emp:-2, eq:-6, aw:-4}, note:"Equity progress stalls."}
        ]},
      { text: "How do you measure impact after 3 months?",
        choices: [
          {label:"Survey marginalized students", delta:{emp:8, eq:10, aw:12}, note:"Lived experience matters."},
          {label:"Track event attendance only", delta:{emp:2, eq:2, aw:4}, note:"Partial picture."},
          {label:"No measurement needed", delta:{emp:-4, eq:-4, aw:-6}, note:"Learning opportunity missed."}
        ]}
    ]
  },
  friend_confide: {
    title: "Friend in Crisis",
    steps: [
      { text: "A close friend shares they’re overwhelmed and can’t focus.",
        choices: [
          {label:"Listen, validate feelings, ask needs", delta:{emp:18, eq:5, aw:8}, note:"Active empathy improves trust."},
          {label:"Offer quick fixes immediately", delta:{emp:3, eq:2, aw:2}, note:"Can feel dismissive without listening."},
          {label:"Change topic to avoid discomfort", delta:{emp:-8, eq:-2, aw:-6}, note:"Avoidance harms support."}
        ]},
      { text: "They mention panic during exams.",
        choices: [
          {label:"Share breathing technique & peer support info", delta:{emp:8, eq:6, aw:10}, note:"You offered tools and options."},
          {label:"Tell them to 'toughen up'", delta:{emp:-10, eq:-2, aw:-4}, note:"Invalidation increases distress."},
          {label:"Keep it secret; no follow-up", delta:{emp:-4, eq:-6, aw:-6}, note:"Silence can isolate."}
        ]},
      { text: "They ask you to accompany them to counseling.",
        choices: [
          {label:"Yes, and schedule together", delta:{emp:10, eq:6, aw:8}, note:"Tangible support matters."},
          {label:"Encourage but don’t join", delta:{emp:4, eq:2, aw:2}, note:"Helpful, but less supportive."},
          {label:"Refuse; you’re too busy", delta:{emp:-6, eq:-4, aw:-4}, note:"Signals low availability."}
        ]}
    ]
  },
  campus_event: {
    title: "Campus Event Accessibility",
    steps: [
      { text: "You’re organizing a festival. Which policy do you add?",
        choices: [
          {label:"Live captions & quiet room", delta:{emp:10, eq:16, aw:10}, note:"Supports neurodiversity & hearing."},
          {label:"VIP-only seating", delta:{emp:-2, eq:-8, aw:-4}, note:"Increases inequality."},
          {label:"No new policies", delta:{emp:0, eq:0, aw:0}, note:"Missed chance to include."}
        ]},
      { text: "Budget is tight; what do you keep?",
        choices: [
          {label:"Keep quiet room, reduce decor", delta:{emp:6, eq:10, aw:6}, note:"Prioritize human needs."},
          {label:"Cut captions, keep lights show", delta:{emp:-4, eq:-10, aw:-4}, note:"Harms accessibility."},
          {label:"Cancel quiet room & captions", delta:{emp:-8, eq:-12, aw:-10}, note:"Excludes attendees."}
        ]},
      { text: "How do you promote inclusivity?",
        choices: [
          {label:"Explicit accessibility details in invites", delta:{emp:5, eq:8, aw:12}, note:"Signals welcome & awareness."},
          {label:"Word-of-mouth only", delta:{emp:0, eq:0, aw:0}, note:"Limited reach."},
          {label:"No mention", delta:{emp:-2, eq:-4, aw:-4}, note:"Some won’t attend."}
        ]}
    ]
  }
};

let echoSession = null;
document.getElementById('echoStart').onclick=()=>startEchoScenario();
document.getElementById('echoReset').onclick=()=>resetEcho();

function startEchoScenario(){
  const key = document.getElementById('echoScenarioSel').value;
  const scen = ECHO_SCENARIOS[key];
  echoSession = { key, title:scen.title, step:0, emp:0, eq:0, aw:0, log:[] };
  renderEchoStep();
  updateEchoMeters();
  document.getElementById('echoSummary').innerHTML = '';
}
function renderEchoStep(){
  const key = echoSession.key;
  const scen = ECHO_SCENARIOS[key];
  const step = scen.steps[echoSession.step];
  const box = document.getElementById('echoStory');
  if(!step){
    const summary = buildEchoSummary(echoSession);
    document.getElementById('echoSummary').innerHTML = summary.html;
    state.echoes.history.push(summary.snapshot);
    save();
    box.innerHTML = `<div class="echo-card"><strong>Scenario complete.</strong> See summary below. You can restart or choose another scenario.</div>`;
    return;
  }
  box.innerHTML = `
    <div class="echo-card">
      <h3>${scen.title} — Step ${echoSession.step+1} of ${scen.steps.length}</h3>
      <p>${step.text}</p>
      <div class="echo-choices">
        ${step.choices.map((c,i)=>`<button class="choice" data-idx="${i}">${c.label}</button>`).join('')}
      </div>
    </div>
  `;
  box.querySelectorAll('.choice').forEach(btn=>{
    btn.onclick=()=>{
      const idx = +btn.dataset.idx;
      const ch = step.choices[idx];
      echoSession.emp += ch.delta.emp; echoSession.eq += ch.delta.eq; echoSession.aw += ch.delta.aw;
      echoSession.log.push({ step: echoSession.step, label: ch.label, note: ch.note, delta: ch.delta });
      echoSession.step += 1;
      updateEchoMeters();
      renderEchoStep();
    };
  });
}
function updateEchoMeters(){
  const clamp = (v)=>Math.max(0, Math.min(100, v));
  document.getElementById('echoEmp').style.width = clamp(echoSession?.emp||0)+'%';
  document.getElementById('echoEq').style.width  = clamp(echoSession?.eq||0)+'%';
  document.getElementById('echoAw').style.width  = clamp(echoSession?.aw||0)+'%';
}
function buildEchoSummary(sess){
  const emp = Math.max(0, Math.min(100, sess.emp));
  const eq  = Math.max(0, Math.min(100, sess.eq));
  const aw  = Math.max(0, Math.min(100, sess.aw));
  const strengths = [];
  if(emp>=eq && emp>=aw) strengths.push("Empathy");
  if(eq>=emp && eq>=aw) strengths.push("Equity");
  if(aw>=emp && aw>=eq) strengths.push("Awareness");
  const html = `
    <div class="echo-card">
      <h3>Summary: ${sess.title}</h3>
      <p><strong>Empathy:</strong> ${emp}% • <strong>Equity:</strong> ${eq}% • <strong>Awareness:</strong> ${aw}%</p>
      <ul>${sess.log.map(l=>`<li><em>${l.label}</em> — ${l.note}</li>`).join('')}</ul>
      <p class="muted small">Strengths: ${strengths.join(', ') || '—'} • Tip: Balance empathy with measurable inclusion and clear communication.</p>
    </div>
  `;
  return {
    html,
    snapshot: {
      timestamp: Date.now(),
      scenario: sess.key,
      title: sess.title,
      empathy: emp, equity: eq, awareness: aw,
      steps: sess.log
    }
  };
}
function resetEcho(){
  echoSession = null;
  document.getElementById('echoStory').innerHTML = '';
  document.getElementById('echoSummary').innerHTML = '';
  updateEchoMeters();
}

// --------- Insights ----------
let insHydChart, insCalChart, insSleepChart, insWoChart;
function renderInsights(){
  const days = [...Array(7)].map((_,i)=>{
    const d = new Date(Date.now() - (6-i)*86400000).toISOString().slice(0,10);
    const L = state.logs[d]||{meals:[],waterEntries:[],mood:'😐 Neutral',wellness:[],workouts:[]};
    const lastWel = last(L.wellness) || {};
    return {
      date:d, label:d.slice(5),
      water: L.waterEntries.reduce((s,e)=>s+e.ml,0),
      kcal:  L.meals.reduce((s,m)=>s+m.kcal,0),
      sleep: +((lastWel.sleep||0)),
      stress:+((lastWel.stress||0)),
      wo:    (L.workouts||[]).length
    };
  });
  const labels = days.map(x=>x.label);

  // Hydration line
  if(insHydChart) insHydChart.destroy();
  insHydChart = new Chart(document.getElementById('insHyd'), {
    type:'line', data:{ labels, datasets:[{label:'Water (ml)', data:days.map(d=>d.water), tension:.3, fill:true}] },
    options:{responsive:true}
  });
  const avgWater = Math.round(days.reduce((s,d)=>s+d.water,0)/7);
  document.getElementById('insHydText').textContent = `Avg ${avgWater} ml/day vs target ${state.settings.waterTarget} ml.`;

  // Calories line
  if(insCalChart) insCalChart.destroy();
  insCalChart = new Chart(document.getElementById('insCal'), {
    type:'line', data:{ labels, datasets:[{label:'Calories', data:days.map(d=>Math.round(d.kcal)), tension:.3, fill:true}] },
    options:{responsive:true}
  });
  const avgCal = Math.round(days.reduce((s,d)=>s+d.kcal,0)/7);
  document.getElementById('insCalText').textContent = `Avg ${avgCal} kcal/day.`;

  // Sleep bars (overlay stress as line)
  if(insSleepChart) insSleepChart.destroy();
  insSleepChart = new Chart(document.getElementById('insSleep'), {
    data:{
      labels,
      datasets:[
        {type:'bar', label:'Sleep (h)', data:days.map(d=>+d.sleep.toFixed(1))},
        {type:'line', label:'Stress (1–5)', data:days.map(d=>d.stress||0), tension:.3, yAxisID:'y1'}
      ]
    },
    options:{responsive:true, scales:{ y1:{position:'right', suggestedMax:5, suggestedMin:0 } } }
  });
  const avgSleep = +(days.reduce((s,d)=>s+(d.sleep||0),0)/7).toFixed(1);
  document.getElementById('insSleepText').textContent = `Avg sleep ${avgSleep} h • Stress trend shown (line).`;

  // Workouts
  if(insWoChart) insWoChart.destroy();
  insWoChart = new Chart(document.getElementById('insWo'), {
    type:'bar', data:{ labels, datasets:[{label:'Exercises logged', data:days.map(d=>d.wo)}] },
    options:{responsive:true}
  });
  const woTotal = days.reduce((s,d)=>s+d.wo,0);
  document.getElementById('insWoText').textContent = `Total exercises logged this week: ${woTotal}.`;

  // Narrative
  const msg = [
    avgWater < state.settings.waterTarget ? "Hydration is below target — try spacing sips across the day." : "Hydration meets target — great consistency.",
    avgSleep < 7 ? "Sleep trend suggests aiming for 7–8h; limit screens 60 min before bed." : "Sleep looks solid — keep a steady schedule.",
    avgCal > 2600 ? "Calories are on the higher side — consider protein-forward meals for satiety." :
    avgCal < 1600 ? "Calories are low — ensure you’re fueling enough for workouts." :
    "Calories look balanced overall."
  ].join(' ');
  document.getElementById('insNarrative').textContent = msg;
}

// --------- Render + Charts (Food/Hydration weekly) ----------
let calChart, waterChart;
function render(){
  // Settings sync
  document.getElementById('waterTarget').value = state.settings.waterTarget;
  document.getElementById('hideZeroDays').checked = !!state.settings.hideZeroDays;

  const log = state.logs[state.today];

  // Meals
  const mealLog = document.getElementById('mealLog');
  mealLog.innerHTML = log.meals.map(m=>`
    <div class="item">
      <span>${m.meal}: ${m.name} (${m.grams}g)</span>
      <span>${m.kcal.toFixed(0)} kcal</span>
    </div>
  `).join('');

  const totals = log.meals.reduce((a,m)=>({
    kcal:a.kcal+m.kcal, p:a.p+m.protein_g, c:a.c+m.carbs_g, f:a.f+m.fat_g
  }), {kcal:0,p:0,c:0,f:0});
  const classK = totals.kcal<1600?'warn':totals.kcal>2600?'bad':'good';
  document.getElementById('totals').innerHTML = `
    <div class="${classK}"><strong>${totals.kcal.toFixed(0)}</strong> kcal</div>
    <div class="muted">Protein ${totals.p.toFixed(1)}g • Carbs ${totals.c.toFixed(1)}g • Fat ${totals.f.toFixed(1)}g</div>
  `;

  // Hydration summary & list
  document.getElementById('todayMood').textContent = log.mood;
  const waterSum = log.waterEntries.reduce((s,e)=>s+e.ml,0);
  document.getElementById('todayWater').textContent = waterSum;
  const pct = Math.min(100, Math.round(100*waterSum/Math.max(1, state.settings.waterTarget)));
  document.getElementById('waterProgressFill').style.width = pct+'%';

  const waterList = document.getElementById('waterList');
  waterList.innerHTML = log.waterEntries.map((e,idx)=>`
    <div class="item">
      <span>${e.ml} ml</span>
      <button class="badge-del" data-del-idx="${idx}">Delete</button>
    </div>
  `).join('');
  waterList.querySelectorAll('[data-del-idx]').forEach(btn=>{
    btn.onclick=()=>{ const i=+btn.dataset.delIdx; state.logs[state.today].waterEntries.splice(i,1); save(); };
  });

  // 7-day arrays; allow hiding zero days
  let days = [...Array(7)].map((_,i)=>{
    const d = new Date(Date.now() - (6-i)*86400000).toISOString().slice(0,10);
    const L = state.logs[d]||{meals:[],waterEntries:[],mood:'😐 Neutral',wellness:[],workouts:[]};
    return {
      date: d,
      label:d.slice(5),
      kcal: L.meals.reduce((s,m)=>s+m.kcal,0),
      water: L.waterEntries.reduce((s,e)=>s+e.ml,0)
    };
  });
  if(state.settings.hideZeroDays){
    days = days.filter(x=>x.water>0);
  }
  const labels = days.map(x=>x.label);
  const kcals = days.map(x=>Math.round(x.kcal));
  const waters = days.map(x=>x.water);
  const targetLine = days.map(_=>state.settings.waterTarget);

  if(calChart) calChart.destroy();
  calChart = new Chart(document.getElementById('calChart'), {
    type:'line',
    data:{ labels, datasets:[{label:'Calories', data:kcals, tension:.3, fill:true}] },
    options:{responsive:true}
  });

  if(waterChart) waterChart.destroy();
  const datasets = [
    {label:'Water (ml)', data:waters, type:'line', fill:true, tension:0.3},
    {label:'Target (ml)', data:targetLine, type:'line', borderDash:[6,6], pointRadius:0}
  ];
  waterChart = new Chart(document.getElementById('waterChart'), {
    data:{ labels, datasets }, options:{responsive:true}
  });

  // Workout log (today)
  const wLog = document.getElementById('workoutLog');
  wLog.innerHTML = (log.workouts||[]).map(w=>{
    const parts = [];
    if(w.sets) parts.push(`${w.sets} sets`);
    if(w.reps) parts.push(`${w.reps} reps`);
    if(w.mins) parts.push(`${w.mins} min`);
    return `<div class="item"><span>${w.name}</span><span class="muted">${parts.join(' • ')}</span></div>`;
  }).join('');

  renderPlans();
  renderWellnessWeek();
  renderWorkoutWeek();

  // Focus Zap: update averages
  const fh = state.focusHistory;
  document.getElementById('focusLast').textContent = fh.length? fh[fh.length-1] : '–';
  const avg = Math.round((fh.reduce((s,x)=>s+x,0)/(fh.length||1)));
  document.getElementById('focusAvg').textContent = fh.length? avg : '–';
}

function renderPlans(){
  const planList = document.getElementById('planList');
  const todayW = state.logs[state.today].workouts||[];
  if(!todayW.length){ planList.innerHTML = `<div class="muted small">No plan yet. Use quick buttons or add exercises.</div>`; return; }
  const byName = {};
  todayW.forEach(w=>{ byName[w.name] = (byName[w.name]||0)+1; });
  planList.innerHTML = Object.entries(byName).map(([name,count])=>`
    <div class="item"><span>${name}</span><span class="muted">${count} item(s)</span></div>
  `).join('');
}

// --------- Weekly renderers ----------
function renderWellnessWeek(){
  const box = document.getElementById('wellnessWeek');
  const list = [...Array(7)].map((_,i)=>{
    const dISO = new Date(Date.now() - (6-i)*86400000).toISOString().slice(0,10);
    const L = state.logs[dISO]||{wellness:[], mood:'😐 Neutral'};
    return { date:dISO, items:L.wellness||[], mood:L.mood||'😐 Neutral' };
  });
  box.innerHTML = list.map(({date,items,mood})=>{
    if(!items.length) return `
      <div class="week-item">
        <h4>${date.slice(5)}</h4>
        <div class="sub">Mood: ${mood}</div>
        <div class="muted small">No wellness entries.</div>
      </div>`;
    const w = last(items) || {};
    const sleepText = (typeof w.sleep === 'number') ? w.sleep.toFixed(1) : (w.sleep||0);
    return `
      <div class="week-item">
        <h4>${date.slice(5)}</h4>
        <div class="sub">Mood: ${mood}</div>
        <div>Sleep: <strong>${sleepText}</strong> h • Stress: <strong>${w.stress??'-'}</strong> • Energy: <strong>${w.energy??'-'}</strong></div>
        ${w.notes? `<div class="muted small">Notes: ${w.notes}</div>`:''}
      </div>`;
  }).join('');
}

function renderWorkoutWeek(){
  const box = document.getElementById('workoutWeek');
  const list = [...Array(7)].map((_,i)=>{
    const dISO = new Date(Date.now() - (6-i)*86400000).toISOString().slice(0,10);
    const L = state.logs[dISO]||{workouts:[]};
    return { date:dISO, items:L.workouts||[] };
  });
  box.innerHTML = list.map(({date,items})=>{
    if(!items.length) return `
      <div class="week-item">
        <h4>${date.slice(5)}</h4>
        <div class="muted small">No workouts.</div>
      </div>`;
    const top3 = items.slice(0,3).map(w=>{
      const bits=[];
      if(w.sets) bits.push(`${w.sets} sets`);
      if(w.reps) bits.push(`${w.reps} reps`);
      if(w.mins) bits.push(`${w.mins} min`);
      return `${w.name}${bits.length?` (${bits.join(' • ')})`:''}`;
    }).join(', ');
    return `
      <div class="week-item">
        <h4>${date.slice(5)}</h4>
        <div>${items.length} exercise(s)</div>
        <div class="muted small">${top3}${items.length>3? ' …':''}</div>
      </div>`;
  }).join('');
}

// --------- AI (MOCK) — made robust (no .at()) ----------
function buildPayloadForAdvice(){
  const t = state.logs[state.today] || { meals:[], waterEntries:[], mood:'😐 Neutral', wellness:[], workouts:[] };
  const totals = t.meals.reduce((a,m)=>({
    kcal:a.kcal+m.kcal, p:a.p+m.protein_g, c:a.c+m.carbs_g, f:a.f+m.fat_g
  }), {kcal:0,p:0,c:0,f:0});
  const lastWel = last(t.wellness) || {};
  return {
    goal: (document.getElementById('goal')?.value) || 'maintain',
    activityLevel: (document.getElementById('activity')?.value) || 'moderate',
    fitnessLevel: (document.getElementById('fitness')?.value) || 'beginner',
    today: {
      calories:+totals.kcal.toFixed(0),
      macros:{protein_g:+totals.p.toFixed(1), carbs_g:+totals.c.toFixed(1), fat_g:+totals.f.toFixed(1)},
      meals: t.meals,
      water_ml: t.waterEntries.reduce((s,e)=>s+e.ml,0),
      mood: t.mood,
      sleep_hours: +((lastWel.sleep||0)),
      stress: +((lastWel.stress||0)),
      energy: +((lastWel.energy||0)),
      workouts: t.workouts
    }
  };
}
function generateAdviceMock(payload){
  const {today, fitnessLevel, goal} = payload;
  const lowProtein = (today.macros?.protein_g||0) < 80;
  const lowWater = (today.water_ml||0) < 2000;
  const poorSleep = (today.sleep_hours||0) < 7;
  const workoutSug = {
    beginner: [
      {title:"Full-body 20 min", steps:["Warm-up 3 min","3× (12 squats, 8 knee push-ups, 12 glute bridges)","Plank 30s × 2","Stretch 3 min"]},
      {title:"Brisk walk + core", steps:["Walk 15–20 min","Core: 2× plank 30–45s","Glute bridge 2×12","Stretch 3 min"]}
    ],
    intermediate: [
      {title:"Intervals 25 min", steps:["Warm-up 5 min","6× (1 min faster, 2 min easy)","Cool down 4 min","Mobility 3 min"]},
      {title:"Legs & Core 25 min", steps:["3× (12 lunges/leg)","3× (30s side planks)","3× (15 hip hinges)","Walk 5 min"]}
    ],
    advanced: [
      {title:"Tempo 30 min", steps:["Warm-up 6 min","20 min tempo run","Cool down 4 min"]},
      {title:"EMOM x 20", steps:["Min1: 12 burpees","Min2: 15 kettlebell swings","Repeat 10 rounds"]}
    ]
  };
  const nutritionPool = [
    goal==='lose' ? "Slight calorie deficit; add 1 serving of lean protein and veggies." :
    goal==='gain' ? "Small surplus; add ~300 kcal with protein + complex carbs." :
                    "Aim for balance; spread protein across 3–4 meals.",
    lowProtein ? "Increase daily protein by ~20–30g (eggs, lentils, chicken, tofu)." :
                 "Protein looks solid—keep spacing it across meals.",
    "Prefer whole grains, legumes, and fiber for satiety.",
    "Include 1–2 servings of fruit for micronutrients."
  ];
  const hydrationPool = [
    lowWater ? "Drink 300–500 ml water now; aim ≥2–2.5 L today." :
               "Hydration on track—sip regularly across the day.",
    poorSleep ? "Target 7–8h tonight; dim screens 60 min before bed." :
                 "Keep a consistent sleep window this week."
  ];
  const motivations = [
    "Small wins add up—log your next meal now.",
    "Momentum beats perfection. Keep going.",
    "You’re closer than you think. One good step at a time."
  ];
  const rand = arr => arr[Math.floor(Math.random()*arr.length)];
  return {
    workout: [rand(workoutSug[fitnessLevel] || workoutSug.beginner)],
    nutrition: [{tip: rand(nutritionPool)}, {tip: rand(nutritionPool)}],
    hydration_sleep: [{tip: rand(hydrationPool)}, {tip: rand(hydrationPool)}],
    motivation: rand(motivations)
  };
}
function renderAdvice(json){
  const box = document.getElementById('adviceCards');
  const safe = x => Array.isArray(x)?x:[];
  const workout = safe(json.workout).map(w=>`
    <div class="card">
      <h3>${w.title||'Workout'}</h3>
      <ul>${(w.steps||[]).map(s=>`<li>${s}</li>`).join('')}</ul>
    </div>
  `).join('');
  const nutrition = safe(json.nutrition).map(n=>`
    <div class="card"><h3>Nutrition</h3><p>${n.tip||''}</p></div>
  `).join('');
  const hs = safe(json.hydration_sleep).map(n=>`
    <div class="card"><h3>Hydration & Sleep</h3><p>${n.tip||''}</p></div>
  `).join('');
  const mot = `<div class="card"><h3>Motivation</h3><p>${json.motivation||'You got this!'}</p></div>`;
  box.innerHTML = workout + nutrition + hs + mot;
}
document.getElementById('genAdvice').onclick=()=>{ try{ renderAdvice(generateAdviceMock(buildPayloadForAdvice())); }catch(e){ alert('Advice error: '+e.message); } };
document.getElementById('genAdvice2').onclick=()=>{ try{ renderAdvice(generateAdviceMock(buildPayloadForAdvice())); }catch(e){ alert('Advice error: '+e.message); } };

// --------- Export Games Data ----------
function download(filename, text){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type: 'text/plain'}));
  a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}
document.getElementById('exportGamesJSON').onclick=()=>{
  const data = {
    macro_match: state.macroStats,
    focus_zap: { last: state.focusHistory[state.focusHistory.length-1]||null, recent: state.focusHistory },
    echoes: state.echoes
  };
  download(`games-data-${todayISO()}.json`, JSON.stringify(data, null, 2));
};
document.getElementById('exportGamesCSV').onclick=()=>{
  const ms = state.macroStats;
  const macroCSV = ['Macro Match Rounds', 'timestamp,correct,total,accuracy%']
    .concat((ms.rounds||[]).map(r=>`${new Date(r.timestamp).toISOString()},${r.correct},${r.total},${r.accuracy}`))
    .concat([`Totals,,${ms.totalCorrect},${ms.totalAttempts},${ms.bestAcc??''}`])
    .join('\n');

  const focusCSV = ['','Focus Zap (recent 5)','index,ms']
    .concat(state.focusHistory.map((v,i)=>`${i+1},${v}`))
    .join('\n');

  const echoesRows = (state.echoes.history||[]).map(s=>{
    const steps = (s.steps||[]).map(x=>x.label).join(' | ').replace(/"/g,'""');
    return `${new Date(s.timestamp).toISOString()},${s.title},${s.empathy},${s.equity},${s.awareness},"${steps}"`;
  });
  const echoesCSV = ['','Echoes of Change','timestamp,title,empathy,equity,awareness,choices']
    .concat(echoesRows).join('\n');

  download(`games-data-${todayISO()}.csv`, macroCSV + '\n' + focusCSV + '\n' + echoesCSV);
};

// --------- Initial render ----------
render();
