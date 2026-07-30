// ═══════════════════════════════════════════════════════════
// core.js - משותף לכל דפי הצוות (referrals.html, groups.html, וכו')
// טוענים עם <script src="shared/core.js"></script> לפני קוד הדף עצמו
// ═══════════════════════════════════════════════════════════
const YL = (function(){
  "use strict";

  const SUPABASE_URL = "https://hvnyhtbmrniuqicdtfsg.supabase.co";
  const SUPABASE_KEY = "sb_publishable_y9ZmwLpDGgrBN6M7XQLAcQ_j6_PUh-C";

  function $(id){return document.getElementById(id)}
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
  function fmtDate(iso){return iso ? new Date(iso).toLocaleDateString("he-IL",{day:"numeric",month:"numeric",year:"2-digit"}) : ""}
  function fmtTime(iso){return iso ? new Date(iso).toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"}) : ""}
  function fmtDT(iso){return iso ? fmtDate(iso)+" "+fmtTime(iso) : ""}

  // ═══ session ═══
  let session=null;
  try{session=JSON.parse(localStorage.getItem("yl-session")||"null")}catch(e){session=null}
  function saveSession(s){
    session=s;
    try{ if(s) localStorage.setItem("yl-session",JSON.stringify(s)); else localStorage.removeItem("yl-session"); }catch(e){}
  }
  function isLoggedIn(){return !!(session&&session.access_token)}
  function whoami(){return session&&session.email}

  async function refreshSession(){
    if(!session||!session.refresh_token) return false;
    try{
      const res=await fetch(SUPABASE_URL+"/auth/v1/token?grant_type=refresh_token",{
        method:"POST",
        headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},
        body:JSON.stringify({refresh_token:session.refresh_token})
      });
      if(!res.ok){saveSession(null);return false}
      const d=await res.json();
      saveSession({access_token:d.access_token,refresh_token:d.refresh_token,email:(d.user&&d.user.email)||session.email});
      return true;
    }catch(e){return false}
  }

  async function login(email,pass){
    const res=await fetch(SUPABASE_URL+"/auth/v1/token?grant_type=password",{
      method:"POST",
      headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({email:email,password:pass})
    });
    if(!res.ok) throw new Error("login failed");
    const d=await res.json();
    saveSession({access_token:d.access_token,refresh_token:d.refresh_token,email:d.user&&d.user.email});
  }
  function logout(){saveSession(null)}

  // לשימוש כשמגיעים מקישור הזמנה/איפוס - יש כבר access_token+refresh_token מה-URL,
  // בלי מייל+סיסמה. שולפים את המייל בעצמנו מהטוקן.
  async function setSessionFromTokens(access_token, refresh_token){
    saveSession({access_token, refresh_token, email:null});
    try{
      const res=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{apikey:SUPABASE_KEY,"Authorization":"Bearer "+access_token}});
      if(res.ok){ const u=await res.json(); saveSession({access_token, refresh_token, email:u.email}); }
    }catch(e){}
  }

  async function setPassword(newPassword){
    const res=await fetch(SUPABASE_URL+"/auth/v1/user",{
      method:"PUT",
      headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},
      body:JSON.stringify({password:newPassword})
    });
    if(!res.ok){ const t=await res.text(); throw new Error(t.slice(0,200)); }
    return res.json();
  }

  // ═══ קריאות ל-PostgREST (טבלאות סופאבייס) ═══
  async function api(path,opts,_retried){
    opts=opts||{};
    const headers=Object.assign({
      "apikey":SUPABASE_KEY,
      "Content-Type":"application/json",
      "Authorization":"Bearer "+(isLoggedIn()?session.access_token:SUPABASE_KEY)
    },opts.headers||{});
    const res=await fetch(SUPABASE_URL+"/rest/v1"+path,{method:opts.method||"GET",headers:headers,body:opts.body});
    if(res.status===401 && isLoggedIn() && !_retried){
      const ok=await refreshSession();
      if(ok) return api(path,opts,true);
    }
    if(!res.ok){ const t=await res.text(); throw new Error(t.slice(0,300)); }
    const text = await res.text();
    if(!text) return null;
    try{ return JSON.parse(text); }
    catch(e){ return null; }
  }

  async function getUser(){
    if(!isLoggedIn()) return null;
    const res=await fetch(SUPABASE_URL+"/auth/v1/user",{
      headers:{apikey:SUPABASE_KEY,"Authorization":"Bearer "+session.access_token}
    });
    if(!res.ok) return null;
    return res.json();
  }

  // ═══ בורר אנשים משותף - חיפוש/יצירת Person, לשימוש בכל מודול ═══
  function personPicker(container, onSelect, placeholder, allowCreate){
    if(allowCreate===undefined) allowCreate=true;
    container.innerHTML =
      '<input placeholder="'+esc(placeholder||"חיפוש לפי שם או טלפון…")+'" data-p-search>'+
      '<div class="picker-results hidden" data-p-results></div>'+
      (allowCreate ?
        '<div style="margin-top:6px"><button type="button" class="btn-ghost" data-p-newtoggle style="font-size:12px">+ איש/אשת קשר חדש/ה לא ברשימה</button></div>'+
        '<div class="hidden row2" data-p-newform style="margin-top:8px">'+
          '<input placeholder="שם פרטי" data-p-newfirst>'+
          '<input placeholder="טלפון (אופציונלי)" data-p-newphone dir="ltr">'+
        '</div>'+
        '<button type="button" class="btn-ghost hidden" data-p-newsave style="margin-top:6px;font-size:12px">שמירת איש קשר חדש/ה ובחירה</button>'
        : '');

    const input=container.querySelector('[data-p-search]');
    const results=container.querySelector('[data-p-results]');
    const newToggle=container.querySelector('[data-p-newtoggle]');
    const newForm=container.querySelector('[data-p-newform]');
    const newSave=container.querySelector('[data-p-newsave]');
    let debounce;

    input.oninput=function(){
      clearTimeout(debounce);
      const q=this.value.trim();
      if(q.length<2){ results.classList.add("hidden"); return; }
      debounce=setTimeout(async ()=>{
        try{
          const rows=await api("/persons?or=(first_name.ilike.*"+encodeURIComponent(q)+"*,last_name.ilike.*"+encodeURIComponent(q)+"*,phone.ilike.*"+encodeURIComponent(q)+"*)&select=id,first_name,last_name,phone&limit=8");
          if(!rows.length){ results.innerHTML='<div class="picker-item" style="color:var(--ink-soft)">אין תוצאות</div>'; }
          else{
            results.innerHTML=rows.map(p=>'<div class="picker-item" data-pid="'+p.id+'" data-pname="'+esc(p.first_name+' '+(p.last_name||''))+'">'+
              esc(p.first_name+' '+(p.last_name||''))+(p.phone?' · <span dir="ltr">'+esc(p.phone)+'</span>':'')+'</div>').join('');
          }
          results.classList.remove("hidden");
          results.querySelectorAll('[data-pid]').forEach(el=>{
            el.onclick=()=>{
              onSelect({id:el.dataset.pid, name:el.dataset.pname});
              results.classList.add("hidden"); input.value="";
            };
          });
        }catch(e){}
      },300);
    };
    if(newToggle){
      newToggle.onclick=()=>{ newForm.classList.toggle("hidden"); newSave.classList.toggle("hidden"); };
      newSave.onclick=async ()=>{
        const first=container.querySelector('[data-p-newfirst]').value.trim();
        const phone=container.querySelector('[data-p-newphone]').value.trim();
        if(!first){ alert("נא למלא שם"); return; }
        newSave.disabled=true;
        try{
          const created=await api("/persons",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({
            first_name:first, phone:phone||null, source:"manual"
          })});
          onSelect({id:created[0].id, name:first});
          newForm.classList.add("hidden"); newSave.classList.add("hidden");
          container.querySelector('[data-p-newfirst]').value="";
          container.querySelector('[data-p-newphone]').value="";
        }catch(e){ alert("היצירה נכשלה: "+e.message.slice(0,150)); }
        newSave.disabled=false;
      };
    }
  }

  async function myCalendarLink(){
    const user = await getUser();
    if(!user) return null;
    const rows = await api("/persons?community_auth_user_id=eq."+user.id+"&select=calendar_feed_token");
    if(!rows || !rows.length) return null;
    return SUPABASE_URL+"/functions/v1/calendar-feed?token="+rows[0].calendar_feed_token;
  }

  async function showMyCalendarLink(){
    try{
      const link = await myCalendarLink();
      if(!link){ alert("לא נמצא קישור אישי - יש לוודא שיש לך רשומת Person מקושרת (למשל דרך הזמנה קודמת)."); return; }
      try{
        await navigator.clipboard.writeText(link);
        alert("קישור היומן האישי שלך הועתק! מדביקים אותו ב-Google Calendar (יומנים אחרים → הוספה לפי URL):\n\n"+link);
      }catch(e){
        alert("קישור היומן האישי שלך (להעתקה ידנית):\n\n"+link);
      }
    }catch(e){ alert("שליפת הקישור נכשלה: "+e.message.slice(0,150)); }
  }

  // ═══ תפריט ניווט משותף בין כל דפי הצוות ═══
  function renderModuleNav(container, current, isAdminUser){
    const modules=[
      {href:"referrals.html", label:"פניות"},
      {href:"people.html", label:"כל האנשים", adminOnly:true},
      {href:"activities.html", label:"פעילויות"},
      {href:"content.html", label:"תוכן"},
      {href:"tasks.html", label:"משימות ולוח שנה"},
      {href:"community.html", label:"רשת קהילתית"}
    ];
    container.innerHTML = modules
      .filter(m=>!m.adminOnly || isAdminUser)
      .map(m=>'<a href="'+m.href+'"'+(current===m.href?' class="active"':'')+'>'+m.label+'</a>').join('')
      + '<button type="button" onclick="YL.showMyCalendarLink()" style="background:none;border:none;color:inherit;font:inherit;cursor:pointer;padding:10px 18px">📅 היומן שלי</button>';
    container.classList.remove("hidden");
  }

  async function callFunction(name, body){
    const res = await fetch(SUPABASE_URL+"/functions/v1/"+name,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":SUPABASE_KEY,
        "Authorization":"Bearer "+(isLoggedIn()?session.access_token:SUPABASE_KEY)
      },
      body:JSON.stringify(body||{})
    });
    const text=await res.text();
    let data=null; try{ data=JSON.parse(text); }catch(e){}
    if(!res.ok) throw new Error((data&&data.error)||text.slice(0,300));
    return data;
  }

  function accessToken(){ return isLoggedIn() ? session.access_token : SUPABASE_KEY; }

  async function accountActivationStatus(){
    const user = await getUser();
    if(!user) return {ok:true}; // לא מחובר/ת בכלל - לא רלוונטי כאן
    try{
      const rows = await api("/persons?community_auth_user_id=eq."+user.id+"&select=account_activated");
      if(!rows.length) return {ok:true}; // אין רשומת Person מקושרת - חשבון ישן/ידני, לא חוסמים
      return {ok: rows[0].account_activated===true};
    }catch(e){ return {ok:true}; } // כשל בבדיקה - לא חוסמים בטעות, רק מתעדים
  }

  return {
    $, esc, fmtDate, fmtTime, fmtDT,
    isLoggedIn, whoami, login, logout, refreshSession, getUser,
    setSessionFromTokens, setPassword, accessToken, myCalendarLink, showMyCalendarLink,
    accountActivationStatus,
    api, personPicker, renderModuleNav, callFunction, SUPABASE_URL, SUPABASE_KEY
  };
})();
