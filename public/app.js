const KEY=window.PLAN_KEY||"planificador-v1",DN=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const uid=()=>Math.random().toString(36).slice(2,9);
const dk=(o=0)=>{const d=new Date();d.setDate(d.getDate()+o);return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate()};
const LV=()=>[["07:00","13:00"],["15:00","20:00"],["20:00","21:00"]];
const WEEK=()=>({0:[["07:00","12:00"]],1:LV(),2:LV(),3:LV(),4:LV(),5:LV(),6:[["07:00","15:00"]]});
function SEED(){
  /* plantilla de inicio para cuentas nuevas: ejemplos genéricos que cada persona cambia o borra */
  const cats=[["TRABAJO","#B71C1C",1],["CLIENTES","#E57373",1],["PROYECTOS","#E65100",2],["ESTUDIOS","#FFB74D",2],["IDEAS","#FDD835",3],["SALUD","#1565C0",3],["FAMILIA","#1E88E5",3],["FINANZAS","#2E7D32",3],["PERSONAL","#616161",3]].map(c=>({id:uid(),name:c[0],color:c[1],lvl:Math.min(3,c[2])}));
  const by=n=>cats.find(c=>c.name===n).id;
  const t=[["TRABAJO","Revisar correos y responder lo urgente",30,1],["CLIENTES","Enviar propuesta al cliente nuevo",60,1],["TRABAJO","Preparar la reunión del jueves",45,1],["FINANZAS","Pagar servicios del mes",20,1],["PROYECTOS","Definir los próximos pasos del proyecto",60,0],["ESTUDIOS","Ver una clase del curso",45,0],["SALUD","Agendar chequeo médico",15,0],["FAMILIA","Llamar a mamá",20,0],["PERSONAL","Ordenar el escritorio",30,0]].map(a=>({id:uid(),cat:by(a[0]),text:a[1],min:a[2],urg:!!a[3],done:false,doneOn:null,createdAt:Date.now(),doneAt:null,plan0:null}));
  const r=[["CLIENTES","Cliente: aprobación de la propuesta"],["TRABAJO","Proveedor: cotización"]].map(a=>({id:uid(),cat:by(a[0]),text:a[1],done:false,createdAt:Date.now(),doneAt:null}));
  return {cats,tasks:t,resp:r,week:WEEK(),from:null,day:dk()};
}
let S=null;
try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){}
/* (las versiones antiguas guardadas solo en el navegador se traen con el respaldo .txt) */
if(!S||!S.cats)S=SEED();
/* solo existen prioridades 1, 2 y 3: las antiguas 4 y 5 pasan a 3 */
const TAGS0=()=>[{id:uid(),name:"Concentración",color:"#3B82F6"},{id:uid(),name:"Tarea ligera",color:"#8B5CF6"},{id:uid(),name:"Fuera de oficina",color:"#2E7D32"}];
if(!Array.isArray(S.tags))S.tags=TAGS0();
/* número de ingreso: las tareas antiguas sin fecha reciben uno según el orden actual, una sola vez; las nuevas, el siguiente */
function ensureSeq(st){let n=st.seqN|0;[...(st.tasks||[]),...(st.resp||[])].forEach(x=>{if(x.seq==null)x.seq=++n;else n=Math.max(n,x.seq)});st.seqN=n}
ensureSeq(S);
function migSep(st){const ids=new Set((st.cats||[]).filter(c=>/^separador$/i.test(String(c.name||"").trim())).map(c=>c.id));
  (st.tasks||[]).forEach(t=>{if(!t.sep&&!t.done&&ids.has(t.cat)&&/^[\s\-–—_=.·*]*$/.test(t.text||"")){t.sep=true;t.cat=null;t.tag=null;t.min=0;t.text="";t.plan0=null}});
  (st.resp||[]).forEach(r=>{if(!r.sep&&!r.done&&ids.has(r.cat)&&/^[\s\-–—_=.·*]*$/.test(r.text||"")){r.sep=true;r.cat=null;r.text=""}})}
migSep(S);
const isSep=t=>!!(t&&t.sep);
const noSep=a=>a.filter(t=>!t.sep);
/* ordena respetando los separadores: cada tramo entre líneas se ordena por separado y las líneas no se mueven */
function sortChunks(arr,cmp){const out=[];let ch=[];const fl=()=>{out.push(...ch.map((t,i)=>[t,i]).sort((a,b)=>cmp(a[0],b[0])||a[1]-b[1]).map(x=>x[0]));ch=[]};
  arr.forEach(t=>{if(t.sep){fl();out.push(t)}else ch.push(t)});fl();return out}
const nextSeq=()=>++S.seqN;
const tagOf=id=>S.tags.find(g=>g.id===id)||null;
const tagOpts=sel=>`<option value="">Sin etiqueta</option>`+S.tags.map(g=>`<option value="${g.id}"${g.id===sel?" selected":""}>${esc(g.name)}</option>`).join("");
const tagPill=t=>{const g=tagOf(t.tag);return g?`<button type="button" class="tg" style="--tc:${g.color}" title="Cambiar etiqueta">${esc(g.name)}</button>`:`<button type="button" class="tg none" title="Poner etiqueta" aria-label="Poner etiqueta">+ etiqueta</button>`};
const fixLvl=st=>{(st.cats||[]).forEach(c=>{c.lvl=Math.min(3,Math.max(1,c.lvl|0||3))})};fixLvl(S);
const maxM=()=>Math.min(24,Math.max(1,S.maxH||12))*60;
/* historial para deshacer (Ctrl/Cmd + Z) y rehacer (Ctrl/Cmd + Y o Shift + Ctrl/Cmd + Z).
   Cada guardado deja una foto del estado anterior; los cambios seguidos (menos de 1 s, como al escribir) cuentan como uno.
   No guarda cosas de pantalla: posición del Gantt, secciones abiertas, hora "desde", fecha del último respaldo. */
const H={u:[],r:[],last:null,t:0,el:null};
function persist(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}window.Cloud&&Cloud.push()}
const snap=()=>JSON.stringify(S,(k,v)=>k==="off"||k==="ui"||k==="lastBk"||k==="from"||k==="day"?undefined:v);
function save(){
  if(H.last!==null){const j=snap();if(j!==H.last){const now=Date.now(),a=document.activeElement;
    /* solo se agrupa lo que escribes seguido en un mismo campo; borrar, mover o crear siempre es un paso aparte */
    const typing=a&&(a.isContentEditable||a.tagName==="TEXTAREA"||a.tagName==="INPUT"&&/^(text|search|number|)$/.test(a.type||""));
    if(!(typing&&a===H.el&&now-H.t<1500)){H.u.push(H.last);if(H.u.length>100)H.u.shift()}
    H.t=now;H.el=typing?a:null;H.r.length=0;H.last=j}}
  persist()}
function undoRedo(redo){
  const from=redo?H.r:H.u,to=redo?H.u:H.r;
  if(!from.length){flash(redo?"No hay nada para rehacer.":"No hay nada para deshacer.");return}
  const cur=snap(),prev=from.pop();to.push(cur);
  const keep={ui:S.ui,from:S.from,day:S.day,lastBk:S.lastBk,off:S.gantt&&S.gantt.off};
  S=JSON.parse(prev);S.ui=keep.ui;S.from=keep.from;S.day=keep.day;S.lastBk=keep.lastBk;if(S.gantt&&keep.off!=null)S.gantt.off=keep.off;
  H.last=prev;H.t=Date.now();
  persist()
  if(typeof GE!=="undefined")GE.hidden=true;
  try{gEditing=null;gNewCat=null}catch(e){}
  render();window.fillGN&&fillGN();
  flash(redo?"Rehecho ↷":"Deshecho ↶ (Ctrl+Y para rehacer)")}
document.addEventListener("keydown",e=>{
  if(!(e.ctrlKey||e.metaKey)||e.altKey)return;const k=e.key.toLowerCase();if(k!=="z"&&k!=="y")return;
  const a=document.activeElement;
  /* dentro de un texto que estás escribiendo, el navegador deshace las letras */
  if(a&&(a.isContentEditable||a.tagName==="TEXTAREA"||a.tagName==="INPUT"&&!/^(checkbox|color|range|radio|button|submit|file)$/.test(a.type)))return;
  if(document.querySelector(".cfm"))return;
  e.preventDefault();undoRedo(k==="y"||e.shiftKey)});
/* alerta de borrado: confirma antes de borrar */
function askDel(msg,ok){
  document.querySelectorAll(".cfm").forEach(x=>x.remove());
  const d=document.createElement("div");d.className="cfm";
  d.innerHTML=`<div class="cfmb" role="alertdialog" aria-modal="true" aria-labelledby="cfmT"><div class="cfmi" aria-hidden="true">🗑</div><p class="cfmt" id="cfmT">${msg}</p><p class="cfms">Si te equivocas: <b>Ctrl + Z</b> (o el botón Deshacer) lo recupera.</p><div class="cfmf"><button type="button" class="cn">Cancelar</button><button type="button" class="dl">Sí, borrar</button></div></div>`;
  document.body.appendChild(d);
  const close=()=>{d.remove();document.removeEventListener("keydown",kd,true)};
  const go=()=>{close();ok()};
  const kd=e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close()}else if(e.key==="Enter"){e.preventDefault();e.stopPropagation();go()}};
  document.addEventListener("keydown",kd,true);
  d.querySelector(".cn").onclick=close;d.querySelector(".dl").onclick=go;
  d.addEventListener("mousedown",e=>{if(e.target===d)close()});
  d.querySelector(".dl").focus()}
/* aviso con botón Deshacer (sirve también en el celular, donde no hay Ctrl + Z) */
function flashU(t){const el=$("toast");el.innerHTML=`<span>${esc(t)}</span> <button type="button" class="ghost sm tundo">↶ Deshacer</button>`;
  el.querySelector(".tundo").onclick=()=>{undoRedo(false)};clearTimeout(flash.t);flash.t=setTimeout(()=>el.textContent="",7000)}
const $=id=>document.getElementById(id);
const cat=id=>S.cats.find(c=>c.id===id)||{name:"Sin categoría",color:"#999999",lvl:9};
const toM=t=>{const[a,b]=(t||"0:0").split(":").map(Number);return a*60+b};
const fmt=m=>Math.floor(m/60)+":"+String(m%60).padStart(2,"0");
const hm=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
const nowM=()=>{const d=new Date();return Math.ceil((d.getHours()*60+d.getMinutes())/5)*5};
const wd=o=>{const d=new Date();d.setDate(d.getDate()+o);return d.getDay()};
const capDay=w=>S.week[w].reduce((a,b)=>a+Math.max(0,toM(b[1])-toM(b[0])),0);
const capWeek=()=>[0,1,2,3,4,5,6].reduce((a,w)=>a+capDay(w),0);
function flash(t){$("toast").textContent=t;clearTimeout(flash.t);flash.t=setTimeout(()=>$("toast").textContent="",2600)}
if(S.day!==dk()){S.from=null;S.day=dk()}
/* registro de fechas: ingreso (creado), programado (primera hora asignada) y culminación */
const MES=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const fd=ts=>{if(!ts)return"—";const d=new Date(ts),y=d.getFullYear()!==new Date().getFullYear()?" "+d.getFullYear():"";return d.getDate()+" "+MES[d.getMonth()]+y+" "+hm(d.getHours()*60+d.getMinutes())};
const fdTxt=ts=>{if(!ts)return"sin registro";const d=new Date(ts);return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear()+" "+hm(d.getHours()*60+d.getMinutes())};
function dur(ms){const m=Math.round(Math.abs(ms)/60000);if(m<60)return m+" min";const h=Math.floor(m/60),r=m%60;
  if(h<24)return h+" h"+(r?" "+r+" min":"");const d=Math.floor(h/24),hh=h%24;return d+(d===1?" día":" días")+(hh&&d<3?" "+hh+" h":"")}
/* resultado de una tarea terminada: compara con la hora programada (o con el ingreso si nunca tuvo hora) */
function result(t){
  if(!t.doneAt)return null;
  if(t.plan0){const diff=t.doneAt-(t.plan0+(t.min||0)*60000),tol=10*60000;
    if(diff>tol)return{c:"late",t:"Se terminó "+dur(diff)+" después de lo programado"};
    if(t.doneAt<t.plan0-tol)return{c:"ontime",t:"Se terminó "+dur(t.plan0-t.doneAt)+" antes de lo programado"};
    return{c:"ontime",t:"Se terminó a tiempo"}}
  if(t.createdAt)return{c:"",t:"Se terminó "+dur(t.doneAt-t.createdAt)+" después de ingresada (nunca tuvo hora asignada)"};
  return null}
/* estado de una tarea pendiente: ¿ya pasó su hora programada original? */
function overdue(t){if(t.done||!t.plan0)return null;const diff=Date.now()-(t.plan0+(t.min||0)*60000);return diff>10*60000?"Atrasada "+dur(diff):null}
function respResult(r){if(!r.doneAt||!r.createdAt)return null;return"Respondieron "+dur(r.doneAt-r.createdAt)+" después"}

/* días que quedan hasta el domingo (sáb=1, dom=0); HOY y COLA son manuales: solo está en Hoy lo que tú subes; todo lo demás está en Cola */
const DL=()=>(7-wd(0))%7;
const NDAYS=()=>0;
const DNL=["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const zoneOf=o=>o<0?"cola":"hoy";
/* pone hora solo a lo que tú fijaste en Hoy (desde la hora elegida); todo lo demás es Cola y nunca sube solo */
function schedule(){
  const from=S.from==null?nowM():toM(S.from),free=[],N=NDAYS(),L=DL();
  for(let o=0;o<=N;o++)free.push(S.week[wd(o)].map(b=>[Math.max(toM(b[0]),o?0:from),toM(b[1])]).filter(x=>x[1]>x[0]).sort((a,b)=>a[0]-b[0]));
  /* cursor secuencial por día: una tarea nunca vuelve a rellenar un hueco anterior, así se respeta el orden de la lista */
  const cur=()=>free.map(()=>({k:0,pos:0}));
  const fit=(c,o,m)=>{const sl=free[o],st=c[o];while(st.k<sl.length){if(st.pos<sl[st.k][0])st.pos=sl[st.k][0];if(sl[st.k][1]-st.pos>=m){const s=st.pos;st.pos+=m;return s}st.k++}return null};
  const plan={},open=S.tasks.filter(t=>!t.done);
  const hoyT=open.filter(t=>pinOf(t)==="hoy");
  open.forEach(t=>{if(pinOf(t)!=="hoy")plan[t.id]={o:-1}});
  /* horas dentro de Hoy en el orden exacto de la lista; si ya no queda espacio, la tarea sigue en Hoy después del último bloque */
  const c2=cur();let ov=Math.max(from,free[0].length?free[0][free[0].length-1][1]:from);
  hoyT.forEach(t=>{const m=Math.max(0,t.min|0),s0=fit(c2,0,m);
    if(s0!=null){plan[t.id]={o:0,s:s0,e:s0+m};return}
    const s1=Math.min(ov,1439);ov+=m;plan[t.id]={o:0,s:s1,e:s1+m}});
  return plan;
}
/* ===== lo que no cabe en Hoy baja a Cola =====
   Se revisa en el orden de Hoy: cada tarea busca lugar en los bloques que quedan (desde la hora actual).
   La que no cabe en ningún bloque baja; las siguientes más cortas pueden seguir entrando en los huecos.
   Separadores y tareas sin minutos nunca bajan. */
function hoyOverflow(tasks){
  const from=S.from==null?nowM():toM(S.from);
  const sl=S.week[wd(0)].map(b=>[Math.max(toM(b[0]),from),toM(b[1])]).filter(x=>x[1]>x[0]).sort((a,b)=>a[0]-b[0]);
  let k=0,pos=0;const out=[];
  (tasks||S.tasks).filter(t=>!t.done&&pinOf(t)==="hoy").forEach(t=>{const m=Math.max(0,t.min|0);if(t.sep||!m)return;
    let kk=k,pp=pos,ok=false;
    while(kk<sl.length){if(pp<sl[kk][0])pp=sl[kk][0];if(sl[kk][1]-pp>=m){pp+=m;ok=true;break}kk++}
    if(ok){k=kk;pos=pp}else out.push(t)});
  return out}
function hoyFree(){const from=S.from==null?nowM():toM(S.from);
  const cap=S.week[wd(0)].reduce((a,b)=>a+Math.max(0,toM(b[1])-Math.max(toM(b[0]),from)),0);
  const used=S.tasks.filter(t=>!t.done&&!t.sep&&pinOf(t)==="hoy").reduce((a,t)=>a+(t.min|0),0);
  return Math.max(0,cap-used)}
/* baja a Cola (arriba) lo que no cabe. Se guarda junto con el cambio que lo provocó, así Deshacer revierte las dos cosas. */
let rTick=false;
function dropOverflow(){
  const out=hoyOverflow();if(!out.length)return;
  out.forEach(t=>{setPin(t,null);S.tasks.splice(S.tasks.indexOf(t),1)});
  const first=S.tasks.findIndex(t=>!t.done&&pinOf(t)!=="hoy");
  S.tasks.splice(first<0?S.tasks.length:first,0,...out);
  delete secMode.cola;S.sortUI={m:secMode,d:sortDir};
  H.last=snap();persist()
  const n=out.length,msg=`${n===1?"«"+plain(out[0].text)+"» bajó":n+" tareas bajaron"} a Cola: no alcanza el tiempo de hoy.`;
  setTimeout(()=>rTick?flash(msg):flashU(msg),0)}
/* alerta cuando insistes en subir a Hoy algo que no cabe */
function askInfo(title,sub){
  document.querySelectorAll(".cfm").forEach(x=>x.remove());
  const d=document.createElement("div");d.className="cfm";
  d.innerHTML=`<div class="cfmb" role="alertdialog" aria-modal="true" aria-labelledby="cfmT"><div class="cfmi warn" aria-hidden="true">⏱</div><p class="cfmt" id="cfmT">${title}</p>${sub?`<p class="cfms">${sub}</p>`:""}<div class="cfmf"><button type="button" class="ok primary">Entendido</button></div></div>`;
  document.body.appendChild(d);
  const close=()=>{d.remove();document.removeEventListener("keydown",kd,true)};
  const kd=e=>{if(e.key==="Escape"||e.key==="Enter"){e.preventDefault();e.stopPropagation();close()}};
  document.addEventListener("keydown",kd,true);
  d.querySelector(".ok").onclick=close;d.addEventListener("mousedown",e=>{if(e.target===d)close()});
  d.querySelector(".ok").focus()}
/* fijar una tarea en Hoy; sin pin = Cola. Lo que no alcanza el tiempo de hoy baja solo a Cola.
   (compatibilidad: pines viejos de Cola, Mañana o Semana pasan a Cola) */
const dkN=k=>{const[y,m,d]=String(k).split("-").map(Number);return y*10000+m*100+d};
function pinOf(t){if(!t.pin)return null;const p=String(t.pin);
  if(!/^\d+-\d+-\d+$/.test(p)||dkN(p)>dkN(dk(0))){t.pin=null;return null}
  return"hoy"}
function setPin(t,z){t.pin=z==="hoy"?dk(0):null}

function arc(r,a0,a1){const p=a=>[75+r*Math.cos(a),75+r*Math.sin(a)],[x0,y0]=p(a0),[x1,y1]=p(a1);return`M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1-a0>Math.PI?1:0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`}
function ring(segs,total){const R=58,W=18,g=1/R;let a=-Math.PI/2,out=`<circle cx="75" cy="75" r="${R}" fill="none" stroke="var(--free)" stroke-width="${W}" data-t="Libre"/>`;
  segs.forEach(s=>{if(s.v<=0)return;const sw=Math.min(s.v/total,1)*Math.PI*2;
    out+=sw>=Math.PI*2-.001?`<circle cx="75" cy="75" r="${R}" fill="none" stroke="${s.c}" stroke-width="${W}" data-t="${esc(s.t)}"/>`:`<path d="${arc(R,a+g,a+sw-g)}" fill="none" stroke="${s.c}" stroke-width="${W}" data-t="${esc(s.t)}"/>`;a+=sw});
  return`<svg viewBox="0 0 150 150" role="img" aria-label="Horas por categoría">${out}</svg>`}
function pieBlock(title,tasks,done,cap,extra){
  const agg={};let used=0;
  if(done.length){const v=done.reduce((a,t)=>a+t.min,0);agg["✓ Hechas"]={c:"var(--ok)",v,lvl:0}}
  tasks.forEach(t=>{const c=cat(t.cat);agg[c.name]=agg[c.name]||{c:c.color,v:0,lvl:c.lvl};agg[c.name].v+=t.min});
  const segs=Object.entries(agg).sort((a,b)=>a[1].lvl-b[1].lvl).map(([n,o])=>{used+=o.v;return{t:n+" · "+fmt(o.v)+" h",c:o.c,v:o.v,n}});
  return{html:`<div class="pie"><h3>${title}</h3><div class="ring">${ring(segs,Math.max(cap,used,1))}<div class="c"><b>${fmt(used)}</b><span>de ${fmt(cap)} h</span></div></div><p>${extra}</p></div>`,segs};
}

function inkOn(hex){const n=parseInt((hex||"#999999").slice(1),16),f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)},L=.2126*f(n>>16&255)+.7152*f(n>>8&255)+.0722*f(n&255);return L>.4?"#1A1F26":"#FFFFFF"}
const lv=c=>Math.min(3,Math.max(1,c.lvl|0||3));
const pdot=c=>`<span class="pdot p${lv(c)}" title="Prioridad ${lv(c)}" aria-label="Prioridad ${lv(c)}">P${lv(c)}</span>`;
function catOpts(sel){return S.cats.map(c=>`<option value="${c.id}"${c.id===sel?" selected":""}>${esc(c.name)}</option>`).join("")}
let dragId=null,dragR=null;
let lastSec={hoy:[],cola:[]};
const ZN={hoy:"Hoy",cola:"Cola"};
function moveTo(id,zone,beforeId,quiet){
  const t=S.tasks.find(x=>x.id===id);if(!t||t.done)return false;
  const curZone=Object.keys(lastSec).find(z=>lastSec[z].includes(id));
  /* subir a Hoy algo que no cabe: no se mueve y sale la alerta */
  if(zone==="hoy"&&curZone!=="hoy"&&!t.sep&&(t.min|0)>0){
    const pin0=t.pin,arr=S.tasks.filter(x=>x!==t);t.pin=dk(0);
    let at=beforeId?arr.findIndex(x=>x.id===beforeId):-1;if(at<0){const mine=lastSec.hoy.filter(x=>x!==id);at=mine.length?arr.findIndex(x=>x.id===mine[mine.length-1])+1:arr.length}
    arr.splice(at,0,t);const out=hoyOverflow(arr);t.pin=pin0;
    if(out.length){if(!quiet){const free=hoyFree();
        askInfo("No hay tiempo para hoy",`«${esc(plain(t.text))}» necesita <b>${fmt(t.min)} h</b> y hoy ${free>0?`quedan libres <b>${fmt(free)} h</b>${free>=t.min?" repartidas en huecos más cortos":""}`:"ya no queda tiempo libre"}. Libera tiempo en Hoy (baja o acorta otra tarea) o amplía tus bloques.`)}
      return false}}
  if(zone!==curZone)setPin(t,zone);
  delete secMode[zone];if(curZone)delete secMode[curZone];S.sortUI={m:secMode,d:sortDir};
  S.tasks.splice(S.tasks.indexOf(t),1);
  let at;
  if(beforeId)at=S.tasks.findIndex(x=>x.id===beforeId);
  else{const order=["hoy","cola"],k=order.indexOf(zone);
    const mine=lastSec[zone].filter(x=>x!==id);
    if(mine.length)at=S.tasks.findIndex(x=>x.id===mine[mine.length-1])+1;
    else{const later=order.slice(k+1).flatMap(z=>lastSec[z]).filter(x=>x!==id);at=later.length?S.tasks.findIndex(x=>x.id===later[0]):S.tasks.length}}
  S.tasks.splice(at<0?S.tasks.length:at,0,t);
  commit();
  const z=ZN[zone];
  if(!quiet)flash(zone===curZone?"Orden actualizado.":`Movida a ${z}: ${t.sep?"separador":plain(t.text)}`);
  return true
}
/* sube a Hoy, en el orden de Cola, las tareas que quepan en el tiempo libre que queda hoy (se salta las que no caben y sigue con las más cortas) */
function fillHoy(){
  const from=S.from==null?nowM():toM(S.from);
  const cap=S.week[wd(0)].reduce((a,b)=>a+Math.max(0,toM(b[1])-Math.max(toM(b[0]),from)),0);
  const mins=id=>{const t=S.tasks.find(x=>x.id===id);return t?(t.min|0):0};
  let used=lastSec.hoy.reduce((a,id)=>a+mins(id),0),n=0;
  [...lastSec.cola].forEach(id=>{const m=mins(id);if(!(m>0)||used+m>cap)return;if(moveTo(id,"hoy",null,true)){used+=m;n++}});
  flash(n?`Subí ${n} tarea${n===1?"":"s"} a Hoy (lo que cabe en tu tiempo libre).`:"No cabe ninguna tarea de Cola en el tiempo libre de hoy (las que no tienen minutos no se suben solas).")}
