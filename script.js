/* =========================================================
   Water Weight: Village — prototype logic
   ========================================================= */

// ----- Real communities facing serious water-access challenges -----
// Notes kept conservative; verify exact figures with charity: water before launch.
const CITIES = [
  {name:"Cité Soleil, Haiti", note:"One of the Caribbean's most underserved urban communities."},
  {name:"Sana'a, Yemen", note:"Among the most water-stressed capitals on Earth."},
  {name:"Kibera, Nairobi, Kenya", note:"A dense settlement where piped water is scarce."},
  {name:"Lilongwe, Malawi", note:"Many families rely on distant shared water points."},
  {name:"Antananarivo, Madagascar", note:"Long queues at communal taps are part of daily life."},
  {name:"Chennai, India", note:"Reservoirs ran critically low during the 2019 crisis."},
  {name:"Maiduguri, Nigeria", note:"Displacement has strained local water supply."},
  {name:"Cox's Bazar, Bangladesh", note:"Water access is a daily challenge in the settlements."},
  {name:"Cape Town, South Africa", note:"Faced a 'Day Zero' water shutoff scare in 2018."},
  {name:"Adi Etot, Ethiopia", note:"Rural families often walk hours to the nearest source."}
];

const VILLAGERS = ["Amara","Tesfay","Joseph","Marie","Daw","Halima","Rahel","Pascal","Nadia","Kebede","Fatou","Lwanga"];
const TASKS = [
  {t:"needs water to cook the evening meal", L:20},
  {t:"needs to do the family's laundry", L:25},
  {t:"needs clean water for the children to drink today", L:20},
  {t:"is caring for a sick relative and needs water", L:30},
  {t:"needs water to mix mortar to repair a wall", L:40},
  {t:"is preparing water for the whole household", L:40},
  {t:"needs to water the small garden plot", L:25}
];
const FACTS = [
  "Around the world, women and children spend an estimated 200 million hours every day collecting water.",
  "The average jerry can holds about 20 liters — and weighs roughly 40 lbs when full.",
  "Many people walk an average of about 6 km a day to reach water.",
  "A single clean water point near a village can turn a half-day walk into a few minutes.",
  "Every $40 can help bring clean water to one person through charity: water.",
  "The water collected is often still contaminated — the walk is only half the burden."
];

const JERRY_L = 20;        // liters per completed round trip
const STRIDE = 0.75;       // meters per step
const BASE_DEMO = 90;      // demo round-trip meters (~120 steps)
const BASE_REAL = 6000;    // real average round trip (meters)

/* ----- difficulty modes: meaningfully change goal, hazard odds & penalties ----- */
const DIFFICULTY = {
  easy:   {label:"Easy",   goal:60,  hazardChance:0.25, spillFrac:0.5,  dropBonus:5, dropLife:7000, dropEvery:[5000, 8000],
           desc:"Easy: 60 L goal · 25% chance of contaminated water · spills lose half the can · bonus drops linger."},
  normal: {label:"Normal", goal:100, hazardChance:0.40, spillFrac:0.5,  dropBonus:3, dropLife:5000, dropEvery:[7000, 11000],
           desc:"Normal: 100 L goal · 40% chance of contaminated water · spills lose half the can."},
  hard:   {label:"Hard",   goal:150, hazardChance:0.55, spillFrac:0.25, dropBonus:2, dropLife:3200, dropEvery:[9000, 14000],
           desc:"Hard: 150 L goal · 55% chance of contaminated water · untreated spills lose 3/4 of the can · drops vanish fast."}
};
const diff = () => DIFFICULTY[state.difficulty];

/* ----- milestone messages (array + conditionals fire them at key scores) ----- */
const MILESTONES = [
  {pct:25, msg:"Milestone: 25% of the village goal — every liter counts! 💧"},
  {pct:50, msg:"Halfway there! 50% of the clean water goal reached. 🚰"},
  {pct:75, msg:"75% — the village can almost taste clean water! 🌊"},
  {pct:90, msg:"90%! Just a few more trips to change this village forever. ✨"}
];

const state = {
  city:null, day:1,
  collected:0, spent:0,
  steps:0, distance:0,
  quest:null,
  trip:{meters:0, reachedSource:false, trips:0},
  hazard:{active:false, treated:false},
  goal:100, won:false,
  demoScale:true,
  sensorActive:false,
  difficulty:"normal",
  milestonesHit:[],
  buildings:{well:false, tank:false, garden:false, school:false}
};

