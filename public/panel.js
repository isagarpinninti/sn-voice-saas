/**
 * ZeVox Workspace Panel
 * Embedded sidebar panel for ServiceNow Agent Workspace / Next Experience.
 * Loaded inside an <iframe> by the ZeVox SN Update Set.
 *
 * URL params: token, table, sys_id, agent (optional)
 * postMessage API: { type:'zevox_record', table, sys_id, display }
 */
(function(){
  var params=new URLSearchParams(window.location.search)
  var TK=params.get('token')||window.ZEVOX_TOKEN||''
  var AGENT=params.get('agent')||window.ZEVOX_AGENT||''
  var GW=params.get('gw')||(window.location.origin)||'https://zevox.onrender.com'
  var recordTable=params.get('table')||''
  var recordSysId=params.get('sys_id')||''
  var recordDisplay=params.get('display')||''
  if(!TK){document.body.innerHTML='<p style="padding:16px;color:#ef4444;font-size:13px">ZeVox: missing token</p>';return}

  var C={color:'#059669',name:'ZeVox AI',brand:true,logo:'',mode:'both',greeting:''}

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

  fetch(GW+'/api/widget/config?token='+TK+'&_t='+Date.now()+(AGENT?'&agent='+encodeURIComponent(AGENT):'')).then(function(r){return r.json()}).then(function(c){
    if(c.color)C.color=c.color
    if(c.agentName)C.name=c.agentName
    if(c.showBranding===false)C.brand=false
    if(c.logoUrl)C.logo=c.logoUrl
    if(c.widgetMode)C.mode=c.widgetMode
    if(c.greeting)C.greeting=c.greeting
  }).catch(function(){}).finally(build)

  function injectCSS(){
    var s=document.createElement('style')
    s.textContent=`
*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;-webkit-font-smoothing:antialiased}
html,body{height:100%;background:#fff;overflow:hidden}
#zvp{display:flex;flex-direction:column;height:100vh;background:#fff;--zvc:#059669}

/* Orb */
.zvorb{border-radius:50%!important;position:relative!important;overflow:hidden!important;flex-shrink:0!important;aspect-ratio:1/1!important;
  background:conic-gradient(from 200deg at 50% 50%,#a0b8e8 0deg,#c0b8f8 50deg,#dcd0ff 90deg,#c4d4f8 140deg,#a8c0f0 180deg,#b0acf0 230deg,#ccc4fc 270deg,#b8d0f8 310deg,#a0b8e8 360deg)!important}
.zvorb::after{content:''!important;position:absolute!important;inset:0!important;border-radius:50%!important;pointer-events:none!important;
  background:repeating-radial-gradient(circle at 50% 50%,rgba(255,255,255,0) 0px,rgba(255,255,255,0) 7px,rgba(255,255,255,.22) 8px,rgba(255,255,255,0) 9px),radial-gradient(ellipse at 30% 26%,rgba(255,255,255,.96) 0%,rgba(255,255,255,.35) 20%,transparent 46%)!important}
@keyframes zvhue{0%{filter:hue-rotate(0deg) brightness(1)}50%{filter:hue-rotate(15deg) brightness(1.04)}100%{filter:hue-rotate(0deg) brightness(1)}}
@keyframes zvwave{0%,100%{transform:scaleY(.2)}50%{transform:scaleY(1)}}
@keyframes zvdot{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}
@keyframes zvring{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.06);opacity:.8}}

/* Header */
#zvp-hdr{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #f3f4f6;flex-shrink:0;background:#fff}
#zvp-hdr-orb{width:32px;height:32px;animation:zvhue 6s ease-in-out infinite}
#zvp-hdr-info{flex:1;min-width:0}
#zvp-hdr-name{font-size:13px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#zvp-hdr-st{font-size:11px;color:var(--zvc);display:flex;align-items:center;gap:4px;margin-top:1px}
#zvp-hdr-st::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--zvc)}

/* Record context bar */
#zvp-record{display:none;align-items:center;gap:6px;padding:6px 14px;background:#f8fafc;border-bottom:1px solid #f1f5f9;flex-shrink:0}
#zvp-record.on{display:flex}
#zvp-record-icon{width:14px;height:14px;color:#64748b;flex-shrink:0}
#zvp-record-text{font-size:11.5px;color:#475569;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* Tabs */
#zvp-tabs{display:flex;border-bottom:1px solid #f3f4f6;flex-shrink:0;background:#fff}
.zvp-tab{flex:1;padding:9px 8px;font-size:12px;font-weight:500;color:#9ca3af;border:none;border-bottom:2px solid transparent;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:color .15s;outline:none}
.zvp-tab svg{width:12px;height:12px}
.zvp-tab.active{color:var(--zvc);border-bottom-color:var(--zvc)}

/* Voice panel */
#zvp-voice{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:24px 16px;overflow:hidden}
#zvp-orb-wrap{position:relative;width:140px;height:140px;display:flex;align-items:center;justify-content:center}
#zvp-orb-lg{width:140px;height:140px;animation:zvhue 6s ease-in-out infinite}
#zvp-ring{position:absolute;inset:-10px;border-radius:50%;border:2px solid rgba(52,211,153,.5);opacity:0;pointer-events:none;transition:opacity .3s}
#zvp-ring.on{opacity:1;animation:zvring 2s ease-in-out infinite}
#zvp-phone-btn{position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);width:48px;height:48px;border-radius:50%;background:var(--zvc);border:3px solid #fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.18);z-index:3;outline:none;transition:transform .15s,background .15s}
#zvp-phone-btn:hover{transform:translateX(-50%) scale(1.08)}
#zvp-phone-btn.active{background:linear-gradient(135deg,#dc2626,#b91c1c);box-shadow:0 4px 16px rgba(220,38,38,.4)}
#zvp-phone-btn svg{width:20px;height:20px;fill:#fff;pointer-events:none}
#zvp-wave{display:flex;gap:3px;align-items:center;height:28px;margin-top:32px;opacity:0;transition:opacity .3s}
#zvp-wave.on{opacity:1}
#zvp-wave span{display:block;width:3px;border-radius:3px;background:var(--zvc);transform-origin:center;transform:scaleY(.2)}
#zvp-wave.on span{animation:zvwave 1.2s ease-in-out infinite}
#zvp-wave span:nth-child(1){height:10px;animation-delay:-.18s}
#zvp-wave span:nth-child(2){height:16px;animation-delay:-.45s}
#zvp-wave span:nth-child(3){height:24px;animation-delay:-.72s}
#zvp-wave span:nth-child(4){height:28px;animation-delay:0s}
#zvp-wave span:nth-child(5){height:24px;animation-delay:-.3s}
#zvp-wave span:nth-child(6){height:16px;animation-delay:-.6s}
#zvp-wave span:nth-child(7){height:10px;animation-delay:-.9s}
#zvp-status{font-size:14px;font-weight:600;color:#111827;margin-top:10px;letter-spacing:-.01em;text-align:center}
#zvp-mute{display:none;width:30px;height:30px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;align-items:center;justify-content:center;cursor:pointer;margin-top:10px;outline:none}
#zvp-mute.show{display:flex}
#zvp-mute.on{background:#ef4444;border-color:#ef4444}
#zvp-mute svg{width:13px;height:13px;stroke:#6b7280}
#zvp-mute.on svg{stroke:#fff}

/* Chat panel */
#zvp-chat{flex:1;display:none;flex-direction:column;overflow:hidden}
#zvp-chat.on{display:flex}
#zvp-msgs{flex:1!important;overflow-y:auto!important;padding:12px 10px!important;display:flex!important;flex-direction:column!important;gap:8px!important;min-height:0!important;scroll-behavior:smooth}
#zvp-msgs::-webkit-scrollbar{width:4px}
#zvp-msgs::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:4px}
.zvm{max-width:85%!important;display:flex!important;flex-direction:column!important;gap:2px!important}
.zvm.user{align-self:flex-end!important;align-items:flex-end!important}
.zvm.agent{align-self:flex-start!important;align-items:flex-start!important}
.zvm-row{display:flex!important;align-items:flex-end!important;gap:5px!important}
.zvm-av{width:22px!important;height:22px!important;flex-shrink:0!important;border-radius:50%!important}
.zvm-av.zvorb{animation:zvhue 6s ease-in-out infinite!important}
.zvm-bub{padding:8px 12px!important;border-radius:16px!important;font-size:13px!important;line-height:1.5!important;word-break:break-word!important;display:block!important;margin:0!important}
.zvm.user .zvm-bub{background:var(--zvc)!important;color:#fff!important;border-bottom-right-radius:4px!important}
.zvm.agent .zvm-bub{background:#f3f4f6!important;color:#111827!important;border-bottom-left-radius:4px!important}
.zvm-time{font-size:10px!important;color:#d1d5db!important;padding:0 2px!important}
#zvp-typing{display:none;align-self:flex-start;padding:8px 12px;background:#f3f4f6;border-radius:16px;border-bottom-left-radius:4px;gap:4px}
#zvp-typing.show{display:flex}
#zvp-typing span{width:5px;height:5px;border-radius:50%;background:#c4c4c4;animation:zvdot 1.4s ease-in-out infinite}
#zvp-typing span:nth-child(2){animation-delay:.16s}
#zvp-typing span:nth-child(3){animation-delay:.32s}

/* Input */
#zvp-inp-wrap{padding:8px 10px;border-top:1px solid #f3f4f6;flex-shrink:0;background:#fff}
#zvp-inp-inner{display:flex;align-items:center;border:1.5px solid #e5e7eb;border-radius:12px;background:#f9fafb;overflow:hidden;transition:border-color .15s}
#zvp-inp-inner:focus-within{border-color:var(--zvc);background:#fff}
#zvp-inp{flex:1;border:none;background:transparent;padding:9px 12px;font-size:13px;outline:none;resize:none;color:#111827;max-height:80px;overflow-y:auto}
#zvp-inp::placeholder{color:#9ca3af}
#zvp-send{width:30px;height:30px;border:none;background:transparent;color:#9ca3af;display:flex;align-items:center;justify-content:center;cursor:pointer;margin-right:3px;flex-shrink:0;transition:color .15s}
#zvp-send:hover{color:var(--zvc)}
#zvp-send:disabled{opacity:.35;cursor:default}
#zvp-send svg{width:13px;height:13px}

/* Footer */
#zvp-footer{font-size:10px;color:#d1d5db;text-align:center;padding:4px 0 6px;flex-shrink:0}
#zvp-footer a{color:#9ca3af;text-decoration:none}
`
    document.head.appendChild(s)
  }

  var PHONE_SVG='<svg viewBox="0 0 24 24" fill="#fff"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.7-.38 1.06-.2 1.1.37 2.28.57 3.54.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C4.61 21 2 18.39 2 15.23V5a2 2 0 0 1 2-2h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.1.31.03.66-.25 1.02L6.6 10.8z"/></svg>'
  var SEND_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
  var VOICE_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
  var CHAT_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
  var RECORD_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'

  function build(){
    injectCSS()
    var isVoice=(C.mode==='voice_only'||C.mode==='both')
    var isChat=(C.mode==='chat_only'||C.mode==='both')
    var isBoth=(C.mode==='both')

    var el=document.createElement('div');el.id='zvp'
    el.innerHTML=[
      // Header
      '<div id="zvp-hdr">',
        '<div id="zvp-hdr-orb" class="zvorb"></div>',
        '<div id="zvp-hdr-info">',
          '<div id="zvp-hdr-name">'+(C.name||'ZeVox AI')+'</div>',
          '<div id="zvp-hdr-st">Online</div>',
        '</div>',
      '</div>',
      // Record bar
      '<div id="zvp-record">',
        '<svg id="zvp-record-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        '<span id="zvp-record-text"></span>',
      '</div>',
      // Tabs (only in both mode)
      isBoth ? '<div id="zvp-tabs"><button class="zvp-tab active" id="zvp-tab-voice">'+VOICE_SVG+'Voice</button><button class="zvp-tab" id="zvp-tab-chat">'+CHAT_SVG+'Chat</button></div>' : '',
      // Voice panel
      isVoice ? [
        '<div id="zvp-voice">',
          '<div id="zvp-orb-wrap">',
            '<div id="zvp-orb-lg" class="zvorb"><div id="zvp-ring"></div></div>',
            '<button id="zvp-phone-btn">'+PHONE_SVG+'</button>',
          '</div>',
          '<div id="zvp-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>',
          '<div id="zvp-status"></div>',
          '<button id="zvp-mute"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg></button>',
        '</div>',
      ].join('') : '',
      // Chat panel
      isChat ? [
        '<div id="zvp-chat"'+(isVoice?'':' class="on"')+'>',
          '<div id="zvp-msgs"><div id="zvp-typing"><span></span><span></span><span></span></div></div>',
          '<div id="zvp-inp-wrap">',
            '<div id="zvp-inp-inner">',
              '<textarea id="zvp-inp" placeholder="Type a message..." rows="1"></textarea>',
              '<button id="zvp-send">'+SEND_SVG+'</button>',
            '</div>',
          '</div>',
        '</div>',
      ].join('') : '',
      // Footer
      C.brand ? '<div id="zvp-footer">Powered by <a href="https://zevox.onrender.com" target="_blank">ZeVox</a></div>' : '<div id="zvp-footer"></div>',
    ].join('')

    document.body.appendChild(el)
    el.style.setProperty('--zvc', C.color)

    if(C.logo){
      var ho=g('zvp-hdr-orb');if(ho){ho.innerHTML='<img src="'+C.logo+'" style="width:32px;height:32px;border-radius:50%;object-fit:cover"/>';ho.classList.remove('zvorb');ho.style.animation='none'}
      var lo=g('zvp-orb-lg');if(lo){lo.innerHTML='<div id="zvp-ring"></div><img src="'+C.logo+'" style="width:140px;height:140px;border-radius:50%;object-fit:cover;position:relative;z-index:1"/>';lo.classList.remove('zvorb');lo.style.animation='none'}
    }

    // Wire tabs
    if(isBoth){
      var tv=g('zvp-tab-voice');if(tv)tv.onclick=showVoice
      var tc=g('zvp-tab-chat');if(tc)tc.onclick=showChat
    }

    // Wire voice
    if(isVoice){
      var pb=g('zvp-phone-btn');if(pb)pb.onclick=function(){if(active)endCall();else startCall()}
      var mb=g('zvp-mute');if(mb)mb.onclick=toggleMute
    }

    // Wire chat input
    if(isChat){
      var inp=g('zvp-inp'),snd=g('zvp-send')
      if(inp){
        inp.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend()}})
        inp.addEventListener('input',function(){inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,80)+'px'})
      }
      if(snd)snd.onclick=doSend
      if(C.greeting)setTimeout(function(){appendMsg('agent',C.greeting)},300)
    }

    // Show initial record context if in URL
    if(recordTable&&recordSysId)updateRecord(recordTable,recordSysId,recordDisplay)

    // In voice-only mode, default to voice panel visible
    if(isVoice&&!isBoth){var vp=g('zvp-voice');if(vp)vp.style.display='flex'}
  }

  // ── Tab switching ────────────────────────────────────────────────────────
  var voiceActive=true

  function showVoice(){
    voiceActive=true
    var tv=g('zvp-tab-voice'),tc=g('zvp-tab-chat');if(tv)tv.className='zvp-tab active';if(tc)tc.className='zvp-tab'
    var vp=g('zvp-voice'),cp=g('zvp-chat')
    if(vp)vp.style.setProperty('display','flex','important')
    if(cp)cp.style.setProperty('display','none','important')
  }
  function showChat(){
    voiceActive=false
    var tv=g('zvp-tab-voice'),tc=g('zvp-tab-chat');if(tv)tv.className='zvp-tab';if(tc)tc.className='zvp-tab active'
    var vp=g('zvp-voice'),cp=g('zvp-chat')
    if(vp)vp.style.setProperty('display','none','important')
    if(cp)cp.style.setProperty('display','flex','important')
    if(active)endCall()
    var inp=g('zvp-inp');if(inp)setTimeout(function(){inp.focus()},100)
  }

  // ── Record context ───────────────────────────────────────────────────────
  function updateRecord(table,sysId,display){
    recordTable=table;recordSysId=sysId
    var bar=g('zvp-record'),txt=g('zvp-record-text')
    if(!bar||!txt)return
    if(table&&sysId){
      txt.textContent=display||(table+' / '+sysId)
      bar.className='on'
    } else {
      bar.className=''
    }
  }

  // Listen for postMessage from SN parent page
  window.addEventListener('message',function(ev){
    try{
      var d=ev.data
      if(d&&d.type==='zevox_record'){
        updateRecord(d.table||'',d.sys_id||'',d.display||'')
      }
    }catch(e){}
  })

  // ── Chat ─────────────────────────────────────────────────────────────────
  var chatSessionId='',chatBusy=false

  function doSend(){
    var inp=g('zvp-inp')
    if(!inp||chatBusy)return
    var txt=(inp.value||'').trim()
    if(!txt)return
    inp.value='';inp.style.height='auto'
    appendMsg('user',txt)
    chatBusy=true;setSendEnabled(false);showTyping(true);scrollMsgs()
    fetch(GW+'/api/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:TK,agent:AGENT,message:txt,session_id:chatSessionId||undefined,record_table:recordTable||undefined,record_sys_id:recordSysId||undefined})
    }).then(function(r){return r.json()}).then(function(d){
      chatSessionId=d.session_id||chatSessionId
      showTyping(false)
      if(d.message)appendMsg('agent',d.message)
      else if(d.error)appendMsg('agent','Sorry, something went wrong.')
    }).catch(function(){showTyping(false);appendMsg('agent','Sorry, I couldn\'t connect. Please try again.')
    }).finally(function(){chatBusy=false;setSendEnabled(true);var i=g('zvp-inp');if(i)i.focus()})
  }

  function appendMsg(role,text){
    var msgs=g('zvp-msgs');if(!msgs)return
    var now=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
    var d=document.createElement('div');d.className='zvm '+role
    var safe=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')
    if(role==='agent'){
      var av=C.logo?'<img class="zvm-av" src="'+C.logo+'" style="object-fit:cover"/>':'<div class="zvm-av zvorb" style="animation:zvhue 6s ease-in-out infinite"></div>'
      d.innerHTML='<div class="zvm-row">'+av+'<div class="zvm-bub">'+safe+'</div></div><div class="zvm-time">'+now+'</div>'
    } else {
      d.innerHTML='<div class="zvm-bub">'+safe+'</div><div class="zvm-time">'+now+'</div>'
    }
    var typing=g('zvp-typing');if(typing)msgs.insertBefore(d,typing);else msgs.appendChild(d)
    scrollMsgs()
  }

  function scrollMsgs(){var m=g('zvp-msgs');if(m)setTimeout(function(){m.scrollTop=m.scrollHeight},50)}
  function showTyping(on){var t=g('zvp-typing');if(t)t.className=on?'show':'';scrollMsgs()}
  function setSendEnabled(on){var b=g('zvp-send');if(b)b.disabled=!on}

  // ── Voice ────────────────────────────────────────────────────────────────
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
    var mb=g('zvp-mute');if(mb)mb.className='show'+(muted?' on':'')
    var svgs=mb?mb.querySelectorAll('svg'):[]
    if(svgs.length>0){svgs[0].style.display=muted?'none':'block';if(svgs[1])svgs[1].style.display=muted?'block':'none'}
  }

  async function startCall(){
    if(active)return
    active=true;muted=false
    var pb=g('zvp-phone-btn');if(pb)pb.classList.add('active')
    var ms=g('zvp-mute');if(ms)ms.classList.add('show')
    setSt('Connecting...')
    await initAudioWorklet()
    try{
      var wsUrl=GW.replace(/^http/,'ws')+'/voice?token='+encodeURIComponent(TK)
      ws=new WebSocket(wsUrl);ws.binaryType='arraybuffer'
      ws.onopen=function(){
        ws.send(JSON.stringify({type:'start',originPortal:'workspace',table:recordTable||undefined,sysId:recordSysId||undefined}))
        startMic().catch(function(){setSt('Mic unavailable')})
      }
      ws.onmessage=function(ev){
        if(ev.data instanceof ArrayBuffer){feedAudio(ev.data);return}
        try{
          var m=JSON.parse(ev.data)
          if(m.type==='ready'){setSt('Listening...');setRing(true);setWave(true)}
          else if(m.type==='state'){
            if(m.state==='listening'){setSt('Listening...');setRing(true);setWave(true)}
            else if(m.state==='speaking'){setSt('Speaking...');setRing(true);setWave(true)}
            else if(m.state==='processing'){setSt('Thinking...');setRing(false);setWave(false)}
          }
          else if(m.type==='barge_in')clearAudio()
          else if(m.type==='agent_message'&&m.text){
            // Show agent voice transcript in chat tab
            appendMsg('agent',m.text)
          }
          else if(m.type==='user_message'&&m.text){appendMsg('user',m.text)}
          else if(m.type==='error'){setSt('Error: '+m.message);endCallGraceful()}
          else if(m.type==='ended')endCallGraceful()
        }catch(e){}
      }
      ws.onclose=function(ev){if(active&&ev.code!==1000){setSt('Connection lost');setTimeout(function(){if(active)endCall()},2000)}}
    }catch(e){setSt('Failed');setTimeout(endCall,2000)}
  }

  function endCall(){
    try{if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'stop'}));ws.close()}}catch(e){}
    ws=null;stopMic();clearAudio();active=false;muted=false
    setRing(false);setWave(false);setSt('')
    var pb=g('zvp-phone-btn');if(pb)pb.classList.remove('active')
    var ms=g('zvp-mute');if(ms)ms.className=''
  }
  function endCallGraceful(){
    if(!active)return
    active=false;stopMic();setRing(false);setWave(false);setSt('Call ended')
    setTimeout(function(){
      try{if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:'stop'}));ws.close()}}catch(e){}
      ws=null;clearAudio();muted=false;setSt('')
      var pb=g('zvp-phone-btn');if(pb)pb.classList.remove('active')
      var ms=g('zvp-mute');if(ms)ms.className=''
    },4000)
  }

  function setSt(t){var s=g('zvp-status');if(s)s.textContent=t||''}
  function setRing(on){var r=g('zvp-ring');if(r)r.className=on?'on':''}
  function setWave(on){var w=g('zvp-wave');if(w)w.className=on?'on':''}
  function g(id){return document.getElementById(id)}
})()
