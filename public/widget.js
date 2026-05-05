/**
 * ZeVox — Voice Widget with AudioWorklet streaming playback
 * <script>window.ZEVOX_TOKEN="sk_live_...";</script>
 * <script src="https://app.zevox.com/widget.js"></script>
 */
(function(){
  var sc=document.currentScript||document.querySelector('script[data-token]')
  var TK=(window.ZeVoxConfig&&window.ZeVoxConfig.token)||window.ZEVOX_TOKEN||(sc&&sc.getAttribute('data-token'))||''
  var GW=(window.ZeVoxConfig&&window.ZeVoxConfig.gateway)||(sc&&sc.src?new URL(sc.src).origin:'')||'https://sn-voice-saas.onrender.com'
  if(!TK){console.error('[ZeVox] No token');return}
  if(window.__zv)return;window.__zv=true

  // ── Detect the end-user's ServiceNow sys_id ──
  // When embedded inside ServiceNow (Service Portal, Workspace, etc.) we want
  // tickets to be created with the actual end-user as the caller, not the
  // workspace owner whose credentials configured the agent. We check several
  // SN-injected globals in priority order, and accept a manual override.
  function getSnUserId(){
    try{
      if(typeof window.ZEVOX_USER_ID==='string'&&window.ZEVOX_USER_ID)return window.ZEVOX_USER_ID
      if(window.ZeVoxConfig&&window.ZeVoxConfig.userId)return window.ZeVoxConfig.userId
      if(window.g_user&&window.g_user.userID)return window.g_user.userID  // Service Portal client script
      if(window.NOW&&window.NOW.user&&window.NOW.user.userID)return window.NOW.user.userID  // Workspace
      if(window.NOW&&window.NOW.user_id)return window.NOW.user_id  // Older SN
    }catch(e){}
    return ''
  }
  var SN_USER_ID=getSnUserId()
  if(SN_USER_ID)console.log('[ZeVox] End-user sys_id detected:',SN_USER_ID)

  var C={color:'#10b981',pos:'right',name:'',brand:true,logo:'',radius:'full'}
  var ws,micCtx,micStr,micP,active=false,muted=false

  // ── Navigation tab queue (popup-blocker fallback) ──
  // window.open from an async WS handler often loses transient activation, so
  // the browser blocks it. We open what we can immediately, queue the rest, and
  // flush on the next user click anywhere on the widget.
  var pendingNavUrls=[]

  // Detect which portal the widget was loaded inside, so the agent builds
  // /sp vs /esc URLs correctly. Falls back to '' (platform UI / not in portal).
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

  // Resolve a tool-supplied URL. Absolute http(s) URLs pass through; relative
  // paths are joined to window.location.origin (which is the SN instance when
  // the widget is embedded in the portal).
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
      try{w=window.open(resolveUrl(u.url),'_blank','noopener')}catch(e){}
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
    queue.forEach(function(u){try{window.open(resolveUrl(u.url),'_blank','noopener')}catch(e){}})
  }

  // ── AudioWorklet for smooth streaming playback ──
  var playCtx,workletNode,workletReady=false

  // Inline AudioWorklet processor — unbounded FIFO chunk queue.
  // Replaces an earlier 10-second ring buffer that would overwrite itself when
  // multi-sentence responses produced more audio than the buffer could hold,
  // causing the agent to "speak twice" (replay artifacts) or "stop mid-sentence"
  // (overwritten samples). The queue grows naturally with response length and
  // drains as audio plays.
  var WORKLET_CODE = `
    class ZeVoxPlayer extends AudioWorkletProcessor {
      constructor() {
        super();
        this.queue = [];          // Array<Float32Array> waiting to play
        this.currentChunk = null; // Chunk currently being read
        this.currentPos = 0;      // Read position within currentChunk
        this.port.onmessage = (e) => {
          if (e.data.type === 'audio') {
            // Push the new chunk onto the queue. No overflow possible.
            this.queue.push(e.data.samples);
          } else if (e.data.type === 'clear') {
            // Barge-in: drop everything queued and stop playing the current chunk.
            this.queue = [];
            this.currentChunk = null;
            this.currentPos = 0;
          }
        };
      }
      process(inputs, outputs) {
        const out = outputs[0][0];
        for (let i = 0; i < out.length; i++) {
          // If we ran out of the current chunk, grab the next one from the queue.
          if (!this.currentChunk || this.currentPos >= this.currentChunk.length) {
            if (this.queue.length > 0) {
              this.currentChunk = this.queue.shift();
              this.currentPos = 0;
            } else {
              out[i] = 0; // Silence — nothing queued
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
      console.log('[ZeVox] AudioWorklet ready')
    } catch (e) {
      console.error('[ZeVox] AudioWorklet failed:', e)
      workletReady = false
    }
  }

  function feedAudio(pcmBuffer) {
    if (!workletReady || !workletNode) return
    if (playCtx.state === 'suspended') playCtx.resume()
    // Convert Int16 PCM to Float32
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
    el.innerHTML=`
<style>
#zv{position:fixed;bottom:20px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter','Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
#zv *{box-sizing:border-box}

/* ── Launcher pill (idle state) ── */
/* Soft emerald halo underneath gives the pill a "premium" ZeVox lift without
   making it look like a billboard on corporate SN portals. */
#zv-launcher{display:flex;align-items:center;gap:8px;background:#fff;border-radius:${C.radius==='lg'?'18px':'999px'};padding:6px 6px 6px 8px;box-shadow:0 1px 2px 0 rgba(16,24,40,.06),0 6px 20px -4px rgba(16,185,129,.18),0 0 0 1px rgba(16,24,40,.05);transition:transform .2s,box-shadow .2s}
#zv-launcher:hover{transform:translateY(-1px);box-shadow:0 2px 4px 0 rgba(16,24,40,.08),0 10px 32px -6px rgba(16,185,129,.28),0 0 0 1px rgba(16,24,40,.06)}

/* Launcher orb — breathing gradient with tenant brand color */
#zv-orb{width:36px;height:36px;border-radius:50%;cursor:pointer;border:none;outline:none;padding:0;position:relative;flex-shrink:0;background:radial-gradient(circle at 35% 30%,${C.color},${C.color} 40%,#0d1117 100%);box-shadow:0 0 0 2px ${C.color}26,0 4px 14px ${C.color}66,inset 0 -3px 6px rgba(0,0,0,.3);animation:zvBreathe 2.4s ease-in-out infinite}
#zv-orb::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.45),rgba(255,255,255,0) 50%);pointer-events:none}
#zv-orb img{width:36px;height:36px;object-fit:cover;border-radius:50%;position:relative;z-index:1}
@keyframes zvBreathe{
  0%,100%{box-shadow:0 0 0 2px ${C.color}26,0 4px 14px ${C.color}66,inset 0 -3px 6px rgba(0,0,0,.3)}
  50%{box-shadow:0 0 0 4px ${C.color}33,0 6px 22px ${C.color}88,inset 0 -3px 6px rgba(0,0,0,.3)}
}

/* Start a call CTA pill — uses brand color icon, dark background */
#zv-start{display:flex;align-items:center;gap:8px;height:38px;padding:0 18px 0 14px;border-radius:999px;border:none;outline:none;background:#0d1117;color:#fff;font-size:13.5px;font-weight:500;font-family:inherit;cursor:pointer;white-space:nowrap;transition:background .15s,transform .15s;letter-spacing:-.005em}
#zv-start:hover{background:#1c2128}
#zv-start:active{transform:scale(.97)}
#zv-start svg{width:14px;height:14px;color:${C.color}}

/* ── Active card (open state) ── */
/* Mesh gradient backdrop — emerald + indigo radials echo the landing-page hero.
   Kept at ~6-8% opacity so text legibility is perfect; glass feel without drama. */
#zv-card{display:none;width:340px;background:
  radial-gradient(ellipse 80% 60% at 15% 0%,rgba(16,185,129,.10) 0%,transparent 55%),
  radial-gradient(ellipse 60% 50% at 90% 20%,rgba(99,102,241,.08) 0%,transparent 55%),
  #fff;border-radius:20px;box-shadow:0 0 0 1px rgba(16,185,129,.10),0 12px 48px -8px rgba(16,24,40,.14),0 4px 16px -4px rgba(16,24,40,.08);padding:22px;flex-direction:column;align-items:center;gap:4px;position:relative;overflow:hidden}
#zv-card.on{display:flex;animation:zvCardEntry .45s cubic-bezier(.22,1,.36,1)}
@keyframes zvCardEntry{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}

/* Subtle grid overlay on the card — micro-texture that matches the hero */
#zv-card::before{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(to right,rgba(16,24,40,.025) 1px,transparent 1px),linear-gradient(to bottom,rgba(16,24,40,.025) 1px,transparent 1px);background-size:24px 24px;mask-image:radial-gradient(ellipse 80% 60% at 50% 10%,#000 0%,transparent 70%);-webkit-mask-image:radial-gradient(ellipse 80% 60% at 50% 10%,#000 0%,transparent 70%)}

/* Agent name (optional) — the one place we use text-gradient-brand for a premium touch */
#zv-agent{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;background:linear-gradient(110deg,#34d399 0%,#10b981 45%,#6366f1 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:10px;position:relative;z-index:1}
#zv-agent.hide{display:none}

/* Orb — layered radial glow: emerald core → indigo halo for the "hero in miniature" effect */
#zv-orb-lg{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:10px;position:relative;z-index:1;background:radial-gradient(circle at 35% 30%,${C.color},${C.color} 40%,#0d1117 100%);box-shadow:0 0 0 2px ${C.color}26,0 6px 24px ${C.color}80,0 10px 40px -4px rgba(99,102,241,.26),inset 0 -4px 8px rgba(0,0,0,.3);animation:zvBreathe 2.4s ease-in-out infinite}
#zv-orb-lg::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.4),rgba(255,255,255,0) 55%);pointer-events:none;z-index:2}
#zv-orb-lg img{width:60px;height:60px;object-fit:cover;border-radius:50%;position:relative;z-index:1}
#zv-ring{position:absolute;inset:-6px;border-radius:50%;border:2px solid ${C.color}55;opacity:0;transition:opacity .3s;z-index:0}
#zv-ring.on{opacity:1;animation:zvR 2s ease-in-out infinite}
@keyframes zvR{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.08);opacity:.95}}