const BUILDINGS = [
  {key:"well", icon:"⛲", name:"Community well", cost:80,
   desc:"Brings water into the village — cuts every future walk by ~65%."},
  {key:"tank", icon:"🛢️", name:"Rainwater tank", cost:60,
   desc:"Stores water for dry days. Adds a new household to help."},
  {key:"garden", icon:"🌱", name:"Garden plot", cost:50,
   desc:"Food security for the village. Unlocks new quests."},
  {key:"school", icon:"🏫", name:"School", cost:120,
   desc:"With water nearby, kids can attend instead of fetching."}
];

const $ = id => document.getElementById(id);
const balance = () => state.collected - state.spent;

function roundTripTarget(){
  const base = state.demoScale ? BASE_DEMO : BASE_REAL;
  return Math.round(base * (state.buildings.well ? 0.35 : 1));
}
function fmtMeters(m){ return m>=1000 ? (m/1000).toFixed(2)+" km" : Math.round(m)+" m"; }

/* ---------------- setup ---------------- */
function init(){
  applyDifficultyUI();
  state.goal = diff().goal;
  state.city = CITIES[Math.floor(Math.random()*CITIES.length)];
  $("cityName").textContent = state.city.name;
  $("cityNote").textContent = state.city.note;
  buildMap();
  newQuest();
  renderBuilds();
  render();
  loopFact();
  scheduleDrop();
  requestAnimationFrame(drawLoop);
}

function newQuest(){
  const name = VILLAGERS[Math.floor(Math.random()*VILLAGERS.length)];
  const task = TASKS[Math.floor(Math.random()*TASKS.length)];
  state.quest = { name, task:task.t, need:task.L, startCollected:state.collected };
  $("questText").innerHTML = `<b>${name}</b> ${task.t}. Walk to the water source and bring back <b>${task.L} liters</b>.`;
}

/* ---------------- step engine ---------------- */
function addSteps(n){
  if(n<=0) return;
  state.steps += n;
  const meters = n * STRIDE;
  state.distance += meters;
  state.trip.meters += meters;

  const target = roundTripTarget();
  const half = target/2;

  if(!state.trip.reachedSource && state.trip.meters >= half){
    state.trip.reachedSource = true;
    flash("Reached the water source — filling the jerry can 💧");
    SFX.collect();
    rollHazard();
  }
  if(state.trip.meters >= target){
    let delivered = JERRY_L;
    if(state.hazard.active && !state.hazard.treated){
      delivered = Math.round(JERRY_L * diff().spillFrac);
      flash(`Contaminated water spilled out — only +${delivered} L made it home`, true);
      SFX.miss();
    }else{
      flash(`+${delivered} L delivered home 🎉`);
      SFX.deliver();
    }
    state.hazard.active=false; state.hazard.treated=false;
    $("hazard").classList.remove("show");
    state.trip.meters = 0;
    state.trip.reachedSource = false;
    state.trip.trips++;
    state.collected += delivered;
    checkMilestones();
    checkQuest();
    checkWin();
  }
  render();
}

/* ---------------- the twist: contaminated water ---------------- */
function rollHazard(){
  // a well in the village means closer, safer water -> far fewer hazards
  // base odds are set by the chosen difficulty mode
  const chance = diff().hazardChance * (state.buildings.well ? 0.3 : 1);
  if(Math.random() < chance){
    state.hazard.active = true;
    state.hazard.treated = false;
    const opts = [
      "The water here is murky and unsafe. Treat it before the long walk home.",
      "There's algae in the source. Treat it, or risk carrying contaminated water.",
      "This water looks contaminated. Treat it to keep the family healthy."
    ];
    $("hazardText").textContent = opts[Math.floor(Math.random()*opts.length)];
    $("hazard").classList.add("show");
    flash("⚠️ Contaminated water — treat it before heading home");
  }
}

function checkWin(){
  if(!state.won && state.collected >= state.goal){
    state.won = true;
    showWin();
  }
}

/* milestone messages: walk the MILESTONES array, fire each threshold once */
function checkMilestones(){
  const pct = 100 * state.collected / state.goal;
  MILESTONES.forEach((m, i) => {
    if(pct >= m.pct && !state.milestonesHit.includes(i) && pct < 100){
      state.milestonesHit.push(i);
      flash(m.msg, true);
      SFX.milestone();
    }
  });
}