function zoneDrop(el,zone){
  el.dataset.zone=zone;
  el.addEventListener("dragover",e=>{if(dragId){e.preventDefault();el.classList.add("zover")}});
  el.addEventListener("dragleave",()=>el.classList.remove("zover"));
  el.addEventListener("drop",e=>{e.preventDefault();el.classList.remove("zover");if(dragId){const id=dragId;dragId=null;moveTo(id,zone,null)}});
}
const PM=document.createElement("div");PM.className="pm";PM.hidden=true;document.body.appendChild(PM);
function pinMenu(btn,t){
  const cur=pinOf(t);
  PM.innerHTML=`<div class="tph">Mover a…</div>`+[["hoy","Hoy"],["cola","Cola"]].map(([k,l])=>`<button type="button" data-k="${k}" class="${(cur||"cola")===k?"on":""}">${l}</button>`).join("");
  PM.hidden=false;const r=btn.getBoundingClientRect();
  PM.style.left=Math.max(8,Math.min(r.left+scrollX,scrollX+document.documentElement.clientWidth-PM.offsetWidth-8))+"px";PM.style.top=(r.bottom+scrollY+4)+"px";
  PM.onclick=e=>{const b=e.target.closest("button");if(!b)return;PM.hidden=true;
    moveTo(t.id,b.dataset.k,null)};
}
function tagMenu(btn,t){
  PM.innerHTML=`<div class="tph">Etiqueta</div>`+S.tags.map(g=>`<button type="button" class="tgo${t.tag===g.id?" on":""}" data-g="${g.id}"><i style="background:${g.color}"></i>${esc(g.name)}</button>`).join("")+`<button type="button" class="tgo${t.tag?"":" on"}" data-g=""><i style="background:var(--free)"></i>Sin etiqueta</button>`;
  PM.hidden=false;const r=btn.getBoundingClientRect();
  PM.style.left=Math.max(8,Math.min(r.left+scrollX,scrollX+document.documentElement.clientWidth-PM.offsetWidth-8))+"px";PM.style.top=(r.bottom+scrollY+4)+"px";
  PM.onclick=e=>{const b=e.target.closest("button");if(!b)return;PM.hidden=true;t.tag=b.dataset.g||null;commit()};
}
document.addEventListener("mousedown",e=>{if(!PM.hidden&&!PM.contains(e.target)&&!e.target.closest(".whenb,.tg,.sbt"))PM.hidden=true});
document.addEventListener("keydown",e=>{if(e.key==="Escape")PM.hidden=true});
/* la línea de registro solo aparece cuando la tarea ya está terminada */
const fdOn=k=>{if(!k)return null;const[y,m,d]=k.split("-").map(Number);return d+" "+MES[m-1]+(y!==new Date().getFullYear()?" "+y:"")};
function metaTask(t){return""}
function metaTip(t){
  if(!t.done)return"";
  const p=[];
  if(t.createdAt)p.push(`<span>Ingresada <b>${fd(t.createdAt)}</b></span>`);
  if(t.doneAt)p.push(`<span>Terminada <b>${fd(t.doneAt)}</b></span>`);
  else if(t.doneOn)p.push(`<span>Terminada <b>${fdOn(t.doneOn)}</b> (sin hora: se marcó antes del registro)</span>`);
  const r=result(t);if(r)p.push(r.t);
  return p.map(x=>x.replace(/<[^>]+>/g,"")).join(" · ")}
function metaResp(r){return""}
function metaRespOld(r){
  if(!r.done)return"";
  const p=[];
  if(r.createdAt)p.push(`<span>Ingresada <b>${fd(r.createdAt)}</b></span>`);
  if(r.doneAt)p.push(`<span>Respondieron <b>${fd(r.doneAt)}</b></span>`);
  const x=respResult(r);if(x)p.push(`<span class="ontime">${x}</span>`);
  return p.length?`<div class="meta">${p.join("")}</div>`:""}
/* ===== NEGRITA EN PARTE DEL TEXTO =====
   se guarda como **texto** (así sale en el respaldo y al copiar); en pantalla se ve en negrita */
const md=v=>esc(v||"").replace(/\*\*(.+?)\*\*/g,"<b>$1</b>");
const plain=v=>String(v||"").replace(/\*\*/g,"");
function rtxToMd(el){let out="";
  const walk=(n,bold)=>{if(n.nodeType===3){const t=n.nodeValue.replace(/ /g," ").replace(/\*\*/g,"*");out+=bold&&t.trim()?"\u0001"+t+"\u0002":t;return}
    if(n.nodeType!==1)return;if(n.tagName==="BR"){out+=" ";return}
    const fw=n.style&&n.style.fontWeight,b=bold||/^(B|STRONG)$/.test(n.tagName)||fw==="bold"||+fw>=600;
    n.childNodes.forEach(c=>walk(c,b))};
  el.childNodes.forEach(c=>walk(c,false));
  /* une tramos seguidos y deja los espacios fuera de los asteriscos */
  out=out.replace(/\u0002\u0001/g,"").replace(/\u0001(\s*)([\s\S]*?)(\s*)\u0002/g,(m,a,x,c)=>x?a+"**"+x+"**"+c:a+c);
  return /^\s*$/.test(out)?"":out}
function wireRtx(el,o){
  const sync=()=>{o.text=rtxToMd(el);el.title=plain(o.text);save()};
  el.addEventListener("input",sync);
  el.addEventListener("keydown",e=>{
    if(e.key==="Enter"||e.key==="Escape"){e.preventDefault();el.blur();return}
    if((e.metaKey||e.ctrlKey)&&!e.altKey){const k=e.key.toLowerCase();
      if(k==="b"){e.preventDefault();boldSel(el)}else if(k==="i"||k==="u")e.preventDefault()}});
  el.addEventListener("paste",e=>{e.preventDefault();const t=(e.clipboardData||window.clipboardData).getData("text/plain").replace(/\s+/g," ");document.execCommand("insertText",false,t)});
  el.addEventListener("drop",e=>e.preventDefault());
  /* al salir se vuelve a dibujar limpio (por si el navegador dejó etiquetas raras) */
  el.addEventListener("blur",()=>{sync();el.innerHTML=md(o.text);el.scrollLeft=0})}
function boldSel(el){try{document.execCommand("styleWithCSS",false,false)}catch(e){}
  document.execCommand("bold");el.dispatchEvent(new Event("input"));bfmtPlace()}
const BF=document.createElement("div");BF.className="bfmt";BF.hidden=true;BF.innerHTML=`<button type="button" title="Negrita (Ctrl/Cmd + B)" aria-label="Negrita">B</button>`;document.body.appendChild(BF);
BF.addEventListener("mousedown",e=>e.preventDefault());
BF.addEventListener("pointerdown",e=>e.preventDefault());
BF.querySelector("button").onclick=()=>{const s=getSelection(),el=s&&s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement).closest(".rtx");if(el)boldSel(el)};
function bfmtPlace(){const s=getSelection();
  const el=s&&s.rangeCount&&!s.isCollapsed&&s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement).closest(".rtx");
  if(!el||!el.contains(s.focusNode)){BF.hidden=true;return}
  const r=s.getRangeAt(0).getBoundingClientRect();if(!r.width&&!r.height){BF.hidden=true;return}
  BF.hidden=false;let on=false;try{on=document.queryCommandState("bold")}catch(e){}
  BF.querySelector("button").classList.toggle("on",on);
  const w=BF.offsetWidth,h=BF.offsetHeight,x=Math.max(8,Math.min(r.left+r.width/2-w/2,innerWidth-w-8)),y=r.top-h-8<8?r.bottom+8:r.top-h-8;
  BF.style.left=x+"px";BF.style.top=y+"px"}
document.addEventListener("selectionchange",bfmtPlace);
addEventListener("scroll",()=>{if(!BF.hidden)bfmtPlace()},true);
addEventListener("resize",()=>{if(!BF.hidden)bfmtPlace()});
function taskRow(t,when,zone){
  const c=cat(t.cat),d=document.createElement("div");
  d.className="row"+(t.done?" done":"")+(!t.done&&!(t.min>0)?" notime":"");
  if(!t.done&&S.view&&(S.view==="none"?!!tagOf(t.tag):t.tag!==S.view))d.hidden=true;
  d.innerHTML=`<span class="grip" title="Arrastrar" aria-hidden="true">⋮⋮</span>
  <button class="dn" title="${t.done?"Volver a pendiente":"Marcar como hecha"}" aria-label="${t.done?"Volver a pendiente":"Marcar como hecha"}">✓</button>
  ${pdot(c)}<select class="cs" id="c-${t.id}" aria-label="Categoría" title="${esc(c.name)}" style="--cc:${c.color};--ct:${inkOn(c.color)}">${catOpts(t.cat)}</select>
  <span class="tw"><div class="txt rtx" id="t-${t.id}" contenteditable="true" role="textbox" spellcheck="false" aria-label="Tarea" title="${esc(plain(t.text))}">${md(t.text)}</div>${tagPill(t)}${t.rt?`<span class="rtk" title="Rutina: vuelve a salir cada día que toca">🔁</span>`:""}</span>
  <input class="mins" id="m-${t.id}" type="number" min="0" step="5" value="${t.min>0?t.min:""}" placeholder="?" aria-label="Minutos" title="${t.min>0?"Minutos":"Sin tiempo: escribe los minutos"}">
  ${t.done?`<span class="when" title="${esc(metaTip(t))}">${when}</span>`:`<span class="wc"><button type="button" class="when whenb" title="Mover a Hoy o Cola">${when}${pinOf(t)&&zone!=="hoy"?" 📌":""}</button>${zone==="cola"?`<button type="button" class="uph" title="Subir esta tarea a Hoy" aria-label="Subir a Hoy">↑ Hoy</button>`:zone==="hoy"?`<button type="button" class="uph dwn" title="Bajar esta tarea a la cima de Cola" aria-label="Bajar a Cola">↓ Cola</button>`:""}</span>`}
  <button class="x" aria-label="Borrar tarea">×</button>${metaTask(t)}`;
  const q=s=>d.querySelector(s);
  q(".dn").onclick=()=>{t.done=!t.done;t.doneOn=t.done?dk():null;t.doneAt=t.done?Date.now():null;t.doneCat=t.done?t.cat:null;commit();if(t.done)flash("Hecha: "+plain(t.text))};
  q(".cs").onchange=e=>{t.cat=e.target.value;commit()};
  wireRtx(q(".txt"),t);
  q(".mins").onchange=e=>{const v=parseInt(e.target.value);t.min=v>0?v:0;commit()};
  q(".x").onclick=()=>askDel(`¿Borrar la tarea <b>«${esc(plain(t.text)||"sin texto")}»</b>?`,()=>{S.tasks=S.tasks.filter(x=>x.id!==t.id);commit();flashU("Tarea borrada.")});
  q(".tg").onclick=e=>tagMenu(e.currentTarget,t);
  if(q(".whenb"))q(".whenb").onclick=e=>pinMenu(e.currentTarget,t);
  if(q(".uph"))q(".uph").onclick=()=>zone==="hoy"?moveTo(t.id,"cola",lastSec.cola[0]||null):moveTo(t.id,"hoy",null);
  if(t.done){q(".grip").style.visibility="hidden";return d}
  q(".grip").addEventListener("mousedown",()=>d.draggable=true);
  d.addEventListener("dragstart",e=>{dragId=t.id;d.classList.add("drag");e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("application/x-tarea",t.id)}catch(err){}});
  d.addEventListener("dragend",()=>{d.draggable=false;d.classList.remove("drag");dragId=null;document.querySelectorAll(".over,.zover").forEach(x=>x.classList.remove("over","zover"))});
  d.addEventListener("dragover",e=>{if(dragId){e.preventDefault();d.classList.add("over")}});
  d.addEventListener("dragleave",()=>d.classList.remove("over"));
  d.addEventListener("drop",e=>{e.preventDefault();e.stopPropagation();d.classList.remove("over");if(!dragId||dragId===t.id)return;const id=dragId;dragId=null;moveTo(id,zone,t.id)});
  return d;
}
const sepLabel=o=>`<label class="sepw${o.text?"":" empty"}"><span class="sepm" aria-hidden="true">${esc(o.text||"+ título")}</span><input class="sepl" size="1" value="${esc(o.text||"")}" placeholder="+ título" aria-label="Título del separador" maxlength="60"></label>`;
/* escribir el título: se guarda al instante; Enter o Esc terminan; tocar la línea abre el campo */
function wireSepLabel(d,o){
  const w=d.querySelector(".sepw"),i=w.querySelector("input"),m=w.querySelector(".sepm");
  i.addEventListener("input",()=>{o.text=i.value.trim();m.textContent=i.value||"+ título";w.classList.toggle("empty",!i.value);save()});
  i.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key==="Escape"){e.preventDefault();i.blur()}});
  d.querySelectorAll("hr").forEach(h=>h.onclick=()=>i.focus())}
/* suma de minutos de cada separador: las tareas que tiene debajo, hasta el siguiente separador o el final de la lista */
let sepTot={};
function calcSep(arr){let cur=null;arr.forEach(t=>{if(t.sep){cur=t.id;sepTot[cur]=0}else if(cur)sepTot[cur]+=Math.max(0,t.min|0)})}
const durMin=m=>{const h=Math.floor(m/60),r=m%60;return h?(r?`${h} h ${r} min`:`${h} h`):`${r} min`};
function sepRow(t,zone){
  const d=document.createElement("div");d.className="sepr";d.setAttribute("role","separator");
  if(S.view)d.hidden=true;
  const tot=sepTot[t.id]||0;
  d.innerHTML=`<span class="grip" title="Arrastrar" aria-hidden="true">⋮⋮</span><hr>${sepLabel(t)}${tot?`<span class="sept" title="Tiempo de las tareas de este tramo (hasta el siguiente separador)">${durMin(tot)}</span>`:""}<hr><span class="sepact">${zone==="hoy"?`<button type="button" class="uph dwn" title="Bajar este separador a Cola">↓ Cola</button>`:`<button type="button" class="uph" title="Subir este separador a Hoy">↑ Hoy</button>`}<button class="x" aria-label="Borrar separador" title="Borrar separador">×</button></span>`;
  d.querySelector(".uph").onclick=()=>zone==="hoy"?moveTo(t.id,"cola",lastSec.cola[0]||null):moveTo(t.id,"hoy",null);
  d.querySelector(".x").onclick=()=>{S.tasks=S.tasks.filter(x=>x.id!==t.id);commit();flashU("Separador borrado.")};wireSepLabel(d,t);
  d.querySelector(".grip").addEventListener("mousedown",()=>d.draggable=true);
  d.addEventListener("dragstart",e=>{dragId=t.id;d.classList.add("drag");e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("application/x-tarea",t.id)}catch(err){}});
  d.addEventListener("dragend",()=>{d.draggable=false;d.classList.remove("drag");dragId=null;document.querySelectorAll(".over,.zover").forEach(x=>x.classList.remove("over","zover"))});
  d.addEventListener("dragover",e=>{if(dragId){e.preventDefault();d.classList.add("over")}});
  d.addEventListener("dragleave",()=>d.classList.remove("over"));
  d.addEventListener("drop",e=>{e.preventDefault();e.stopPropagation();d.classList.remove("over");if(!dragId||dragId===t.id)return;const id=dragId;dragId=null;moveTo(id,zone,t.id)});
  return d}
