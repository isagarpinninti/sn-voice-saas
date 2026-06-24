/**
 * ZeVox — Voice Widget with AudioWorklet streaming playback
 * <script>window.ZEVOX_TOKEN="sk_live_...";</script>
 * <script src="https://app.zevox.com/widget.js"></script>
 *
 * Modes (set window.ZEVOX_MODE before loading):
 *   "portal"  (default) — floating corner widget, classic rounded square card
 *   "form"              — centered rectangle card, no corner positioning
 */
(function(){
  // ── Safeguard: Do not load on the SaaS dashboard or landing pages, or if the dashboard is embedded in an iframe ──
  try {
    var loc = window.location;
    var isVoicePage = loc.pathname.indexOf('/voice') === 0;
    var isSaaS = loc.hostname === 'zevox.onrender.com' || loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
    if (isSaaS && !isVoicePage) {
      return;
    }
    // If we are in a parent window (like ServiceNow) that embeds the SaaS dashboard in an iframe, hide the widget
    var frames = document.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      try {
        var src = frames[i].src || '';
        if (src.indexOf('/dashboard') !== -1 && (src.indexOf('zevox.onrender.com') !== -1 || src.indexOf('localhost') !== -1)) {
          console.log('[ZeVox] SaaS dashboard detected in iframe, hiding widget');
          return;
        }
      } catch (e) {}
    }
  } catch (e) {}

  var sc=document.currentScript||document.querySelector('script[data-token]')
  var TK=(window.ZeVoxConfig&&window.ZeVoxConfig.token)||window.ZEVOX_TOKEN||(sc&&sc.getAttribute('data-token'))||''
  var GW=(window.ZeVoxConfig&&window.ZeVoxConfig.gateway)||(sc&&sc.src?new URL(sc.src).origin:'')||'https://zevox.onrender.com'
  if(!TK){console.error('[ZeVox] No token');return}
  if(window.__zv)return;window.__zv=true

  // Widget display mode — "portal" (corner floating) or "form" (centered rectangle)
  var MODE=((window.ZEVOX_MODE)||(window.ZeVoxConfig&&window.ZeVoxConfig.mode)||'portal').toLowerCase()
  var FM=MODE==='form'

  // ── Detect form context when widget is embedded in a SN form ──
  // Works in both portal and form mode — g_form availability is the real guard.
  function getFormContext(){
    try{
      var ctx={tableName:'',sysId:'',fields:{}}
      // Classic SN form API — reads whatever fields the form view currently shows,
      // so it works generically for incidents, work orders, change requests, custom apps, etc.
      if(window.g_form){
        try{ctx.tableName=g_form.getTableName?g_form.getTableName():''}catch{}
        try{ctx.sysId=g_form.getUniqueValue?g_form.getUniqueValue():''}catch{}
        // getFieldNames() returns every field currently on this form view — fully dynamic
        var flds=[]
        try{if(g_form.getFieldNames)flds=g_form.getFieldNames()||[]}catch{}
        // Fallback: common baseline fields if getFieldNames is unavailable
        if(!flds.length)flds=['number','short_description','description','state','priority',
          'urgency','category','subcategory','assignment_group','assigned_to','caller_id',
          'opened_by','opened_at','cmdb_ci','location','impact']
        for(var i=0;i<flds.length;i++){
          try{
            var fn=flds[i]
            var dv=g_form.getDisplayValue?g_form.getDisplayValue(fn):null
            var v=g_form.getValue?g_form.getValue(fn):null
            var label=dv!==null&&dv!==''?dv:v
            if(label!==null&&label!==undefined&&label!=='')
              ctx.fields[fn]=String(label).substring(0,300)
          }catch{}
        }
      }
      // Workspace / Next Experience fallback
      if(!ctx.tableName&&window.NOW&&window.NOW.form){
        try{ctx.tableName=NOW.form.tableName||''}catch{}
        try{ctx.sysId=NOW.form.sysId||''}catch{}
      }
      return(ctx.sysId||ctx.tableName)?ctx:null
    }catch{return null}
  }

  // ── Detect the end-user's ServiceNow sys_id ──
  function getSnUserId(){
    try{
      if(typeof window.ZEVOX_USER_ID==='string'&&window.ZEVOX_USER_ID)return window.ZEVOX_USER_ID
      if(window.ZeVoxConfig&&window.ZeVoxConfig.userId)return window.ZeVoxConfig.userId
      if(window.g_user&&window.g_user.userID)return window.g_user.userID
      if(window.NOW&&window.NOW.user&&window.NOW.user.userID)return window.NOW.user.userID
      if(window.NOW&&window.NOW.user_id)return window.NOW.user_id
    }catch{}
    return ''
  }
  var SN_USER_ID=getSnUserId()
  if(SN_USER_ID)console.log('[ZeVox] End-user sys_id detected:',SN_USER_ID)

  var C={color:'#10b981',pos:'right',name:'',brand:true,logo:'',radius:'full'}
  var ws,micCtx,micStr,micP,active=false,muted=false

  // ── Navigation tab queue ──
  var pendingNavUrls=[]

  function detectOriginPortal(){
    try{
      var p=(window.location.pathname||'').toLowerCase()
      var m=p.match(/^\/(sp|esc)(\/|$|\?)/)
      if(m)return m[1]
      if(window.ZEVOX_PORTAL)return String(window.ZEVOX_PORTAL).toLowerCase()
      if(window.ZeVoxConfig&&window.ZeVoxConfig.portal)return String(window.ZeVoxConfig.portal).toLowerCase()
    }catch{}
    return ''
  }

  function resolveUrl(u){
    if(!u)return ''
    if(/^https?:\/\//i.test(u))return u
    var base=window.location.origin.replace(/\/$/,'')
    return base+(u.charAt(0)==='/'?u:'/'+u)
  }

  function openNavUrls(urls){
    if(!urls||!urls.length)return
    var blocked=[]
    urls.forEach(function(u){
      var w=null
      try{w=window.open(resolveUrl(u.url),'_blank','noopener')}catch{}
      if(!w)blocked.push(u)
    })
    if(blocked.length){
      pendingNavUrls=pendingNavUrls.concat(blocked)
      setSt('Tap to open ' + blocked.length + ' page'+(blocked.length>1?'s':''),'')
    }
  }

  function flushPendingNav(){
    if(!pendingNavUrls.length)return
    var queue=pendingNavUrls;pendingNavUrls=[]
    queue.forEach(function(u){try{window.open(resolveUrl(u.url),'_blank','noopener')}catch{}})
  }

  // ── AudioWorklet for smooth streaming playback ──
  var playCtx,workletNode,workletReady=false

  var WORKLET_CODE = `
    class ZeVoxPlayer extends AudioWorkletProcessor {
      constructor() {
        super();
        this.queue = [];
        this.currentChunk = null;
        this.currentPos = 0;
        this.port.onmessage = (e) => {
          if (e.data.type === 'audio') {
            this.queue.push(e.data.samples);
          } else if (e.data.type === 'clear') {
            this.queue = [];
            this.currentChunk = null;
            this.currentPos = 0;
          }
        };
      }
      process(inputs, outputs) {
        const out = outputs[0][0];
        for (let i = 0; i < out.length; i++) {
          if (!this.currentChunk || this.currentPos >= this.currentChunk.length) {
            if (this.queue.length > 0) {
              this.currentChunk = this.queue.shift();
              this.currentPos = 0;
            } else {
              out[i] = 0;
              continue;
            }
          }
          out[i] = this.currentChunk[this.currentPos++];
        }
        return true;
      }
    }
    registerProcessor('zevox-player', ZeVoxPlayer);
  `

  async function initAudioWorklet() {
    if (workletReady) return
    try {
      playCtx = new AudioContext({ sampleRate: 24000 })
      var blob = new Blob([WORKLET_CODE], { type: 'application/javascript' })
      var url = URL.createObjectURL(blob)
      await playCtx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      workletNode = new AudioWorkletNode(playCtx, 'zevox-player')
      workletNode.connect(playCtx.destination)
      workletReady = true
    } catch (e) {
      console.error('[ZeVox] AudioWorklet failed:', e)
      workletReady = false
    }
  }

  function feedAudio(pcmBuffer) {
    if (!workletReady || !workletNode) return
    if (playCtx.state === 'suspended') playCtx.resume()
    var i16 = new Int16Array(pcmBuffer)
    var f32 = new Float32Array(i16.length)
    for (var i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768
    workletNode.port.postMessage({ type: 'audio', samples: f32 })
  }

  function clearAudio() {
    if (workletNode) workletNode.port.postMessage({ type: 'clear' })
  }

  // ── Load config ──
  fetch(GW+'/api/widget/config?token='+TK+'&_t='+Date.now()).then(function(r){return r.json()}).then(function(c){
    if(c.color)C.color=c.color;if(c.position)C.pos=c.position
    if(c.agentName)C.name=c.agentName;if(c.showBranding===false)C.brand=false
    if(c.logoUrl)C.logo=c.logoUrl;if(c.borderRadius)C.radius=c.borderRadius
  }).catch(function(){}).finally(build)

  // ── Build UI ──
  function build(){
    var el=document.createElement('div');el.id='zv'
    document.body.appendChild(el)
    el.addEventListener('click',flushPendingNav,true)
    if(FM){
      buildForm(el)
    } else {
      buildPortal(el)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PORTAL MODE — existing floating corner widget
  // ─────────────────────────────────────────────────────────────────────────
  function buildPortal(el){
    var col=C.color
    el.innerHTML=`
<style>
#zv{position:fixed;bottom:20px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter','Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
#zv *{box-sizing:border-box}
#zv-launcher{display:flex;align-items:center;gap:8px;background:#fff;border-radius:${C.radius==='lg'?'18px':'999px'};padding:6px 6px 6px 8px;box-shadow:0 1px 2px 0 rgba(16,24,40,.06),0 6px 20px -4px rgba(16,185,129,.18),0 0 0 1px rgba(16,24,40,.05);transition:transform .2s,box-shadow .2s}
#zv-launcher:hover{transform:translateY(-1px);box-shadow:0 2px 4px 0 rgba(16,24,40,.08),0 10px 32px -6px rgba(16,185,129,.28),0 0 0 1px rgba(16,24,40,.06)}
#zv-orb{width:36px;height:36px;border-radius:50%;cursor:pointer;border:none;outline:none;padding:0;position:relative;flex-shrink:0;background:radial-gradient(circle at 35% 30%,${col},${col} 40%,#0d1117 100%);box-shadow:0 0 0 2px ${col}26,0 4px 14px ${col}66,inset 0 -3px 6px rgba(0,0,0,.3);animation:zvBreathe 2.4s ease-in-out infinite}
#zv-orb::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.45),rgba(255,255,255,0) 50%);pointer-events:none}
#zv-orb img{width:36px;height:36px;object-fit:cover;border-radius:50%;position:relative;z-index:1}
@keyframes zvBreathe{0%,100%{box-shadow:0 0 0 2px ${col}26,0 4px 14px ${col}66,inset 0 -3px 6px rgba(0,0,0,.3)}50%{box-shadow:0 0 0 4px ${col}33,0 6px 22px ${col}88,inset 0 -3px 6px rgba(0,0,0,.3)}}
#zv-start{display:flex;align-items:center;gap:8px;height:38px;padding:0 18px 0 14px;border-radius:999px;border:none;outline:none;background:#0d1117;color:#fff;font-size:13.5px;font-weight:500;font-family:inherit;cursor:pointer;white-space:nowrap;transition:background .15s,transform .15s;letter-spacing:-.005em}
#zv-start:hover{background:#1c2128}
#zv-start:active{transform:scale(.97)}
#zv-start svg{width:14px;height:14px;color:${col}}
#zv-card{display:none;width:340px;background:radial-gradient(ellipse 80% 60% at 15% 0%,rgba(16,185,129,.10) 0%,transparent 55%),radial-gradient(ellipse 60% 50% at 90% 20%,rgba(99,102,241,.08) 0%,transparent 55%),#fff;border-radius:20px;box-shadow:0 0 0 1px rgba(16,185,129,.10),0 12px 48px -8px rgba(16,24,40,.14),0 4px 16px -4px rgba(16,24,40,.08);padding:22px;flex-direction:column;align-items:center;gap:4px;position:relative;overflow:hidden}
#zv-card.on{display:flex;animation:zvCardEntry .45s cubic-bezier(.22,1,.36,1)}
@keyframes zvCardEntry{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
#zv-card::before{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(to right,rgba(16,24,40,.025) 1px,transparent 1px),linear-gradient(to bottom,rgba(16,24,40,.025) 1px,transparent 1px);background-size:24px 24px;mask-image:radial-gradient(ellipse 80% 60% at 50% 10%,#000 0%,transparent 70%);-webkit-mask-image:radial-gradient(ellipse 80% 60% at 50% 10%,#000 0%,transparent 70%)}
#zv-agent{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;background:linear-gradient(110deg,#34d399 0%,#10b981 45%,#6366f1 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:10px;position:relative;z-index:1}
#zv-agent.hide{display:none}
#zv-orb-lg{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:10px;position:relative;z-index:1;background:radial-gradient(circle at 35% 30%,${col},${col} 40%,#0d1117 100%);box-shadow:0 0 0 2px ${col}26,0 6px 24px ${col}80,0 10px 40px -4px rgba(99,102,241,.26),inset 0 -4px 8px rgba(0,0,0,.3);animation:zvBreathe 2.4s ease-in-out infinite}
#zv-orb-lg::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.4),rgba(255,255,255,0) 55%);pointer-events:none;z-index:2}
#zv-orb-lg img{width:60px;height:60px;object-fit:cover;border-radius:50%;position:relative;z-index:1}
#zv-ring{position:absolute;inset:-6px;border-radius:50%;border:2px solid ${col}55;opacity:0;transition:opacity .3s;z-index:0}
#zv-ring.on{opacity:1;animation:zvR 2s ease-in-out infinite}
@keyframes zvR{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.08);opacity:.95}}
#zv-wave{display:flex;gap:3px;align-items:center;height:18px;margin-bottom:8px;opacity:.55;position:relative;z-index:1}
#zv-wave span{display:block;width:3px;border-radius:2px;background:${col};transform-origin:center;transform:scaleY(.4)}
#zv-wave.on span{animation:zvWave 1.3s ease-in-out infinite}
#zv-wave span:nth-child(1){height:30%;animation-delay:-.2s}
#zv-wave span:nth-child(2){height:60%;animation-delay:-.5s}
#zv-wave span:nth-child(3){height:90%;animation-delay:-.8s}
#zv-wave span:nth-child(4){height:100%;animation-delay:0s}
#zv-wave span:nth-child(5){height:90%;animation-delay:-.3s}
#zv-wave span:nth-child(6){height:60%;animation-delay:-.6s}
#zv-wave span:nth-child(7){height:30%;animation-delay:-.9s}
@keyframes zvWave{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}
#zv-status{font-size:15px;font-weight:600;color:#0d1117;letter-spacing:-.01em;position:relative;z-index:1}
#zv-sub{font-size:12px;color:#6b7280;margin-top:2px;position:relative;z-index:1}
#zv-ctrls{display:flex;align-items:center;gap:8px;margin-top:14px;position:relative;z-index:1}
#zv-end{display:flex;align-items:center;gap:6px;padding:8px 24px;border-radius:24px;border:1px solid #e5e7eb;background:#fff;color:#0d1117;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s}
#zv-end:hover{background:#f9fafb;border-color:#d1d5db}
#zv-end svg{width:14px;height:14px}
#zv-mute{width:36px;height:36px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s}
#zv-mute:hover{background:#f9fafb;border-color:#d1d5db}
#zv-mute.on{background:#ef4444;border-color:#ef4444}
#zv-mute svg{width:16px;height:16px;color:#6b7280}
#zv-mute.on svg{color:#fff}
#zv-br{font-size:11px;color:#9ca3af;margin-top:14px;position:relative;z-index:1}
#zv-br a{color:#6b7280;text-decoration:none;font-weight:500}
#zv-br a:hover{color:${col}}
#zv-attach{display:none;width:100%;margin-top:14px;padding:12px;border-radius:12px;background:${col}14;border:1px solid ${col}33;text-align:left;position:relative;z-index:1;animation:zvFadeUp .35s cubic-bezier(.22,1,.36,1)}
#zv-attach.on{display:block}
#zv-attach-title{font-size:12px;font-weight:600;color:#0d1117;margin-bottom:2px}
#zv-attach-reason{font-size:11px;color:#6b7280;margin-bottom:10px;line-height:1.4}
#zv-attach-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:8px 12px;border-radius:8px;background:#0d1117;color:#fff;font-size:12px;font-weight:500;cursor:pointer;border:none;text-decoration:none;font-family:inherit;transition:background .15s}
#zv-attach-btn:hover{background:#1c2128}
#zv-attach-btn svg{width:12px;height:12px}
@keyframes zvFadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
</style>
<div id="zv-launcher">
  <button id="zv-orb" aria-label="Voice agent"></button>
  <button id="zv-start"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Start a call</button>
</div>
<div id="zv-card">
  <div id="zv-agent" class="hide"></div>
  <div id="zv-orb-lg"><div id="zv-ring"></div></div>
  <div id="zv-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
  <div id="zv-status">Connecting...</div>
  <div id="zv-sub"></div>
  <div id="zv-ctrls">
    <button id="zv-end"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.68 13.31a16 16 0 003.41 2.6l1.1-1.1a1 1 0 011.11-.27c1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.1.31.03.66-.25 1.02l-1.1 1.1"/></svg> End</button>
    <button id="zv-mute"><svg id="zv-mon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg><svg id="zv-mof" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .34-.03.67-.08 1"/></svg></button>
  </div>
  <div id="zv-attach"></div>
  <div id="zv-br"></div>
</div>`

    var orb=g('zv-orb'),root=g('zv'),card=g('zv-card'),orbLg=g('zv-orb-lg')
    root.style[C.pos==='left'?'left':'right']='20px'
    if(C.pos==='left'){card.style.position='absolute';card.style.bottom='0';card.style.left='0'}

    if(C.logo){
      orb.innerHTML='<img src="'+C.logo+'"/>'
      orb.style.background='#fff';orb.style.animation='none';orb.style.boxShadow='0 2px 10px rgba(0,0,0,.1)'
      orbLg.innerHTML='<div id="zv-ring"></div><img src="'+C.logo+'"/>'
      orbLg.style.background='#f5f5f5';orbLg.style.animation='none';orbLg.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'
    }

    g('zv-br').innerHTML=C.brand?'Powered by <a href="https://zevox.onrender.com" target="_blank">ZeVox</a>':''

    if(C.name){
      var agentEl=g('zv-agent')
      if(agentEl){agentEl.textContent=C.name;agentEl.className=''}
    }

    orb.onclick=startCall
    g('zv-start').onclick=startCall
    g('zv-end').onclick=endCall
    g('zv-mute').onclick=toggleMute
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FORM MODE — centered rectangle card, no corner positioning
  // ─────────────────────────────────────────────────────────────────────────
  function buildForm(el){
    var col=C.color
    el.innerHTML=`
<style>
#zv.zv-form{position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter','Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
#zv.zv-form *{box-sizing:border-box}

/* ── Launcher bar — horizontal, centered ── */
#zvf-bar{display:flex;align-items:center;gap:14px;background:#fff;border-radius:16px;padding:14px 20px;width:500px;box-shadow:0 0 0 1px rgba(16,24,40,.07),0 4px 16px -4px rgba(16,24,40,.12),0 8px 32px -8px rgba(16,24,40,.08);cursor:default;transition:box-shadow .2s,transform .2s}
#zvf-bar:hover{box-shadow:0 0 0 1px rgba(16,24,40,.10),0 6px 24px -4px rgba(16,24,40,.16),0 12px 40px -8px rgba(16,24,40,.12);transform:translateY(-1px)}
#zvf-orb{width:42px;height:42px;flex-shrink:0;border-radius:50%;background:radial-gradient(circle at 35% 30%,${col},${col} 40%,#0d1117 100%);box-shadow:0 0 0 2px ${col}26,0 4px 12px ${col}60,inset 0 -3px 6px rgba(0,0,0,.25);animation:zvBreathe 2.4s ease-in-out infinite;position:relative}
#zvf-orb::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.4),rgba(255,255,255,0) 50%);pointer-events:none}
#zvf-orb img{width:42px;height:42px;object-fit:cover;border-radius:50%;position:relative;z-index:1}
#zvf-txt{flex:1}
#zvf-label{font-size:13.5px;font-weight:600;color:#0d1117;letter-spacing:-.01em}
#zvf-hint{font-size:11.5px;color:#9ca3af;margin-top:2px}
#zvf-cta{display:flex;align-items:center;gap:7px;padding:10px 22px;border-radius:10px;border:none;background:#0d1117;color:#fff;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;font-family:inherit;transition:background .15s,transform .1s;letter-spacing:-.01em;flex-shrink:0}
#zvf-cta:hover{background:#1c2128}
#zvf-cta:active{transform:scale(.97)}
#zvf-cta svg{width:13px;height:13px;color:${col}}

/* ── Active call card — wide rectangle, centered ── */
#zvf-card{display:none;width:500px;background:#fff;border-radius:16px;box-shadow:0 0 0 1px rgba(16,24,40,.08),0 4px 16px -4px rgba(16,24,40,.14),0 12px 48px -8px rgba(16,24,40,.12);padding:22px 24px;align-items:center;gap:20px}
#zvf-card.on{display:flex;animation:zvCardEntry .4s cubic-bezier(.22,1,.36,1)}
@keyframes zvCardEntry{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes zvBreathe{0%,100%{box-shadow:0 0 0 2px ${col}26,0 4px 14px ${col}66,inset 0 -3px 6px rgba(0,0,0,.25)}50%{box-shadow:0 0 0 4px ${col}33,0 6px 22px ${col}88,inset 0 -3px 6px rgba(0,0,0,.25)}}
@keyframes zvR{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.08);opacity:.95}}
@keyframes zvWave{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}
@keyframes zvFadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

/* Orb in active card */
#zvf-orb2{width:52px;height:52px;border-radius:50%;flex-shrink:0;position:relative;background:radial-gradient(circle at 35% 30%,${col},${col} 40%,#0d1117 100%);box-shadow:0 0 0 2px ${col}26,0 4px 18px ${col}70,inset 0 -3px 8px rgba(0,0,0,.28);animation:zvBreathe 2.4s ease-in-out infinite}
#zvf-orb2::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.4),rgba(255,255,255,0) 55%);pointer-events:none}
#zvf-orb2 img{width:52px;height:52px;object-fit:cover;border-radius:50%;position:relative;z-index:1}
#zvf-ring{position:absolute;inset:-6px;border-radius:50%;border:2px solid ${col}55;opacity:0;transition:opacity .3s}
#zvf-ring.on{opacity:1;animation:zvR 2s ease-in-out infinite}

/* Center section: status + waveform */
#zvf-main{flex:1;min-width:0}
#zvf-name{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;background:linear-gradient(110deg,#34d399 0%,#10b981 45%,#6366f1 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:6px}
#zvf-name.hide{display:none}
#zvf-status{font-size:16px;font-weight:600;color:#0d1117;letter-spacing:-.015em}
#zvf-sub{font-size:12px;color:#6b7280;margin-top:2px}
#zvf-wave{display:flex;gap:3px;align-items:center;height:16px;margin-top:8px;opacity:.55}
#zvf-wave span{display:block;width:3px;border-radius:2px;background:${col};transform-origin:center;transform:scaleY(.4)}
#zvf-wave.on span{animation:zvWave 1.3s ease-in-out infinite}
#zvf-wave span:nth-child(1){height:30%;animation-delay:-.2s}
#zvf-wave span:nth-child(2){height:60%;animation-delay:-.5s}
#zvf-wave span:nth-child(3){height:90%;animation-delay:-.8s}
#zvf-wave span:nth-child(4){height:100%;animation-delay:0s}
#zvf-wave span:nth-child(5){height:90%;animation-delay:-.3s}
#zvf-wave span:nth-child(6){height:60%;animation-delay:-.6s}

/* Right controls */
#zvf-ctrls{display:flex;align-items:center;gap:8px;flex-shrink:0}
#zvf-end{display:flex;align-items:center;gap:6px;padding:9px 22px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;color:#0d1117;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s;white-space:nowrap}
#zvf-end:hover{background:#f9fafb;border-color:#d1d5db}
#zvf-end svg{width:14px;height:14px}
#zvf-mute{width:38px;height:38px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s}
#zvf-mute:hover{background:#f9fafb;border-color:#d1d5db}
#zvf-mute.on{background:#ef4444;border-color:#ef4444}
#zvf-mute svg{width:16px;height:16px;color:#6b7280}
#zvf-mute.on svg{color:#fff}

/* Attachment panel — spans full width below the horizontal row */
#zvf-attach-wrap{width:500px;margin-top:8px}
#zvf-attach{display:none;padding:12px;border-radius:12px;background:${col}14;border:1px solid ${col}33;text-align:left;animation:zvFadeUp .35s cubic-bezier(.22,1,.36,1)}
#zvf-attach.on{display:block}
#zvf-attach-title{font-size:12px;font-weight:600;color:#0d1117;margin-bottom:2px}
#zvf-attach-reason{font-size:11px;color:#6b7280;margin-bottom:10px;line-height:1.4}
#zvf-attach-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:8px 12px;border-radius:8px;background:#0d1117;color:#fff;font-size:12px;font-weight:500;cursor:pointer;border:none;text-decoration:none;font-family:inherit;transition:background .15s}
#zvf-attach-btn:hover{background:#1c2128}
#zvf-attach-btn svg{width:12px;height:12px}

/* Branding */
#zvf-br{font-size:10px;color:#9ca3af;margin-top:10px;width:500px;text-align:right}
#zvf-br a{color:#9ca3af;text-decoration:none;font-weight:500}
#zvf-br a:hover{color:${col}}
</style>

<div id="zvf-bar">
  <div id="zvf-orb"></div>
  <div id="zvf-txt">
    <div id="zvf-label">${C.name||'Voice Assistant'}</div>
    <div id="zvf-hint">Click to start a call</div>
  </div>
  <button id="zvf-cta"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Start a call</button>
</div>

<div id="zvf-card">
  <div id="zvf-orb2"><div id="zvf-ring"></div></div>
  <div id="zvf-main">
    <div id="zvf-name" class="hide"></div>
    <div id="zvf-status">Connecting...</div>
    <div id="zvf-sub"></div>
    <div id="zvf-wave"><span></span><span></span><span></span><span></span><span></span><span></span></div>
  </div>
  <div id="zvf-ctrls">
    <button id="zvf-mute"><svg id="zvf-mon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg><svg id="zvf-mof" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .34-.03.67-.08 1"/></svg></button>
    <button id="zvf-end"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.68 13.31a16 16 0 003.41 2.6l1.1-1.1a1 1 0 011.11-.27c1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.1.31.03.66-.25 1.02l-1.1 1.1"/></svg> End</button>
  </div>
</div>
<div id="zvf-attach-wrap"><div id="zvf-attach"></div></div>
${C.brand?'<div id="zvf-br">Powered by <a href="https://zevox.onrender.com" target="_blank">ZeVox</a></div>':''}`

    el.classList.add('zv-form')

    if(C.logo){
      var fo=g('zvf-orb'),fo2=g('zvf-orb2')
      fo.innerHTML='<img src="'+C.logo+'"/>'
      fo.style.background='#fff';fo.style.animation='none';fo.style.boxShadow='0 2px 10px rgba(0,0,0,.1)'
      fo2.innerHTML='<div id="zvf-ring"></div><img src="'+C.logo+'"/>'
      fo2.style.background='#f5f5f5';fo2.style.animation='none';fo2.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'
    }

    if(C.name){
      var nl=g('zvf-label');if(nl)nl.textContent=C.name
      var nn=g('zvf-name');if(nn){nn.textContent=C.name;nn.className=''}
    }

    g('zvf-bar').onclick=startCall
    g('zvf-cta').onclick=function(e){e.stopPropagation();startCall()}
    g('zvf-end').onclick=endCall
    g('zvf-mute').onclick=toggleMute
  }

  function g(id){return document.getElementById(id)}

  // ── Shared UI helpers (mode-aware) ──
  function setSt(main,sub){
    var s=g(FM?'zvf-status':'zv-status')
    var su=g(FM?'zvf-sub':'zv-sub')
    if(s)s.textContent=main
    if(su)su.textContent=sub||''
  }
  function setRing(on){
    var r=g(FM?'zvf-ring':'zv-ring')
    if(r)r.className=on?'on':''
  }
  function setWave(on){
    var w=g(FM?'zvf-wave':'zv-wave')
    if(w)w.className=on?'on':''
  }

  // ── Attachment request UI ──
  function showAttachmentRequest(url,reason){
    var box=g(FM?'zvf-attach':'zv-attach');if(!box)return
    var safeReason=(reason||'a file').toString().replace(/[<>&"']/g,'')
    box.className='on'
    box.innerHTML=''
      +'<div id="'+(FM?'zvf':'zv')+'-attach-title">Share a file</div>'
      +'<div id="'+(FM?'zvf':'zv')+'-attach-reason">The agent has asked for '+safeReason+'. Tap below to open a secure upload page.</div>'
      +'<a id="'+(FM?'zvf':'zv')+'-attach-btn" href="'+url+'" target="_blank" rel="noopener">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
      +'Open upload page</a>'
  }
  function resetAttachmentUI(){
    var box=g(FM?'zvf-attach':'zv-attach');if(!box)return
    box.className='';box.innerHTML=''
  }

  function startMic(){return navigator.mediaDevices.getUserMedia({audio:{channelCount:1,sampleRate:16000,echoCancellation:true,noiseSuppression:true}}).then(function(s){micCtx=new(window.AudioContext||window.webkitAudioContext)({sampleRate:16000});micStr=s;var src=micCtx.createMediaStreamSource(s);micP=micCtx.createScriptProcessor(4096,1,1);micP.onaudioprocess=function(e){if(ws&&ws.readyState===1&&!muted){var f=e.inputBuffer.getChannelData(0),i=new Int16Array(f.length);for(var j=0;j<f.length;j++)i[j]=Math.max(-32768,Math.min(32767,Math.round(f[j]*32767)));ws.send(i.buffer)}};src.connect(micP);micP.connect(micCtx.destination)})}
  function stopMic(){if(micP){micP.disconnect();micP=null}if(micStr){micStr.getTracks().forEach(function(t){t.stop()});micStr=null}if(micCtx){micCtx.close();micCtx=null}}

  function toggleMute(){
    muted=!muted
    var mb=g(FM?'zvf-mute':'zv-mute')
    var mon=g(FM?'zvf-mon':'zv-mon')
    var mof=g(FM?'zvf-mof':'zv-mof')
    if(mb)mb.className=muted?'on':''
    if(mon)mon.style.display=muted?'none':'block'
    if(mof)mof.style.display=muted?'block':'none'
  }

  async function startCall(){
    if(active)return
    active=true;muted=false
    if(FM){
      var bar=g('zvf-bar');if(bar)bar.style.display='none'
      var card=g('zvf-card');if(card)card.classList.add('on')
    } else {
      g('zv-launcher').style.display='none'
      g('zv-card').classList.add('on')
    }
    setSt('Connecting...','')
    await initAudioWorklet()
    _connectWs()
  }

  // Separated so the 1006 retry path can call it directly without re-running startCall guards.
  var _wsRetried=false
  function _connectWs(){
    try{
      var wsUrl=GW.replace('http','ws')+'/voice?token='+TK
      if(SN_USER_ID)wsUrl+='&user='+encodeURIComponent(SN_USER_ID)
      ws=new WebSocket(wsUrl);ws.binaryType='arraybuffer'
      var _hbId=null
      ws.onopen=function(){
        console.log('[ZeVox] WS open')
        var startMsg={type:'start',originPortal:detectOriginPortal()}
        var fc=getFormContext();if(fc)startMsg.formContext=fc
        ws.send(JSON.stringify(startMsg))
        // Send heartbeats from the browser every 1 s until 'ready'.
        // Render's proxy has ~1.8 s idle timeout on BOTH directions; if the
        // browser is silent after 'start', that half of the tunnel can drop.
        _hbId=setInterval(function(){
          if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'heartbeat'}))
          else{clearInterval(_hbId);_hbId=null}
        },1000)
      }
      ws.onmessage=function(ev){
        if(ev.data instanceof ArrayBuffer){feedAudio(ev.data);return}
        try{var m=JSON.parse(ev.data)
          if(m.type==='ready'){
            clearInterval(_hbId);_hbId=null
            setSt('Listening...','Say something');setRing(true);setWave(true)
            _wsRetried=false
            startMic().catch(function(){setSt('Listening...','Mic unavailable')})
          }
          else if(m.type==='status'){
            if(m.state==='connecting')setSt('Initializing...','')
          }
          else if(m.type==='state'){
            if(m.state==='listening'){setSt('Listening...','Talk to interrupt');setRing(true);setWave(true)}
            else if(m.state==='speaking'){setSt('Speaking...','Talk to interrupt');setRing(true);setWave(true)}
            else if(m.state==='processing'){setSt('Thinking...','');setRing(false);setWave(false)}
          }
          else if(m.type==='barge_in')clearAudio()
          else if(m.type==='navigate')openNavUrls(m.urls)
          else if(m.type==='attachment_requested')showAttachmentRequest(m.url,m.reason)
          else if(m.type==='error'){setSt('Error',m.message);endCallGraceful()}
          else if(m.type==='ended')endCallGraceful()
        }catch{}
      }
      ws.onclose=function(ev){
        clearInterval(_hbId);_hbId=null
        console.log('[ZeVox] WS close code='+ev.code+' clean='+ev.wasClean+' reason="'+ev.reason+'"')
        // Code 1006 = abnormal closure (network drop / Render proxy blip) before
        // the pipeline was fully ready. Silently retry once — the server is fine.
        if(active && ev.code===1006 && !_wsRetried){
          _wsRetried=true
          stopMic()
          ws=null
          setSt('Connecting...','')
          setTimeout(_connectWs,1200)
          return
        }
        if(active){
          // Only set status if no error message was already shown via onmessage
          // (error messages set status and call endCallGraceful which sets active=false)
          if(ev.code===4001)setSt('Setup needed','Embed snippet not on page')
          else if(ev.code===4003)setSt('Invalid token','Re-sync agent in ServiceNow')
          else if(ev.code===4500)setSt('Server error','Check Render logs')
          else if(ev.code!==1000)setSt('Connection lost','')
          setTimeout(function(){if(active)endCall()},1500)
        }
      }
    }catch(err){setSt('Failed',err.message);setTimeout(endCall,2000)}
  }

  function endCall(){
    try{if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'stop'}));ws.close()}}catch{}
    ws=null;stopMic();clearAudio();active=false;muted=false;_wsRetried=false;setRing(false);setWave(false)
    pendingNavUrls=[]
    if(FM){
      var card=g('zvf-card');if(card)card.classList.remove('on')
      resetAttachmentUI()
      var bar=g('zvf-bar');if(bar)bar.style.display='flex'
    } else {
      g('zv-card').classList.remove('on');resetAttachmentUI()
      g('zv-launcher').style.display='flex'
    }
  }

  function endCallGraceful(){
    if(!active)return
    active=false
    stopMic()
    setRing(false)
    setWave(false)
    setSt('Call ending...','')
    setTimeout(function(){
      try{if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'stop'}));ws.close()}}catch{}
      ws=null
      clearAudio()
      muted=false
      if(FM){
        var card=g('zvf-card');if(card)card.classList.remove('on')
        resetAttachmentUI()
        var bar=g('zvf-bar');if(bar)bar.style.display='flex'
      } else {
        g('zv-card').classList.remove('on');resetAttachmentUI()
        g('zv-launcher').style.display='flex'
      }
    },6000)
  }
})()