function checkQuest(){
  const got = state.collected - state.quest.startCollected;
  if(got >= state.quest.need){
    state.day++;
    flash(`Quest complete! ${state.quest.name} has water. Day ${state.day} begins.`, true);
    SFX.milestone();
    newQuest();
  }
}

/* ---------------- device motion (real pedometer) ---------------- */
let smoothed = 0, lastStep = 0;
function onMotion(e){
  const a = e.accelerationIncludingGravity || e.acceleration;
  if(!a || a.x===null) return;
  const mag = Math.sqrt(a.x*a.x + a.y*a.y + a.z*a.z);
  smoothed = smoothed*0.8 + mag*0.2;
  const delta = mag - smoothed;
  const now = Date.now();
  if(delta > 1.2 && (now - lastStep) > 320){
    lastStep = now;
    addSteps(1);
  }
}

async function startSensor(){
  // iOS 13+ requires explicit permission, triggered by a user gesture
  try{
    if(typeof DeviceMotionEvent !== "undefined" &&
       typeof DeviceMotionEvent.requestPermission === "function"){
      const res = await DeviceMotionEvent.requestPermission();
      if(res !== "granted"){ sensorMsg("Motion access was denied. Use “Test +20 steps” to try the loop.", false); return; }
    }
    if(typeof DeviceMotionEvent === "undefined"){
      sensorMsg("This device has no motion sensor. Open on a phone, or use “Test +20 steps”.", false); return;
    }
    window.addEventListener("devicemotion", onMotion);
    state.sensorActive = true;
    $("startBtn").textContent = "Counting your steps…";
    $("startBtn").disabled = true;
    sensorMsg("Step counting is live — start walking. ", true);
  }catch(err){
    sensorMsg("Couldn't start the sensor here. Use “Test +20 steps” to try the loop.", false);
  }
}
function sensorMsg(msg, ok){
  const el = $("sensorNote");
  el.innerHTML = ok ? "<b>"+msg+"</b>" : msg;
}