const newSep=zone=>({id:uid(),sep:true,text:"",min:0,cat:null,tag:null,done:false,doneOn:null,createdAt:Date.now(),seq:nextSeq(),doneAt:null,plan0:null,pin:zone==="hoy"?dk(0):null});
/* crea la línea arriba de la sección; luego se arrastra con ⋮⋮ */
function addSep(zone){const s=newSep(zone),first=lastSec[zone][0],at=first?S.tasks.findIndex(x=>x.id===first):-1;
  if(at>=0)S.tasks.splice(at,0,s);else S.tasks.push(s);
  commit();flash(`Separador agregado arriba de ${ZN[zone]}. Arrástralo con ⋮⋮ a donde quieras.`)}
/* separador dentro de Esperando respuesta: misma línea que en Hoy y Cola; se reordena arrastrando dentro del bloque */
function respSepRow(r){
  const d=document.createElement("div");d.className="sepr";d.setAttribute("role","separator");
  d.innerHTML=`<span class="grip" title="Arrastrar" aria-hidden="true">⋮⋮</span><hr>${sepLabel(r)}<hr><span class="sepact"><button class="x" aria-label="Borrar separador" title="Borrar separador">×</button></span>`;
  d.querySelector(".x").onclick=()=>{S.resp=S.resp.filter(x=>x.id!==r.id);commit();flashU("Separador borrado.")};wireSepLabel(d,r);
  d.querySelector(".grip").addEventListener("mousedown",()=>d.draggable=true);
  d.addEventListener("dragstart",e=>{dragR=r.id;d.classList.add("drag");e.dataTransfer.effectAllowed="move"});
  d.addEventListener("dragend",()=>{d.draggable=false;d.classList.remove("drag");dragR=null});
  d.addEventListener("dragover",e=>{if(dragR){e.preventDefault();d.classList.add("over")}});
  d.addEventListener("dragleave",()=>d.classList.remove("over"));
  d.addEventListener("drop",e=>{e.preventDefault();d.classList.remove("over");if(!dragR||dragR===r.id)return;
    const i=S.resp.findIndex(x=>x.id===dragR),m=S.resp.splice(i,1)[0];S.resp.splice(S.resp.findIndex(x=>x.id===r.id),0,m);dragR=null;commit()});
  return d}
const newSepR=()=>({id:uid(),sep:true,text:"",cat:null,done:false,createdAt:Date.now(),seq:nextSeq(),doneAt:null});
function addSepR(){const s=newSepR(),at=S.resp.findIndex(x=>!x.done);
  if(at>=0)S.resp.splice(at,0,s);else S.resp.push(s);
  commit();flash("Separador agregado arriba de Esperando respuesta. Arrástralo con ⋮⋮ a donde quieras.")}
function respRow(r){
  const c=cat(r.cat),d=document.createElement("div");d.className="row"+(r.done?" done":"");
  d.innerHTML=`<span class="grip" title="Arrastrar" aria-hidden="true">⋮⋮</span><button class="dn" title="${r.done?"Volver a pendiente":"Ya respondieron"}" aria-label="${r.done?"Volver a pendiente":"Ya respondieron"}">✓</button>
  ${pdot(c)}<select class="cs" id="rc-${r.id}" aria-label="Categoría" title="${esc(c.name)}" style="--cc:${c.color};--ct:${inkOn(c.color)}">${catOpts(r.cat)}</select>
  <div class="txt rtx" id="rt-${r.id}" contenteditable="true" role="textbox" spellcheck="false" aria-label="Esperando respuesta de" title="${esc(plain(r.text))}">${md(r.text)}</div>
  <span></span><span class="when" style="color:var(--rpta)">${r.done?"respondió":"⏳ RPTA"}</span>
  <button class="x" aria-label="Borrar">×</button>${metaResp(r)}`;
  d.querySelector(".dn").onclick=()=>{r.done=!r.done;r.doneAt=r.done?Date.now():null;commit()};
  d.querySelector(".grip").addEventListener("mousedown",()=>d.draggable=true);
  d.addEventListener("dragstart",e=>{dragR=r.id;d.classList.add("drag");e.dataTransfer.effectAllowed="move"});
  d.addEventListener("dragend",()=>{d.draggable=false;d.classList.remove("drag");dragR=null});
  d.addEventListener("dragover",e=>{if(dragR){e.preventDefault();d.classList.add("over")}});
  d.addEventListener("dragleave",()=>d.classList.remove("over"));
  d.addEventListener("drop",e=>{e.preventDefault();d.classList.remove("over");if(!dragR||dragR===r.id)return;
    const i=S.resp.findIndex(x=>x.id===dragR),m=S.resp.splice(i,1)[0];S.resp.splice(S.resp.findIndex(x=>x.id===r.id),0,m);dragR=null;commit()});
  d.querySelector(".cs").onchange=e=>{r.cat=e.target.value;commit()};
  wireRtx(d.querySelector(".txt"),r);
  d.querySelector(".x").onclick=()=>askDel(`¿Borrar <b>«${esc(plain(r.text)||"sin texto")}»</b> de Esperando respuesta?`,()=>{S.resp=S.resp.filter(x=>x.id!==r.id);commit();flashU("Borrado de Esperando respuesta.")});
  return d;
}
const sortDir=(S.sortUI&&S.sortUI.d)||{};
const SORTS=[["ing","Fecha de ingreso","Ingreso"],["pri","Prioridad (P1 → P3)","Prioridad"],["cat","Categoría (orden de importancia)","Categoría"],["tag","Etiqueta (tipo de tarea)","Etiqueta"],["min","Tiempo estimado","Tiempo"]];
const secMode=(S.sortUI&&S.sortUI.m)||{};
function secSort(zone,key){
  const ids=lastSec[zone];if(!ids||ids.length<2){flash("Esta sección tiene menos de 2 tareas.");return}
  const dir=sortDir[zone]=(secMode[zone]===key&&sortDir[zone]===1)?-1:1;secMode[zone]=key;
  const pos=ids.map(id=>S.tasks.findIndex(x=>x.id===id)).sort((a,b)=>a-b);
  const items=pos.map(i=>S.tasks[i]);
  const ci=new Map(S.cats.map((c,i)=>[c.id,i])),ti=new Map(S.tags.map((g,i)=>[g.id,i]));
  const ing=(a,b)=>((a.createdAt?1:0)-(b.createdAt?1:0))||((a.createdAt||0)-(b.createdAt||0))||((a.seq||0)-(b.seq||0)),lv=(a,b)=>cat(a.cat).lvl-cat(b.cat).lvl,co=(a,b)=>(ci.get(a.cat)??999)-(ci.get(b.cat)??999),tg=(a,b)=>(ti.get(a.tag)??999)-(ti.get(b.tag)??999);
  const main={ing,pri:lv,cat:(a,b)=>lv(a,b)||co(a,b),tag:tg,min:(a,b)=>a.min-b.min}[key];
  const tie={ing:()=>0,pri:ing,cat:ing,tag:(a,b)=>lv(a,b)||ing(a,b),min:(a,b)=>lv(a,b)||ing(a,b)}[key];
  const sorted=sortChunks(items,(a,b)=>main(a,b)*dir||tie(a,b));
  pos.forEach((p,i)=>S.tasks[p]=sorted[i]);
  S.sortUI={m:secMode,d:sortDir};commit();
  const L={ing:dir===1?"de la más antigua a la más reciente":"de la más reciente a la más antigua",pri:dir===1?"P1 primero; empates por fecha de ingreso":"P3 primero; empates por fecha de ingreso",cat:dir===1?"según el orden de importancia de categorías":"orden de categorías al revés",tag:dir===1?"agrupado por etiqueta, en el orden de la lista de etiquetas":"etiquetas en orden inverso",min:dir===1?"de menor a mayor tiempo":"de mayor a menor tiempo"}[key];
  flash(`${ZN[zone]}: ${L}.`);
}
function sortMenu(btn,zone){
  PM.innerHTML=`<div class="tph">Ordenar esta sección por…</div>`+SORTS.map(([k,l])=>`<button type="button" data-k="${k}" class="${secMode[zone]===k?"on":""}">${l}${secMode[zone]===k?(sortDir[zone]===1?" ↓":" ↑"):""}</button>`).join("")+`<div class="tph" style="margin:6px 0 0">Tócalo otra vez para invertir.</div>`;
  PM.hidden=false;const r=btn.getBoundingClientRect();
  PM.style.left=Math.max(8,Math.min(r.right+scrollX-PM.offsetWidth,scrollX+document.documentElement.clientWidth-PM.offsetWidth-8))+"px";PM.style.top=(r.bottom+scrollY+4)+"px";
  PM.onclick=e=>{const b=e.target.closest("button");if(!b)return;PM.hidden=true;secSort(zone,b.dataset.k)};
}
function secHead(L,txt,zone,cls){
  const s=document.createElement("div");s.className="sep sx"+(cls?" "+cls:"");
  const m=SORTS.find(x=>x[0]===secMode[zone]);
  s.innerHTML=`<span>${txt}</span><span class="ln"></span><button type="button" class="addsep" title="Agregar una línea separadora arriba de esta sección">+ separador</button><button type="button" class="sbt" title="Ordenar esta sección">Ordenar${m?": "+m[2]+(sortDir[zone]===1?" ↓":" ↑"):""} ▾</button>`;
  s.querySelector(".sbt").onclick=e=>sortMenu(e.currentTarget,zone);
  s.querySelector(".addsep").onclick=()=>addSep(zone);
  L.appendChild(s);zoneDrop(s,zone);return s;
}
function sep(L,txt,cls){const s=document.createElement("div");s.className="sep"+(cls?" "+cls:"");s.textContent=txt;L.appendChild(s);return s}

/* semanas: 0 = esta (lunes a domingo), 1 = la pasada, etc. */
const dts=k=>{if(!k)return 0;const[y,m,d]=k.split("-").map(Number);return new Date(y,m-1,d).getTime()};
function monday(){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(d.getDay()+6)%7);return d.getTime()}
function weekIdx(k){if(!k)return 99;const days=Math.round((monday()-dts(k))/864e5);return days<=0?0:Math.ceil(days/7)}
const DNs=k=>DN[new Date(dts(k)).getDay()];
/* minutos dedicados por prioridad → categoría (la categoría que tenía al terminarla) */
function dedication(list){const P={1:{v:0,cats:{}},2:{v:0,cats:{}},3:{v:0,cats:{}}};let tot=0;
  list.forEach(t=>{const m=t.min>0?t.min:0;if(!m)return;const c=cat(t.doneCat||t.cat),l=lv(c);P[l].v+=m;tot+=m;
    const k=c.id||c.name;P[l].cats[k]=P[l].cats[k]||{n:c.name,c:c.color,v:0};P[l].cats[k].v+=m});
  return{P,tot}}
function arcC(c,r,a0,a1){const p=a=>[c+r*Math.cos(a),c+r*Math.sin(a)],[x0,y0]=p(a0),[x1,y1]=p(a1);return`M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1-a0>Math.PI?1:0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`}
function sunburst(D){const C=100,R1=50,W1=22,R2=78,W2=26;let out=`<circle cx="${C}" cy="${C}" r="${R1}" fill="none" stroke="var(--free)" stroke-width="${W1}"/><circle cx="${C}" cy="${C}" r="${R2}" fill="none" stroke="var(--free)" stroke-width="${W2}"/>`;
  if(!D.tot)return`<svg viewBox="0 0 200 200" role="img" aria-label="Sin tiempo dedicado aún">${out}</svg>`;
  const seg=(r,w,a0,a1,col,tip)=>{const g=Math.min(.012,(a1-a0)/4);return a1-a0>=Math.PI*2-.001?`<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="${col}" stroke-width="${w}" data-t="${esc(tip)}"/>`:`<path d="${arcC(C,r,a0+g,a1-g)}" fill="none" stroke="${col}" stroke-width="${w}" data-t="${esc(tip)}"/>`};
  let a=-Math.PI/2;
  [1,2,3].forEach(l=>{const P=D.P[l];if(!P.v)return;const sw=P.v/D.tot*Math.PI*2;
    out+=seg(R1,W1,a,a+sw,`var(--p${l})`,`P${l} · ${fmt(P.v)} h · ${Math.round(P.v/D.tot*100)}%`);
    let b=a;Object.values(P.cats).sort((x,y)=>y.v-x.v).forEach(c=>{const s2=c.v/D.tot*Math.PI*2;out+=seg(R2,W2,b,b+s2,c.c,`${c.n} (P${l}) · ${fmt(c.v)} h · ${Math.round(c.v/D.tot*100)}%`);b+=s2});
    a+=sw});
  return`<svg viewBox="0 0 200 200" role="img" aria-label="Tiempo dedicado por prioridad y categoría">${out}</svg>`}
function dashWeek(plan,open,done,L0){
  const wk=done.filter(t=>weekIdx(t.doneOn)===0),D=dedication(wk),last=dedication(done.filter(t=>weekIdx(t.doneOn)===1));
  const pct=(v,t)=>t?Math.round(v/t*100)+"%":"0%";
  /* tabla agrupada */
  let rows="";[1,2,3].forEach(l=>{const P=D.P[l];if(!P.v)return;
    rows+=`<tr class="pr"><td><span class="pdot p${l}">P${l}</span>Prioridad ${l}</td><td class="n">${fmt(P.v)} h</td><td class="n pc">${pct(P.v,D.tot)}</td></tr>`;
    Object.values(P.cats).sort((x,y)=>y.v-x.v).forEach(c=>rows+=`<tr class="ct"><td><i style="background:${c.c}"></i>${esc(c.n)}</td><td class="n">${fmt(c.v)} h</td><td class="n pc">${pct(c.v,D.tot)}</td></tr>`)});
  /* planificado vs hecho: hecho esta semana + lo pendiente que tiene hora hasta el domingo */
  const plannedP={1:0,2:0,3:0};open.forEach(t=>{const p=plan[t.id];if(p&&p.o>=0&&p.o<=L0&&t.min>0)plannedP[lv(cat(t.cat))]+=t.min});
  const bars=[1,2,3].map(l=>{const h=D.P[l].v,tot=h+plannedP[l],w=tot?Math.round(h/tot*100):0;
    return`<div class="ln" title="P${l}: ${fmt(h)} h hechas de ${fmt(tot)} h planificadas para esta semana"><span class="pdot p${l}">P${l}</span><div class="tr"><div class="fl" style="width:${w}%;background:var(--p${l})"></div></div><span>${fmt(h)} / ${fmt(tot)} h</span></div>`}).join("");
  const lastTxt=last.tot?`Semana pasada: ${fmt(last.tot)} h · `+[1,2,3].filter(l=>last.P[l].v).map(l=>`P${l} ${pct(last.P[l].v,last.tot)}`).join(" · "):"Semana pasada: sin registro";
  return`<div class="ded"><h3>Esta semana</h3><div class="sun">${sunburst(D)}<div class="c"><b>${fmt(D.tot)} h</b><span>${D.tot?"dedicadas":"aún nada hecho"}</span></div></div><p class="last">${lastTxt}</p></div>
  <div class="dtab">${D.tot?`<table class="dt">${rows}</table>`:`<p class="empty-ded">Cuando marques tareas como hechas esta semana, aquí verás cuánto tiempo fue a cada prioridad y categoría.</p>`}</div>
  <div class="dtab"><div><h3 style="margin-bottom:6px">Planificado vs. hecho</h3><div class="pvh">${bars}</div></div>
  ${tagDash(plan,open,wk,L0)}</div>`}
function tagDash(plan,open,wk,L0){
  if(!S.tags.length)return"";
  const rows=[...S.tags.map(g=>({n:g.name,c:g.color,id:g.id})),{n:"Sin etiqueta",c:"var(--muted)",id:null}].map(g=>{
    const h=wk.filter(t=>(t.tag||null)===g.id).reduce((a,t)=>a+(t.min>0?t.min:0),0);
    const pl=open.filter(t=>(t.tag||null)===g.id&&t.min>0&&plan[t.id]&&plan[t.id].o>=0&&plan[t.id].o<=L0).reduce((a,t)=>a+t.min,0);
    return{...g,h,tot:h+pl}}).filter(g=>g.tot>0);
  if(!rows.length)return"";
  const all=rows.reduce((a,g)=>a+g.tot,0);
  const bars=rows.map(g=>{const w=g.tot?Math.round(g.h/g.tot*100):0;
    return`<div class="ln tgl" title="${esc(g.n)}: ${fmt(g.h)} h hechas de ${fmt(g.tot)} h planificadas (${all?Math.round(g.tot/all*100):0}% de la semana)"><span class="tg" style="--tc:${g.c};cursor:default">${esc(g.n)}</span><div class="tr"><div class="fl" style="width:${w}%;background:${g.c}"></div></div><span>${fmt(g.h)} / ${fmt(g.tot)} h</span></div>`}).join("");
  return`<div><h3 style="margin-bottom:6px">Por tipo de trabajo</h3><div class="pvh">${bars}</div></div>`}
/* síntesis de la semana: reemplaza la explicación tarea por tarea */
function synthesis(wk,open){
  const mins=t=>t.min>0?t.min:0,tot=wk.reduce((a,t)=>a+mins(t),0),pc=v=>tot?Math.round(v/tot*100)+"%":"—";
  const byDay={};wk.forEach(t=>{byDay[t.doneOn]=(byDay[t.doneOn]||0)+mins(t)});
  const best=Object.entries(byDay).sort((a,b)=>b[1]-a[1])[0];
  const R=wk.map(result).filter(Boolean),onT=R.filter(x=>x.c==="ontime").length,late=R.filter(x=>x.c==="late").length,noPlan=wk.length-onT-late;
  const tile=(v,l)=>`<div class="st"><b>${v}</b><span>${l}</span></div>`;
  const bar=(lbl,n,m,col)=>`<div class="ln"><span>${lbl}</span><div class="tr"><div class="fl" style="width:${tot?Math.round(m/tot*100):0}%;background:${col}"></div></div><span>${n} · ${fmt(m)} h · ${pc(m)}</span></div>`;
  const pri=[1,2,3].map(l=>{const g=wk.filter(t=>lv(cat(t.doneCat||t.cat))===l);return g.length?bar(`<span class="pdot p${l}">P${l}</span>`,g.length,g.reduce((a,t)=>a+mins(t),0),`var(--p${l})`):""}).join("");
  const tg=[...S.tags,{id:null,name:"Sin etiqueta",color:"var(--muted)"}].map(g=>{const k=wk.filter(t=>(tagOf(t.tag)?t.tag:null)===g.id);return k.length?bar(`<span class="tg" style="--tc:${g.color};cursor:default">${esc(g.name)}</span>`,k.length,k.reduce((a,t)=>a+mins(t),0),g.color):""}).join("");
  const p1=wk.filter(t=>lv(cat(t.doneCat||t.cat))===1).reduce((a,t)=>a+mins(t),0);
  const p1open=open.filter(t=>lv(cat(t.cat))===1).length;
  const rp=S.resp.filter(x=>x.done&&x.doneAt&&weekIdx((d=>d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate())(new Date(x.doneAt)))===0);
  const waits=rp.filter(x=>x.createdAt).map(x=>x.doneAt-x.createdAt),avgW=waits.length?waits.reduce((a,b)=>a+b,0)/waits.length:0;
  const lines=[];
  lines.push(`El <b>${pc(p1)}</b> de tu tiempo fue a Prioridad 1${p1open?`; quedan <b>${p1open}</b> tareas P1 pendientes`:"; no quedan tareas P1 pendientes"}.`);
  if(R.length)lines.push(`Cumplimiento: <b>${onT}</b> a tiempo, <b>${late}</b> tarde${noPlan?` y ${noPlan} sin hora programada para comparar`:""}.`);
  else lines.push(`Aún no hay tareas con hora programada y hora de término para medir puntualidad; se medirá con las próximas que marques.`);
  if(rp.length)lines.push(`Recibiste <b>${rp.length}</b> respuesta${rp.length===1?"":"s"}${waits.length?`; esperaste en promedio <b>${dur(avgW)}</b>`:""}.`);
  synthesis.line=`${wk.length} hechas · ${fmt(tot)} h · ${pc(p1)} en P1`;
  return`<h3>Síntesis de la semana</h3><div class="sts">${tile(wk.length,"tareas hechas")}${tile(fmt(tot)+" h","tiempo invertido")}${tile(wk.length?Math.round(tot/wk.length)+" min":"—","promedio por tarea")}${tile(best?DNL[new Date(dts(best[0])).getDay()]:"—",best?"día más productivo · "+fmt(best[1])+" h":"día más productivo")}</div>
  <div class="sg"><div><h4>Por prioridad</h4><div class="pvh sb">${pri}</div></div><div><h4>Por tipo de trabajo</h4><div class="pvh sb">${tg}</div></div></div>
  <ul class="sl">${lines.map(x=>`<li>${x}</li>`).join("")}</ul>`}