/* Waveform — ZeVox signature, ties widget visual language to dashboard + hero.
   Idle: still, low amplitude. Active (listening/speaking): bars animate.
   Using brand color with slight opacity so it never overpowers the orb. */
#zv-wave{display:flex;gap:3px;align-items:center;height:18px;margin-bottom:8px;opacity:.55;position:relative;z-index:1}
#zv-wave span{display:block;width:3px;border-radius:2px;background:${C.color};transform-origin:center;transform:scaleY(.4)}
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
#zv-br a:hover{color:${C.color}}

/* ── Attachment request banner ── */
#zv-attach{display:none;width:100%;margin-top:14px;padding:12px;border-radius:12px;background:${C.color}14;border:1px solid ${C.color}33;text-align:left;position:relative;z-index:1;animation:zvFadeUp .35s cubic-bezier(.22,1,.36,1)}
#zv-attach.on{display:block}
#zv-attach.done{background:#10b98114;border-color:#10b98133}
#zv-attach-title{font-size:12px;font-weight:600;color:#0d1117;margin-bottom:2px}
#zv-attach-reason{font-size:11px;color:#6b7280;margin-bottom:10px;line-height:1.4}
#zv-attach-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:8px 12px;border-radius:8px;background:#0d1117;color:#fff;font-size:12px;font-weight:500;cursor:pointer;border:none;text-decoration:none;font-family:inherit;transition:background .15s}
#zv-attach-btn:hover{background:#1c2128}
#zv-attach-btn svg{width:12px;height:12px}
#zv-attach-status{font-size:11px;color:#10b981;font-weight:500;display:flex;align-items:center;gap:4px}
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
    document.body.appendChild(el)

    // Any click inside the widget counts as a fresh user gesture — flush any
    // navigation URLs that were popup-blocked when the agent's response arrived.
    el.addEventListener('click',flushPendingNav,true)

    var launcher=g('zv-launcher'),orb=g('zv-orb'),root=g('zv'),card=g('zv-card'),orbLg=g('zv-orb-lg')
    root.style[C.pos==='left'?'left':'right']='20px'
    if(C.pos==='left'){card.style.position='absolute';card.style.bottom='0';card.style.left='0'}

    // Logo override — replace the orb with the customer's logo image (both states).
    // We override background to white and disable the breathing animation so the logo
    // displays cleanly without the brand-color glow competing with it.
    if(C.logo){
      orb.innerHTML='<img src="'+C.logo+'"/>'
      orb.style.background='#fff';orb.style.animation='none';orb.style.boxShadow='0 2px 10px rgba(0,0,0,.1)'
      orbLg.innerHTML='<div id="zv-ring"></div><img src="'+C.logo+'"/>'
      orbLg.style.background='#f5f5f5';orbLg.style.animation='none';orbLg.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'
    }

    g('zv-br').innerHTML=C.brand?'Powered by <a href="https://sn-voice-saas.onrender.com" target="_blank">ZeVox</a>':''

    // Agent name header — only shown if configured, renders with the brand gradient
    if(C.name){
      var agentEl=g('zv-agent')
      if(agentEl){agentEl.textContent=C.name;agentEl.className=''}
    }

    // Both the orb and the start button trigger the call
    orb.onclick=startCall
    g('zv-start').onclick=startCall
    g('zv-end').onclick=endCall
    g('zv-mute').onclick=toggleMute
  }

  function g(id){return document.getElementById(id)}

  // ── Attachment request UI ──
  // The agent has called request_attachment. Surface a panel with a link that
  // opens the upload page in a new tab. After upload, the agent is notified
  // server-side so we don't need to poll — the LLM will speak about the file
  // on its next turn. We still flip to a "Uploaded" state when the user opens
  // the upload tab so they get visible confirmation.
  function showAttachmentRequest(url,reason){
    var box=g('zv-attach');if(!box)return
    var safeReason=(reason||'a file').toString().replace(/[<>&"']/g,'')
    box.className='on'
    box.innerHTML=''
      +'<div id="zv-attach-title">Share a file</div>'
      +'<div id="zv-attach-reason">The agent has asked for '+safeReason+'. Tap below to open a secure upload page.</div>'
      +'<a id="zv-attach-btn" href="'+url+'" target="_blank" rel="noopener">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
      +'Open upload page</a>'
  }
  function resetAttachmentUI(){
    var box=g('zv-attach');if(!box)return
    box.className='';box.innerHTML=''
  }
  function setSt(main,sub){g('zv-status').textContent=main;g('zv-sub').textContent=sub||''}
  function setRing(on){var r=g('zv-ring');if(r)r.className=on?'on':''}
  // Waveform follows the agent's voice state — animates on listening/speaking,
  // still during connecting/thinking. Gives the widget a continuous visual pulse
  // that matches the dashboard .zvx-wave and the landing page hero bars.
  function setWave(on){var w=g('zv-wave');if(w)w.className=on?'on':''}

  function startMic(){return navigator.mediaDevices.getUserMedia({audio:{channelCount:1,sampleRate:16000,echoCancellation:true,noiseSuppression:true}}).then(function(s){micCtx=new(window.AudioContext||window.webkitAudioContext)({sampleRate:16000});micStr=s;var src=micCtx.createMediaStreamSource(s);micP=micCtx.createScriptProcessor(4096,1,1);micP.onaudioprocess=function(e){if(ws&&ws.readyState===1&&!muted){var f=e.inputBuffer.getChannelData(0),i=new Int16Array(f.length);for(var j=0;j<f.length;j++)i[j]=Math.max(-32768,Math.min(32767,Math.round(f[j]*32767)));ws.send(i.buffer)}};src.connect(micP);micP.connect(micCtx.destination)})}
  function stopMic(){if(micP){micP.disconnect();micP=null}if(micStr){micStr.getTracks().forEach(function(t){t.stop()});micStr=null}if(micCtx){micCtx.close();micCtx=null}}
  function toggleMute(){muted=!muted;g('zv-mute').className=muted?'on':'';g('zv-mon').style.display=muted?'none':'block';g('zv-mof').style.display=muted?'block':'none'}

  async function startCall(){
    if(active)return
    active=true;muted=false
    g('zv-launcher').style.display='none'
    g('zv-card').classList.add('on')
    setSt('Connecting...','')

    // Init AudioWorklet for smooth playback
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
        if(ev.data instanceof ArrayBuffer){
          // Feed PCM directly to AudioWorklet ring buffer — smooth continuous playback
          feedAudio(ev.data)
          return
        }
        try{var m=JSON.parse(ev.data)
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

  // Immediate close — used when the user hangs up themselves. Drops anything queued.
  function endCall(){
    console.log('[ZeVox] endCall (immediate)')
    try{if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'stop'}));ws.close()}}catch(e){}
    ws=null;stopMic();clearAudio();active=false;muted=false;setRing(false);setWave(false)
    pendingNavUrls=[]
    g('zv-card').classList.remove('on');resetAttachmentUI()
    g('zv-launcher').style.display='flex'
  }

  // Graceful close — used when the SERVER ends the call (closing message, error
  // fallback, etc.). The agent's last words are still in flight: bytes may still
  // be arriving over the WS, and the AudioWorklet queue may still have audio to
  // play. We must NOT call clearAudio() until that audio has actually played, or
  // the user hears nothing and the call just dies.
  //
  // Strategy:
  //   1. Stop the mic immediately (no more user input)
  //   2. Stop the pulsing ring, show "Call ending..." status
  //   3. Wait a grace period (long enough for typical fallback messages to drain)
  //   4. Then close the WS, clear audio, return to launcher
  function endCallGraceful(){
    if(!active)return
    console.log('[ZeVox] endCall (graceful)')
    active=false  // No more user input — but DO NOT touch the audio queue
    stopMic()
    setRing(false)
    setWave(false)
    setSt('Call ending...','')
    // 6s grace period — covers ~15 words of fallback message at typical TTS rate
    // (24kHz × 2 bytes × ~3 seconds of audio for the fallback, plus network buffer)
    setTimeout(function(){
      try{if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'stop'}));ws.close()}}catch(e){}
      ws=null
      clearAudio()
      muted=false
      g('zv-card').classList.remove('on');resetAttachmentUI()
      g('zv-launcher').style.display='flex'
    },6000)
  }
})()