/* ---------------- build / resource management ---------------- */
function renderBuilds(){
  const wrap = $("builds");
  wrap.innerHTML = "";
  BUILDINGS.forEach(b=>{
    const built = state.buildings[b.key];
    const div = document.createElement("div");
    div.className = "build" + (built ? " done" : "");
    div.innerHTML = `
      <div class="icon">${b.icon}</div>
      <div class="name">${b.name}</div>
      <div class="desc">${b.desc}</div>
      <div class="cost">${built ? "BUILT ✓" : b.cost+" L"}</div>
      <button class="mini" data-key="${b.key}" ${built || balance()<b.cost ? "disabled":""}>
        ${built ? "Complete" : "Build"}
      </button>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll(".mini").forEach(btn=>{
    btn.addEventListener("click", ()=>build(btn.dataset.key));
  });
}

function build(key){
  const b = BUILDINGS.find(x=>x.key===key);
  if(state.buildings[key] || balance() < b.cost) return;
  state.spent += b.cost;
  state.buildings[key] = true;
  buildMap();
  SFX.build();
  if(key==="well"){
    flash("You built a well! The walk for water just got far shorter. ⛲", true);
    state.trip.meters = 0; state.trip.reachedSource = false;
  }else{
    flash(`${b.name} built! The village grows. ${b.icon}`);
  }
  renderBuilds();
  render();
}

/* ---------------- render ---------------- */
function render(){
  $("hudLiters").textContent = Math.round(balance());
  $("hudDay").textContent = state.day;
  $("hudKm").textContent = (state.distance/1000).toFixed(2);
  $("stepCount").textContent = state.steps;

  $("goalNums").textContent = `${Math.min(Math.round(state.collected),state.goal)} / ${state.goal} L`;
  $("goalBar").style.width = Math.min(100, 100*state.collected/state.goal) + "%";

  const got = Math.min(state.collected - state.quest.startCollected, state.quest.need);
  $("questNums").textContent = `${got} / ${state.quest.need} L`;
  $("questBar").style.width = (100*got/state.quest.need) + "%";

  const target = roundTripTarget(), half = target/2;
  $("tripMeters").textContent = fmtMeters(state.trip.meters);
  $("tripTarget").textContent = fmtMeters(target);
  $("tripsDone").textContent = state.trip.trips;
  $("walkPill").textContent = state.demoScale ? "demo scale" : "real 6 km trip";

  // leg label + can fill
  const can = $("canFill"), leg = $("legLabel");
  if(!state.trip.reachedSource){
    leg.textContent = "Heading to the water source →";
    leg.className = "leg";
    can.style.height = "0%";
  }else{
    leg.textContent = "← Carrying water home (the heavy part)";
    leg.className = "leg carry";
    const ret = (state.trip.meters - half)/half;
    can.style.height = Math.max(8, Math.min(100, 100*(1-ret*0))) + "%"; // full once collected
    can.style.height = "100%";
  }

  // walker position along route
  const route = $("walker").parentElement.clientWidth || 300;
  let f; // 0..1 left->right
  if(!state.trip.reachedSource){ f = Math.min(1, state.trip.meters/half); }
  else { f = 1 - Math.min(1, (state.trip.meters-half)/half); }
  $("walker").style.left = (6 + f*(route-22)) + "px";
  $("walker").textContent = state.trip.reachedSource ? "🚶🏽‍♀️" : "🚶🏽";
}

/* ---------------- pixel map (canvas) ---------------- */
const cv = $("map"), ctx = cv.getContext("2d");
const TILE = 32, COLS = 12, ROWS = 8;
// simple village grid: g grass, p path, w water, h house, T tree, . empty plot
let GRID = [];
function buildMap(){
  GRID = [
    "gggggggggggw".split(""),
    "gTggphhggggw".split(""),
    "ggggphggpppw".split(""),
    "gghhpggpgggw".split(""),
    "ggggpppppggw".split(""),
    "ghggTggpgTgw".split(""),
    "gggggggpgggw".split(""),
    "gggTgggggggw".split(""),
  ];
  // place built structures onto grid
  if(state.buildings.well){ GRID[4][6]="O"; }       // well
  if(state.buildings.tank){ GRID[5][3]="K"; }
  if(state.buildings.garden){ GRID[7][1]="N"; }
  if(state.buildings.school){ GRID[1][9]="S"; }
  drawMap();
}

function px(x,y,w,h,c){ ctx.fillStyle=c; ctx.fillRect(x,y,w,h); }

function drawTile(type, cx, cy){
  // base grass under everything
  px(cx,cy,TILE,TILE,"#7CB86A");
  px(cx+4,cy+6,3,3,"#6AA85B"); px(cx+20,cy+22,3,3,"#6AA85B"); px(cx+12,cy+14,2,2,"#8FCB7C");
  if(type==="w"){ // water
    px(cx,cy,TILE,TILE,"#2D9CDB");
    px(cx+3,cy+6,10,2,"#7FC9F0"); px(cx+16,cy+18,10,2,"#7FC9F0"); px(cx+8,cy+26,8,2,"#1E7CB8");
  }
  else if(type==="p"){ // path
    px(cx,cy,TILE,TILE,"#CDA86A");
    px(cx+5,cy+8,4,4,"#bd9658"); px(cx+20,cy+18,4,4,"#bd9658");
  }
  else if(type==="h"){ // house
    px(cx+5,cy+12,22,16,"#E7D6B8");           // wall
    px(cx+3,cy+6,26,8,"#C0533B");             // roof
    px(cx+13,cy+18,6,10,"#7A5230");           // door
  }
  else if(type==="T"){ // tree
    px(cx+13,cy+18,6,10,"#7A5230");
    px(cx+8,cy+6,16,14,"#3E8E41"); px(cx+11,cy+3,10,8,"#4DA354");
  }
  else if(type==="O"){ // well (built)
    px(cx+8,cy+10,16,16,"#9aa1a6");           // stone ring
    px(cx+11,cy+13,10,10,"#2D9CDB");          // water
    px(cx+7,cy+6,18,3,"#7A5230");             // roof beam
  }
  else if(type==="K"){ // tank
    px(cx+9,cy+8,14,20,"#6E7B86"); px(cx+9,cy+8,14,4,"#94A0AB");
  }
  else if(type==="N"){ // garden
    px(cx+6,cy+18,20,8,"#7A5230");
    px(cx+8,cy+12,3,8,"#4DA354"); px(cx+15,cy+10,3,10,"#4DA354"); px(cx+22,cy+13,3,7,"#4DA354");
  }
  else if(type==="S"){ // school
    px(cx+4,cy+12,24,16,"#F0E2C0"); px(cx+2,cy+8,28,6,"#2D6CB8");
    px(cx+13,cy+18,6,10,"#7A5230");
  }
}

function drawMap(){
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      drawTile(GRID[r][c], c*TILE, r*TILE);
    }
  }
}

function drawLoop(){
  drawMap();
  requestAnimationFrame(drawLoop);
}

/* ---------------- feedback ---------------- */
let toastTimer=null;
function flash(msg, big){
  const t=$("toast");
  t.textContent=msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove("show"), big?2600:1600);
}
let factIdx=0;
function loopFact(){
  setInterval(()=>{
    factIdx=(factIdx+1)%FACTS.length;
    $("factText").textContent=FACTS[factIdx];
  }, 7000);
}

/* ---------------- controls ---------------- */
$("startBtn").addEventListener("click", startSensor);
$("testBtn").addEventListener("click", ()=> addSteps(20));

/* treat contaminated water (the twist resolution) */
$("hazardBtn").addEventListener("click", ()=>{
  if(!state.hazard.active) return;
  state.hazard.treated = true;
  state.hazard.active = false;
  $("hazard").classList.remove("show");
  flash("Water treated — safe to carry home 💧");
  SFX.treat();
});

/* ---------------- win celebration ---------------- */
function showWin(){
  const place = state.city.name.split(",")[0];
  $("winNum").textContent = Math.round(state.collected) + " L carried home";
  $("winSub").textContent =
    `Over ${state.day} day${state.day>1?"s":""} of walking, you brought clean water to ${place}.`;
  $("winwrap").classList.add("show");
  fireConfetti();
  SFX.win();
}

const conf = $("confetti"), cctx = conf.getContext("2d");
let confParticles = [], confRAF = null;
function sizeConf(){ conf.width = innerWidth; conf.height = innerHeight; }
function fireConfetti(){
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  sizeConf();
  conf.style.display = "block";
  const colors = ["#FFC907","#2D9CDB","#FFFFFF","#143D5E","#FFE07A"];
  confParticles = [];
  for(let i=0;i<150;i++){
    confParticles.push({
      x:Math.random()*conf.width, y:-20-Math.random()*conf.height*0.5,
      w:6+Math.random()*6, h:8+Math.random()*8,
      c:colors[Math.floor(Math.random()*colors.length)],
      vy:2+Math.random()*4, vx:-2+Math.random()*4,
      rot:Math.random()*6.28, vr:-0.2+Math.random()*0.4
    });
  }
  const start = Date.now();
  cancelAnimationFrame(confRAF);
  (function run(){
    cctx.clearRect(0,0,conf.width,conf.height);
    confParticles.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.04; p.rot+=p.vr;
      cctx.save(); cctx.translate(p.x,p.y); cctx.rotate(p.rot);
      cctx.fillStyle=p.c; cctx.fillRect(-p.w/2,-p.h/2,p.w,p.h); cctx.restore();
    });
    if(Date.now()-start < 4200){ confRAF = requestAnimationFrame(run); }
    else { cctx.clearRect(0,0,conf.width,conf.height); conf.style.display="none"; }
  })();
}
window.addEventListener("resize", ()=>{ if(conf.style.display==="block") sizeConf(); });

/* ---------------- reset ---------------- */
function resetGame(){
  Object.assign(state, {
    day:1, collected:0, spent:0, steps:0, distance:0,
    trip:{meters:0, reachedSource:false, trips:0},
    hazard:{active:false, treated:false},
    won:false, demoScale:true,
    goal:diff().goal, milestonesHit:[],
    buildings:{well:false, tank:false, garden:false, school:false}
  });
  clearDrops();
  state.city = CITIES[Math.floor(Math.random()*CITIES.length)];
  $("cityName").textContent = state.city.name;
  $("cityNote").textContent = state.city.note;
  $("hazard").classList.remove("show");
  $("winwrap").classList.remove("show");
  $("startBtn").disabled = false;
  $("startBtn").textContent = "Start walking";
  $("scaleBtn").textContent = "Switch to real distance (6 km)";
  buildMap(); newQuest(); renderBuilds(); render();
  flash("New game — a new community to support.", true);
}
$("resetBtn").addEventListener("click", resetGame);
$("playAgain").addEventListener("click", ()=>{ $("winwrap").classList.remove("show"); resetGame(); });

$("scaleBtn").addEventListener("click", ()=>{
  state.demoScale = !state.demoScale;
  state.trip.meters=0; state.trip.reachedSource=false;
  $("scaleBtn").textContent = state.demoScale
    ? "Switch to real distance (6 km)"
    : "Switch to demo scale";
  flash(state.demoScale ? "Demo scale: a trip is ~120 steps." : "Real distance: a trip is the average 6 km walk.", true);
  render();
});


/* ================= sound effects (WebAudio, no files needed) ================= */
let audioCtx = null, muted = false;
function ac(){
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if(audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function tone(freq, dur, type="triangle", vol=0.14, when=0){
  if(muted) return;
  try{
    const c = ac();
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + when + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + when);
    o.stop(c.currentTime + when + dur + 0.05);
  }catch(e){ /* audio unavailable — fail silently */ }
}
const SFX = {
  collect(){ tone(660,.12); tone(880,.16,"triangle",.12,.08); },                       // filled / picked up a drop
  deliver(){ tone(523,.12); tone(659,.12,"triangle",.14,.1); tone(784,.2,"triangle",.14,.2); },
  miss(){ tone(220,.25,"sawtooth",.09); tone(155,.3,"sawtooth",.07,.12); },            // spill / drop evaporated
  build(){ tone(392,.1,"square",.08); tone(523,.16,"square",.08,.09); },
  treat(){ tone(700,.1,"sine",.12); tone(940,.14,"sine",.1,.07); },
  milestone(){ tone(587,.12); tone(784,.18,"triangle",.12,.1); },
  win(){ [523,659,784,1046].forEach((f,i)=>tone(f,.25,"triangle",.16,i*.15)); tone(1318,.5,"triangle",.13,.6); }
};
$("muteBtn").addEventListener("click", ()=>{
  muted = !muted;
  const b = $("muteBtn");
  b.textContent = muted ? "🔇" : "🔊";
  b.setAttribute("aria-pressed", String(muted));
  if(!muted) SFX.collect();
});

/* ============ interactive bonus drops: click one and it pops away ============ */
let dropTimer = null;
function scheduleDrop(){
  clearTimeout(dropTimer);
  const [a,b] = diff().dropEvery;
  dropTimer = setTimeout(spawnDrop, a + Math.random()*(b-a));
}
function spawnDrop(){
  if(state.won){ scheduleDrop(); return; }
  const layer = $("dropLayer");
  const d = document.createElement("button");
  d.type = "button";
  d.className = "drop";
  d.textContent = "💧";
  d.setAttribute("aria-label", "Bonus water drop — click to collect");
  d.style.left = (8 + Math.random()*76) + "%";
  d.style.top  = (10 + Math.random()*68) + "%";
  const expire = setTimeout(()=>{
    d.classList.add("gone");
    SFX.miss();
    flash("A bonus drop evaporated… 💨");
    setTimeout(()=>d.remove(), 300);
  }, diff().dropLife);
  d.addEventListener("click", ()=>{
    clearTimeout(expire);
    d.classList.add("pop");
    const bonus = diff().dropBonus;
    state.collected += bonus;
    flash(`Bonus +${bonus} L collected! 💧`);
    SFX.collect();
    checkMilestones(); checkQuest(); checkWin(); render();
    setTimeout(()=>d.remove(), 250);
  }, {once:true});
  layer.appendChild(d);
  scheduleDrop();
}
function clearDrops(){
  const layer = $("dropLayer");
  if(layer) layer.innerHTML = "";
  scheduleDrop();
}

/* ==================== difficulty selection ==================== */
function applyDifficultyUI(){
  document.querySelectorAll(".diff-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.diff === state.difficulty);
  });
  $("diffNote").textContent = "goal: " + diff().goal + " L";
  $("diffDesc").textContent = diff().desc;
}
document.querySelectorAll(".diff-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    if(btn.dataset.diff === state.difficulty) return;
    state.difficulty = btn.dataset.diff;
    applyDifficultyUI();
    resetGame();
    flash(diff().label + " mode — collect " + diff().goal + " L to win!", true);
  });
});

init();