(()=>{const m=$("maxH");m.innerHTML=Array.from({length:17},(_,i)=>i+8).map(h=>`<option value="${h}">${h} h</option>`).join("");m.value=String(S.maxH||12);
  m.onchange=()=>{const v=+m.value,over=[0,1,2,3,4,5,6].filter(w=>capDay(w)>v*60);
    if(over.length){m.value=String(S.maxH||12);wkMsg(over.map(w=>DN[w]).join(", ")+" ya tiene"+(over.length>1?"n":"")+" más de "+v+" h en bloques. Acórtalos primero.",true);return}
    S.maxH=v;save();wkMsg("Máximo por día: "+v+" h ✓")}})();
/* objetivo de la semana, recordatorios y notas */
(()=>{S.goal=S.goal||{t:"",d:""};
  const gt=$("goalT"),gd=$("goalD");
  [gt,gd].forEach(el=>{if(el.contentEditable!=="plaintext-only")el.contentEditable="true"});
  gt.textContent=S.goal.t||"";gd.textContent=S.goal.d||"";
  const plainPaste=e=>{e.preventDefault();const t=(e.clipboardData||window.clipboardData).getData("text/plain");document.execCommand("insertText",false,t)};
  [gt,gd].forEach(el=>el.addEventListener("paste",plainPaste));
  gt.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();gt.blur()}});
  gt.addEventListener("input",()=>{S.goal.t=gt.innerText.trim();save()});
  gd.addEventListener("input",()=>{S.goal.d=gd.innerText.trim();save()});
  const nt=$("notes"),ns=$("noteSaved");
  const clean=h=>{const d=document.createElement("div");d.innerHTML=h||"";d.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach(x=>x.remove());
    d.querySelectorAll("*").forEach(x=>[...x.attributes].forEach(a=>{if(/^on/i.test(a.name)||/^(src|href)$/i.test(a.name)&&/^\s*javascript:/i.test(a.value))x.removeAttribute(a.name)}));return d.innerHTML};
  nt.innerHTML=clean(S.notes||"");
  window.fillGN=()=>{S.goal=S.goal||{t:"",d:""};gt.textContent=S.goal.t||"";gd.textContent=S.goal.d||"";nt.innerHTML=clean(S.notes||"")};
  const saveN=()=>{S.notes=clean(nt.innerHTML);save();ns.textContent="Guardado ✓";clearTimeout(saveN.t);saveN.t=setTimeout(()=>ns.textContent="",1500)};
  nt.addEventListener("input",saveN);
  document.querySelectorAll(".ntb [data-c]").forEach(b=>{b.addEventListener("mousedown",e=>e.preventDefault());b.onclick=()=>{nt.focus();document.execCommand(b.dataset.c,false,null);saveN()}});
  $("noteClean").addEventListener("mousedown",e=>e.preventDefault());
  $("noteClean").onclick=()=>{const sel=getSelection();
    if(sel&&!sel.isCollapsed&&nt.contains(sel.anchorNode)){document.execCommand("removeFormat");document.execCommand("unlink")}
    else{const out=[];let cur="";const flush=()=>{out.push(cur);cur=""};
      const walk=n=>{if(n.nodeType===3){cur+=n.nodeValue;return}if(n.nodeType!==1)return;const tg=n.tagName;
        if(tg==="BR"){flush();return}const blk=/^(DIV|P|LI|UL|OL|H[1-6]|PRE|BLOCKQUOTE|TR)$/.test(tg);
        if(blk&&cur)flush();if(tg==="LI")cur+="• ";n.childNodes.forEach(walk);if(blk&&cur)flush()};
      nt.childNodes.forEach(walk);if(cur)flush();
      nt.innerHTML=out.map(l=>esc(l.replace(/\u00a0/g," "))).join("<br>")}
    saveN();flash("Formato limpio: queda solo el texto.")};
})();
/* ===== RUTINAS: una línea que se despliega; cada día que tocan crean sola una tarea en HOY (se tacha al hacerla y al día siguiente vuelve a salir) ===== */
const RTL=["L","M","X","J","V","S","D"],RTD=[1,2,3,4,5,6,0],RTN=["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
function ensureRt(st){if(!Array.isArray(st.routines))st.routines=[];st.routines.forEach(r=>{if(!Array.isArray(r.days)||!r.days.length)r.days=[0,1,2,3,4,5,6];if(typeof r.min!=="number"||!(r.min>0))r.min=15;delete r.log})}
ensureRt(S);
const rtDue=(r,o=0)=>r.days.includes(wd(o));
const rtFreq=r=>{const d=[...r.days].sort((a,b)=>a-b),k=d.join("");return d.length===7?"Diaria":k==="12345"?"L–V":k==="06"?"Fin de semana":RTD.filter(x=>d.includes(x)).map(x=>RTL[RTD.indexOf(x)]).join(" ")};
const rtToday=r=>S.tasks.find(t=>t.rt===r.id&&t.rtDay===dk());
/* racha (se usa en el respaldo): días programados seguidos con la tarea hecha; los días que no tocan no la cortan */
function rtStreak(r){const ds=new Set();S.tasks.forEach(t=>{if(t.rt===r.id&&t.done&&t.doneOn)ds.add(t.doneOn)});let n=0;for(let o=0;o>-400;o--){if(!rtDue(r,o))continue;if(ds.has(dk(o)))n++;else if(o!==0)break}return n}
function rtMake(r){const today=dk();S.tasks.push({id:uid(),cat:r.cat,text:r.text,min:r.min,tag:null,done:false,doneOn:null,createdAt:Date.now(),seq:nextSeq(),doneAt:null,plan0:null,pin:today,rt:r.id,rtDay:today})}
/* cada día: las rutinas que tocan hoy crean su tarea en HOY (una sola vez por día); las de días anteriores que quedaron sin hacer se descartan para que no se acumulen */
function spawnRoutines(){
  const today=dk();let ch=false;const n0=S.tasks.length;
  S.tasks=S.tasks.filter(t=>!(t.rt&&!t.done&&t.rtDay!==today));if(S.tasks.length!==n0)ch=true;
  S.routines.forEach(r=>{if(r.last===today||!rtDue(r))return;r.last=today;ch=true;
    if(S.tasks.some(t=>t.rt===r.id&&t.rtDay===today))return;rtMake(r)});
  if(ch)save()}
/* si cambias una rutina, la tarea de hoy que aún no hiciste se actualiza igual */
const rtSync=r=>S.tasks.forEach(t=>{if(t.rt===r.id&&!t.done){t.text=r.text;t.cat=r.cat;t.min=r.min}});
const rtChips=days=>RTD.map((d,i)=>`<button type="button" class="dc${days.includes(d)?" on":""}" data-d="${d}" title="${RTN[i]}" aria-label="${RTN[i]}" aria-pressed="${days.includes(d)}">${RTL[i]}</button>`).join("");
const rtMin=v=>{const n=parseInt(v);return n>0?n:0};
/* alerta de minutos obligatorios: marca el campo en rojo, lo enfoca y avisa */
function rtNeedMin(inp){inp.classList.add("bad");inp.focus();flash("⚠ Pon los minutos de la rutina: es obligatorio y debe ser un número mayor que 0.");inp.addEventListener("input",()=>inp.classList.remove("bad"),{once:true})}
function rutinasBlock(L){
  const R=S.routines,nDue=R.filter(r=>rtDue(r)).length,nDone=R.filter(r=>{const t=rtToday(r);return t&&t.done}).length,all=nDue>0&&nDone===nDue;
  const box=document.createElement("details");box.className="rtbox";box.open=!!render.rtOpen;box.ontoggle=()=>render.rtOpen=box.open;L.appendChild(box);
  const h=document.createElement("summary");h.className="sep "+(all?"ok":"rt");
  h.textContent=`🔁 Rutinas · ${!R.length?"sin rutinas":nDue?`${nDone}/${nDue} hoy${all?" ✓":""}`:"hoy no toca ninguna"}`;box.appendChild(h);
  R.forEach(r=>{
    const back=rtDue(r)&&!rtToday(r),e=document.createElement("div");e.className="rtedit";
    e.innerHTML=`<select aria-label="Categoría">${catOpts(r.cat)}</select><input class="rttx" value="${esc(r.text)}" aria-label="Rutina"><input class="rtmn" type="number" min="5" step="5" value="${r.min}" aria-label="Minutos" title="Minutos"><span class="dcs">${rtChips(r.days)}</span><span class="rtact">${back?`<button type="button" class="sbt rtback" title="Hoy la quitaste: volver a ponerla en Hoy">↺ a Hoy</button>`:""}<button type="button" class="x" aria-label="Borrar rutina" title="Borrar rutina">×</button></span>`;
    e.querySelector("select").onchange=ev=>{r.cat=ev.target.value;rtSync(r);commit()};
    e.querySelector(".rttx").onchange=ev=>{const v=ev.target.value.trim();if(v)r.text=v;rtSync(r);commit()};
    e.querySelector(".rtmn").onchange=ev=>{const n=rtMin(ev.target.value);if(!n){ev.target.value=r.min;rtNeedMin(ev.target);return}r.min=n;rtSync(r);commit()};
    e.querySelector(".dcs").onclick=ev=>{const b=ev.target.closest(".dc");if(!b)return;const d=+b.dataset.d,i=r.days.indexOf(d);
      if(i>=0){if(r.days.length===1){flash("Una rutina necesita al menos un día.");return}r.days.splice(i,1)}else r.days.push(d);commit()};
    const bk=e.querySelector(".rtback");if(bk)bk.onclick=()=>{rtMake(r);commit();flash("De vuelta en Hoy: "+r.text)};
    const x=e.querySelector(".x");
    x.onclick=()=>{if(x.dataset.sure){S.routines=S.routines.filter(q=>q.id!==r.id);S.tasks=S.tasks.filter(t=>!(t.rt===r.id&&!t.done));commit()}
      else{x.dataset.sure="1";x.textContent="¿Borrar?";x.classList.add("sure");setTimeout(()=>{if(x.isConnected){delete x.dataset.sure;x.textContent="×";x.classList.remove("sure")}},3000)}};
    box.appendChild(e)});
  const nd=render.rtNew||(render.rtNew=[0,1,2,3,4,5,6]);
  const defCat=(S.cats.find(c=>/personal/i.test(c.name))||S.cats[0]||{}).id;
  const add=document.createElement("div");add.className="rtadd";
  add.innerHTML=`<div class="rtedit"><select id="rtCat" aria-label="Categoría de la nueva rutina">${catOpts(render.rtCat||defCat)}</select><input id="rtTxt" class="rttx" placeholder="Nueva rutina (ej. Tomar agua)" aria-label="Nueva rutina"><input id="rtMin" class="rtmn" type="number" min="5" step="5" placeholder="min" aria-label="Minutos (obligatorio)" title="Minutos (obligatorio)"><button type="button" class="primary" id="rtAdd">Agregar</button></div>
    <div class="rtpre"><span>Se repite:</span><span class="dcs" id="rtDays">${rtChips(nd)}</span><button type="button" class="sbt" data-p="all">Todos los días</button><button type="button" class="sbt" data-p="wk">L–V</button></div>`;
  box.appendChild(add);
  const paint=()=>add.querySelectorAll(".dc").forEach(b=>{const on=nd.includes(+b.dataset.d);b.classList.toggle("on",on);b.setAttribute("aria-pressed",on)});
  add.querySelector("#rtDays").onclick=ev=>{const b=ev.target.closest(".dc");if(!b)return;const d=+b.dataset.d,i=nd.indexOf(d);if(i>=0)nd.splice(i,1);else nd.push(d);paint()};
  add.querySelectorAll(".sbt").forEach(b=>b.onclick=()=>{nd.length=0;(b.dataset.p==="wk"?[1,2,3,4,5]:[0,1,2,3,4,5,6]).forEach(d=>nd.push(d));paint()});
  add.querySelector("#rtCat").onchange=ev=>render.rtCat=ev.target.value;
  const doAdd=()=>{const v=add.querySelector("#rtTxt").value.trim();
    if(!v){flash("Escribe la rutina antes de agregarla.");return}
    if(!nd.length){flash("Elige al menos un día en que se repite.");return}
    const mn=rtMin(add.querySelector("#rtMin").value);
    if(!mn){rtNeedMin(add.querySelector("#rtMin"));return}
    S.routines.push({id:uid(),cat:add.querySelector("#rtCat").value,text:v,min:mn,days:[...nd],last:null});
    render.rtNew=[0,1,2,3,4,5,6];render.rtOpen=true;commit();flash("Rutina agregada: "+v+(rtDue(S.routines[S.routines.length-1])?" (ya está en Hoy)":""))};
  add.querySelector("#rtAdd").onclick=doAdd;
  add.querySelector("#rtTxt").onkeydown=ev=>{if(ev.key==="Enter"){ev.preventDefault();doAdd()}};
}
const ADDF=document.getElementById("addForm");
function render(){
  ensureRt(S);spawnRoutines();dropOverflow();
  const plan=schedule(),open=S.tasks.filter(t=>!t.done),done=S.tasks.filter(t=>t.done);
  /* la primera vez que una tarea recibe día y hora, se guarda como "programada" (no cambia aunque luego se mueva) */
  let fresh=false;open.forEach(t=>{const p=plan[t.id];if(!t.sep&&!t.plan0&&p&&p.o>=0){const d=new Date();d.setDate(d.getDate()+p.o);d.setHours(0,0,0,0);t.plan0=d.getTime()+p.s*60000;fresh=true}});
  if(fresh)save();
  const L0=DL();
  const byS=a=>a.sort((x,y)=>(plan[x.id].o-plan[y.id].o)||(plan[x.id].s-plan[y.id].s));
  const hoy=byS(open.filter(t=>plan[t.id].o===0)),cola=open.filter(t=>plan[t.id].o<0);
  const from=S.from==null?nowM():toM(S.from);
  const capHoy=S.week[wd(0)].reduce((a,b)=>a+Math.max(0,toM(b[1])-Math.max(toM(b[0]),from)),0);
  const empty=(t,z)=>{const p=document.createElement("p");p.className="note dropz";p.innerHTML=t;L.appendChild(p);zoneDrop(p,z)};
  const foot=(t,z)=>{const p=document.createElement("div");p.className="sum";p.innerHTML=t;L.appendChild(p);zoneDrop(p,z)};
  lastSec={hoy:hoy.map(t=>t.id),cola:cola.map(t=>t.id)};
  const mm=a=>a.reduce((x,t)=>x+(t.min|0),0);const openR=noSep(open);
  const mini=(u,c)=>{const p=c?Math.min(1,u/c):0,r=7,C=2*Math.PI*r;return`<span class="mini" title="${Math.round(p*100)}% del tiempo disponible"><svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="${r}" fill="none" stroke="var(--free)" stroke-width="3.2"/><circle cx="9" cy="9" r="${r}" fill="none" stroke="var(--accent)" stroke-width="3.2" stroke-dasharray="${(p*C).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 9 9)"/></svg>${Math.round(p*100)}%</span>`};
  const doneHoy=done.filter(t=>t.doneOn===dk());
  const tm=a=>fmt(a.reduce((x,t)=>x+t.min,0));
  const noT=a=>{const n=noSep(a).filter(t=>!(t.min>0)).length;return n?`<span class="warn">⚠ ${n} ${n===1?"tarea sin tiempo: agrégale minutos":"tareas sin tiempo: agrégales minutos"} para que sumen</span>`:""};
  const sumLine=(a,cap)=>`${noT(a)}${mini(mm(a),cap)}${noSep(a).length} tareas · <b>${tm(a)} h</b> de ${fmt(cap)} h · libre ${fmt(Math.max(0,cap-mm(a)))} h`;
  const L=$("list");if(ADDF.parentNode===L)ADDF.remove();L.innerHTML="";
  rutinasBlock(L);
  const pending=S.resp.filter(r=>!r.done);
  if(pending.length){const box=document.createElement("div");box.className="rpbox";L.appendChild(box);
    const h=document.createElement("div");h.className="sep sx rp";h.innerHTML=`<span>⏳ Esperando respuesta · ${pending.filter(r=>!r.sep).length}</span><span class="ln"></span><button type="button" class="addsep" title="Agregar una línea separadora arriba de este bloque">+ separador</button>`;
    h.querySelector(".addsep").onclick=addSepR;box.appendChild(h);
    pending.forEach(r=>box.appendChild(r.sep?respSepRow(r):respRow(r)))}
  L.appendChild(ADDF);
  const hr=t=>hm(plan[t.id].s);
  /* agrega las filas de una sección con una línea cada vez que cambian de bloque (y de día en Semana) */
  const rowsWithBlocks=(arr,zone,whenFn)=>{
    calcSep(arr);
    const groups=[];
    arr.forEach(t=>{const p=plan[t.id],bl=[...S.week[wd(p.o)]].sort((x,y)=>toM(x[0])-toM(y[0]));
      let i=bl.findIndex(b=>p.s>=toM(b[0])&&p.s<toM(b[1]));if(i<0)i=bl.findIndex(b=>p.s===toM(b[1]));
      const key=p.o+"-"+i,g=groups[groups.length-1];
      if(g&&g.key===key)g.tasks.push(t);else groups.push({key,o:p.o,i,b:bl[i],tasks:[t]})});
    /* un solo recuadro por día; dentro, una línea separa cada bloque */
    let box=null,day=null;
    groups.forEach(g=>{
      if(g.o!==day){day=g.o;box=document.createElement("div");box.className="bgrp day";L.appendChild(box);
        if(zone==="sem"){const h=document.createElement("div");h.className="dayh";h.textContent=DNL[wd(g.o)];box.appendChild(h)}}
      if(g.b){const st=g.o===0?Math.max(toM(g.b[0]),from):toM(g.b[0]),cap=Math.max(0,toM(g.b[1])-st),used=mm(g.tasks);
        const d=document.createElement("div");d.className="bsep in"+(box.querySelector(".row")?" brk":"");
        d.innerHTML=`<b>Bloque ${g.i+1}</b><span>${ampm(g.b[0])} – ${ampm(g.b[1])}</span><span class="bt${used>=cap?" full":""}">${fmt(used)} h de ${fmt(cap)} h</span>`;
        box.appendChild(d);zoneDrop(d,zone)}
      g.tasks.forEach(t=>box.appendChild(t.sep?sepRow(t,zone):taskRow(t,whenFn(t),zone)))})};
  secHead(L,`Hoy · ${DNL[wd(0)]} · desde ${hm(from)}`,"hoy");rowsWithBlocks(hoy,"hoy",t=>hr(t));
  if(!hoy.length)empty("Nada en Hoy. Arrastra aquí una tarea desde Cola (o usa el botón de la tarea → Hoy).","hoy");
  foot(sumLine(hoy,capHoy),"hoy");
  const shC=secHead(L,`Cola`,"cola","wait");if(cola.length){const fb=document.createElement("button");fb.type="button";fb.className="sbt";fb.textContent="Llenar Hoy ↑";fb.title="Sube a Hoy las tareas de Cola que quepan en el tiempo libre de hoy";fb.onclick=fillHoy;shC.insertBefore(fb,shC.querySelector(".sbt"));}
  calcSep(cola);
  if(cola.length){const box=document.createElement("div");box.className="bgrp cq";cola.forEach(t=>box.appendChild(t.sep?sepRow(t,"cola"):taskRow(t,"cola","cola")));L.appendChild(box)}
  if(!cola.length)empty("La cola está vacía. Aquí esperan las tareas que bajas de Hoy.","cola");
  foot(`${noT(cola)}${noSep(cola).length} tareas · <b>${tm(cola)} h</b>`,"cola");
  const doneThis=done.filter(t=>weekIdx(t.doneOn)===0),doneOld=done.filter(t=>weekIdx(t.doneOn)!==0);
  /* respuestas ya recibidas: van con las tareas hechas (esta semana) o con semanas anteriores */
  const dkOf=ts=>{const d=new Date(ts);return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate()};
  const rpDone=S.resp.filter(x=>x.done).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  const rpThis=rpDone.filter(x=>!x.doneAt||weekIdx(dkOf(x.doneAt))===0),rpOld=rpDone.filter(x=>x.doneAt&&weekIdx(dkOf(x.doneAt))!==0);
  {sep(L,`Hechas esta semana · ${rpThis.length?`${doneThis.length} tarea${doneThis.length===1?"":"s"} · ${rpThis.length} respuesta${rpThis.length===1?"":"s"}`:doneThis.length}`,"ok");
    if(doneThis.length||rpThis.length){const box=document.createElement("div");box.className="bgrp dq";[...doneHoy,...doneThis.filter(t=>t.doneOn!==dk())].forEach(t=>box.appendChild(taskRow(t,t.doneOn===dk()?"hoy ✓":DNs(t.doneOn)+" ✓")));rpThis.forEach(x=>box.appendChild(respRow(x)));L.appendChild(box)}
    if(!doneThis.length&&!rpThis.length){const p=document.createElement("p");p.className="note";p.textContent="Todavía no terminas tareas esta semana. Cuando marques una con ✓, aparecerá aquí con su resumen.";L.appendChild(p)}
    else{const box=document.createElement("div");box.className="synth";try{box.innerHTML=synthesis(doneThis,openR)}catch(err){box.innerHTML="<h3>Síntesis de la semana</h3><p class=\"note\">No se pudo calcular el resumen.</p>"}L.appendChild(box)}
    if(doneOld.length||rpOld.length){const det=document.createElement("details");det.className="old";if(render.oldOpen)det.open=true;
      det.innerHTML=`<summary>Ver semanas anteriores · ${doneOld.length+rpOld.length}</summary>`;det.ontoggle=()=>render.oldOpen=det.open;
      [...doneOld].sort((a,b)=>(b.doneAt||dts(b.doneOn))-(a.doneAt||dts(a.doneOn))).forEach(t=>det.appendChild(taskRow(t,fdOn(t.doneOn)+" ✓")));rpOld.forEach(x=>det.appendChild(respRow(x)));L.appendChild(det)}}
  /* panel: Hoy + dedicación de la semana */
  const p1=pieBlock("Hoy",noSep(hoy),doneHoy,capDay(wd(0)),`${noSep(hoy).length} pendientes · ${doneHoy.length} hechas`);
  $("pies").innerHTML=`<div class="dash">${p1.html}${dashWeek(plan,openR,done,L0)}</div>`;
  {const mn=a=>a.reduce((x,t)=>x+(t.min>0?t.min:0),0),wkD=done.filter(t=>weekIdx(t.doneOn)===0),wm=mn(wkD),p1m=mn(wkD.filter(t=>lv(cat(t.doneCat||t.cat))===1));
   $("sumLine").innerHTML=`Hoy <b>${fmt(mn(doneHoy))}</b> de ${fmt(capDay(wd(0)))} h · Semana <b>${fmt(wm)} h</b>${wm?` · P1 <b>${Math.round(p1m/wm*100)}%</b>`:""} · ${openR.length} pendientes`}
  const seen=new Map();p1.segs.forEach(x=>seen.set(x.n,x.c));
  $("legend").innerHTML='<span style="font-weight:600">Hoy:</span>'+[...seen].map(([n,c])=>`<span><i style="background:${c}"></i>${esc(n)}</span>`).join("")+'<span><i style="background:var(--free)"></i>Libre</span>';
  $("from").value=S.from==null?hm(nowM()):S.from;
  renderWeek();renderCats();renderTags();renderCatView(plan);renderGantt();
  $("nCat").innerHTML=catOpts($("nCat").value||S.cats[0]?.id);
  $("nTag").innerHTML=tagOpts($("nTag").value);
  if(S.view&&S.view!=="none"&&!tagOf(S.view))S.view=null;
  const cnt=k=>openR.filter(t=>k==="none"?!tagOf(t.tag):t.tag===k).length;
  $("vf").innerHTML=`<span class="lb">Ver:</span><button type="button" class="tg all${S.view?"":" on"}" data-v="">Todas · ${openR.length}</button>`+S.tags.map(g=>`<button type="button" class="tg${S.view===g.id?" on":""}" style="--tc:${g.color}" data-v="${g.id}">${esc(g.name)} · ${cnt(g.id)}</button>`).join("")+`<button type="button" class="tg${S.view==="none"?" on":""}" style="--tc:var(--muted)" data-v="none">Sin etiqueta · ${cnt("none")}</button>`+(S.view?`<span class="note" style="margin-left:6px">Solo se ocultan las demás; los horarios no cambian.</span>`:"");
  $("vf").querySelectorAll("button").forEach(b=>b.onclick=()=>{S.view=b.dataset.v||null;commit()});
}
function wkMsg(t,bad){const m=$("wkMsg");m.textContent=t;m.style.color=bad?"var(--hot)":"var(--ok)";clearTimeout(wkMsg.t);wkMsg.t=setTimeout(()=>m.textContent="",4000)}
const ampm=t=>{const m=toM(t),h=Math.floor(m/60),h12=h%12||12;return String(h12).padStart(2,"0")+":"+String(m%60).padStart(2,"0")+" "+(h<12?"a.m.":"p.m.")};
/* selector de hora propio, con botón Guardar */
const TP=document.createElement("div");TP.className="tp";TP.hidden=true;TP.setAttribute("role","dialog");TP.setAttribute("aria-label","Elegir hora");document.body.appendChild(TP);
let tpCtx=null;
function tpClose(){TP.hidden=true;tpCtx=null}
function tpOpen(btn,w,i,k){
  const cur=toM(S.week[w][i][k]);let H=Math.floor(cur/60)%12||12,M=Math.round(cur%60/5)*5%60,P=Math.floor(cur/60)<12?"a.m.":"p.m.";
  tpCtx={w,i,k};
  const col=(vals,sel,cls)=>`<div class="tpc" data-c="${cls}">${vals.map(v=>`<button type="button" data-v="${v}" class="${v==sel?"on":""}">${v}</button>`).join("")}</div>`;
  const draw=()=>{TP.innerHTML=`<div class="tph">${DN[w]} · ${k?"fin":"inicio"} del bloque</div><div class="tpg">${col([...Array(12)].map((_,n)=>String(n+1).padStart(2,"0")),String(H).padStart(2,"0"),"h")}${col([...Array(12)].map((_,n)=>String(n*5).padStart(2,"0")),String(M).padStart(2,"0"),"m")}${col(["a.m.","p.m."],P,"p")}</div><div class="tpf"><button type="button" id="tpCancel">Cancelar</button><button type="button" class="primary" id="tpOk">Guardar</button></div>`;
    TP.querySelectorAll(".tpc").forEach(c=>{tpCenter(c);c.onclick=e=>{const b=e.target.closest("button");if(!b)return;const v=b.dataset.v;
      if(c.dataset.c==="h")H=+v;else if(c.dataset.c==="m")M=+v;else P=v;const st=c.scrollTop;draw();TP.querySelector(`[data-c="${c.dataset.c}"]`).scrollTop=st}});
    $("tpCancel").onclick=tpClose;
    $("tpOk").onclick=()=>{const t=hm(((H%12)+(P==="p.m."?12:0))*60+M);
      const old=JSON.parse(JSON.stringify(S.week[w]));S.week[w][i][k]=t;
      const bad=m=>{S.week[w]=old;wkMsg(m,true)};
      const b=S.week[w][i];
      if(toM(b[1])<=toM(b[0]))return bad(DN[w]+": el fin debe ser después del inicio.");
      if(capDay(w)>maxM())return bad(DN[w]+" pasaría de "+maxM()/60+" h. Acorta otro bloque o sube el máximo por día.");
      const bl=[...S.week[w]].sort((x,y)=>toM(x[0])-toM(y[0]));
      for(let n=1;n<bl.length;n++)if(toM(bl[n][0])<toM(bl[n-1][1]))return bad(DN[w]+": se cruza con el bloque "+ampm(bl[n-1][0])+" – "+ampm(bl[n-1][1])+".");
      tpClose();commit();wkMsg(DN[w]+" guardado ✓ · "+ampm(b[0])+" – "+ampm(b[1]))}};
  draw();TP.hidden=false;
  const r=btn.getBoundingClientRect(),wdt=TP.offsetWidth;
  TP.style.left=Math.max(8,Math.min(r.left+scrollX,scrollX+document.documentElement.clientWidth-wdt-8))+"px";
  TP.style.top=(r.bottom+scrollY+6)+"px";
  TP.querySelectorAll(".tpc").forEach(tpCenter);
}
function tpCenter(c){const o=c.querySelector(".on");if(o)c.scrollTop=o.offsetTop-c.clientHeight/2+o.offsetHeight/2}
document.addEventListener("mousedown",e=>{if(!TP.hidden&&!TP.contains(e.target)&&!e.target.closest(".tbtn"))tpClose()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!TP.hidden)tpClose()});
/* ===== VISTA POR CATEGORÍA (solo lectura) ===== */
const CVKEY="planificador-kenny-vista-cat",CVN=7;
const cvGet=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(CVKEY));return v&&v[k]!==undefined?v[k]:d}catch(e){return d}};
const cvSet=(k,v)=>{try{const o=JSON.parse(localStorage.getItem(CVKEY))||{};o[k]=v;localStorage.setItem(CVKEY,JSON.stringify(o))}catch(e){}};
/* todas las categorías que tienen tareas (pendientes o hechas esta semana), en el orden de Categorías */
function cvCats(){const has=id=>S.tasks.some(t=>!t.rt&&t.cat===id&&(!t.done||weekIdx(t.doneOn)===0));return S.cats.map(c=>c.id).filter(has)}
function cvApplyView(){const v0=cvGet("view","lista"),v=v0==="cat"||v0==="gantt"?v0:"lista";
  const p=document.querySelector(".panel.main");if(p)p.dataset.v=v;
  document.querySelectorAll(".vtabs button").forEach(b=>{const on=b.dataset.v===v;b.classList.toggle("on",on);b.setAttribute("aria-selected",on)})}
