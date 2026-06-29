/**
 * ZeVox Widget
 * <script>window.ZEVOX_TOKEN="sk_live_...";</script>
 * <script src="https://zevox.onrender.com/widget.js"></script>
 */
(function(){
  var sc=document.currentScript||document.querySelector('script[data-token]')
  var TK=(window.ZeVoxConfig&&window.ZeVoxConfig.token)||window.ZEVOX_TOKEN||(sc&&sc.getAttribute('data-token'))||''
  var AGENT=(window.ZeVoxConfig&&window.ZeVoxConfig.agent)||window.ZEVOX_AGENT||(sc&&sc.getAttribute('data-agent'))||''
  var GW=(window.ZeVoxConfig&&window.ZeVoxConfig.gateway)||(sc&&sc.src?new URL(sc.src).origin:'')||'https://zevox.onrender.com'
  if(!TK){console.error('[ZeVox] No token');return}
  if(window.__zv)return;window.__zv=true

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

  var C={color:'#059669',pos:'right',name:'',brand:true,logo:'',radius:'full',mode:'voice_only',greeting:''}
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

  var playCtx,workletNode,workletReady=false
  var WORKLET_CODE='class ZeVoxPlayer extends AudioWorkletProcessor{constructor(){super();this.queue=[];this.currentChunk=null;this.currentPos=0;this.port.onmessage=(e)=>{if(e.data.type==="audio")this.queue.push(e.data.samples);else if(e.data.type==="clear"){this.queue=[];this.currentChunk=null;this.currentPos=0}}}process(inputs,outputs){const out=outputs[0][0];for(let i=0;i<out.length;i++){if(!this.currentChunk||this.currentPos>=this.currentChunk.length){if(this.queue.length>0){this.currentChunk=this.queue.shift();this.currentPos=0}else{out[i]=0;continue}}out[i]=this.currentChunk[this.currentPos++]}return true}}registerProcessor("zevox-player",ZeVoxPlayer)'
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

  /* ── STYLES ── */
  function injectCSS(){
    var s=document.createElement('style')
    s.textContent=`
#zv{position:fixed;bottom:24px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;align-items:flex-end;gap:12px}
#zv *{box-sizing:border-box;margin:0;padding:0;font-family:inherit}

/* ZeVox orb — holographic metallic disc */
.zvorb{
  background:
    conic-gradient(from 200deg at 50% 50%,
      #a0b8e8 0deg,
      #c0b8f8 50deg,
      #dcd0ff 90deg,
      #c4d4f8 140deg,
      #a8c0f0 180deg,
      #b0acf0 230deg,
      #ccc4fc 270deg,
      #b8d0f8 310deg,
      #a0b8e8 360deg);
  border-radius:50%;
  position:relative;
  overflow:hidden
}
.zvorb::after{
  content:'';position:absolute;inset:0;border-radius:50%;
  background:
    repeating-radial-gradient(circle at 50% 50%,
      rgba(255,255,255,.0) 0px, rgba(255,255,255,.0) 7px,
      rgba(255,255,255,.22) 8px, rgba(255,255,255,.0) 9px),
    radial-gradient(ellipse at 30% 26%, rgba(255,255,255,.96) 0%, rgba(255,255,255,.35) 20%, transparent 46%);
  pointer-events:none
}

@keyframes zvhue{0%{filter:hue-rotate(0deg) brightness(1)}50%{filter:hue-rotate(15deg) brightness(1.04)}100%{filter:hue-rotate(0deg) brightness(1)}}
@keyframes zvpop{from{opacity:0;transform:translateY(16px) scale(.93)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes zvring{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.06);opacity:.8}}
@keyframes zvwave{0%,100%{transform:scaleY(.2)}50%{transform:scaleY(1)}}
@keyframes zvdot{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}
@keyframes zvglow{0%,100%{box-shadow:0 0 20px rgba(52,211,153,.3),0 4px 20px rgba(0,0,0,.18)}50%{box-shadow:0 0 35px rgba(52,211,153,.55),0 4px 20px rgba(0,0,0,.18)}}

/* ── LAUNCHER ── */
#zv-launcher{
  display:inline-flex;align-items:center;
  background:#fff;
  border-radius:999px;
  padding:5px 5px 5px 5px;
  gap:0;
  box-shadow:0 2px 12px rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.06);
  cursor:pointer;
  transition:box-shadow .2s,transform .2s
}
#zv-launcher:hover{box-shadow:0 6px 24px rgba(0,0,0,.16),0 0 0 1px rgba(0,0,0,.12);transform:translateY(-2px)}
#zv-orb{
  width:40px;height:40px;flex-shrink:0;
  animation:zvhue 6s ease-in-out infinite;
  border:none;cursor:pointer;outline:none;background:none;padding:0
}
#zv-start,#zv-chat-start{
  display:inline-flex;align-items:center;gap:8px;
  height:38px;padding:0 18px 0 12px;margin-left:6px;
  border-radius:999px;border:none;outline:none;
  background:var(--zvc);
  color:#fff;
  font-size:13.5px;font-weight:600;
  cursor:pointer;letter-spacing:-.01em;white-space:nowrap;
  transition:filter .15s,transform .1s;
  box-shadow:0 2px 8px rgba(0,0,0,.2)
}
#zv-start:hover,#zv-chat-start:hover{filter:brightness(1.08);transform:scale(1.02)}
#zv-start svg,#zv-chat-start svg{width:14px;height:14px;flex-shrink:0}

/* ── VOICE CARD ── */
#zv-card{
  display:none;
  width:320px;
  background:#fff;
  border-radius:28px;
  box-shadow:0 0 0 1px rgba(0,0,0,.07),0 24px 64px -8px rgba(0,0,0,.22);
  flex-direction:column;
  align-items:center;
  position:relative;
  overflow:visible;
  padding-bottom:4px
}
#zv-card.on{display:flex;animation:zvpop .35s cubic-bezier(.22,1,.36,1)}

/* Close button */
#zv-card-x{
  position:absolute;top:14px;right:14px;
  width:30px;height:30px;border-radius:50%;
  border:1px solid #e5e7eb;background:#fff;
  color:#9ca3af;font-size:15px;line-height:1;
  cursor:pointer;display:flex;align-items:center;justify-content:center;
  z-index:4;transition:all .15s;outline:none
}
#zv-card-x:hover{background:#f3f4f6;color:#374151}

/* Agent label */
#zv-agent{
  display:none;
  margin-top:20px;
  font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--zvc)
}

/* Big orb + phone */
#zv-orb-wrap{
  position:relative;
  margin:36px 0 0;
  width:160px;height:160px;
  display:flex;align-items:center;justify-content:center
}
#zv-orb-lg{
  width:160px;height:160px;
  animation:zvhue 6s ease-in-out infinite,zvglow 4s ease-in-out infinite;
  flex-shrink:0
}
#zv-ring{
  position:absolute;inset:-12px;border-radius:50%;
  border:2.5px solid rgba(52,211,153,.5);
  opacity:0;pointer-events:none;transition:opacity .3s
}
#zv-ring.on{opacity:1;animation:zvring 2s ease-in-out infinite}
#zv-phone-btn{
  position:absolute;bottom:-18px;left:50%;
  transform:translateX(-50%);
  width:52px;height:52px;border-radius:50%;
  background:var(--zvc);
  border:3.5px solid #fff;
  cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 4px 20px rgba(0,0,0,.2);
  z-index:3;transition:transform .15s,background .15s;outline:none
}
#zv-phone-btn:hover{transform:translateX(-50%) scale(1.1)}
#zv-phone-btn.active{background:linear-gradient(135deg,#dc2626,#b91c1c);box-shadow:0 4px 20px rgba(220,38,38,.4)}
#zv-phone-btn svg{width:22px;height:22px;fill:#fff;pointer-events:none}

/* Wave bars */
#zv-wave{
  display:flex;gap:3.5px;align-items:center;
  height:32px;margin:34px 0 0;
  opacity:0;transition:opacity .3s
}
#zv-wave.on{opacity:1}
#zv-wave span{
  display:block;width:3.5px;border-radius:3px;
  background:var(--zvc);
  transform-origin:center;transform:scaleY(.2)
}
#zv-wave.on span{animation:zvwave 1.2s ease-in-out infinite}
#zv-wave span:nth-child(1){height:10px;animation-delay:-.18s}
#zv-wave span:nth-child(2){height:18px;animation-delay:-.45s}
#zv-wave span:nth-child(3){height:26px;animation-delay:-.72s}
#zv-wave span:nth-child(4){height:32px;animation-delay:0s}
#zv-wave span:nth-child(5){height:26px;animation-delay:-.3s}
#zv-wave span:nth-child(6){height:18px;animation-delay:-.6s}
#zv-wave span:nth-child(7){height:10px;animation-delay:-.9s}

#zv-status{
  font-size:15px;font-weight:600;color:#111827;
  letter-spacing:-.02em;margin-top:8px
}
#zv-sub{
  font-size:12.5px;color:#9ca3af;
  margin-top:4px;min-height:18px;
  text-align:center;padding:0 24px
}

/* Mute btn */
#zv-mute{
  display:none;
  width:34px;height:34px;border-radius:50%;
  border:1.5px solid #e5e7eb;background:#fff;
  align-items:center;justify-content:center;
  cursor:pointer;transition:all .15s;
  margin-top:8px;outline:none
}
#zv-mute.show{display:flex}
#zv-mute.on{background:#ef4444;border-color:#ef4444}
#zv-mute svg{width:15px;height:15px;stroke:#6b7280}
#zv-mute.on svg{stroke:#fff}

/* Attachment box */
#zv-attach{
  display:none;
  width:calc(100% - 32px);
  margin:14px 0 0;padding:12px;
  border-radius:14px;
  background:color-mix(in srgb,var(--zvc) 8%,#fff);border:1px solid color-mix(in srgb,var(--zvc) 30%,#fff)
}
#zv-attach.on{display:block}

/* Card text input */
#zv-card-input-row{
  display:flex;align-items:center;
  width:calc(100% - 28px);
  margin:18px 0 16px;
  border:1.5px solid #e5e7eb;border-radius:14px;
  background:#f9fafb;overflow:hidden;
  transition:border-color .15s
}
#zv-card-input-row:focus-within{border-color:var(--zvc);background:#fff}
#zv-card-input{
  flex:1;border:none;background:transparent;
  padding:11px 14px;font-size:13.5px;outline:none;color:#111827
}
#zv-card-input::placeholder{color:#9ca3af}
#zv-card-send{
  width:36px;height:36px;border:none;background:transparent;
  color:#d1d5db;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;margin-right:3px;
  transition:color .15s;outline:none
}
#zv-card-send:hover{color:var(--zvc)}
#zv-card-send svg{width:14px;height:14px}

#zv-br{font-size:10.5px;color:#d1d5db;margin-bottom:6px;text-align:center}
#zv-br a{color:#9ca3af;text-decoration:none}

/* ── CHAT CARD ── */
#zv-chat{
  display:none;
  width:360px;height:520px;
  background:#fff;border-radius:24px;
  box-shadow:0 0 0 1px rgba(0,0,0,.07),0 24px 64px -8px rgba(0,0,0,.22);
  flex-direction:column;overflow:hidden
}
#zv-chat.on{display:flex;animation:zvpop .35s cubic-bezier(.22,1,.36,1)}

/* Chat header — white */
#zv-chat-hdr{
  display:flex;align-items:center;gap:10px;
  padding:14px 16px;
  background:#fff;border-bottom:1px solid #f3f4f6;
  flex-shrink:0
}
#zv-chat-hdr-orb{
  width:34px;height:34px;flex-shrink:0;border-radius:50%;
  animation:zvhue 6s ease-in-out infinite
}
#zv-chat-hdr-info{flex:1;min-width:0}
#zv-chat-hdr-name{
  font-size:14px;font-weight:600;color:#111827;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis
}
#zv-chat-hdr-st{
  font-size:11px;color:var(--zvc);
  display:flex;align-items:center;gap:5px;margin-top:2px
}
#zv-chat-hdr-st::before{
  content:'';width:6px;height:6px;
  border-radius:50%;background:var(--zvc);flex-shrink:0
}
#zv-chat-cls{
  width:30px;height:30px;border-radius:50%;
  border:1px solid #e5e7eb;background:#fff;
  color:#9ca3af;font-size:15px;line-height:1;
  cursor:pointer;display:flex;align-items:center;justify-content:center;
  flex-shrink:0;transition:all .15s;outline:none
}
#zv-chat-cls:hover{background:#f3f4f6;color:#374151}

/* Tabs */
#zv-tabs{display:none!important;flex-shrink:0;background:#fff;border-bottom:1px solid #f3f4f6;flex-direction:row!important}
#zv-tabs.show{display:flex!important;flex-direction:row!important;align-items:stretch}
.zv-tab{
  flex:1!important;padding:10px;
  font-size:12.5px;font-weight:500;color:#9ca3af;
  border-top:none!important;border-left:none!important;border-right:none!important;
  border-bottom:2px solid transparent!important;
  background:transparent!important;cursor:pointer;
  display:flex;align-items:center;justify-content:center;gap:6px;
  transition:color .15s;outline:none!important;box-shadow:none!important
}
.zv-tab.active{color:var(--zvc)!important;border-bottom:2px solid var(--zvc)!important}
.zv-tab svg{width:13px;height:13px}

/* Messages */
#zv-chat-msgs{
  flex:1!important;overflow-y:auto!important;padding:14px 12px!important;
  display:flex!important;flex-direction:column!important;gap:10px;scroll-behavior:smooth;
  min-height:0!important
}
#zv-chat-msgs::-webkit-scrollbar{width:4px}
#zv-chat-msgs::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:4px}
.zv-msg{max-width:82%;display:flex;flex-direction:column;gap:3px}
.zv-msg.user{align-self:flex-end;align-items:flex-end}
.zv-msg.agent{align-self:flex-start;align-items:flex-start}
.zv-msg-row{display:flex;align-items:flex-end;gap:6px}
.zv-msg-avatar{
  width:24px;height:24px;flex-shrink:0;border-radius:50%
}
.zv-msg-avatar.zvorb{animation:zvhue 6s ease-in-out infinite}
.zv-msg-bubble{
  padding:10px 14px;border-radius:18px;
  font-size:13.5px;line-height:1.5;word-break:break-word
}
.zv-msg.user .zv-msg-bubble{
  background:var(--zvc);
  color:#fff;border-bottom-right-radius:4px
}
.zv-msg.agent .zv-msg-bubble{
  background:#f3f4f6;color:#111827;border-bottom-left-radius:4px
}
.zv-msg-time{font-size:10px;color:#d1d5db;padding:0 2px}
.zv-msg-upload{display:flex;flex-direction:column;gap:6px;min-width:180px}
.zv-upload-label{font-size:12px;font-weight:600;color:#374151}
.zv-upload-reason{font-size:12.5px;color:#6b7280;line-height:1.4}
.zv-upload-btn{
  display:inline-flex;align-items:center;gap:6px;
  margin-top:4px;padding:8px 14px;
  background:var(--zvc);color:#fff;
  border-radius:8px;text-decoration:none;
  font-size:13px;font-weight:500;transition:opacity .15s
}
.zv-upload-btn:hover{opacity:.85}
.zv-upload-btn svg{width:14px;height:14px;flex-shrink:0}

/* Typing */
#zv-typing{
  display:none;align-self:flex-start;
  padding:10px 14px;background:#f3f4f6;
  border-radius:18px;border-bottom-left-radius:4px;gap:4px
}
#zv-typing.show{display:flex}
#zv-typing span{
  width:6px;height:6px;border-radius:50%;
  background:#c4c4c4;animation:zvdot 1.4s ease-in-out infinite
}
#zv-typing span:nth-child(2){animation-delay:.2s}
#zv-typing span:nth-child(3){animation-delay:.4s}

/* Chat input */
#zv-chat-input-row{
  padding:10px 12px;
  border-top:1px solid #f3f4f6;
  background:#fff;flex-shrink:0
}
#zv-chat-input-wrap{
  display:flex;align-items:center;
  border:1.5px solid #e5e7eb;border-radius:14px;
  background:#f9fafb;overflow:hidden;transition:border-color .15s
}
#zv-chat-input-wrap:focus-within{border-color:var(--zvc);background:#fff}
#zv-chat-input{
  flex:1;border:none;background:transparent;
  padding:10px 14px;font-size:13.5px;outline:none;
  resize:none;max-height:100px;min-height:38px;
  line-height:1.4;color:#111827
}
#zv-chat-input::placeholder{color:#9ca3af}
#zv-chat-send{
  width:34px;height:34px;border:none;background:transparent;
  color:#d1d5db;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;margin-right:5px;
  transition:color .15s;outline:none
}
#zv-chat-send:hover{color:var(--zvc)}
#zv-chat-send:disabled{opacity:.35;cursor:default}
#zv-chat-send svg{width:14px;height:14px}
#zv-chat-br{
  font-size:10.5px;color:#d1d5db;
  text-align:center;padding:4px 0 8px
}
#zv-chat-br a{color:#9ca3af;text-decoration:none}
#zv-voice-panel{
  flex:1;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:10px;padding:24px
}
`
    document.head.appendChild(s)
  }

  /* ── SVG icons ── */
  var PHONE_SVG='<svg viewBox="0 0 24 24" fill="#fff"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.7-.38 1.06-.2 1.1.37 2.28.57 3.54.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C4.61 21 2 18.39 2 15.23c0-.03 0-.06.01-.09V4.96c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.1.31.03.66-.25 1.02L6.6 10.8z"/></svg>'
  var SEND_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
  var MIC_SVG='<svg id="zv-mon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg><svg id="zv-mof" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .34-.03.67-.08 1"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
  var CHAT_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
  var VOICE_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'

  /* ── Build UI ── */
  function build(){
    injectCSS()
    var el=document.createElement('div');el.id='zv'
    el.addEventListener('click',flushPendingNav,true)

    var mode=C.mode,isBoth=(mode==='both'),isChat=(mode==='chat_only'||isBoth),isVoice=(mode==='voice_only'||isBoth)

    /* Launcher */
    var btnLabel=isBoth?'Ask Anything':(isVoice?'Start a call':'Chat with us')
    var btnId=isChat?'zv-chat-start':'zv-start'
    var launcherHTML='<button id="zv-orb" class="zvorb" aria-label="ZeVox"></button>'
      +'<button id="'+btnId+'">'+PHONE_SVG+btnLabel+'</button>'

    /* Voice card */
    var voiceHTML=''
    if(isVoice&&!isBoth){
      voiceHTML=[
        '<div id="zv-card">',
          '<button id="zv-card-x">&#x2715;</button>',
          '<div id="zv-agent"></div>',
          '<div id="zv-orb-wrap">',
            '<div id="zv-orb-lg" class="zvorb"><div id="zv-ring"></div></div>',
            '<button id="zv-phone-btn">'+PHONE_SVG+'</button>',
          '</div>',
          '<div id="zv-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>',
          '<div id="zv-status"></div>',
          '<div id="zv-sub"></div>',
          '<button id="zv-mute">'+MIC_SVG+'</button>',
          '<div id="zv-attach"></div>',
          '<div id="zv-card-input-row">',
            '<input id="zv-card-input" type="text" placeholder="Type a message..." autocomplete="off"/>',
            '<button id="zv-card-send">'+SEND_SVG+'</button>',
          '</div>',
          '<div id="zv-br"></div>',
        '</div>'
      ].join('')
    }

    /* Chat card */
    var chatHTML=''
    if(isChat){
      var tabsHTML=isBoth?[
        '<div id="zv-tabs" class="show">',
          '<button class="zv-tab" id="zv-tab-voice">'+VOICE_SVG+'Voice</button>',
          '<button class="zv-tab active" id="zv-tab-chat">'+CHAT_SVG+'Chat</button>',
        '</div>'
      ].join(''):''
      chatHTML=[
        '<div id="zv-chat">',
          '<div id="zv-chat-hdr">',
            '<div id="zv-chat-hdr-orb" class="zvorb"></div>',
            '<div id="zv-chat-hdr-info">',
              '<div id="zv-chat-hdr-name">ZeVox AI</div>',
              '<div id="zv-chat-hdr-st">Online</div>',
            '</div>',
            '<button id="zv-chat-cls">&#x2715;</button>',
          '</div>',
          tabsHTML,
          '<div id="zv-chat-msgs"><div id="zv-typing"><span></span><span></span><span></span></div></div>',
          '<div id="zv-chat-input-row">',
            '<div id="zv-chat-input-wrap">',
              '<textarea id="zv-chat-input" placeholder="Type a message..." rows="1"></textarea>',
              '<button id="zv-chat-send">'+SEND_SVG+'</button>',
            '</div>',
          '</div>',
          '<div id="zv-chat-br"></div>',
        '</div>'
      ].join('')
    }

    el.innerHTML='<div id="zv-launcher">'+launcherHTML+'</div>'+voiceHTML+chatHTML
    document.body.appendChild(el)
    el.style[C.pos==='left'?'left':'right']='20px'
    el.style.setProperty('--zvc', C.color)

    /* Agent name — only in chat header, not voice card */
    if(C.name){
      var hn=g('zv-chat-hdr-name');if(hn)hn.textContent=C.name
    }

    /* Logo override */
    if(C.logo){
      var orbe=g('zv-orb')
      if(orbe){orbe.innerHTML='<img src="'+C.logo+'" style="width:40px;height:40px;border-radius:50%;object-fit:cover"/>';orbe.classList.remove('zvorb');orbe.style.cssText='background:transparent;animation:none;border:none;padding:0;outline:none'}
      var orbLg=g('zv-orb-lg')
      if(orbLg){orbLg.innerHTML='<div id="zv-ring"></div><img src="'+C.logo+'" style="width:160px;height:160px;border-radius:50%;object-fit:cover;position:relative;z-index:1"/>';orbLg.classList.remove('zvorb');orbLg.style.cssText='background:#f0fdf4;animation:none'}
      var chatOrb=g('zv-chat-hdr-orb')
      if(chatOrb){chatOrb.innerHTML='<img src="'+C.logo+'" style="width:34px;height:34px;border-radius:50%;object-fit:cover"/>';chatOrb.classList.remove('zvorb');chatOrb.style.animation='none'}
    }

    /* Branding */
    var br=g('zv-br');if(br)br.innerHTML=C.brand?'Powered by <a href="https://zevox.onrender.com" target="_blank">ZeVox</a>':''
    var cbr=g('zv-chat-br');if(cbr)cbr.innerHTML=C.brand?'Powered by <a href="https://zevox.onrender.com" target="_blank">ZeVox</a>':''

    /* Wire voice card */
    if(isVoice&&!isBoth){
      var orbBtn=g('zv-orb');if(orbBtn)orbBtn.onclick=startCall
      var sb=g('zv-start');if(sb)sb.onclick=startCall
      var ph=g('zv-phone-btn');if(ph)ph.onclick=function(){if(active)endCall();else startCall()}
      var cx=g('zv-card-x')
      if(cx)cx.onclick=function(){
        if(active){endCall()}
        else{var vc=g('zv-card');if(vc)vc.classList.remove('on');var la=g('zv-launcher');if(la)la.style.display='inline-flex'}
      }
      var mb=g('zv-mute');if(mb)mb.onclick=toggleMute
      wireVoiceCardInput()
    }

    /* Wire chat card */
    if(isChat){
      if(!isBoth){var orbBtn2=g('zv-orb');if(orbBtn2)orbBtn2.onclick=openChat}
      var csb=g('zv-chat-start');if(csb)csb.onclick=openChat
      var cc=g('zv-chat-cls');if(cc)cc.onclick=closeChat
      wireInputBar()
      if(isBoth){
        var t1=g('zv-tab-voice');if(t1)t1.onclick=showVoiceTab
        var t2=g('zv-tab-chat');if(t2)t2.onclick=showChatTab
      }
      var greet=C.greeting||'Hi! How can I help you today?'
      setTimeout(function(){appendMsg('agent',greet)},400)
    }
  }

// ── Chat state + functions  // ── Chat state + functions ──────────────────────────────────────────────
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
    var safe=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')
    if(role==='agent'){
      var avatarHtml='<div class="zv-msg-avatar zvorb" style="animation:zvhue 6s ease-in-out infinite"></div>'
      if(C.logo)avatarHtml='<img class="zv-msg-avatar" src="'+C.logo+'" style="object-fit:cover"/>'
      d.innerHTML='<div class="zv-msg-row">'+avatarHtml+'<div class="zv-msg-bubble">'+safe+'</div></div><div class="zv-msg-time">'+now+'</div>'
    } else {
      d.innerHTML='<div class="zv-msg-bubble">'+safe+'</div><div class="zv-msg-time">'+now+'</div>'
    }
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

  function wireVoiceCardInput(){
    var inp=g('zv-card-input'),btn=g('zv-card-send')
    if(!inp||!btn)return
    inp.addEventListener('keydown',function(e){
      if(e.key==='Enter'){e.preventDefault();doCardSend()}
    })
    btn.onclick=doCardSend
  }
  function doCardSend(){
    var inp=g('zv-card-input')
    if(!inp||chatBusy)return
    var txt=(inp.value||'').trim()
    if(!txt)return
    inp.value=''
    // Route to chat API (reuses same session)
    appendMsgToCard(txt)
    chatBusy=true
    fetch(GW+'/api/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:TK,agent:AGENT,message:txt,session_id:chatSessionId||undefined,sn_user_id:SN_USER_ID||undefined})
    }).then(function(r){return r.json()}).then(function(d){
      chatSessionId=d.session_id||chatSessionId
      if(d.message)appendMsgToCard(d.message,'agent')
    }).catch(function(){}).finally(function(){chatBusy=false})
  }
  function appendMsgToCard(text,role){
    // Show in voice card sub-text as a lightweight transcript
    var sub=g('zv-sub')
    if(sub)sub.textContent=(role==='agent'?'':'You: ')+text
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
        panel.style.cssText='flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;overflow:hidden'
        // Large orb + overlapping phone button — same design as voice-only card
        panel.innerHTML='<div style="position:relative;margin-bottom:0">'
          +'<div id="zv-orb-lg" class="zvorb" style="width:140px;height:140px;animation:zvhue 6s ease-in-out infinite;display:block"><div id="zv-ring"></div></div>'
          +'<button id="zv-start-tab" style="position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);width:46px;height:46px;border-radius:50%;border:3px solid #fff;background:var(--zvc);cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.2);outline:none;padding:0">'
          +'<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.7-.38 1.06-.2 1.1.37 2.28.57 3.54.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C4.61 21 2 18.39 2 15.23V5a2 2 0 0 1 2-2h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.1.31.03.66-.25 1.02L6.6 10.8z"/></svg>'
          +'</button>'
          +'<button id="zv-end" style="display:none;position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);width:46px;height:46px;border-radius:50%;border:3px solid #fff;background:linear-gradient(135deg,#dc2626,#b91c1c);cursor:pointer;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(220,38,38,.45);outline:none;padding:0">'
          +'<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.7-.38 1.06-.2 1.1.37 2.28.57 3.54.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C4.61 21 2 18.39 2 15.23V5a2 2 0 0 1 2-2h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.1.31.03.66-.25 1.02L6.6 10.8z"/></svg>'
          +'</button>'
          +'</div>'
          +'<div id="zv-wave" style="margin-top:30px"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>'
          +'<div id="zv-status" style="font-size:15px;font-weight:600;color:#111827;margin-top:10px;letter-spacing:-.01em">Tap to start a call</div>'
          +'<div id="zv-sub" style="font-size:12px;color:#9ca3af;margin-top:4px;text-align:center;padding:0 24px;min-height:16px"></div>'
          +'<button id="zv-mute" style="display:none;width:32px;height:32px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;align-items:center;justify-content:center;cursor:pointer;margin-top:8px;outline:none;padding:0">'
          +'<svg id="zv-mon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>'
          +'<svg id="zv-mof" width="14" height="14" style="display:none" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/></svg>'
          +'</button>'
        var cbr=card.querySelector('#zv-chat-br')
        if(cbr)card.insertBefore(panel,cbr)
        else card.appendChild(panel)
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
      var pb=g('zv-phone-btn');if(pb)pb.classList.add('active')
      var ms=g('zv-mute');if(ms)ms.classList.add('show')
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
      var pb=g('zv-phone-btn');if(pb)pb.classList.remove('active')
      var ms=g('zv-mute');if(ms)ms.classList.remove('show','on')
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
