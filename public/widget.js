/**
 * ZeVox — Voice + Chat Widget
 * Embed:
 *   <script>window.ZEVOX_TOKEN="sk_live_...";</script>
 *   <script>window.ZEVOX_AGENT="<saas_agent_id>";</script>  <!-- optional: per-agent config -->
 *   <script src="https://zevox.onrender.com/widget.js"></script>
 *
 * widgetMode (set per-agent in ZeVox dashboard or SN):
 *   "voice_only" — voice call only (default)
 *   "chat_only"  — text chat only
 *   "both"       — launcher shows voice + chat; card has tabs
 */
(function(){
  var sc=document.currentScript||document.querySelector('script[data-token]')
  var TK=(window.ZeVoxConfig&&window.ZeVoxConfig.token)||window.ZEVOX_TOKEN||(sc&&sc.getAttribute('data-token'))||''
  var AGENT=(window.ZeVoxConfig&&window.ZeVoxConfig.agent)||window.ZEVOX_AGENT||(sc&&sc.getAttribute('data-agent'))||''
  var GW=(window.ZeVoxConfig&&window.ZeVoxConfig.gateway)||(sc&&sc.src?new URL(sc.src).origin:'')||'https://zevox.onrender.com'
  if(!TK){console.error('[ZeVox] No token');return}
  if(window.__zv)return;window.__zv=true

  // ── Detect SN end-user ──────────────────────────────────────────────────
  function getSnUserId(){
    try{
      if(typeof window.ZEVOX_USER_ID==='string'&&window.ZEVOX_USER_ID)return window.ZEVOX_USER_ID
      if(window.ZeVoxConfig&&window.ZeVoxConfig.userId)return window.ZeVoxConfig.userId
      if(window.g_user&&window.g_user.userID)return window.g_user.userID
      if(window.NOW&&window.NOW.user&&window.NOW.user.userID)return window.NOW.user.userID
      if(window.NOW&&window.NOW.user_id)return window.NOW.user_id
    }catch(e){}
    return ''
  }
  var SN_USER_ID=getSnUserId()

  var C={color:'#10b981',pos:'right',name:'',brand:true,logo:'',radius:'full',mode:'voice_only',greeting:''}
  var pendingNavUrls=[]

  function detectOriginPortal(){
    try{
      var p=(window.location.pathname||'').toLowerCase()
      var m=p.match(/^\/(sp|esc)(\/|$|\?)/)
      if(m)return m[1]
      if(window.ZEVOX_PORTAL)return String(window.ZEVOX_PORTAL).toLowerCase()
      if(window.ZeVoxConfig&&window.ZeVoxConfig.portal)return String(window.ZeVoxConfig.portal).toLowerCase()
    }catch(e){}
    return ''
  }

  function resolveUrl(u){
    if(!u)return ''
    if(/^https?:\/\//i.test(u))return u
    return window.location.origin.replace(/\/$/,'')+(u.charAt(0)==='/'?u:'/'+u)
  }
  function openNavUrls(urls){
    if(!urls||!urls.length)return
    var blocked=[]
    urls.forEach(function(u){var w=null;try{w=window.open(resolveUrl(u.url),'_blank','noopener')}catch(e){}; if(!w)blocked.push(u)})
    if(blocked.length){pendingNavUrls=pendingNavUrls.concat(blocked);setSt('Tap to open '+blocked.length+' page'+(blocked.length>1?'s':''),'')}
  }
  function flushPendingNav(){
    if(!pendingNavUrls.length)return
    var q=pendingNavUrls;pendingNavUrls=[]
    q.forEach(function(u){try{window.open(resolveUrl(u.url),'_blank','noopener')}catch(e){}})
  }

  // ── AudioWorklet for smooth TTS playback ────────────────────────────────
  var playCtx,workletNode,workletReady=false
  var WORKLET_CODE=`
    class ZeVoxPlayer extends AudioWorkletProcessor {
      constructor(){super();this.queue=[];this.currentChunk=null;this.currentPos=0;
        this.port.onmessage=(e)=>{
          if(e.data.type==='audio')this.queue.push(e.data.samples);
          else if(e.data.type==='clear'){this.queue=[];this.currentChunk=null;this.currentPos=0}
        }
      }
      process(inputs,outputs){
        const out=outputs[0][0];
        for(let i=0;i<out.length;i++){
          if(!this.currentChunk||this.currentPos>=this.currentChunk.length){
            if(this.queue.length>0){this.currentChunk=this.queue.shift();this.currentPos=0}
            else{out[i]=0;continue}
          }
          out[i]=this.currentChunk[this.currentPos++]
        }
        return true
      }
    }
    registerProcessor('zevox-player',ZeVoxPlayer)
  `
  async function initAudioWorklet(){
    if(workletReady)return
    try{
      playCtx=new AudioContext({sampleRate:24000})
      var blob=new Blob([WORKLET_CODE],{type:'application/javascript'})
      var url=URL.createObjectURL(blob)
      await playCtx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      workletNode=new AudioWorkletNode(playCtx,'zevox-player')
      workletNode.connect(playCtx.destination)
      workletReady=true
    }catch(e){workletReady=false}
  }
  function feedAudio(buf){
    if(!workletReady||!workletNode)return
    if(playCtx.state==='suspended')playCtx.resume()
    var i16=new Int16Array(buf),f32=new Float32Array(i16.length)
    for(var i=0;i<i16.length;i++)f32[i]=i16[i]/32768
    workletNode.port.postMessage({type:'audio',samples:f32})
  }
  function clearAudio(){if(workletNode)workletNode.port.postMessage({type:'clear'})}

  // ── Load config, then build ─────────────────────────────────────────────
  var configUrl=GW+'/api/widget/config?token='+TK+'&_t='+Date.now()
  if(AGENT)configUrl+='&agent='+encodeURIComponent(AGENT)
  fetch(configUrl).then(function(r){return r.json()}).then(function(c){
    if(c.color)C.color=c.color
    if(c.position)C.pos=c.position
    if(c.agentName)C.name=c.agentName
    if(c.showBranding===false)C.brand=false
    if(c.logoUrl)C.logo=c.logoUrl
    if(c.borderRadius)C.radius=c.borderRadius
    if(c.widgetMode)C.mode=c.widgetMode
    if(c.greeting)C.greeting=c.greeting
  }).catch(function(){}).finally(build)

  // ── CSS ─────────────────────────────────────────────────────────────────
  function injectCSS(){
    var R=C.radius==='lg'?'18px':'999px'
    var s=document.createElement('style')
    s.textContent=`
#zv{position:fixed;bottom:20px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter','Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
#zv *{box-sizing:border-box}

/* ── Launcher ── */
#zv-launcher{display:flex;align-items:center;gap:8px;background:#fff;border-radius:${R};padding:6px 6px 6px 8px;box-shadow:0 1px 2px 0 rgba(16,24,40,.06),0 6px 20px -4px ${C.color}2e,0 0 0 1px rgba(16,24,40,.05);transition:transform .2s,box-shadow .2s}
#zv-launcher:hover{transform:translateY(-1px);box-shadow:0 2px 4px 0 rgba(16,24,40,.08),0 10px 32px -6px ${C.color}47,0 0 0 1px rgba(16,24,40,.06)}
#zv-orb{width:36px;height:36px;border-radius:50%;cursor:pointer;border:none;outline:none;padding:0;position:relative;flex-shrink:0;background:radial-gradient(circle at 35% 30%,${C.color},${C.color} 40%,#0d1117 100%);box-shadow:0 0 0 2px ${C.color}26,0 4px 14px ${C.color}66,inset 0 -3px 6px rgba(0,0,0,.3);animation:zvBreathe 2.4s ease-in-out infinite}
#zv-orb::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.45),rgba(255,255,255,0) 50%);pointer-events:none}
#zv-orb img{width:36px;height:36px;object-fit:cover;border-radius:50%;position:relative;z-index:1}
@keyframes zvBreathe{0%,100%{box-shadow:0 0 0 2px ${C.color}26,0 4px 14px ${C.color}66,inset 0 -3px 6px rgba(0,0,0,.3)}50%{box-shadow:0 0 0 4px ${C.color}33,0 6px 22px ${C.color}88,inset 0 -3px 6px rgba(0,0,0,.3)}}
#zv-start{display:flex;align-items:center;gap:8px;height:38px;padding:0 18px 0 14px;border-radius:999px;border:none;outline:none;background:#0d1117;color:#fff;font-size:13.5px;font-weight:500;font-family:inherit;cursor:pointer;white-space:nowrap;transition:background .15s,transform .15s;letter-spacing:-.005em}
#zv-start:hover{background:#1c2128}
#zv-start:active{transform:scale(.97)}
#zv-start svg{width:14px;height:14px;color:${C.color}}
#zv-chat-start{display:flex;align-items:center;gap:8px;height:38px;padding:0 18px 0 14px;border-radius:999px;border:1px solid #e5e7eb;outline:none;background:#fff;color:#0d1117;font-size:13.5px;font-weight:500;font-family:inherit;cursor:pointer;white-space:nowrap;transition:all .15s;letter-spacing:-.005em}
#zv-chat-start:hover{background:#f9fafb;border-color:${C.color};color:${C.color}}
#zv-chat-start svg{width:14px;height:14px;color:${C.color}}

/* ── Voice card ── */
#zv-card{display:none;width:340px;background:radial-gradient(ellipse 80% 60% at 15% 0%,${C.color}1a 0%,transparent 55%),radial-gradient(ellipse 60% 50% at 90% 20%,rgba(99,102,241,.08) 0%,transparent 55%),#fff;border-radius:20px;box-shadow:0 0 0 1px ${C.color}1a,0 12px 48px -8px rgba(16,24,40,.14),0 4px 16px -4px rgba(16,24,40,.08);padding:22px;flex-direction:column;align-items:center;gap:4px;position:relative;overflow:hidden}
#zv-card.on{display:flex;animation:zvCardEntry .45s cubic-bezier(.22,1,.36,1)}
@keyframes zvCardEntry{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
#zv-card::before{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(to right,rgba(16,24,40,.025) 1px,transparent 1px),linear-gradient(to bottom,rgba(16,24,40,.025) 1px,transparent 1px);background-size:24px 24px;mask-image:radial-gradient(ellipse 80% 60% at 50% 10%,#000 0%,transparent 70%)}
#zv-agent{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;background:linear-gradient(110deg,#34d399 0%,${C.color} 45%,#6366f1 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:10px;position:relative;z-index:1}
#zv-agent.hide{display:none}
#zv-orb-lg{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:10px;position:relative;z-index:1;background:radial-gradient(circle at 35% 30%,${C.color},${C.color} 40%,#0d1117 100%);box-shadow:0 0 0 2px ${C.color}26,0 6px 24px ${C.color}80,0 10px 40px -4px rgba(99,102,241,.26),inset 0 -4px 8px rgba(0,0,0,.3);animation:zvBreathe 2.4s ease-in-out infinite}
#zv-orb-lg::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.4),rgba(255,255,255,0) 55%);pointer-events:none;z-index:2}
#zv-orb-lg img{width:60px;height:60px;object-fit:cover;border-radius:50%;position:relative;z-index:1}
#zv-ring{position:absolute;inset:-6px;border-radius:50%;border:2px solid ${C.color}55;opacity:0;transition:opacity .3s;z-index:0}
#zv-ring.on{opacity:1;animation:zvR 2s ease-in-out infinite}
@keyframes zvR{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.08);opacity:.95}}
#zv-wave{display:flex;gap:3px;align-items:center;height:18px;margin-bottom:8px;opacity:.55;position:relative;z-index:1}
#zv-wave span{display:block;width:3px;border-radius:2px;background:${C.color};transform-origin:center;transform:scaleY(.4)}
#zv-wave.on span{animation:zvWave 1.3s ease-in-out infinite}
#zv-wave span:nth-child(1){height:30%;animation-delay:-.2s}#zv-wave span:nth-child(2){height:60%;animation-delay:-.5s}#zv-wave span:nth-child(3){height:90%;animation-delay:-.8s}#zv-wave span:nth-child(4){height:100%;animation-delay:0s}#zv-wave span:nth-child(5){height:90%;animation-delay:-.3s}#zv-wave span:nth-child(6){height:60%;animation-delay:-.6s}#zv-wave span:nth-child(7){height:30%;animation-delay:-.9s}
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
#zv-br a:hover{color:${C.color}}
#zv-attach{display:none;width:100%;margin-top:14px;padding:12px;border-radius:12px;background:${C.color}14;border:1px solid ${C.color}33;text-align:left;position:relative;z-index:1;animation:zvFadeUp .35s cubic-bezier(.22,1,.36,1)}
#zv-attach.on{display:block}
#zv-attach-title{font-size:12px;font-weight:600;color:#0d1117;margin-bottom:2px}
#zv-attach-reason{font-size:11px;color:#6b7280;margin-bottom:10px;line-height:1.4}
#zv-attach-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:8px 12px;border-radius:8px;background:#0d1117;color:#fff;font-size:12px;font-weight:500;cursor:pointer;border:none;text-decoration:none;font-family:inherit;transition:background .15s}
#zv-attach-btn:hover{background:#1c2128}
#zv-attach-btn svg{width:12px;height:12px}
@keyframes zvFadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

/* ── Chat card ── */
#zv-chat{display:none;width:360px;height:520px;background:#fff;border-radius:20px;box-shadow:0 0 0 1px rgba(16,24,40,.08),0 12px 48px -8px rgba(16,24,40,.18),0 4px 16px -4px rgba(16,24,40,.1);flex-direction:column;overflow:hidden;position:relative}
#zv-chat.on{display:flex;animation:zvCardEntry .45s cubic-bezier(.22,1,.36,1)}
#zv-chat-hdr{display:flex;align-items:center;gap:12px;padding:16px 18px;background:linear-gradient(135deg,#0d1117 0%,#1c2128 100%);color:#fff;flex-shrink:0}
#zv-chat-hdr-orb{width:36px;height:36px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 35% 30%,${C.color},${C.color} 40%,#0d1117 100%);box-shadow:0 0 0 2px ${C.color}40,0 4px 12px ${C.color}60}
#zv-chat-hdr-orb img{width:36px;height:36px;border-radius:50%;object-fit:cover}
#zv-chat-hdr-info{flex:1;min-width:0}
#zv-chat-hdr-name{font-size:14px;font-weight:600;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#zv-chat-hdr-status{font-size:11px;color:#34d399;display:flex;align-items:center;gap:4px;margin-top:2px}
#zv-chat-hdr-status::before{content:"";width:6px;height:6px;border-radius:50%;background:#34d399;flex-shrink:0}
#zv-chat-close{width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;flex-shrink:0;transition:background .15s}
#zv-chat-close:hover{background:rgba(255,255,255,.15)}

/* Tabs (both mode only) */
#zv-tabs{display:none;flex-shrink:0;background:#f8fafc;border-bottom:1px solid #e5e7eb}
#zv-tabs.show{display:flex}
.zv-tab{flex:1;padding:10px;font-size:12.5px;font-weight:500;color:#6b7280;border:none;background:transparent;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;border-bottom:2px solid transparent;transition:all .15s}
.zv-tab:hover{color:#0d1117}
.zv-tab.active{color:${C.color};border-bottom-color:${C.color};background:#fff}
.zv-tab svg{width:13px;height:13px}

/* Chat panel */
#zv-chat-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}
#zv-chat-msgs::-webkit-scrollbar{width:4px}
#zv-chat-msgs::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:4px}
.zv-msg{max-width:82%;display:flex;flex-direction:column;gap:3px;animation:zvFadeUp .2s ease}
.zv-msg.user{align-self:flex-end;align-items:flex-end}
.zv-msg.agent{align-self:flex-start;align-items:flex-start}
.zv-msg-bubble{padding:10px 14px;border-radius:16px;font-size:13.5px;line-height:1.5;word-break:break-word}
.zv-msg.user .zv-msg-bubble{background:${C.color};color:#fff;border-bottom-right-radius:4px}
.zv-msg.agent .zv-msg-bubble{background:#f1f5f9;color:#0d1117;border-bottom-left-radius:4px}
.zv-msg-time{font-size:10px;color:#9ca3af;padding:0 4px}
.zv-msg-upload{display:flex;flex-direction:column;gap:6px;min-width:200px}
.zv-upload-label{font-size:12px;font-weight:600;color:#374151}
.zv-upload-reason{font-size:12.5px;color:#6b7280;line-height:1.4}
.zv-upload-btn{display:inline-flex;align-items:center;gap:6px;margin-top:4px;padding:8px 14px;background:${C.color};color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:500;transition:opacity .15s}
.zv-upload-btn:hover{opacity:.85}
.zv-upload-btn svg{width:14px;height:14px;flex-shrink:0}

/* Typing indicator */
#zv-typing{display:none;align-self:flex-start;padding:10px 14px;background:#f1f5f9;border-radius:16px;border-bottom-left-radius:4px;gap:4px}
#zv-typing.show{display:flex}
#zv-typing span{width:7px;height:7px;border-radius:50%;background:#94a3b8;animation:zvDot 1.4s ease-in-out infinite}
#zv-typing span:nth-child(2){animation-delay:.2s}
#zv-typing span:nth-child(3){animation-delay:.4s}
@keyframes zvDot{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}

/* Input bar */
#zv-chat-input-row{display:flex;align-items:flex-end;gap:8px;padding:12px 14px;border-top:1px solid #f1f5f9;flex-shrink:0;background:#fff}
#zv-chat-input{flex:1;border:1px solid #e5e7eb;border-radius:12px;padding:10px 14px;font-size:13.5px;font-family:inherit;outline:none;resize:none;max-height:100px;min-height:40px;line-height:1.4;color:#0d1117;transition:border-color .15s}
#zv-chat-input:focus{border-color:${C.color}}
#zv-chat-input::placeholder{color:#9ca3af}
#zv-chat-send{width:38px;height:38px;border-radius:50%;border:none;background:${C.color};color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s,transform .1s}
#zv-chat-send:hover{background:${C.color}cc}
#zv-chat-send:active{transform:scale(.93)}
#zv-chat-send:disabled{background:#e5e7eb;cursor:default}
#zv-chat-send svg{width:16px;height:16px}
#zv-chat-br{font-size:10.5px;color:#9ca3af;text-align:center;padding:0 14px 8px;flex-shrink:0}
#zv-chat-br a{color:#6b7280;text-decoration:none;font-weight:500}

/* Voice panel inside combined card */
#zv-voice-panel{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px}
`
    document.head.appendChild(s)
  }

  // ── Build UI ────────────────────────────────────────────────────────────
  function build(){
    injectCSS()
    var el=document.createElement('div');el.id='zv'
    el.addEventListener('click',flushPendingNav,true)

    var mode=C.mode
    var isBoth=mode==='both'
    var isChat=mode==='chat_only'||isBoth
    var isVoice=mode==='voice_only'||isBoth

    // Launcher HTML
    var launcherInner=''
    if(isVoice&&!isChat){
      // voice-only: orb + "Start a call"
      launcherInner=orbHTML()+`<button id="zv-start"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Start a call</button>`
    } else if(isChat&&!isBoth){
      // chat-only: orb + "Chat with us"
      launcherInner=orbHTML()+`<button id="zv-chat-start"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Chat with us</button>`
    } else {
      // both: orb + voice button + chat button
      launcherInner=orbHTML()+`<button id="zv-start"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Voice</button><button id="zv-chat-start"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Chat</button>`
    }

    el.innerHTML=`
<div id="zv-launcher">${launcherInner}</div>
${isVoice?buildVoiceCardHTML():''}
${isChat?buildChatCardHTML(isBoth):''}
`
    document.body.appendChild(el)

    var root=g('zv-launcher')
    el.style[C.pos==='left'?'left':'right']='20px'

    // Logo
    if(C.logo){
      var orb=g('zv-orb'),orbLg=g('zv-orb-lg')
      if(orb){orb.innerHTML='<img src="'+C.logo+'"/>';orb.style.background='#fff';orb.style.animation='none';orb.style.boxShadow='0 2px 10px rgba(0,0,0,.1)'}
      if(orbLg){orbLg.innerHTML='<div id="zv-ring"></div><img src="'+C.logo+'"/>';orbLg.style.background='#f5f5f5';orbLg.style.animation='none';orbLg.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'}
      var chatOrb=g('zv-chat-hdr-orb')
      if(chatOrb){chatOrb.innerHTML='<img src="'+C.logo+'"/>';chatOrb.style.background='#fff'}
    }

    // Agent name in voice card
    if(C.name){var ae=g('zv-agent');if(ae){ae.textContent=C.name;ae.className=''}}
    // Agent name in chat header
    var hn=g('zv-chat-hdr-name');if(hn)hn.textContent=C.name||'Assistant'

    // Branding
    var br=g('zv-br');if(br)br.innerHTML=C.brand?'Powered by <a href="https://zevox.onrender.com" target="_blank">ZeVox</a>':''
    var cbr=g('zv-chat-br');if(cbr)cbr.innerHTML=C.brand?'Powered by <a href="https://zevox.onrender.com" target="_blank">ZeVox</a>':''

    // Wire voice buttons
    if(isVoice){
      var orbb=g('zv-orb');if(orbb)orbb.onclick=isChat?function(){openVoiceFromBoth()}:startCall
      var sb=g('zv-start');if(sb)sb.onclick=isChat?openVoiceFromBoth:startCall
      if(g('zv-end'))g('zv-end').onclick=endCall
      if(g('zv-mute'))g('zv-mute').onclick=toggleMute
    } else {
      // chat-only: orb click opens chat
      var orbc=g('zv-orb');if(orbc)orbc.onclick=openChat
    }

    // Wire chat buttons
    if(isChat){
      var csb=g('zv-chat-start');if(csb)csb.onclick=openChat
      var cc=g('zv-chat-close');if(cc)cc.onclick=closeChat
      wireInputBar()
      if(isBoth){
        var t1=g('zv-tab-voice'),t2=g('zv-tab-chat')
        if(t1)t1.onclick=function(){showVoiceTab()}
        if(t2)t2.onclick=function(){showChatTab()}
      }
      // Auto-open greeting
      if(C.greeting)setTimeout(function(){appendMsg('agent',C.greeting)},400)
    }
  }

  function orbHTML(){
    return'<button id="zv-orb" aria-label="Assistant"></button>'
  }

  function buildVoiceCardHTML(){
    return`<div id="zv-card">
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
  }

  function buildChatCardHTML(showTabs){
    var tabs=showTabs?`<div id="zv-tabs" class="show">
  <button class="zv-tab" id="zv-tab-voice"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Voice</button>
  <button class="zv-tab active" id="zv-tab-chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Chat</button>
</div>`:''
    return`<div id="zv-chat">
  <div id="zv-chat-hdr">
    <div id="zv-chat-hdr-orb"></div>
    <div id="zv-chat-hdr-info">
      <div id="zv-chat-hdr-name">Assistant</div>
      <div id="zv-chat-hdr-status">Online</div>
    </div>
    <button id="zv-chat-close">✕</button>
  </div>
  ${tabs}
  <div id="zv-chat-msgs"><div id="zv-typing"><span></span><span></span><span></span></div></div>
  <div id="zv-chat-input-row">
    <textarea id="zv-chat-input" placeholder="Type a message..." rows="1"></textarea>
    <button id="zv-chat-send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
  </div>
  <div id="zv-chat-br"></div>
</div>`
  }

  // ── Chat state + functions ──────────────────────────────────────────────
  var chatOpen=false,chatSessionId='',chatBusy=false

  function openChat(){
    if(chatOpen)return
    chatOpen=true
    g('zv-launcher').style.display='none'
    var card=g('zv-chat');if(card)card.classList.add('on')
    var inp=g('zv-chat-input');if(inp)setTimeout(function(){inp.focus()},300)
  }

  function closeChat(){
    chatOpen=false
    var card=g('zv-chat');if(card)card.classList.remove('on')
    g('zv-launcher').style.display='flex'
  }

  function wireInputBar(){
    var inp=g('zv-chat-input'),btn=g('zv-chat-send')
    if(!inp||!btn)return
    inp.addEventListener('keydown',function(e){
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend()}
    })
    inp.addEventListener('input',function(){
      inp.style.height='auto'
      inp.style.height=Math.min(inp.scrollHeight,100)+'px'
    })
    btn.onclick=doSend
  }

  function doSend(){
    var inp=g('zv-chat-input')
    if(!inp||chatBusy)return
    var txt=(inp.value||'').trim()
    if(!txt)return
    inp.value='';inp.style.height='auto'
    appendMsg('user',txt)
    chatBusy=true
    setChatSendEnabled(false)
    showTyping(true)
    scrollMsgs()

    fetch(GW+'/api/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:TK,agent:AGENT,message:txt,session_id:chatSessionId||undefined,sn_user_id:SN_USER_ID||undefined})
    }).then(function(r){return r.json()}).then(function(d){
      chatSessionId=d.session_id||chatSessionId
      showTyping(false)
      if(d.message)appendMsg('agent',d.message)
      else if(d.error)appendMsg('agent','Sorry, something went wrong.')
      if(d.attachment_url)appendChatUpload(d.attachment_url,d.attachment_reason)
    }).catch(function(){
      showTyping(false)
      appendMsg('agent','Sorry, I couldn\'t connect. Please try again.')
    }).finally(function(){
      chatBusy=false;setChatSendEnabled(true)
      var i=g('zv-chat-input');if(i)i.focus()
    })
  }

  function appendMsg(role,text){
    var msgs=g('zv-chat-msgs')
    if(!msgs)return
    var now=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
    var d=document.createElement('div')
    d.className='zv-msg '+role
    // Escape HTML then linkify
    var safe=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')
    d.innerHTML='<div class="zv-msg-bubble">'+safe+'</div><div class="zv-msg-time">'+now+'</div>'
    // Insert before typing indicator
    var typing=g('zv-typing')
    if(typing)msgs.insertBefore(d,typing)
    else msgs.appendChild(d)
    scrollMsgs()
  }

  function scrollMsgs(){
    var msgs=g('zv-chat-msgs');if(msgs)setTimeout(function(){msgs.scrollTop=msgs.scrollHeight},50)}
  function showTyping(on){var t=g('zv-typing');if(t)t.className=on?'show':'';scrollMsgs()}
  function setChatSendEnabled(on){var b=g('zv-chat-send');if(b)b.disabled=!on}

  function appendChatUpload(url,reason){
    var msgs=g('zv-chat-msgs');if(!msgs)return
    var safe=(reason||'a file').replace(/[<>&"']/g,'')
    var d=document.createElement('div')
    d.className='zv-msg agent'
    d.innerHTML='<div class="zv-msg-bubble zv-msg-upload"><div class="zv-upload-label">📎 File upload requested</div><div class="zv-upload-reason">'+safe+'</div><a class="zv-upload-btn" href="'+url+'" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Open upload page</a></div>'
    var typing=g('zv-typing');if(typing)msgs.insertBefore(d,typing);else msgs.appendChild(d)
    scrollMsgs()
  }

  // ── Both mode — tabs ────────────────────────────────────────────────────
  var voiceTabActive=false

  function showVoiceTab(){
    voiceTabActive=true
    var t1=g('zv-tab-voice'),t2=g('zv-tab-chat')
    if(t1)t1.className='zv-tab active'
    if(t2)t2.className='zv-tab'
    var mp=g('zv-chat-msgs'),ir=g('zv-chat-input-row'),vp=g('zv-voice-panel')
    // Swap content: hide chat messages/input, show voice panel
    if(mp)mp.style.display='none'
    if(ir)ir.style.display='none'
    // Inject voice panel if not present
    if(!vp){
      var card=g('zv-chat')
      if(card){
        var panel=document.createElement('div')
        panel.id='zv-voice-panel'
        panel.innerHTML=`
<div id="zv-orb-lg" style="width:64px;height:64px"><div id="zv-ring"></div></div>
<div id="zv-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
<div id="zv-status" style="font-size:16px;font-weight:600;color:#0d1117">Tap to start a call</div>
<div id="zv-sub" style="font-size:12px;color:#6b7280"></div>
<div id="zv-ctrls" style="margin-top:16px">
  <button id="zv-start-tab" style="display:flex;align-items:center;gap:8px;padding:10px 28px;border-radius:24px;border:none;background:${C.color};color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
    Start Voice Call
  </button>
  <button id="zv-end" style="display:none;align-items:center;gap:6px;padding:8px 20px;border-radius:24px;border:1px solid #e5e7eb;background:#fff;color:#0d1117;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l18 18M10.68 13.31a16 16 0 003.41 2.6l1.1-1.1a1 1 0 011.11-.27c1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.1.31.03.66-.25 1.02l-1.1 1.1"/></svg> End
  </button>
  <button id="zv-mute" style="width:36px;height:36px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer"><svg id="zv-mon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg><svg id="zv-mof" style="display:none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/></svg></button>
</div>
<div id="zv-br" style="font-size:11px;color:#9ca3af"></div>`
        var cbr=card.querySelector('#zv-chat-br')
        if(cbr)card.insertBefore(panel,cbr)
        else card.appendChild(panel)
        if(C.brand){var vbr=g('zv-br');if(vbr)vbr.innerHTML='Powered by <a href="https://zevox.onrender.com" target="_blank" style="color:#6b7280;text-decoration:none;font-weight:500">ZeVox</a>'}
        var stBtn=g('zv-start-tab');if(stBtn)stBtn.onclick=startCall
        if(g('zv-end'))g('zv-end').onclick=endCall
        if(g('zv-mute'))g('zv-mute').onclick=toggleMute
      }
    } else {
      vp.style.display='flex'
    }
  }

  function showChatTab(){
    voiceTabActive=false
    var t1=g('zv-tab-voice'),t2=g('zv-tab-chat')
    if(t1)t1.className='zv-tab'
    if(t2)t2.className='zv-tab active'
    var mp=g('zv-chat-msgs'),ir=g('zv-chat-input-row'),vp=g('zv-voice-panel')
    if(mp)mp.style.display='flex'
    if(ir)ir.style.display='flex'
    if(vp)vp.style.display='none'
    if(active)endCall()
  }

  function openVoiceFromBoth(){
    openChat()
    setTimeout(showVoiceTab,50)
  }

  // ── Voice state + functions ─────────────────────────────────────────────
  var ws,micCtx,micStr,micP,active=false,muted=false

  function startMic(){
    return navigator.mediaDevices.getUserMedia({audio:{channelCount:1,sampleRate:16000,echoCancellation:true,noiseSuppression:true}}).then(function(s){
      micCtx=new(window.AudioContext||window.webkitAudioContext)({sampleRate:16000})
      micStr=s
      var src=micCtx.createMediaStreamSource(s)
      micP=micCtx.createScriptProcessor(4096,1,1)
      micP.onaudioprocess=function(e){
        if(ws&&ws.readyState===1&&!muted){
          var f=e.inputBuffer.getChannelData(0),i=new Int16Array(f.length)
          for(var j=0;j<f.length;j++)i[j]=Math.max(-32768,Math.min(32767,Math.round(f[j]*32767)))
          ws.send(i.buffer)
        }
      }
      src.connect(micP);micP.connect(micCtx.destination)
    })
  }
  function stopMic(){
    if(micP){micP.disconnect();micP=null}
    if(micStr){micStr.getTracks().forEach(function(t){t.stop()});micStr=null}
    if(micCtx){micCtx.close();micCtx=null}
  }
  function toggleMute(){
    muted=!muted
    var mb=g('zv-mute');if(mb)mb.className=muted?'on':''
    var mon=g('zv-mon'),mof=g('zv-mof')
    if(mon)mon.style.display=muted?'none':'block'
    if(mof)mof.style.display=muted?'block':'none'
  }

  async function startCall(){
    if(active)return
    active=true;muted=false

    // In "both" mode the launcher stays hidden (chat card is open) — just swap voice panel
    if(C.mode==='both'){
      var stBtn=g('zv-start-tab')
      if(stBtn){stBtn.style.display='none'}
      var endBtn=g('zv-end');if(endBtn)endBtn.style.display='flex'
    } else {
      g('zv-launcher').style.display='none'
      var vc=g('zv-card');if(vc)vc.classList.add('on')
    }
    setSt('Connecting...','')
    await initAudioWorklet()

    try{
      var wsUrl=GW.replace('http','ws')+'/voice?token='+TK
      if(SN_USER_ID)wsUrl+='&user='+encodeURIComponent(SN_USER_ID)
      ws=new WebSocket(wsUrl);ws.binaryType='arraybuffer'
      ws.onopen=function(){
        ws.send(JSON.stringify({type:'start',originPortal:detectOriginPortal()}))
        startMic().catch(function(){setSt('Listening...','Mic unavailable')})
      }
      ws.onmessage=function(ev){
        if(ev.data instanceof ArrayBuffer){feedAudio(ev.data);return}
        try{
          var m=JSON.parse(ev.data)
          if(m.type==='ready'){setSt('Listening...','Say something');setRing(true);setWave(true)}
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
        }catch(e){}
      }
      ws.onclose=function(ev){if(active){if(ev.code!==1000)setSt('Connection lost','');setTimeout(function(){if(active)endCall()},1500)}}
    }catch(e){setSt('Failed',e.message);setTimeout(endCall,2000)}
  }

  function endCall(){
    try{if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'stop'}));ws.close()}}catch(e){}
    ws=null;stopMic();clearAudio();active=false;muted=false;setRing(false);setWave(false)
    pendingNavUrls=[]
    if(C.mode==='both'){
      var stBtn=g('zv-start-tab');if(stBtn)stBtn.style.display='flex'
      var endBtn=g('zv-end');if(endBtn)endBtn.style.display='none'
      setSt('Tap to start a call','')
    } else {
      var vc=g('zv-card');if(vc)vc.classList.remove('on')
      resetAttachmentUI()
      g('zv-launcher').style.display='flex'
    }
  }

  function endCallGraceful(){
    if(!active)return
    active=false;stopMic();setRing(false);setWave(false)
    setSt('Call ending...','')
    setTimeout(function(){
      try{if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'stop'}));ws.close()}}catch(e){}
      ws=null;clearAudio();muted=false
      if(C.mode==='both'){
        var stBtn=g('zv-start-tab');if(stBtn)stBtn.style.display='flex'
        var endBtn=g('zv-end');if(endBtn)endBtn.style.display='none'
        setSt('Tap to start a call','')
      } else {
        var vc=g('zv-card');if(vc)vc.classList.remove('on')
        resetAttachmentUI()
        g('zv-launcher').style.display='flex'
      }
    },6000)
  }

  function showAttachmentRequest(url,reason){
    var box=g('zv-attach');if(!box)return
    var safe=(reason||'a file').toString().replace(/[<>&"']/g,'')
    box.className='on'
    box.innerHTML='<div id="zv-attach-title">Share a file</div><div id="zv-attach-reason">The agent has asked for '+safe+'. Tap below to open a secure upload page.</div><a id="zv-attach-btn" href="'+url+'" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Open upload page</a>'
  }
  function resetAttachmentUI(){var box=g('zv-attach');if(box){box.className='';box.innerHTML=''}}

  function setSt(main,sub){var s=g('zv-status'),sb=g('zv-sub');if(s)s.textContent=main;if(sb)sb.textContent=sub||''}
  function setRing(on){var r=g('zv-ring');if(r)r.className=on?'on':''}
  function setWave(on){var w=g('zv-wave');if(w)w.className=on?'on':''}
  function g(id){return document.getElementById(id)}
})()