document.querySelectorAll(".vtabs button").forEach(b=>b.onclick=()=>{cvSet("view",b.dataset.v);cvApplyView();if(b.dataset.v==="gantt"){gScrollTo=gScrollTo??"hoy";renderGantt()}});
cvApplyView();
/* texto claro u oscuro según el color de la categoría, para que siempre se lea sobre la barra */
const cvInk=hex=>{let h=String(hex||"").replace("#","");if(h.length===3)h=h.split("").map(x=>x+x).join("");const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return(0.299*r+0.587*g+0.114*b)>165?"#1f2937":"#ffffff"};
/* orden de las tarjetas: se guarda junto a las demás preferencias de esta vista; categorías nuevas van al final */
let cvDrag=null,cvRz=null;
const cvOrder=ids=>{const sv=cvGet("order",[]);if(!Array.isArray(sv))return ids;const s=sv.map(String),a=ids.filter(i=>s.includes(String(i))).sort((x,y)=>s.indexOf(String(x))-s.indexOf(String(y)));return a.concat(ids.filter(i=>!a.includes(i)))};
/* arrastrar y soltar: mouse al instante; dedo con pulsación larga (así el scroll normal no se rompe) */
(function cvInitDrag(){
  const box=$("catview");if(!box)return;
  let st=null;
  const inside=(r,x,y)=>x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
  const sibs=(g,el)=>[...g.children].filter(c=>c!==el);
  const scrollParent=el=>{for(let p=el.parentElement;p&&p!==document.body&&p!==document.documentElement;p=p.parentElement){const o=getComputedStyle(p).overflowY;if((o==="auto"||o==="scroll")&&p.scrollHeight>p.clientHeight)return p}return null};
  function place(){const el=st.el;el.style.transform="none";const r=el.getBoundingClientRect();el.style.transform=`translate(${st.px-st.gx-r.left}px,${st.py-st.gy-r.top}px)`}
  function move(){
    const el=st.el,g=st.grid;place();
    if(st.cool){if(inside(st.cool.getBoundingClientRect(),st.px,st.py))return;st.cool=null}
    const t=sibs(g,el).find(c=>inside(c.getBoundingClientRect(),st.px,st.py));if(!t)return;
    const before=new Map(sibs(g,el).map(c=>[c,c.getBoundingClientRect()]));
    if(el.compareDocumentPosition(t)&Node.DOCUMENT_POSITION_FOLLOWING)t.after(el);else t.before(el);
    st.cool=t;place();
    before.forEach((r0,c)=>{const r1=c.getBoundingClientRect(),dx=r0.left-r1.left,dy=r0.top-r1.top;if(!dx&&!dy)return;
      c.style.transition="none";c.style.transform=`translate(${dx}px,${dy}px)`;c.getBoundingClientRect();
      c.style.transition="transform .18s ease";c.style.transform="";setTimeout(()=>{c.style.transition=""},230)})}
  function loop(){if(!st||!st.on)return;
    const sp=st.sp,r=sp?sp.getBoundingClientRect():{top:0,bottom:innerHeight},Z=70;let dy=0;
    if(st.py<r.top+Z)dy=-Math.ceil((r.top+Z-st.py)/5);else if(st.py>r.bottom-Z)dy=Math.ceil((st.py-(r.bottom-Z))/5);
    if(dy){const y0=sp?sp.scrollTop:scrollY;if(sp)sp.scrollTop+=dy;else scrollBy(0,dy);if((sp?sp.scrollTop:scrollY)!==y0)move()}
    st.raf=requestAnimationFrame(loop)}
  function begin(){if(!st||st.on)return;clearTimeout(st.timer);st.on=true;cvDrag=st;
    const r=st.el.getBoundingClientRect();st.gx=st.x0-r.left;st.gy=st.y0-r.top;
    st.el.classList.add("cvdrag");box.classList.add("cvdragging");st.sp=scrollParent(st.el);st.raf=requestAnimationFrame(loop);
    if(st.touch&&navigator.vibrate){try{navigator.vibrate(12)}catch(e){}}}
  function end(){if(!st)return;const s=st;clearTimeout(s.timer);cancelAnimationFrame(s.raf);st=null;
    if(!s.on)return;cvDrag=null;
    const el=s.el,r0=el.getBoundingClientRect();
    el.classList.remove("cvdrag");box.classList.remove("cvdragging");el.style.transform="";
    const r1=el.getBoundingClientRect();
    el.style.transition="none";el.style.transform=`translate(${r0.left-r1.left}px,${r0.top-r1.top}px)`;el.getBoundingClientRect();
    el.style.transition="transform .18s ease";el.style.transform="";setTimeout(()=>{el.style.transition=""},230);
    /* guardar: el orden que quedó en pantalla + el de categorías que hoy no se ven */
    const ids=[...s.grid.children].map(c=>c.dataset.id),old=cvGet("order",[]);
    cvSet("order",ids.concat((Array.isArray(old)?old:[]).map(String).filter(x=>!ids.includes(x))));
    if(s.pend)renderCatView(s.pend)}
  box.addEventListener("pointerdown",e=>{
    if(st||(e.pointerType==="mouse"&&e.button!==0))return;
    const h=e.target.closest&&e.target.closest(".cvcol>h3");if(!h)return;
    const el=h.parentElement;
    st={el,grid:el.parentElement,x0:e.clientX,y0:e.clientY,px:e.clientX,py:e.clientY,touch:e.pointerType!=="mouse",pid:e.pointerId,on:false};
    if(st.touch)st.timer=setTimeout(begin,280)});
  document.addEventListener("pointermove",e=>{
    if(!st||e.pointerId!==st.pid)return;
    st.px=e.clientX;st.py=e.clientY;
    if(!st.on){const d=Math.hypot(st.px-st.x0,st.py-st.y0);
      if(st.touch){if(d>8){clearTimeout(st.timer);st=null}return}
      if(d<5)return;begin()}
    e.preventDefault();move()});
  document.addEventListener("pointerup",e=>{if(st&&e.pointerId===st.pid)end()});
  document.addEventListener("pointercancel",e=>{if(st&&e.pointerId===st.pid)end()});
  document.addEventListener("touchmove",e=>{if(st&&st.on&&e.cancelable)e.preventDefault()},{passive:false});
  box.addEventListener("contextmenu",e=>{if(st&&st.touch)e.preventDefault()});
})();
/* altura de cada bloque: se arrastra el borde de abajo; al soltar se ajusta a filas completas y se guarda cuántas filas se ven (doble clic/toque = automático) */
(function cvInitResize(){
  const box=$("catview");if(!box)return;
  let st=null,lastTap=0,lastId=null;const RES=30;
  const rowsMap=()=>{const o=cvGet("rows",{});return o&&typeof o==="object"&&!Array.isArray(o)?{...o}:{}};
  function setRows(card,k){const rows=[...card.querySelectorAll(".cvr")],n=rows.length,more=card.querySelector(".cvmore");
    rows.forEach((r,i)=>r.classList.toggle("cvh",i>=k));
    if(more){more.hidden=n-k<=0;more.textContent=`+ ${n-k} más en esta categoría`}}
  function fit(){const c=st.card,top=c.getBoundingClientRect().top;
    c.style.height=Math.max(60,st.py-st.grab-top)+"px";
    const rows=[...c.querySelectorAll(".cvr")],n=rows.length;
    rows.forEach(r=>r.classList.remove("cvh"));
    const lim=c.querySelector(".cvb").getBoundingClientRect().bottom;
    let k=0;while(k<n&&rows[k].getBoundingClientRect().bottom<=lim-(k<n-1?RES:0))k++;
    st.k=Math.max(1,k);setRows(c,st.k)}
  function loop(){if(!st)return;
    if(st.moved){const h=innerHeight;let dy=0;if(st.py>h-60)dy=Math.ceil((st.py-(h-60))/4);else if(st.py<60)dy=-Math.ceil((60-st.py)/4);if(dy){scrollBy(0,dy);fit()}}
    st.raf=requestAnimationFrame(loop)}
  function done(){if(!st)return;const s=st;cancelAnimationFrame(s.raf);st=null;cvRz=null;
    box.classList.remove("cvresizing");try{s.g.releasePointerCapture(s.pid)}catch(_){}
    s.card.style.height="";
    if(s.moved&&s.k!=null){const m=rowsMap();m[String(s.id)]=s.k;cvSet("rows",m)}
    else if(!s.moved){const now=Date.now();
      if(lastId===s.id&&now-lastTap<350){const m=rowsMap();delete m[String(s.id)];cvSet("rows",m);
        setRows(s.card,Math.max(1,Math.min(s.card.querySelectorAll(".cvr").length,CVN)));lastTap=0}
      else{lastTap=now;lastId=s.id}}
    if(s.pend)renderCatView(s.pend)}
  box.addEventListener("pointerdown",e=>{
    const g=e.target.closest&&e.target.closest(".cvgrip");if(!g||st||(e.pointerType==="mouse"&&e.button!==0))return;
    const card=g.parentElement;e.preventDefault();
    try{g.setPointerCapture(e.pointerId)}catch(_){}
    const r=card.getBoundingClientRect();
    st={card,g,pid:e.pointerId,id:card.dataset.id,x0:e.clientX,y0:e.clientY,py:e.clientY,grab:e.clientY-r.bottom,moved:false,k:null};
    cvRz=st;box.classList.add("cvresizing");st.raf=requestAnimationFrame(loop)});
  box.addEventListener("pointermove",e=>{if(!st||e.pointerId!==st.pid)return;
    st.py=e.clientY;if(Math.abs(e.clientY-st.y0)>3||Math.abs(e.clientX-st.x0)>3)st.moved=true;
    if(st.moved){e.preventDefault();fit()}});
  box.addEventListener("pointerup",e=>{if(st&&e.pointerId===st.pid)done()});
  box.addEventListener("pointercancel",e=>{if(st&&e.pointerId===st.pid)done()});
})();
/* orden de cada columna = el de la lista: primero lo que está en Hoy (por hora), luego Cola; no toca ni cambia nada */
function renderCatView(plan){
  const box=$("catview");if(!box)return;
  const busy=cvDrag||cvRz;if(busy){busy.pend=plan;return}
  const mine0=S.tasks.filter(t=>!t.rt),ids=cvOrder(cvCats());if(!ids.length){box.innerHTML=`<p class="cvempty">Todavía no hay tareas para mostrar.</p>`;return}
  const isH=t=>plan[t.id]&&plan[t.id].o===0;
  const RM=(()=>{const o=cvGet("rows",{});return o&&typeof o==="object"&&!Array.isArray(o)?o:{}})();
  const cols=ids.map(id=>{
    const c=cat(id),mine=mine0.filter(t=>t.cat===id);
    const open=mine.filter(t=>!t.done),dn=mine.filter(t=>t.done&&weekIdx(t.doneOn)===0);
    const ord=open.filter(isH).sort((a,b)=>plan[a.id].s-plan[b.id].s).concat(open.filter(t=>!isH(t)));
    const tot=open.length+dn.length,pend=open.reduce((a,t)=>a+(t.min>0?t.min:0),0),pct=tot?Math.round(dn.length/tot*100):0;
    const k=Math.max(1,Math.min(ord.length,Number(RM[String(id)])||CVN)),rows=ord.map((t,i)=>`<li class="cvr${i===0?" next":""}${i>=k?" cvh":""}"${i===0?' title="Siguiente en esta categoría"':""}><span class="cvn">${i+1}</span><span class="cvt" title="${esc(plain(t.text))}">${md(t.text)}</span><span class="cvm">${t.min>0?t.min:"–"}</span><span class="cvw${isH(t)?" h":""}">${isH(t)?hm(plan[t.id].s):"cola"}</span></li>`).join("");
    return`<section class="cvcol" data-id="${esc(String(id))}" style="--cc:${c.color};--ct:${cvInk(c.color)}" aria-label="${esc(c.name)}"><h3><span class="cvnm" title="${esc(c.name)}">${esc(c.name)}</span><span class="cvcnt">${open.length} pend.</span></h3>
      <div class="cvb"><div class="cvbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      <div class="cvst"><span><b>${dn.length}/${tot}</b> hechas</span><span>${pend?`<b>${fmt(pend)} h</b> pend.`:"al día ✓"}</span></div>
      ${rows?`<ul class="cvl">${rows}</ul>`:`<p class="cvempty">Sin tareas pendientes ✓</p>`}
      <p class="cvmore"${ord.length>k?"":" hidden"}>+ ${ord.length-k} más en esta categoría</p></div>${ord.length>1?`<div class="cvgrip" role="separator" aria-orientation="horizontal" title="Arrastra para cambiar la altura · doble clic: tamaño automático"></div>`:""}</section>`}).join("");
  box.innerHTML=`<div class="cvtop"><span>Solo vista · todas las categorías · mismo orden de la lista (Hoy primero, luego Cola) · hechas = esta semana · arrastra la barra de color para reacomodar · arrastra el borde de abajo para cambiar la altura</span></div>
    <div class="cvgrid">${cols}</div>`}
/* ===== GANTT =====
   Carriles = categorías (se empieza con una). Debajo de cada categoría van sus timelines: filas con nombre
   donde pones barras (rango de días con texto adentro) e hitos ◆ (un día). Todo es libre: no se conecta con las tareas. */
const GN=77,GLH=30,GDW=()=>matchMedia("(max-width:640px)").matches?26:30;
const MESL=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const GPAL=["#00897B","#5E35B1","#3949AB","#6D4C41","#C2185B","#00ACC1","#7CB342","#F4511E","#546E7A","#8E24AA"];
const gp=n=>String(n).padStart(2,"0");
const gKey=d=>d.getFullYear()+"-"+gp(d.getMonth()+1)+"-"+gp(d.getDate());
const gToday=()=>gKey(new Date());
const gDi=k=>{const[y,m,d]=String(k).split("-").map(Number);return Math.round(Date.UTC(y,m-1,d)/864e5)};
const gKd=n=>{const d=new Date(n*864e5);return d.getUTCFullYear()+"-"+gp(d.getUTCMonth()+1)+"-"+gp(d.getUTCDate())};
const gDow=n=>((n+4)%7+7)%7;
const gMon=n=>n-(gDow(n)+6)%7;
const gFmt=k=>{const[y,m,d]=String(k).split("-").map(Number);return d+" "+MES[m-1]+(y!==new Date().getFullYear()?" "+y:"")};
const gFmtTxt=k=>{const[y,m,d]=String(k).split("-");return d+"/"+m+"/"+y};
const gBy=(a,b)=>a.start<b.start?-1:a.start>b.start?1:0;
function gIsoWeek(n){const th=gMon(n)+3,y=new Date(th*864e5).getUTCFullYear(),j1=Math.round(Date.UTC(y,0,1)/864e5);return 1+Math.floor((th-j1)/7)}
function gNewRow(g,cid,name){const r={id:uid(),cat:cid,name:name||""};g.rows.push(r);return r}
/* un timeline nuevo aparece debajo del último de su misma categoría (o al final si es la primera) */
function gNewRowNear(g,cid){const r=gNewRow(g,cid,""),k=g.rows.slice(0,-1).map(x=>x.cat).lastIndexOf(cid);if(k>=0){g.rows.pop();g.rows.splice(k+1,0,r)}return r}
const gFirstCat=st=>(st.cats||[]).find(x=>String(x.name).toUpperCase()==="PROYECTO")||[...(st.cats||[])].sort((a,b)=>(a.lvl|0)-(b.lvl|0))[0];
/* categoría de ejemplo: un timeline con dos barras y un hito */
function gSeed(st,g){const c=gFirstCat(st);if(!c)return;const T=gDi(gToday()),r=gNewRow(g,c.id,"Ejemplo: lanzar web");g.lanes=[c.id];
  g.items.push({id:uid(),type:"p",row:r.id,cat:c.id,name:"Diseño y contenido",start:gKd(T+1),end:gKd(T+10),prog:20,note:""},
    {id:uid(),type:"p",row:r.id,cat:c.id,name:"Desarrollo",start:gKd(T+11),end:gKd(T+24),prog:0,note:""},
    {id:uid(),type:"e",row:r.id,cat:c.id,name:"Publicar",start:gKd(T+25),note:""})}
function ensureG(st){
  if(!st.gantt||typeof st.gantt!=="object")st.gantt={};
  const g=st.gantt,ids=(st.cats||[]).map(c=>c.id);
  if(!Array.isArray(g.items))g.items=[];if(!Array.isArray(g.rows))g.rows=[];
  if(typeof g.off!=="number")g.off=-14;if(g.mode!=="e")g.mode="p";
  g.items=g.items.filter(it=>it&&it.id&&/^\d{4}-\d\d-\d\d$/.test(it.start||"")&&ids.includes(it.cat));
  let L=Array.isArray(g.lanes)?[...new Set(g.lanes.filter(id=>ids.includes(id)))]:[];
  if((g.v|0)<3){
    if((g.v|0)<2)L=L.filter(id=>g.items.some(it=>it.cat===id));
    if(!g.items.length){g.rows=[];gSeed(st,g);L=g.lanes||[]}
    else{const n={};[...g.items].sort(gBy).forEach(it=>{if(it.row)return;
        let r=it.type==="p"?null:g.rows.find(x=>x.cat===it.cat);
        if(!r){n[it.cat]=(n[it.cat]||0)+1;r=gNewRow(g,it.cat,"Timeline "+n[it.cat])}it.row=r.id});
      g.items.forEach(it=>{if(!L.includes(it.cat))L.push(it.cat)})}
    g.v=3}
  /* hitos: van en la franja de arriba, para todo el Gantt; los que estaban dentro de un timeline pasan ahí */
  if(!Array.isArray(g.miles))g.miles=[];
  g.items.filter(i=>i.type==="e").forEach(e=>g.miles.push({id:e.id,type:"e",name:e.name||"",start:e.start,note:e.note||""}));
  g.items=g.items.filter(i=>i.type!=="e");
  g.miles=g.miles.filter(m=>m&&m.id&&/^\d{4}-\d\d-\d\d$/.test(m.start||""));
  g.rows=g.rows.filter(r=>r&&r.id&&ids.includes(r.cat));
  g.items.forEach(it=>{const r=g.rows.find(x=>x.id===it.row);if(r)it.cat=r.cat;else it.row=(g.rows.find(x=>x.cat===it.cat)||gNewRow(g,it.cat,"")).id});
  if((g.v|0)<4){const keep=g.rows.filter(r=>r.name||g.items.some(i=>i.row===r.id));g.rows=keep.length?keep:g.rows.slice(0,1);g.v=4}
  g.miles.forEach(m=>{if(m.cat&&!ids.includes(m.cat))m.cat=null});
  /* v5: el orden de los timelines lo decides tú (arrastrando); se parte del orden por categoría que se veía */
  if((g.v|0)<5){const lv=id=>((st.cats||[]).find(c=>c.id===id)||{lvl:9}).lvl|0,ix=id=>{const i=ids.indexOf(id);return i<0?999:i};
    g.rows=g.rows.map((r,i)=>[r,i]).sort((a,b)=>(lv(a[0].cat)-lv(b[0].cat))||(ix(a[0].cat)-ix(b[0].cat))||(a[1]-b[1])).map(x=>x[0]);g.v=5}
  if(!L.length){const c=gFirstCat(st);if(c)L=[c.id]}
  g.lanes=L;
}
ensureG(S);
let gRD=null,gD=null,gScrollTo="hoy",gEditing=null,gNewCat=null,gNewTmp=null,gLastCat=(S.gantt.rows[S.gantt.rows.length-1]||{}).cat;const gNew=new Set();
const GT=document.createElement("div");GT.className="tip";GT.hidden=true;document.body.appendChild(GT);
const GE=document.createElement("div");GE.className="gpop";GE.hidden=true;GE.setAttribute("role","dialog");document.body.appendChild(GE);
function gBarHtml(p,col,W0,N,DW,top){
  const s=gDi(p.start),e=gDi(p.end),a=Math.max(s,W0),b=Math.min(e,W0+N-1);
  return`<div class="gbar${s<W0?" cl":""}${e>W0+N-1?" cr":""}" data-id="${p.id}" style="--bc:${col};--bt:${inkOn(col)};left:${(a-W0)*DW+1}px;width:${(b-a+1)*DW-2}px;top:${top}px" title="${esc(p.name)} · ${gFmt(p.start)} → ${gFmt(p.end)} · ${e-s+1} días · ${p.prog|0}%${p.note?" · "+esc(p.note):""}"><span class="hl"></span><b class="gbt" spellcheck="false">${esc(p.name)}</b>${p.prog?`<em>${p.prog|0}%</em>`:""}<button type="button" class="gmore" title="Fechas, avance y nota" aria-label="Fechas, avance y nota">⋯</button><i class="pg" style="width:${p.prog|0}%"></i><span class="hr"></span></div>`}
const gMileCol=h=>h.cat?cat(h.cat).color:"var(--accent)";
const gWhen=d=>d===0?"hoy":d>0?"en "+d+" d":"hace "+(-d)+" d";
function gEvHtml(h,W0,DW,top,T){
  const d=gDi(h.start)-T;
  return`<div class="gev${d<0?" past":""}${d===0?" now":""}" data-id="${h.id}" style="--bc:${gMileCol(h)};left:${(gDi(h.start)-W0)*DW}px;top:${top}px" title="◆ ${esc(h.name)} · ${DNL[gDow(gDi(h.start))]} ${gFmt(h.start)} · ${gWhen(d)}${h.cat?" · "+esc(cat(h.cat).name):""}${h.note?" · "+esc(h.note):""}"><i></i><span class="gbt" spellcheck="false">${esc(h.name)}</span><small>${gWhen(d)}</small></div>`}
function renderGantt(){
  const box=$("ganttview");if(!box)return;
  if(gD){gD.pend=true;return}
  if(gEditing||gRD)return;
  const ae=document.activeElement;if(ae&&ae.tagName==="INPUT"&&box.contains(ae))return;
  ensureG(S);
  const G=S.gantt,DW=GDW(),N=GN,T=gDi(gToday()),W0=T+G.off,x=n=>(n-W0)*DW,inWin=n=>n>=W0&&n<W0+N;
  const old=box.querySelector(".gwrap"),sl=old?old.scrollLeft:0,st=old?old.scrollTop:0;
  let mo="",wk="",dy="",cols="";
  for(let i=0;i<N;){const k=gKd(W0+i);let j=i;while(j<N&&gKd(W0+j).slice(0,7)===k.slice(0,7))j++;
    mo+=`<div class="ghc m" style="width:${(j-i)*DW}px">${j-i>=3?MESL[+k.slice(5,7)-1]+" "+k.slice(0,4):""}</div>`;i=j}
  for(let i=0;i<N;){const m0=gMon(W0+i);let j=i;while(j<N&&gMon(W0+j)===m0)j++;
    wk+=`<div class="ghc w" style="width:${(j-i)*DW}px" title="Semana del ${gFmt(gKd(m0))}">${j-i>=2?"S"+gIsoWeek(m0):""}</div>`;i=j}
  for(let i=0;i<N;i++){const n=W0+i,w=gDow(n),cl=(w===0||w===6?" we":"")+(w===1?" mon":"")+(n===T?" td":"");
    dy+=`<div class="ghc d${cl}" style="width:${DW}px" title="${DNL[w]} ${gFmt(gKd(n))}"><span>${"DLMXJVS"[w]}</span><b>${+gKd(n).slice(8)}</b></div>`;
    cols+=`<i class="${cl.trim()}"></i>`}
  const ms=G.miles.filter(m=>inWin(gDi(m.start))).sort(gBy),ml=[],mp=new Map();
  ms.forEach(m=>{const a=x(gDi(m.start)),b=a+DW+plain(m.name||"Nombre del hito…").length*6.8+gWhen(gDi(m.start)-T).length*6.2+24;let k=ml.findIndex(e=>e<=a+1);if(k<0){k=ml.length;ml.push(0)}ml[k]=b;mp.set(m.id,k)});
  const mb=G.miles.filter(m=>gDi(m.start)<W0).sort(gBy),ma=G.miles.filter(m=>gDi(m.start)>=W0+N).sort(gBy);
  const strip=`<div class="ghr hs"><div class="lab"><span class="ghl">◆ Hitos</span>${mb.length?`<button type="button" class="gjump" data-k="${mb[mb.length-1].start}" title="${mb.length} antes de esta vista">←${mb.length}</button>`:""}${ma.length?`<button type="button" class="gjump" data-k="${ma[0].start}" title="${ma.length} después de esta vista">${ma.length}→</button>`:""}</div><div class="ghs" style="height:${Math.max(1,ml.length)*22+4}px" title="Toca un día para agregar un hito">${inWin(T)?`<i class="gnowl" style="left:${x(T)+DW/2}px"></i>`:""}${ms.map(m=>gEvHtml(m,W0,DW,2+mp.get(m.id)*22,T)).join("")}<span class="ghplus" hidden>+</span></div></div>`;
  let body="";
  const ci=new Map(S.cats.map((c,i)=>[c.id,i]));
  const rowsS=G.rows;
  let prev=null;
  rowsS.forEach(r=>{
    const c=cat(r.cat),col=c.color,first=r.cat!==prev;prev=r.cat;
    const its=G.items.filter(i=>i.row===r.id).sort(gBy),end=i=>gDi(i.end);
    const vis=its.filter(i=>end(i)>=W0&&gDi(i.start)<W0+N),bef=its.filter(i=>end(i)<W0),aft=its.filter(i=>gDi(i.start)>=W0+N);
    /* barras que se cruzan se acomodan en otra línea dentro del mismo timeline */
    const lines=[],pos=new Map();
    vis.forEach(i=>{const a=x(Math.max(gDi(i.start),W0)),b=x(Math.min(gDi(i.end),W0+N-1)+1);let k=lines.findIndex(e=>e<=a+1);if(k<0){k=lines.length;lines.push(0)}lines[k]=b;pos.set(i.id,k)});
    body+=`<div class="gr trow${first?" cfirst":""}" data-row="${r.id}" style="--cc:${col};--ct:${inkOn(col)}"><div class="lab"><span class="ggrip" title="Arrastra para subir o bajar" aria-label="Mover timeline">⋮⋮</span>${gNewCat===r.id?`<input class="gnewcat" data-row="${r.id}" placeholder="Nueva categoría" maxlength="40" aria-label="Nombre de la nueva categoría">`:`<select class="gcs" data-row="${r.id}" title="Categoría: ${esc(c.name)}" aria-label="Categoría del timeline">${catOpts(r.cat)}<option value="__new">+ Nueva categoría…</option></select>`}<input class="gtn" data-row="${r.id}" value="${esc(r.name)}" placeholder="Nombre del timeline" maxlength="60" aria-label="Nombre del timeline">${bef.length?`<button type="button" class="gjump" data-k="${bef[bef.length-1].start}" title="${bef.length} antes de esta vista">←${bef.length}</button>`:""}${aft.length?`<button type="button" class="gjump" data-k="${aft[0].start}" title="${aft.length} después de esta vista">${aft.length}→</button>`:""}<button type="button" class="gtx" data-row="${r.id}" title="Borrar timeline" aria-label="Borrar timeline">×</button></div><div class="tl tc" data-row="${r.id}" style="height:${Math.max(1,lines.length)*GLH+4}px" title="Toca un día para crear una barra">${vis.map(i=>gBarHtml(i,col,W0,N,DW,3+pos.get(i.id)*GLH)).join("")}</div></div>`});
  if(!rowsS.length)body=`<div class="gr"><div class="lab"><span class="ghl">Sin timelines</span></div><div class="tl"><span class="gempty" style="left:${Math.max(8,x(T)+12)}px">Crea el primero con «+ timeline»</span></div></div>`;
  box.innerHTML=`<div class="gtop"><div class="gnav"><button type="button" data-g="-30" title="Un mes atrás">◀◀</button><button type="button" data-g="-7" title="Una semana atrás">◀</button><button type="button" data-g="0" class="primary">Hoy</button><button type="button" data-g="7" title="Una semana adelante">▶</button><button type="button" data-g="30" title="Un mes adelante">▶▶</button><span class="rng">${gFmt(gKd(W0))} – ${gFmt(gKd(W0+N-1))}</span></div>
    <p class="ghint">Agrega timelines en la esquina izquierda · ⋮⋮ arrastra para subir o bajar · toca un día de un timeline para crear una barra · el + sobre los días marca un hito · toca una barra para escribir · ⋯ fechas y avance · arrastra para mover y estira los bordes.</p></div>
    <div class="gwrap" style="--dw:${DW}px;--n:${N}"><div class="gtab"><div class="gh"><div class="ghr"><div class="lab"></div>${mo}</div><div class="ghr gw"><div class="lab"></div>${wk}${inWin(T)?`<span class="gtoday" style="left:calc(var(--lw) + ${x(T)+DW/2}px)">HOY</span>`:""}</div>${strip}<div class="ghr"><div class="lab gacts"><select class="gaddcat" aria-label="Agregar un timeline de una categoría" title="Elige una categoría: aparece con su timeline"><option value="" selected>+ categoría</option>${catOpts("")}</select><button type="button" class="gbtn gaddrow" title="Nuevo timeline con la última categoría usada">+<span class="gbl"> timeline</span></button></div>${dy}</div></div>
    <div class="gb"><div class="gcols">${cols}</div>${ms.map(m=>`<div class="gmile${gDi(m.start)<T?" past":""}" data-id="${m.id}" style="--bc:${gMileCol(m)};left:calc(var(--lw) + ${x(gDi(m.start))+DW/2}px)"></div>`).join("")}${inWin(T)?`<div class="gnow" style="left:calc(var(--lw) + ${x(T)+DW/2}px)"></div>`:""}${body}</div></div></div>`;
  const wrap=box.querySelector(".gwrap");
  if(gScrollTo!=null&&box.offsetParent){const n=gScrollTo==="hoy"?T:gScrollTo;wrap.scrollLeft=Math.max(0,(n-W0-3)*DW);gScrollTo=null}
  else wrap.scrollLeft=sl;
  wrap.scrollTop=st;
  box.querySelectorAll(".gnav button").forEach(b=>b.onclick=()=>{const d=+b.dataset.g;if(d===0){G.off=-14;gScrollTo="hoy"}else G.off+=d;save();renderGantt()});
  box.querySelectorAll(".gjump").forEach(b=>b.onclick=()=>{const n=gDi(b.dataset.k);G.off=n-T-7;gScrollTo=n;save();renderGantt()});
  /* franja de hitos: el + sigue al mouse por los días; tocar un día crea el hito y escribes su nombre */
  const hs=box.querySelector(".ghs"),hp=hs.querySelector(".ghplus"),dayAt=ev=>W0+Math.floor((ev.clientX-hs.getBoundingClientRect().left)/DW);
  hs.onmousemove=ev=>{if(ev.target!==hs||gD){hp.hidden=true;return}hp.hidden=false;hp.style.left=(dayAt(ev)-W0)*DW+"px"};
  hs.onmouseleave=()=>hp.hidden=true;
  hs.onclick=ev=>{if(ev.target!==hs)return;hp.hidden=true;const h={id:uid(),type:"e",name:"",start:gKd(dayAt(ev)),note:""};
    G.miles.push(h);gNew.add(h.id);renderGantt();const el=box.querySelector(`.gev[data-id="${h.id}"]`);if(el)gInline(h,el)};
  /* hito ↔ su línea: al pasar sobre uno, su línea se resalta */
  box.querySelectorAll(".ghs .gev").forEach(e=>{const ln=box.querySelector(`.gmile[data-id="${e.dataset.id}"]`);if(!ln)return;e.onmouseenter=()=>ln.classList.add("hot");e.onmouseleave=()=>ln.classList.remove("hot")});
  box.querySelectorAll(".gcs").forEach(sl=>sl.onchange=()=>{const r=G.rows.find(x=>x.id===sl.dataset.row);if(!r)return;
    if(sl.value==="__new"){gNewCat=r.id;renderGantt();return}
    r.cat=sl.value;gLastCat=r.cat;save();renderGantt();flash(`${r.name||"Timeline"} → ${cat(r.cat).name}`)});
  /* + categoría: eliges una de tus categorías y aparece con su timeline, listo para escribirle el nombre */
  box.querySelector(".gaddcat").onchange=e=>{const cid=e.target.value;if(!cid)return;
    const r=gNewRowNear(G,cid);gLastCat=cid;save();renderGantt();
    const i=box.querySelector(`.gtn[data-row="${r.id}"]`);if(i){i.focus();i.scrollIntoView({block:"nearest"})}
    flash(`${cat(cid).name}: timeline nuevo, escríbele el nombre.`)};
  box.querySelector(".gaddrow").onclick=()=>{const cid=S.cats.some(c=>c.id===gLastCat)?gLastCat:(gFirstCat(S)||{}).id;if(!cid)return;
    const r=gNewRowNear(G,cid);save();renderGantt();const i=box.querySelector(`.gtn[data-row="${r.id}"]`);if(i){i.focus();i.scrollIntoView({block:"nearest"})}};
  /* ⋮⋮ arrastrar un timeline hacia arriba o abajo (mouse o dedo) */
  box.querySelectorAll(".ggrip").forEach(gp=>gp.onpointerdown=ev=>{
    if(gRD||(ev.pointerType==="mouse"&&ev.button!==0))return;ev.preventDefault();
    const row=gp.closest(".gr.trow"),rows=[...box.querySelectorAll(".gr.trow")],others=rows.filter(r=>r!==row),wrap=box.querySelector(".gwrap");
    gRD={id:row.dataset.row,y0:ev.clientY,s0:wrap.scrollTop,moved:false,to:undefined};
    try{gp.setPointerCapture(ev.pointerId)}catch(_){}
    const clear=()=>others.forEach(r=>r.classList.remove("dropb","dropa"));
    gp.onpointermove=e=>{if(!gRD)return;
      const wr=wrap.getBoundingClientRect();if(e.clientY>wr.bottom-30)wrap.scrollTop+=12;else if(e.clientY<wr.top+90)wrap.scrollTop-=12;
      const dy=e.clientY-gRD.y0+(wrap.scrollTop-gRD.s0);if(!gRD.moved&&Math.abs(dy)<4)return;
      if(!gRD.moved){gRD.moved=true;row.classList.add("rdrag")}
      row.style.transform=`translateY(${dy}px)`;clear();
      const t=others.find(r=>{const b=r.getBoundingClientRect();return e.clientY<b.top+b.height/2});
      if(t){t.classList.add("dropb");gRD.to=t.dataset.row}else if(others.length){others[others.length-1].classList.add("dropa");gRD.to=null}};
    const fin=keep=>{gp.onpointermove=gp.onpointerup=gp.onpointercancel=null;const d=gRD;gRD=null;row.style.transform="";row.classList.remove("rdrag");clear();
      if(!keep||!d||!d.moved||d.to===undefined){renderGantt();return}
      const i=G.rows.findIndex(r=>r.id===d.id);if(i<0)return;const [m]=G.rows.splice(i,1);
      const j=d.to===null?G.rows.length:G.rows.findIndex(r=>r.id===d.to);G.rows.splice(j<0?G.rows.length:j,0,m);
      save();renderGantt();flash(`Timeline movido: ${m.name||cat(m.cat).name}`)};
    gp.onpointerup=()=>fin(true);gp.onpointercancel=()=>fin(false)});
  box.querySelectorAll(".gtn").forEach(i=>{const r=G.rows.find(x=>x.id===i.dataset.row);
    i.oninput=()=>{r.name=i.value.trim();save()};
    i.onkeydown=e=>{if(e.key==="Enter"||e.key==="Escape"){e.preventDefault();i.blur()}}});
  box.querySelectorAll(".gtx").forEach(b=>b.onclick=()=>{const id=b.dataset.row,r=G.rows.find(x=>x.id===id),n=G.items.filter(i=>i.row===id).length;
    const del=()=>{S.gantt.rows=S.gantt.rows.filter(x=>x.id!==id);S.gantt.items=S.gantt.items.filter(i=>i.row!==id);save();renderGantt();flashU("Timeline borrado.")};
    if(!n&&!(r&&r.name)){del();return}
    askDel(`¿Borrar el timeline <b>«${esc(r&&r.name||"sin nombre")}»</b>${n?` y sus ${n} barra${n===1?"":"s"}`:""}?`,del)});
  const ni=box.querySelector(".gnewcat");
  if(ni){let done=false;
    const fin=ok=>{if(done)return;done=true;ni.onblur=null;ni.blur();const v=ni.value.trim(),r=G.rows.find(x=>x.id===ni.dataset.row),tmp=gNewTmp===ni.dataset.row;gNewCat=null;gNewTmp=null;
      if(!ok||!v||!r){if(tmp&&r&&!r.name&&!G.items.some(i=>i.row===r.id))G.rows=G.rows.filter(x=>x.id!==r.id);save();renderGantt();return}
      const ex=S.cats.find(c=>String(c.name).toUpperCase()===v.toUpperCase());let id;
      if(ex)id=ex.id;else{const c={id:uid(),name:v.toUpperCase(),color:GPAL[S.cats.length%GPAL.length],lvl:3};S.cats.push(c);id=c.id}
      r.cat=id;gLastCat=id;commit();if(tmp){const i=$("ganttview").querySelector(`.gtn[data-row="${r.id}"]`);if(i)i.focus()}flash(ex?`${ex.name} ya existía: la puse en el timeline.`:`Categoría creada: ${v.toUpperCase()}. Su color y prioridad se ajustan en «Categorías y colores».`)};
    ni.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();fin(true)}else if(e.key==="Escape"){e.preventDefault();fin(false)}};
    ni.onblur=()=>fin(true);
    if(box.offsetParent)ni.focus()}
  box.querySelectorAll(".gmore").forEach(b=>b.onclick=e=>{e.stopPropagation();const it=G.items.find(i=>i.id===b.closest(".gbar").dataset.id);if(it)gEdit(it,b.getBoundingClientRect())});
  /* tocar un día vacío de un timeline: crea una barra (7 días) o un hito, y escribes su nombre ahí mismo */
  box.querySelectorAll(".tl.tc").forEach(tl=>tl.onclick=e=>{if(e.target!==tl)return;
    const r=G.rows.find(x=>x.id===tl.dataset.row);if(!r)return;
    const n=W0+Math.floor((e.clientX-tl.getBoundingClientRect().left)/DW),k=gKd(n);
    const it={id:uid(),type:"p",row:r.id,cat:r.cat,name:"",start:k,end:gKd(n+6),prog:0,note:""};
    G.items.push(it);gNew.add(it.id);renderGantt();
    const el=box.querySelector(`[data-id="${it.id}"]`);if(el)gInline(it,el)});
  /* arrastrar barras e hitos */
  const gb=box.querySelector(".gtab");
  gb.addEventListener("pointerdown",ev=>{
    const el=ev.target.closest(".gbar,.gev");if(!el||gD||(ev.pointerType==="mouse"&&ev.button!==0))return;
    if(ev.target.closest(".gmore")||el.classList.contains("editing"))return;
    const it=G.items.find(i=>i.id===el.dataset.id)||G.miles.find(i=>i.id===el.dataset.id);if(!it)return;
    ev.preventDefault();
    const mode=ev.target.classList.contains("hl")?"l":ev.target.classList.contains("hr")?"r":"m";
    gD={el,it,mode,x0:ev.clientX,s0:gDi(it.start),e0:gDi(it.type==="p"?it.end:it.start),moved:false,W0,N,DW,pid:ev.pointerId};
    try{el.setPointerCapture(ev.pointerId)}catch(_){}
    el.classList.add("gdrag")});
  gb.addEventListener("pointermove",ev=>{
    if(!gD||ev.pointerId!==gD.pid)return;
    if(!gD.moved&&Math.abs(ev.clientX-gD.x0)<4)return;
    gD.moved=true;ev.preventDefault();
    const d=Math.round((ev.clientX-gD.x0)/gD.DW);let s=gD.s0,e=gD.e0;
    if(gD.mode==="m"){s+=d;e+=d}else if(gD.mode==="l")s=Math.min(gD.s0+d,gD.e0);else e=Math.max(gD.e0+d,gD.s0);
    gD.s=s;gD.e=e;gPlace(gD,s,e);
    GT.textContent=gD.it.type==="p"?`${gFmt(gKd(s))} → ${gFmt(gKd(e))} · ${e-s+1} días`:gFmt(gKd(s))+" · "+DNL[gDow(s)];
    GT.hidden=false;GT.style.left=(ev.clientX+12)+"px";GT.style.top=(ev.clientY+14)+"px"});
  const up=ev=>{
    if(!gD||ev.pointerId!==gD.pid)return;
    const g=gD;gD=null;GT.hidden=true;g.el.classList.remove("gdrag");
    const r=g.el.getBoundingClientRect();
    if(g.moved&&g.s!=null&&(g.s!==g.s0||g.e!==g.e0)){g.it.start=gKd(g.s);if(g.it.type==="p")g.it.end=gKd(g.e);save();renderGantt();flash(`${g.it.name}: ${g.it.type==="p"?gFmt(g.it.start)+" → "+gFmt(g.it.end):gFmt(g.it.start)}`)}
    else{if(g.pend)renderGantt();
      if(!g.moved){if(g.it.type==="p"){const el=box.querySelector(`.gbar[data-id="${g.it.id}"]`);if(el)gInline(g.it,el)}else gEdit(g.it,r)}}};
  gb.addEventListener("pointerup",up);
  gb.addEventListener("pointercancel",ev=>{if(gD&&ev.pointerId===gD.pid){gD.moved=true;gD.s=null;up(ev);renderGantt()}});
}
/* escribir el nombre ahí mismo: Enter o tocar fuera guarda; Esc deshace; lo nuevo sin texto se descarta */
function gInline(it,el){
  const b=el.querySelector(".gbt");if(!b)return;
  gEditing=it.id;el.classList.add("editing");
  b.contentEditable="plaintext-only";if(b.contentEditable!=="plaintext-only")b.contentEditable="true";
  b.focus();try{const r=document.createRange();r.selectNodeContents(b);if(!gNew.has(it.id))r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)}catch(_){}
  const old=it.name||"";let cancel=false;
  b.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();b.blur()}else if(e.key==="Escape"){e.preventDefault();cancel=true;b.blur()}};
  b.onpaste=e=>{e.preventDefault();document.execCommand("insertText",false,(e.clipboardData||window.clipboardData).getData("text/plain").replace(/\s+/g," "))};
  b.ondrop=e=>e.preventDefault();
  b.onblur=()=>{b.onblur=null;gEditing=null;
    const v=cancel?old:b.textContent.replace(/\s+/g," ").trim(),wasNew=gNew.delete(it.id);
    if(!v&&wasNew){S.gantt.items=S.gantt.items.filter(x=>x.id!==it.id);S.gantt.miles=S.gantt.miles.filter(x=>x.id!==it.id)}else if(v)it.name=v;
    save();renderGantt();
    if(v&&v!==old)flash((wasNew?(it.type==="e"?"Hito creado: ":"Barra creada: "):"Guardado: ")+v)}}
function gPlace(g,s,e){
  const el=g.el,W0=g.W0,N=g.N,DW=g.DW;
  if(g.it.type==="e"){el.style.visibility=s>=W0&&s<W0+N?"":"hidden";el.style.left=(s-W0)*DW+"px";return}
  const a=Math.max(s,W0),b=Math.min(e,W0+N-1);
  if(b<a){el.style.visibility="hidden";return}
  el.style.visibility="";el.style.left=((a-W0)*DW+1)+"px";el.style.width=((b-a+1)*DW-2)+"px";
  el.classList.toggle("cl",s<W0);el.classList.toggle("cr",e>W0+N-1)}
/* ⋯ de una barra o toque en un hito: fechas, avance, nota y borrar */
function gEdit(it,r){
  const c=cat(it.cat),P=it.type==="p",row=P&&S.gantt.rows.find(x=>x.id===it.row);
  GE.innerHTML=`<div class="tph">${P?`Barra · ${esc(c.name)}${row&&row.name?" · "+esc(row.name):""}`:"◆ Hito"}</div>
    <label class="gf"><span>Nombre</span><input id="geN" value="${esc(it.name||"")}" maxlength="80"></label>
    <div class="gf2"><label class="gf"><span>${P?"Inicio":"Fecha"}</span><input type="date" id="geS" value="${it.start}"></label>${P?`<label class="gf"><span>Fin</span><input type="date" id="geE" value="${it.end}"></label>`:""}</div>
    ${P?`<label class="gf"><span>Avance <b id="geV">${it.prog|0}%</b></span><input type="range" id="geP" min="0" max="100" step="5" value="${it.prog|0}"></label>`:""}
    <label class="gf"><span>Nota</span><textarea id="geT" rows="2" maxlength="400">${esc(it.note||"")}</textarea></label>
    <div class="gmsg" id="geM"></div>
    <div class="tpf"><button type="button" class="gdel" id="geDel">Borrar</button><span style="flex:1"></span><button type="button" id="geX">Cancelar</button><button type="button" class="primary" id="geOk">Guardar</button></div>`;
  GE.hidden=false;
  const q=id=>GE.querySelector("#"+id),W=GE.offsetWidth,H=GE.offsetHeight,vw=document.documentElement.clientWidth;
  const left=Math.max(8,Math.min(r.left,vw-W-8)),top=r.bottom+6+H>innerHeight&&r.top-H-6>8?r.top-H-6:r.bottom+6;
  GE.style.left=(left+scrollX)+"px";GE.style.top=(top+scrollY)+"px";
  if(P)q("geP").oninput=e=>q("geV").textContent=e.target.value+"%";
  q("geX").onclick=()=>GE.hidden=true;
  const ok=()=>{const nm=q("geN").value.trim(),s=q("geS").value,e=P?q("geE").value:s,m=q("geM");
    if(!nm){m.textContent="Ponle un nombre.";q("geN").focus();return}
    if(!s||!e){m.textContent="Elige las fechas.";return}
    if(P&&e<s){m.textContent="El fin debe ser el mismo día o después del inicio.";return}
    it.name=nm;it.start=s;if(P){it.end=e;it.prog=+q("geP").value}it.note=q("geT").value.trim();
    GE.hidden=true;save();renderGantt();flash("Guardado: "+nm)};
  q("geOk").onclick=ok;
  q("geN").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();ok()}};
  const del=q("geDel");
  del.onclick=()=>{GE.hidden=true;askDel(`¿Borrar ${P?"la barra":"el hito"} <b>«${esc(it.name)}»</b>?`,()=>{S.gantt.items=S.gantt.items.filter(x=>x.id!==it.id);S.gantt.miles=S.gantt.miles.filter(x=>x.id!==it.id);save();renderGantt();flashU((P?"Barra":"Hito")+" borrado: "+it.name)})};
}
document.addEventListener("mousedown",e=>{if(!GE.hidden&&!GE.contains(e.target)&&!e.target.closest(".gmore,.gbar,.gev,.tl.tc,.ghs"))GE.hidden=true});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!GE.hidden)GE.hidden=true});
{let rt,lastW=GDW();addEventListener("resize",()=>{clearTimeout(rt);rt=setTimeout(()=>{if(GDW()!==lastW){lastW=GDW();renderGantt()}},200)})}
function renderWeek(){
  const W=$("week");W.innerHTML="";
  [1,2,3,4,5,6,0].forEach(w=>{const C=capDay(w),r=document.createElement("div");r.className="wd"+(w===wd(0)?" today":"");
    r.innerHTML=`<b>${DN[w]}</b><div class="chips"></div><span class="cap">${fmt(C)} h</span>`;
    const ch=r.querySelector(".chips");
    S.week[w].forEach((b,i)=>{const c=document.createElement("span");c.className="chip";
      c.innerHTML=`<button type="button" class="tbtn" id="s-${w}-${i}" aria-label="${DN[w]} inicio">${ampm(b[0])}</button><span>–</span><button type="button" class="tbtn" id="e-${w}-${i}" aria-label="${DN[w]} fin">${ampm(b[1])}</button><button class="x" aria-label="Quitar bloque">×</button>`;
      const [s,e]=c.querySelectorAll(".tbtn");
      s.onclick=()=>tpOpen(s,w,i,0);e.onclick=()=>tpOpen(e,w,i,1);
      c.querySelector(".x").onclick=()=>{S.week[w].splice(i,1);commit();wkMsg(DN[w]+": bloque quitado ✓")};
      ch.appendChild(c)});
    const a=document.createElement("button");a.className="add";a.textContent="+ bloque";
    a.onclick=()=>{const left=maxM()-capDay(w);if(left<30){wkMsg(DN[w]+" ya tiene "+maxM()/60+" h. Sube el máximo por día si necesitas más.",true);return}
      const st=Math.min(S.week[w].reduce((x,b)=>Math.max(x,toM(b[1])),7*60),22*60);S.week[w].push([hm(st),hm(Math.min(st+Math.min(60,left),23*60))]);commit();wkMsg(DN[w]+": bloque agregado ✓ Toca las horas para ajustarlo.")};
    ch.appendChild(a);W.appendChild(r)});
  const wt=$("wkTot");if(wt)wt.textContent="· Total semana: "+fmt(capWeek())+" h";
}
function renderCats(){
  const C=$("cats");C.innerHTML=`<p class="note">El orden de esta lista es la <b>importancia</b>: primero manda la prioridad (1, 2, 3) y, dentro de cada prioridad, la que está más arriba es más importante. Usa ↑ ↓ para reordenar.</p>`;
  [1,2,3].forEach(lv=>{const g=S.cats.filter(c=>c.lvl===lv);if(!g.length)return;
    const h=document.createElement("div");h.className="sep";h.style.margin="6px 0 0";h.innerHTML=`<span class="pdot p${lv}">P${lv}</span> Prioridad ${lv}`;C.appendChild(h);
    g.forEach((c,k)=>{const d=document.createElement("div");d.className="cat cato";
    d.innerHTML=`<span class="ord">${k+1}</span><span class="pl"><input type="color" value="${c.color}" aria-label="Color"></span><input class="cn" value="${esc(c.name)}" aria-label="Nombre"><select aria-label="Prioridad">${[1,2,3].map(n=>`<option value="${n}"${n==c.lvl?" selected":""}>Prioridad ${n}</option>`).join("")}</select><span class="mv"><button class="up" aria-label="Subir" ${k?"":"disabled"}>↑</button><button class="dw" aria-label="Bajar" ${k<g.length-1?"":"disabled"}>↓</button></span><button class="x" aria-label="Borrar categoría">×</button>`;
    const sw=o=>{const a=S.cats.indexOf(c),b=S.cats.indexOf(g[k+o]);[S.cats[a],S.cats[b]]=[S.cats[b],S.cats[a]];commit()};
    d.querySelector(".up").onclick=()=>sw(-1);d.querySelector(".dw").onclick=()=>sw(1);
    d.querySelector("input[type=color]").onchange=e=>{c.color=e.target.value;commit()};
    d.querySelector(".cn").onchange=e=>{c.name=e.target.value.trim()||c.name;commit()};
    d.querySelector("select").onchange=e=>{c.lvl=+e.target.value;commit()};
    d.querySelector(".x").onclick=()=>{if(S.tasks.some(t=>t.cat===c.id)||S.resp.some(r=>r.cat===c.id)){flash("Esa categoría tiene tareas. Muévelas antes de borrarla.");return}
      if(S.gantt&&(S.gantt.items.some(it=>it.cat===c.id)||S.gantt.rows.some(r=>r.cat===c.id))){flash("Esa categoría tiene timelines en el Gantt. Cámbiales la categoría o bórralos antes.");return}
      askDel(`¿Borrar la categoría <b>${esc(c.name)}</b>?`,()=>{S.cats=S.cats.filter(x=>x.id!==c.id);commit();flashU("Categoría borrada: "+c.name)})};
    C.appendChild(d)})});
}
function renderTags(){
  const C=$("tags");C.innerHTML="";
  S.tags.forEach(g=>{const n=S.tasks.filter(t=>t.tag===g.id&&!t.done).length,d=document.createElement("div");d.className="tagrow";
    d.innerHTML=`<input type="color" value="${g.color}" aria-label="Color de ${esc(g.name)}"><input class="tn" value="${esc(g.name)}" aria-label="Nombre de la etiqueta"><span class="prev"><span class="tg" style="--tc:${g.color};cursor:default">${esc(g.name)}</span></span><span class="cnt">${n} pend.</span><button class="x" aria-label="Borrar etiqueta">×</button>`;
    d.querySelector("input[type=color]").onchange=e=>{g.color=e.target.value;commit()};
    d.querySelector(".tn").onchange=e=>{g.name=e.target.value.trim()||g.name;commit()};
    d.querySelector(".x").onclick=()=>{const k=S.tasks.filter(t=>t.tag===g.id).length;askDel(`¿Borrar la etiqueta <b>${esc(g.name)}</b>?${k?` ${k} tarea${k===1?"":"s"} quedará${k===1?"":"n"} sin etiqueta.`:""}`,()=>{S.tasks.forEach(t=>{if(t.tag===g.id)t.tag=null});S.tags=S.tags.filter(x=>x.id!==g.id);commit();flashU(k?`Etiqueta borrada; ${k} tareas quedaron sin etiqueta.`:"Etiqueta borrada.")})};
    C.appendChild(d)});
  if(!S.tags.length)C.innerHTML='<p class="note">No hay etiquetas. Crea una con “+ Etiqueta”.</p>';
}
function commit(){save();render()}

$("now").onclick=()=>{S.from=null;commit()};
$("from").onchange=e=>{S.from=e.target.value;commit()};
$("sort").onclick=()=>{const idx=new Map(S.cats.map((c,i)=>[c.id,i]));
  S.tasks=sortChunks(S.tasks,(a,b)=>(cat(a.cat).lvl-cat(b.cat).lvl)||((idx.get(a.cat)??999)-(idx.get(b.cat)??999)));
  commit();flash("Ordenado por prioridad de categoría.")};
$("nRp").onchange=e=>{$("nMin").disabled=e.target.checked;if(e.target.checked)$("nMin").classList.remove("bad")};
$("addForm").onsubmit=e=>{e.preventDefault();const txt=$("nTxt").value.trim();if(!txt){flash("Escribe la tarea antes de agregarla.");return}
  if(/^-{3,}$/.test(txt)&&$("nRp").checked){S.resp.push(newSepR());$("nTxt").value="";commit();$("nTxt").focus();flash("Separador agregado al final de Esperando respuesta.");return}
  if(/^-{3,}$/.test(txt)){S.tasks.push(newSep("hoy"));$("nTxt").value="";$("nMin").value="";$("nMin").classList.remove("bad");commit();$("nTxt").focus();flash("Separador agregado al final de Hoy. Arrástralo con ⋮⋮ a donde quieras.");return}
  const mn=parseInt($("nMin").value);
  if(!$("nRp").checked&&!(mn>0)){const i=$("nMin");i.classList.add("bad");i.focus();flash("⚠ Pon los minutos de la tarea: es obligatorio y debe ser un número mayor que 0.");i.addEventListener("input",()=>i.classList.remove("bad"),{once:true});return}
  if($("nRp").checked)S.resp.push({id:uid(),cat:$("nCat").value,text:txt,done:false,createdAt:Date.now(),seq:nextSeq(),doneAt:null});
  else S.tasks.push({id:uid(),cat:$("nCat").value,text:txt,min:mn,tag:$("nTag").value||null,done:false,doneOn:null,createdAt:Date.now(),seq:nextSeq(),doneAt:null,plan0:null,pin:dk(0)});
  $("nTxt").value="";$("nMin").value="";commit();$("nTxt").focus()};
$("energy").onclick=()=>{if(!S.tags.length){flash("Primero crea etiquetas.");return}
  ["hoy"].forEach(z=>{if(lastSec[z].length>1){secMode[z]=null;sortDir[z]=null;secSort(z,"tag")}});
  flash(`Hoy: primero ${S.tags[0].name}, luego ${S.tags.slice(1).map(g=>g.name).join(" y ")||"el resto"}; empates por prioridad.`)};
$("addTag").onclick=()=>{S.tags.push({id:uid(),name:"Nueva etiqueta",color:"#64748B"});commit();const i=[...document.querySelectorAll("#tags .tn")].pop();if(i){i.focus();i.select()}};
$("addCat").onclick=()=>{S.cats.push({id:uid(),name:"NUEVA",color:"#888888",lvl:3});commit();$("cfg").open=true};
function hslHex(h,s,l){s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));return"#"+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,"0")).join("")}
$("suggest").onclick=()=>{const H={1:0,2:24,3:46},Sat={1:72,2:85,3:90};
  [1,2,3].forEach(l=>{const g=S.cats.filter(c=>c.lvl===l);g.forEach((c,i)=>{c.color=hslHex(H[l],Sat[l],g.length>1?38+i*(34/(g.length-1)):42)})});commit()};
$("copy").onclick=()=>{const plan=schedule(),o=S.tasks.filter(t=>!t.done).sort((a,b)=>(plan[a.id].o<0?99:plan[a.id].o)-(plan[b.id].o<0?99:plan[b.id].o)||(plan[a.id].s||0)-(plan[b.id].s||0));
  const ln=o.map(t=>{const p=plan[t.id];if(t.sep)return t.text?"—— "+t.text.toUpperCase()+" ——":"——————";return`${p.o<0?"COLA":"Hoy "+hm(p.s)+"–"+hm(p.e)} · ${cat(t.cat).name} · ${t.text}${tagOf(t.tag)?" · "+tagOf(t.tag).name:""} · ${t.min>0?t.min+" min":"SIN TIEMPO"}`});
  const r=S.resp.filter(x=>!x.done).map(x=>x.sep?(x.text?"—— "+x.text.toUpperCase()+" ——":"——————"):`⏳ ${cat(x.cat).name} · ${x.text}`);
  const txt="MI PLAN:\n"+ln.join("\n")+(r.length?"\n\nESPERANDO RESPUESTA:\n"+r.join("\n"):"");
  navigator.clipboard.writeText(txt).then(()=>flash("Copiado. Pégalo en el chat con Claude."),()=>flash("No se pudo copiar automáticamente en esta vista."))};
$("reset").onclick=()=>{$("confirm").innerHTML='<button id="yes" style="border-color:var(--hot);color:var(--hot)">Sí, borrar mis cambios</button>';$("yes").onclick=()=>{S=SEED();S.tags=TAGS0();ensureSeq(S);$("confirm").innerHTML="";commit()}};
const tip=$("tip");
document.addEventListener("mousemove",e=>{const t=e.target.closest&&e.target.closest("[data-t]");if(!t){tip.hidden=true;return}tip.textContent=t.dataset.t;tip.hidden=false;tip.style.left=(e.clientX+12)+"px";tip.style.top=(e.clientY+12)+"px"});
$("today").textContent=new Date().toLocaleDateString("es-PE",{weekday:"long",day:"numeric",month:"long"}).replace(/^./,c=>c.toUpperCase())+" · se guarda en tu cuenta";
/* respaldo */
const MARK="===== DATOS PARA RESTAURAR (no editar) =====";
function backupText(){
  const plan=schedule(),open=S.tasks.filter(t=>!t.done),L=[];
  const line=t=>{const p=plan[t.id]||{o:-1};if(t.sep)return"- —— "+(t.text?t.text.toUpperCase()+" ——":"————");return`- [${cat(t.cat).name}] ${t.text}${tagOf(t.tag)?" · #"+tagOf(t.tag).name:""} · ${t.min>0?t.min+" min":"SIN TIEMPO"}${p.o>=0?" · Hoy "+hm(p.s):""} · ingresada ${fdTxt(t.createdAt)}${t.plan0?" · programada "+fdTxt(t.plan0):""}${overdue(t)?" · "+overdue(t).toUpperCase():""}`};
  const sec=(title,rows)=>{L.push("","== "+title+" ("+rows.length+") ==");rows.length?rows.forEach(r=>L.push(r)):L.push("(vacío)")};
  const by=o=>open.filter(t=>(plan[t.id]||{o:-1}).o===o);
  L.push("PLANIFICADOR · respaldo",new Date().toLocaleString("es-PE"));
  sec("RUTINAS",S.routines.map(r=>{const t=rtToday(r);return`- [${cat(r.cat).name}] ${r.text} · ${rtFreq(r)} · ${r.min} min${!rtDue(r)?" · hoy no toca":t?(t.done?" · hecha hoy":" · en Hoy"):""}${rtStreak(r)>=2?" · racha "+rtStreak(r)+" días":""}`}));
  sec("ESPERANDO RESPUESTA",S.resp.filter(r=>!r.done).map(r=>r.sep?"- —— "+(r.text?r.text.toUpperCase()+" ——":"————"):`- [${cat(r.cat).name}] ${r.text} · ingresada ${fdTxt(r.createdAt)}${r.createdAt?" · esperando hace "+dur(Date.now()-r.createdAt):""}`));
  sec("HOY · "+DNL[wd(0)].toUpperCase(),by(0).map(line));
  sec("COLA",by(-1).map(line));
  sec("HECHAS",[...S.tasks.filter(t=>t.done).map(t=>{const r=result(t);return`- [${cat(t.cat).name}] ${t.text} · ${t.min} min · ingresada ${fdTxt(t.createdAt)}${t.plan0?" · programada "+fdTxt(t.plan0):""} · terminada ${t.doneAt?fdTxt(t.doneAt):(t.doneOn||"sin registro")}${r?" · "+r.t:""}`}),...S.resp.filter(r=>r.done).map(r=>`- RPTA [${cat(r.cat).name}] ${r.text} · ingresada ${fdTxt(r.createdAt)} · respondieron ${fdTxt(r.doneAt)}${respResult(r)?" · "+respResult(r):""}`)]);
  if(S.gantt&&S.gantt.rows&&S.gantt.rows.length){const out=[];
    S.gantt.rows.filter(r=>r.name||S.gantt.items.some(i=>i.row===r.id)).forEach(r=>{out.push(`- [${cat(r.cat).name}] Timeline: ${r.name||"(sin nombre)"}`);
      S.gantt.items.filter(i=>i.row===r.id).sort(gBy).forEach(it=>out.push(it.type==="p"?`    ▬ ${it.name} · ${gFmtTxt(it.start)} → ${gFmtTxt(it.end)} (${gDi(it.end)-gDi(it.start)+1} días) · avance ${it.prog|0}%${it.note?" · "+it.note:""}`:`    ◆ Hito: ${it.name} · ${gFmtTxt(it.start)}${it.note?" · "+it.note:""}`))});
    sec("GANTT · TIMELINES",out)}
  if(S.gantt&&S.gantt.miles&&S.gantt.miles.length)sec("GANTT · HITOS",[...S.gantt.miles].sort(gBy).map(m=>`- ◆ ${m.name} · ${gFmtTxt(m.start)}${m.cat?" · "+cat(m.cat).name:""}${m.note?" · "+m.note:""}`));
  if(S.goal&&(S.goal.t||S.goal.d))sec("OBJETIVO DE LA SEMANA",[S.goal.t,S.goal.d].filter(Boolean));
  if(S.notes){const d=document.createElement("div");d.innerHTML=S.notes;sec("NOTAS",d.innerText.split("\n").filter(x=>x.trim()))}
  sec("BLOQUES DE TRABAJO",[1,2,3,4,5,6,0].map(w=>`- ${DN[w]}: ${S.week[w].map(b=>b[0]+"–"+b[1]).join(", ")||"sin bloques"} (${fmt(capDay(w))} h)`));
  sec("ETIQUETAS",S.tags.map(g=>`- ${g.name} · ${g.color}`));
  sec("CATEGORÍAS",[...S.cats].sort((a,b)=>a.lvl-b.lvl).map(c=>`- ${c.name} · prioridad ${c.lvl} · ${c.color}`));
  /* también va el acomodo de «Vista por categoría» (orden y tamaño de las tarjetas, pestaña abierta) */
  let vista=null;try{vista=JSON.parse(localStorage.getItem(CVKEY))}catch(e){}
  L.push("",MARK,JSON.stringify(vista?{...S,_vista:vista}:S));
  return L.join("\n");
}
let dl=null;try{window.claude&&claude.use("downloads").then(d=>dl=d)}catch(e){}
$("bkSave").onclick=async()=>{
  const d=new Date(),name=`planificador-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}.txt`,txt=backupText();
  const done=()=>{S.lastBk=new Date().toLocaleString("es-PE");save();showBk();flash("Respaldo guardado: "+name)};
  if(dl){try{await dl.save({filename:name,data:txt});done()}catch(e){flash(e&&e.code==="declined"?"Descarga cancelada.":"No se pudo descargar aquí. Usa “Copiar para Claude” como respaldo.")}return}
  try{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([txt],{type:"text/plain;charset=utf-8"}));a.download=name;document.body.appendChild(a);a.click();a.remove();done()}catch(e){flash("No se pudo descargar en esta vista.")}
};
function bkShow(html,cls){const c=$("bkCard");c.className="bkcard "+(cls||"");c.innerHTML=html;c.hidden=false}
function bkCheck(f){
  if(!f)return;
  bkShow(`Leyendo <b>${esc(f.name)}</b>…`);
  const r=new FileReader();
  r.onerror=()=>bkShow(`✗ No se pudo leer <b>${esc(f.name)}</b>. Prueba subirlo otra vez.`,"bad");
  r.onload=()=>{const t=String(r.result),i=t.indexOf(MARK);let data=null,why="";
    if(i<0)why="No encontré el bloque de datos del final. ¿Es un respaldo descargado desde este planificador?";
    else{try{data=JSON.parse(t.slice(i+MARK.length).trim())}catch(err){why="El bloque de datos del final está dañado o fue editado."}}
    if(data&&(!Array.isArray(data.cats)||!Array.isArray(data.tasks)||!data.week)){why="Al respaldo le faltan partes (categorías, tareas o bloques).";data=null}
    if(!data){bkShow(`✗ <b>${esc(f.name)}</b> no es válido. ${why}`,"bad");return}
    const fecha=(t.split("\n")[1]||"").trim(),pend=data.tasks.filter(x=>!x.done).length,hech=data.tasks.length-pend,rp=(data.resp||[]).filter(x=>!x.done&&!x.sep).length;
    bkShow(`<div>✓ <b>${esc(f.name)}</b> es un respaldo válido${fecha?" del "+esc(fecha.replace(/\.$/,"")):""}.</div>
      <div class="note">${pend} tareas pendientes · ${hech} hechas · ${rp} respuestas pendientes · ${(data.routines||[]).length} rutinas · Gantt: ${(data.gantt&&data.gantt.rows||[]).length} timelines, ${(data.gantt&&data.gantt.items||[]).length} barras y ${(data.gantt&&data.gantt.miles||[]).length} hitos · ${data.cats.length} categorías · bloques de 7 días</div>
      <div class="note" style="color:var(--hot)">Al restaurar se reemplaza todo lo que tienes ahora en esta página.</div>
      <div class="ctrl"><button class="primary" id="bkYes">Restaurar ahora</button><button id="bkNo">Cancelar</button></div>`,"ok");
    $("bkYes").onclick=()=>{const vista=data._vista;delete data._vista;
      if(vista&&typeof vista==="object"){try{localStorage.setItem(CVKEY,JSON.stringify(vista))}catch(e){}}
      S={...data,resp:data.resp||[],from:null,day:dk()};if(!Array.isArray(S.tags))S.tags=TAGS0();ensureSeq(S);migSep(S);ensureRt(S);fixLvl(S);save();render();showBk();window.fillGN&&fillGN();typeof cvApplyView==="function"&&cvApplyView();
      const gt=S.gantt?(S.gantt.rows||[]).length:0,gb=S.gantt?(S.gantt.items||[]).length:0,gh=S.gantt?(S.gantt.miles||[]).length:0;
      bkShow(`✓ Listo: se restauraron ${pend} tareas pendientes, ${hech} hechas, ${rp} respuestas y el Gantt (${gt} timelines, ${gb} barras, ${gh} hitos) desde <b>${esc(f.name)}</b>.`,"ok");
      document.querySelector('[aria-label="Tareas"]').scrollIntoView({behavior:"smooth",block:"start"})};
    $("bkNo").onclick=()=>{$("bkCard").hidden=true}};
  r.readAsText(f);
}
$("bkFile").onchange=e=>{const f=e.target.files[0];e.target.value="";bkCheck(f)};
const drop=$("bkDrop");
drop.addEventListener("dragover",e=>{if([...e.dataTransfer.types].includes("Files")){e.preventDefault();drop.classList.add("on")}});
drop.addEventListener("dragleave",()=>drop.classList.remove("on"));
drop.addEventListener("drop",e=>{e.preventDefault();drop.classList.remove("on");bkCheck(e.dataTransfer.files[0])});
function showBk(){const t=S.lastBk?"Último respaldo: "+S.lastBk:"Aún no has descargado un respaldo";$("lastBk").textContent=t;$("footBk").innerHTML=`${esc(t)} · <button type="button" class="ghost sm" id="footBkBtn">Descargar ahora</button>`;$("footBkBtn").onclick=()=>$("bkSave").click()}
showBk();
S.ui=S.ui||{};
[["sumD","sum"]].forEach(([id,k])=>{const d=$(id);d.open=!!S.ui[k];d.addEventListener("toggle",()=>{S.ui[k]=d.open;save()})});
document.querySelectorAll(".more .menu button").forEach(b=>b.addEventListener("click",()=>$("more").open=false));
document.addEventListener("mousedown",e=>{const m=$("more");if(m.open&&!m.contains(e.target))m.open=false});
setInterval(()=>{if(S.day!==dk()){S.from=null;S.day=dk();save()}if(S.from==null&&!document.activeElement.closest("#list,#week,form")){rTick=true;try{render()}finally{setTimeout(()=>rTick=false,0)}}},60000);
render();
H.last=snap();
/* sincroniza entre pestañas y ventanas del mismo navegador: si otra ventana guarda, esta se actualiza sola
   (así una ventana vieja abierta nunca pisa los cambios nuevos) */
/* aplica un estado que llegó de afuera (otra pestaña o la nube) sin perder lo que es de esta pantalla */
function applyState(n,msg){
  if(!n||!Array.isArray(n.cats))return;
  const a=document.activeElement;if(a&&a!==document.body&&a.blur)a.blur();
  const keep={ui:S.ui,from:S.from,day:S.day};
  S=n;S.ui=S.ui||keep.ui;if(S.from===undefined)S.from=keep.from;if(!S.day)S.day=keep.day;
  if(!Array.isArray(S.tags))S.tags=TAGS0();ensureSeq(S);fixLvl(S);ensureRt(S);ensureG(S);
  window.Cloud&&Cloud.adopt(S);
  H.last=snap();H.u.length=0;H.r.length=0;
  try{GE.hidden=true;gEditing=null;gNewCat=null}catch(_){}
  render();window.fillGN&&fillGN();showBk();
  if(msg)flash(msg)}
window.applyState=applyState;
window.getState=()=>S;
/* sincroniza entre pestañas y ventanas del mismo navegador */
addEventListener("storage",e=>{
  if(e.key===CVKEY){try{cvApplyView();render()}catch(_){}return}
  if(e.key!==KEY||!e.newValue)return;
  let n;try{n=JSON.parse(e.newValue)}catch(_){return}
  applyState(n,"Actualizado con los cambios de otra ventana.")});
