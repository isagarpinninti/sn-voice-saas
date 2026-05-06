/**
 * ZeVox — Incident Voice Agent Widget
 * Floating orb on incident forms. Opens a modal with voice conversation,
 * form-field suggestions, resolution notes, and reply suggestions.
 *
 * Usage (ServiceNow UI Page / Widget):
 *   <script>window.VA_TOKEN = "sk_live_...";</script>
 *   <script src="https://zevox.onrender.com/voice-agent-incident-widget.js"></script>
 *
 * Reads incident context from g_form. The agent can suggest field updates,
 * resolution notes, and reply suggestions via built-in tools on the server.
 */
(function () {
  var sc = document.currentScript || document.querySelector('script[data-va-token]');
  var TK = window.VA_TOKEN || (sc && sc.getAttribute('data-va-token')) || '';
  var GW = (window.VA_GATEWAY ||
    (sc && sc.src ? (function (u) { try { return new URL(u).origin; } catch (e) { return ''; } })(sc.src) : '') || ''
  ).replace(/\/+$/, '');

  if (!TK) { console.error('[VA-Incident] No token'); return; }
  if (window.__vaIncident) return;
  window.__vaIncident = true;

  var wsBase = GW.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');

  /* ── g_form helpers ──────────────────────────────────────────────────── */
  // Resolve g_form across frame boundaries.
  // UI Actions run inside the form frame; the widget JS is injected into top.
  // Priority: pre-captured snapshot from UI Action → top.g_form → parent.g_form → window.g_form
  function resolveGForm() {
    try { if (top.g_form && typeof top.g_form.getValue === 'function') return top.g_form; } catch (e) {}
    try { if (parent.g_form && typeof parent.g_form.getValue === 'function') return parent.g_form; } catch (e) {}
    try { if (window.g_form && typeof window.g_form.getValue === 'function') return window.g_form; } catch (e) {}
    return null;
  }

  function readIncidentContext() {
    // UI Action pre-captures g_form data before injecting the script (most reliable)
    try {
      var pre = top.VA_INCIDENT_CONTEXT;
      if (pre && typeof pre === 'object' && pre.number) return pre;
    } catch (e) {}

    var gf = resolveGForm();
    if (!gf) return {};

    var fields = [
      'number', 'short_description', 'description', 'state', 'priority', 'urgency',
      'category', 'subcategory', 'assignment_group', 'assigned_to', 'caller_id',
      'comments', 'work_notes', 'close_notes', 'close_code', 'impact',
      'contact_type', 'opened_at', 'opened_by', 'sys_id'
    ];
    var ctx = {};
    fields.forEach(function (f) {
      try { var v = gf.getValue(f); if (v) ctx[f] = String(v); } catch (e) {}
    });
    return ctx;
  }

  function applyFormUpdate(field, value) {
    // Try pre-captured g_form reference first, then resolve across frames
    var gf = null;
    try { if (top.VA_GFORM && typeof top.VA_GFORM.setValue === 'function') gf = top.VA_GFORM; } catch (e) {}
    if (!gf) gf = resolveGForm();
    if (!gf) return false;
    try { gf.setValue(field, value); return true; } catch (e) { return false; }
  }

  var FIELD_LABELS = {
    number: 'Number', short_description: 'Short Description', description: 'Description',
    state: 'State', priority: 'Priority', urgency: 'Urgency', category: 'Category',
    subcategory: 'Subcategory', assignment_group: 'Assignment Group', assigned_to: 'Assigned To',
    caller_id: 'Caller', comments: 'Comments', work_notes: 'Work Notes',
    close_notes: 'Resolution Notes', impact: 'Impact', contact_type: 'Contact Type',
    opened_at: 'Opened', opened_by: 'Opened By'
  };
  function fl(f) { return FIELD_LABELS[f] || f; }

  /* ── AudioWorklet (identical approach to widget.js) ─────────────────── */
  var playCtx, workletNode, workletReady = false;
  var WORKLET_SRC = [
    'class VoiceIncidentPlayer extends AudioWorkletProcessor {',
    '  constructor(){super();this.q=[];this.cur=null;this.pos=0;',
    '    this.port.onmessage=e=>{',
    '      if(e.data.type==="audio")this.q.push(e.data.s);',
    '      else if(e.data.type==="clear"){this.q=[];this.cur=null;this.pos=0;}',
    '    };',
    '  }',
    '  process(i,o){const out=o[0][0];for(let n=0;n<out.length;n++){',
    '    if(!this.cur||this.pos>=this.cur.length){',
    '      if(this.q.length){this.cur=this.q.shift();this.pos=0;}',
    '      else{out[n]=0;continue;}',
    '    }',
    '    out[n]=this.cur[this.pos++];',
    '  }return true;}',
    '}',
    'registerProcessor("va-incident-player",VoiceIncidentPlayer);'
  ].join('\n');

  async function initAudio() {
    if (workletReady) return;
    try {
      playCtx = new AudioContext({ sampleRate: 24000 });
      var blob = new Blob([WORKLET_SRC], { type: 'application/javascript' });
      var url = URL.createObjectURL(blob);
      await playCtx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      workletNode = new AudioWorkletNode(playCtx, 'va-incident-player');
      workletNode.connect(playCtx.destination);
      workletReady = true;
    } catch (e) { console.error('[VA-Incident] AudioWorklet failed:', e); }
  }

  function feedAudio(buf) {
    if (!workletReady || !workletNode) return;
    if (playCtx.state === 'suspended') playCtx.resume();
    var i16 = new Int16Array(buf);
    var f32 = new Float32Array(i16.length);
    for (var i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
    workletNode.port.postMessage({ type: 'audio', s: f32 });
  }

  function clearAudio() {
    if (workletNode) workletNode.port.postMessage({ type: 'clear' });
  }

  /* ── State ───────────────────────────────────────────────────────────── */
  var ws = null, micCtx = null, micStr = null, micP = null;
  var active = false, muted = false;
  var messages = [];   // { id, role:'user'|'agent', text }
  var suggestions = []; // { type, field?, value, label, applied }
  var pendingTranslateMsgId = null;
  var msgCounter = 0;

  var LANGS = [
    ['en','English'],['es','Spanish'],['fr','French'],['de','German'],
    ['hi','Hindi'],['ar','Arabic'],['zh','Chinese'],['ja','Japanese'],
    ['pt','Portuguese'],['it','Italian'],['ko','Korean'],['nl','Dutch'],['ru','Russian']
  ];

  /* ── CSS ─────────────────────────────────────────────────────────────── */
  var CSS = '#vai-btn{position:fixed;bottom:80px;right:20px;width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;z-index:9998;background:radial-gradient(circle at 35% 30%,#10b981,#10b981 40%,#0d1117 100%);box-shadow:0 0 0 2px #10b98126,0 4px 14px #10b98166,inset 0 -3px 6px rgba(0,0,0,.3);animation:vaiBreathe 2.4s ease-in-out infinite;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'
  + '#vai-btn::after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.45),rgba(255,255,255,0) 50%);pointer-events:none}'
  + '@keyframes vaiBreathe{0%,100%{box-shadow:0 0 0 2px #10b98126,0 4px 14px #10b98166,inset 0 -3px 6px rgba(0,0,0,.3)}50%{box-shadow:0 0 0 5px #10b98133,0 6px 22px #10b98188,inset 0 -3px 6px rgba(0,0,0,.3)}}'
  + '#vai-btn.vai-active{background:radial-gradient(circle at 35% 30%,#ef4444,#ef4444 40%,#0d1117 100%);animation:vaiActive 1s ease-in-out infinite}'
  + '@keyframes vaiActive{0%,100%{box-shadow:0 0 0 2px #ef444426,0 4px 14px #ef444466,inset 0 -3px 6px rgba(0,0,0,.3)}50%{box-shadow:0 0 0 7px #ef444422,0 6px 26px #ef444488,inset 0 -3px 6px rgba(0,0,0,.3)}}'
  + '#vai-btn svg{position:relative;z-index:1}'

  + '#vai-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:none;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'
  + '#vai-overlay.vai-open{display:flex;animation:vaiFadeIn .2s ease}'
  + '@keyframes vaiFadeIn{from{opacity:0}to{opacity:1}}'

  + '#vai-modal{background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.25),0 0 0 1px rgba(0,0,0,.06);width:920px;max-width:calc(100vw - 32px);height:620px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;overflow:hidden;animation:vaiSlide .3s cubic-bezier(.22,1,.36,1)}'
  + '@keyframes vaiSlide{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}'
  + '#vai-modal *{box-sizing:border-box}'

  + '#vai-hdr{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #f0f0f0;background:linear-gradient(135deg,#f0fdf4 0%,#f5f3ff 100%);flex-shrink:0}'
  + '#vai-hdr-orb{width:30px;height:30px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 35% 30%,#10b981,#0d1117 100%);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px #10b98144}'
  + '#vai-hdr-title{font-size:13px;font-weight:700;color:#0d1117;flex:1}'
  + '.vai-hdr-badge{font-size:10px;font-weight:600;border-radius:4px;padding:2px 7px;border:1px solid}'
  + '.vai-hdr-inc{background:#f0fdf4;border-color:#bbf7d0;color:#15803d}'
  + '.vai-hdr-state{background:#f5f3ff;border-color:#ddd6fe;color:#6366f1}'
  + '#vai-close{width:26px;height:26px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:15px;line-height:1;transition:all .15s}'
  + '#vai-close:hover{background:#f9fafb;color:#0d1117}'

  + '#vai-body{display:flex;flex:1;overflow:hidden}'

  + '#vai-details{width:270px;flex-shrink:0;border-right:1px solid #f0f0f0;overflow-y:auto;padding:14px;background:#fafafa}'
  + '#vai-details h3{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px}'
  + '.vai-f{margin-bottom:9px}'
  + '.vai-fl{font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}'
  + '.vai-fv{font-size:12px;color:#0d1117;font-weight:500;word-break:break-word;line-height:1.4}'
  + '.vai-fv.trunc{max-height:54px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}'
  + '.vai-badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700}'
  + '.vai-s-new{background:#dbeafe;color:#1d4ed8}'
  + '.vai-s-prog{background:#fef9c3;color:#854d0e}'
  + '.vai-s-res{background:#dcfce7;color:#166534}'
  + '.vai-s-cls{background:#f3f4f6;color:#6b7280}'
  + '.vai-p1{background:#fee2e2;color:#dc2626}'
  + '.vai-p2{background:#fed7aa;color:#c2410c}'
  + '.vai-p3{background:#fef9c3;color:#92400e}'
  + '.vai-p4{background:#f0fdf4;color:#15803d}'
  + '#vai-refresh{display:flex;align-items:center;gap:4px;font-size:11px;color:#6b7280;cursor:pointer;border:none;background:none;padding:4px 0;margin-top:8px;font-family:inherit;transition:color .15s}'
  + '#vai-refresh:hover{color:#10b981}'

  + '#vai-conv{flex:1;display:flex;flex-direction:column;overflow:hidden}'
  + '#vai-chat{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}'

  + '.vai-msg{display:flex;gap:7px;max-width:88%}'
  + '.vai-msg.user{flex-direction:row-reverse;align-self:flex-end}'
  + '.vai-msg.agent{align-self:flex-start}'
  + '.vai-bubble{padding:8px 11px;border-radius:11px;font-size:13px;line-height:1.5;color:#0d1117;word-break:break-word}'
  + '.vai-msg.user .vai-bubble{background:#0d1117;color:#fff;border-radius:11px 11px 2px 11px}'
  + '.vai-msg.agent .vai-bubble{background:#f3f4f6;border-radius:11px 11px 11px 2px}'
  + '.vai-ico{width:22px;height:22px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-top:3px}'
  + '.vai-msg.agent .vai-ico{background:radial-gradient(circle at 35% 30%,#10b981,#0d1117 100%)}'
  + '.vai-msg.user .vai-ico{background:#e5e7eb;color:#6b7280}'
  + '.vai-tl-btn{font-size:10px;color:#9ca3af;border:1px solid #e5e7eb;background:#fff;border-radius:4px;padding:2px 6px;cursor:pointer;font-family:inherit;margin-top:4px;transition:all .15s;display:inline-flex;align-items:center;gap:3px}'
  + '.vai-tl-btn:hover{border-color:#10b981;color:#10b981}'
  + '.vai-tl-out{font-size:11px;color:#6b7280;font-style:italic;margin-top:4px;border-top:1px solid #e5e7eb;padding-top:4px}'

  + '#vai-interim{padding:2px 14px;font-size:12px;color:#9ca3af;font-style:italic;min-height:18px;flex-shrink:0}'

  + '#vai-sug-panel{border-top:1px solid #f0f0f0;padding:9px 13px;background:#fafafa;flex-shrink:0;max-height:130px;overflow-y:auto;display:none}'
  + '#vai-sug-panel.has-items{display:block}'
  + '#vai-sug-panel h4{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin:0 0 7px}'
  + '#vai-sug-list{display:flex;flex-wrap:wrap;gap:5px}'
  + '.vai-sug{display:inline-flex;align-items:center;gap:5px;border-radius:7px;border:1px solid;padding:5px 9px;font-size:11px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s;max-width:280px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}'
  + '.vai-sug.fu{background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8}'
  + '.vai-sug.fu:hover{background:#dbeafe}'
  + '.vai-sug.rn{background:#f0fdf4;border-color:#bbf7d0;color:#15803d}'
  + '.vai-sug.rn:hover{background:#dcfce7}'
  + '.vai-sug.rp{background:#faf5ff;border-color:#e9d5ff;color:#7c3aed}'
  + '.vai-sug.rp:hover{background:#f3e8ff}'
  + '.vai-sug.done{opacity:.45;cursor:default;pointer-events:none;text-decoration:line-through}'

  + '#vai-ctrl{display:flex;align-items:center;gap:8px;padding:9px 13px;border-top:1px solid #f0f0f0;flex-shrink:0}'
  + '#vai-wave{display:flex;gap:2px;align-items:center;height:16px;opacity:.35}'
  + '#vai-wave.on{opacity:.85}'
  + '#vai-wave span{display:block;width:3px;border-radius:2px;background:#10b981;transform-origin:center;transform:scaleY(.35)}'
  + '#vai-wave.on span{animation:vaiWv 1.3s ease-in-out infinite}'
  + '#vai-wave span:nth-child(1){height:7px;animation-delay:-.2s}'
  + '#vai-wave span:nth-child(2){height:12px;animation-delay:-.5s}'
  + '#vai-wave span:nth-child(3){height:18px;animation-delay:-.8s}'
  + '#vai-wave span:nth-child(4){height:20px;animation-delay:0s}'
  + '#vai-wave span:nth-child(5){height:18px;animation-delay:-.3s}'
  + '#vai-wave span:nth-child(6){height:12px;animation-delay:-.6s}'
  + '#vai-wave span:nth-child(7){height:7px;animation-delay:-.9s}'
  + '@keyframes vaiWv{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}'
  + '#vai-st{font-size:12px;color:#6b7280;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  + '#vai-st.ok{color:#059669;font-weight:500}'
  + '#vai-st.err{color:#dc2626}'
  + '#vai-trwrap{display:flex;align-items:stretch;border:1.5px solid #bfdbfe;border-radius:6px;overflow:hidden}'
  + '#vai-langsel{padding:4px 5px;border:none;border-right:1px solid #bfdbfe;background:#fff;font-size:11px;color:#1e3a5f;outline:none;max-width:86px;cursor:pointer}'
  + '#vai-trbtn{display:flex;align-items:center;gap:3px;padding:4px 9px;border:none;background:#fff;color:#2563eb;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;white-space:nowrap;transition:background .15s}'
  + '#vai-trbtn:hover:not(:disabled){background:#eff6ff}'
  + '#vai-trbtn:disabled{opacity:.4;cursor:default}'
  + '#vai-micbtn{width:38px;height:38px;border-radius:50%;border:2px solid #10b981;background:#fff;color:#059669;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}'
  + '#vai-micbtn:hover:not(:disabled){background:#f0fdf4}'
  + '#vai-micbtn.rec{background:#fef2f2;border-color:#ef4444;color:#dc2626;animation:vaiMicPulse 1.4s ease-in-out infinite}'
  + '#vai-micbtn:disabled{opacity:.4;cursor:default}'
  + '@keyframes vaiMicPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.25)}50%{box-shadow:0 0 0 5px rgba(239,68,68,0)}}'
  + '#vai-mutebtn{width:30px;height:30px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#6b7280;transition:all .15s;flex-shrink:0}'
  + '#vai-mutebtn:hover{background:#f9fafb}'
  + '#vai-mutebtn.on{background:#ef4444;border-color:#ef4444;color:#fff}'
  + '#vai-endbtn{display:flex;align-items:center;gap:5px;padding:6px 13px;border-radius:18px;border:1px solid #e5e7eb;background:#fff;color:#0d1117;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s;flex-shrink:0}'
  + '#vai-endbtn:hover{background:#f9fafb;border-color:#d1d5db}'
  + '#vai-startprompt{display:flex;align-items:center;gap:8px}'
  + '#vai-startbtn{display:flex;align-items:center;gap:6px;padding:7px 16px;border-radius:18px;border:none;background:#0d1117;color:#fff;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;transition:background .15s}'
  + '#vai-startbtn:hover{background:#1c2128}'
  + '#vai-startbtn svg{color:#10b981}'
  + '#vai-hint{font-size:11px;color:#9ca3af}'
  + '#vai-br{font-size:10px;color:#d1d5db;margin-left:auto;flex-shrink:0}'
  + '#vai-br a{color:#9ca3af;text-decoration:none}'
  + '#vai-br a:hover{color:#10b981}'
  + '.vai-toast{position:absolute;bottom:70px;left:50%;transform:translateX(-50%);background:#0d1117;color:#fff;font-size:12px;font-weight:500;padding:7px 14px;border-radius:20px;white-space:nowrap;pointer-events:none;animation:vaiToast 2.8s ease forwards;z-index:10}'
  + '@keyframes vaiToast{0%{opacity:0;transform:translateX(-50%) translateY(6px)}12%{opacity:1;transform:translateX(-50%) translateY(0)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-4px)}}'
  + '.vai-callshow{display:none!important}'
  + '.vai-incall .vai-callshow{display:flex!important}'
  + '.vai-incall #vai-startprompt{display:none!important}'
  + '#vai-chat:empty::after{content:"Voice agent is ready — click Start Voice Session to begin.";display:block;text-align:center;color:#9ca3af;font-size:13px;margin-top:70px;font-style:italic}'
  + '.vai-confirm-wrap{margin-top:7px;display:flex;gap:6px;align-items:center}'
  + '.vai-confirm-lbl{font-size:11px;color:#6b7280;margin-right:2px}'
  + '.vai-cfbtn{padding:4px 13px;border-radius:6px;border:1px solid;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s}'
  + '.vai-cfbtn.yes{background:#dcfce7;border-color:#86efac;color:#166534}'
  + '.vai-cfbtn.yes:hover:not(:disabled){background:#bbf7d0}'
  + '.vai-cfbtn.no{background:#fee2e2;border-color:#fca5a5;color:#dc2626}'
  + '.vai-cfbtn.no:hover:not(:disabled){background:#fecaca}'
  + '.vai-cfbtn:disabled{opacity:.4;cursor:default}';

  /* ── SVG icons ───────────────────────────────────────────────────────── */
  var I = {
    agent: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-1.8L12 2z"/></svg>',
    mic:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>',
    mute:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .34-.03.67-.08 1"/></svg>',
    phone: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 18v3a2 2 0 01-2.18 2A19.79 19.79 0 013.07 9.18 2 2 0 014.11 7h3a2 2 0 011.72 1.83 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11l-1.4 1.36z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    call:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>',
    glob:  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
    ref:   '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>',
    edit:  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>',
    doc:   '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    msg:   '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    user:  '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
  };

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function g(id) { return document.getElementById(id); }

  function stateBadge(state) {
    var map = {'1':['New','s-new'],'2':['In Progress','s-prog'],'3':['On Hold','s-prog'],'6':['Resolved','s-res'],'7':['Closed','s-cls'],'8':['Canceled','s-cls']};
    var info = map[String(state)];
    if (!info) return esc(state || '');
    return '<span class="vai-badge vai-' + info[1] + '">' + info[0] + '</span>';
  }
  function prioBadge(p) {
    var map = {'1':['1 - Critical','p1'],'2':['2 - High','p2'],'3':['3 - Moderate','p3'],'4':['4 - Low','p4']};
    var info = map[String(p)];
    if (!info) return esc(p || '');
    return '<span class="vai-badge vai-' + info[1] + '">' + info[0] + '</span>';
  }

  /* ── Build DOM ───────────────────────────────────────────────────────── */
  function buildLangOpts() {
    return LANGS.map(function (l) {
      return '<option value="' + l[0] + '"' + (l[0] === 'en' ? ' selected' : '') + '>' + l[1] + '</option>';
    }).join('');
  }

  function inject() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var floatBtn = document.createElement('button');
    floatBtn.id = 'vai-btn';
    floatBtn.title = 'ZeVox Incident Agent';
    floatBtn.innerHTML = I.agent;
    document.body.appendChild(floatBtn);
    floatBtn.addEventListener('click', openModal);

    var overlay = document.createElement('div');
    overlay.id = 'vai-overlay';
    overlay.innerHTML = ''
      + '<div id="vai-modal">'
      +   '<div id="vai-hdr">'
      +     '<div id="vai-hdr-orb">' + I.agent + '</div>'
      +     '<div id="vai-hdr-title">ZeVox Incident Agent</div>'
      +     '<span id="vai-hdr-inc" class="vai-hdr-badge vai-hdr-inc"></span>'
      +     '<span id="vai-hdr-state" class="vai-hdr-badge vai-hdr-state"></span>'
      +     '<button id="vai-close" type="button">&#215;</button>'
      +   '</div>'
      +   '<div id="vai-body">'
      +     '<div id="vai-details">'
      +       '<h3>Incident Details</h3>'
      +       '<div id="vai-details-list"></div>'
      +       '<button id="vai-refresh" type="button">' + I.ref + ' Refresh</button>'
      +     '</div>'
      +     '<div id="vai-conv">'
      +       '<div id="vai-chat"></div>'
      +       '<div id="vai-interim"></div>'
      +       '<div id="vai-sug-panel"><h4>Suggested Actions</h4><div id="vai-sug-list"></div></div>'
      +       '<div id="vai-ctrl">'
      +         '<div id="vai-startprompt">'
      +           '<button id="vai-startbtn" type="button">' + I.call + ' Start Voice Session</button>'
      +           '<span id="vai-hint">Ask the AI about this incident</span>'
      +         '</div>'
      +         '<div id="vai-wave" class="vai-callshow"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>'
      +         '<span id="vai-st" class="vai-callshow">Connecting…</span>'
      +         '<div id="vai-trwrap">'
      +           '<select id="vai-langsel">' + buildLangOpts() + '</select>'
      +           '<button id="vai-trbtn" type="button" disabled>' + I.glob + ' Translate</button>'
      +         '</div>'
      +         '<button id="vai-mutebtn" class="vai-callshow" type="button" title="Mute">'
      +           '<svg id="vai-mon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>'
      +           '<svg id="vai-mof" style="display:none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .34-.03.67-.08 1"/></svg>'
      +         '</button>'
      +         '<button id="vai-micbtn" class="vai-callshow" type="button" title="Microphone">' + I.mic + '</button>'
      +         '<button id="vai-endbtn" class="vai-callshow" type="button">' + I.phone + ' End</button>'
      +         '<span id="vai-br">Powered by <a href="https://zevox.onrender.com" target="_blank">ZeVox</a></span>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    g('vai-close').addEventListener('click', closeModal);
    g('vai-refresh').addEventListener('click', renderDetails);
    g('vai-startbtn').addEventListener('click', startCall);
    g('vai-endbtn').addEventListener('click', endCall);
    g('vai-mutebtn').addEventListener('click', toggleMute);
    g('vai-micbtn').addEventListener('click', togglePTT);
    g('vai-trbtn').addEventListener('click', translateLastAgentMessage);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && g('vai-overlay').classList.contains('vai-open')) closeModal();
    });
  }

  /* ── Incident details panel ──────────────────────────────────────────── */
  function renderDetails() {
    var ctx = readIncidentContext();
    var list = g('vai-details-list');
    if (!list) return;

    var incEl = g('vai-hdr-inc');
    var stateEl = g('vai-hdr-state');
    if (incEl) incEl.textContent = ctx.number || '';
    if (stateEl) stateEl.innerHTML = ctx.state ? stateBadge(ctx.state) : '';

    var order = ['short_description','description','state','priority','urgency','caller_id','category','subcategory','assignment_group','assigned_to','comments','work_notes'];
    var html = '';
    order.forEach(function (f) {
      var v = ctx[f]; if (!v) return;
      var rendered;
      if (f === 'state') rendered = stateBadge(v);
      else if (f === 'priority') rendered = prioBadge(v);
      else rendered = '<div class="vai-fv' + (v.length > 80 ? ' trunc' : '') + '">' + esc(v) + '</div>';
      html += '<div class="vai-f"><div class="vai-fl">' + fl(f) + '</div>' + rendered + '</div>';
    });
    list.innerHTML = html || '<div style="font-size:12px;color:#9ca3af;line-height:1.5">No incident data found.<br>Ensure g_form is available.</div>';
  }

  /* ── Modal open/close ────────────────────────────────────────────────── */
  function openModal() {
    renderDetails();
    g('vai-overlay').classList.add('vai-open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    g('vai-overlay').classList.remove('vai-open');
    document.body.style.overflow = '';
  }

  function addToast(text) {
    var modal = g('vai-modal');
    if (!modal) return;
    var t = document.createElement('div');
    t.className = 'vai-toast';
    t.textContent = text;
    modal.style.position = 'relative';
    modal.appendChild(t);
    setTimeout(function () { try { modal.removeChild(t); } catch (e) {} }, 3000);
  }

  /* ── Messages ────────────────────────────────────────────────────────── */
  function addMessage(role, text) {
    var id = 'vai-m' + (++msgCounter);
    messages.push({ id: id, role: role, text: text });
    var chat = g('vai-chat');
    if (!chat) return id;
    var div = document.createElement('div');
    div.id = id;
    div.className = 'vai-msg ' + role;
    var ico = role === 'agent'
      ? '<div class="vai-ico">' + I.agent + '</div>'
      : '<div class="vai-ico">' + I.user + '</div>';
    var tlBtn = role === 'agent'
      ? '<div><button class="vai-tl-btn">' + I.glob + ' Translate</button></div>'
      : '';
    div.innerHTML = ico + '<div><div class="vai-bubble">' + esc(text) + '</div>' + tlBtn + '</div>';
    if (role === 'agent') {
      var tlb = div.querySelector('.vai-tl-btn');
      if (tlb) {
        (function (msgId, msgText) {
          tlb.addEventListener('click', function () { translateMessage(msgId, msgText); });
        })(id, text);
      }
    }
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return id;
  }

  function addConfirmPrompt(confirmId, field, valueLabel, reason) {
    var chat = g('vai-chat');
    if (!chat) return;
    var div = document.createElement('div');
    div.className = 'vai-msg agent';
    var ico = '<div class="vai-ico">' + I.agent + '</div>';
    var reasonHtml = reason ? '<div class="vai-bubble" style="margin-bottom:5px">' + esc(reason) + '</div>' : '';
    var promptText = 'Update <strong>' + esc(fl(field)) + '</strong> to <strong>' + esc(valueLabel) + '</strong>?';
    div.innerHTML = ico + '<div>'
      + reasonHtml
      + '<div class="vai-bubble">' + promptText + '</div>'
      + '<div class="vai-confirm-wrap">'
      +   '<span class="vai-confirm-lbl">Say "yes" or "no", or:</span>'
      +   '<button class="vai-cfbtn yes" type="button">Confirm</button>'
      +   '<button class="vai-cfbtn no" type="button">Cancel</button>'
      + '</div></div>';
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;

    var btnYes = div.querySelector('.vai-cfbtn.yes');
    var btnNo  = div.querySelector('.vai-cfbtn.no');
    function disableBtns() {
      if (btnYes) btnYes.disabled = true;
      if (btnNo)  btnNo.disabled  = true;
    }
    if (btnYes) btnYes.addEventListener('click', function () {
      disableBtns();
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'field_confirm', confirmId: confirmId, confirmed: true }));
    });
    if (btnNo)  btnNo.addEventListener('click', function () {
      disableBtns();
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'field_confirm', confirmId: confirmId, confirmed: false }));
    });
  }

  function setInterim(t) { var el = g('vai-interim'); if (el) el.textContent = t ? '… ' + t : ''; }

  /* ── Translation ─────────────────────────────────────────────────────── */
  function translateMessage(msgId, text) {
    if (!ws || ws.readyState !== 1 || !text) return;
    var lang = g('vai-langsel') ? g('vai-langsel').value : 'en';
    pendingTranslateMsgId = msgId;
    var trbtn = g('vai-trbtn');
    if (trbtn) { trbtn.disabled = true; trbtn.innerHTML = I.glob + ' …'; }
    ws.send(JSON.stringify({ type: 'translate', text: text, sourceLang: '', targetLang: lang }));
  }

  function translateLastAgentMessage() {
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'agent') { translateMessage(messages[i].id, messages[i].text); return; }
    }
  }

  function showTranslation(msgId, translatedText) {
    var el = g(msgId);
    if (!el) return;
    var existing = el.querySelector('.vai-tl-out');
    if (existing) { existing.textContent = translatedText; return; }
    var bubble = el.querySelector('.vai-bubble');
    if (bubble) {
      var d = document.createElement('div');
      d.className = 'vai-tl-out';
      d.textContent = translatedText;
      bubble.appendChild(d);
    }
  }

  /* ── Suggestions ─────────────────────────────────────────────────────── */
  function addSuggestion(sug) {
    suggestions.push(sug);
    renderSuggestions();
  }

  function renderSuggestions() {
    var panel = g('vai-sug-panel');
    var list = g('vai-sug-list');
    if (!panel || !list) return;
    if (!suggestions.length) { panel.classList.remove('has-items'); return; }
    panel.classList.add('has-items');
    list.innerHTML = '';
    suggestions.forEach(function (s, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      var cls = s.type === 'form_update' ? 'fu' : s.type === 'resolution' ? 'rn' : 'rp';
      btn.className = 'vai-sug ' + cls + (s.applied ? ' done' : '');
      var icon = s.type === 'form_update' ? I.edit : s.type === 'resolution' ? I.doc : I.msg;
      btn.innerHTML = icon + ' ' + esc(s.label);
      btn.title = s.value || s.label;
      if (!s.applied) {
        (function (i) { btn.addEventListener('click', function () { applySuggestion(i); }); })(idx);
      }
      list.appendChild(btn);
    });
  }

  function applySuggestion(idx) {
    var s = suggestions[idx];
    if (!s || s.applied) return;
    var targetField = s.type === 'form_update' ? s.field : s.type === 'resolution' ? 'close_notes' : 'comments';
    var ok = applyFormUpdate(targetField, s.value);
    if (ok) {
      s.applied = true;
      renderSuggestions();
      renderDetails();
      if (s.type === 'form_update') addMessage('agent', 'Updated ' + fl(s.field) + ' on the form.');
      else if (s.type === 'resolution') addMessage('agent', 'Resolution notes added to the form.');
      else addMessage('agent', 'Reply added to the Comments field.');
    }
  }

  /* ── Status / wave helpers ───────────────────────────────────────────── */
  function setSt(msg, cls) {
    var el = g('vai-st');
    if (el) { el.textContent = msg; el.className = 'vai-callshow' + (cls ? ' ' + cls : ''); }
  }
  function setWave(on) {
    var w = g('vai-wave');
    if (w) w.className = on ? 'vai-callshow on' : 'vai-callshow';
  }
  function setCallingMode(on) {
    var modal = g('vai-modal');
    if (modal) modal.classList[on ? 'add' : 'remove']('vai-incall');
    var btn = g('vai-btn');
    if (btn) btn.classList[on ? 'add' : 'remove']('vai-active');
    var trbtn = g('vai-trbtn');
    if (trbtn) trbtn.disabled = true;
  }

  /* ── Mic helpers ─────────────────────────────────────────────────────── */
  var pttActive = false;

  function togglePTT() {
    // Toggle mic mute (push-to-talk style visual)
    pttActive = !pttActive;
    var mb = g('vai-micbtn');
    if (mb) mb.classList[pttActive ? 'add' : 'remove']('rec');
    // When PTT is "pressed": unmute. When released: stay unmuted (always-on mic)
    // This button acts as a visual indicator; actual muting is via vai-mutebtn
  }

  function startMic() {
    return navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      video: false
    }).then(function (s) {
      micCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      micStr = s;
      var src = micCtx.createMediaStreamSource(s);
      micP = micCtx.createScriptProcessor(4096, 1, 1);
      micP.onaudioprocess = function (e) {
        if (!ws || ws.readyState !== 1 || muted) return;
        var f = e.inputBuffer.getChannelData(0);
        var i16 = new Int16Array(f.length);
        for (var j = 0; j < f.length; j++) i16[j] = Math.max(-32768, Math.min(32767, Math.round(f[j] * 32767)));
        ws.send(i16.buffer);
      };
      src.connect(micP);
      micP.connect(micCtx.destination);
    });
  }

  function stopMic() {
    if (micP) { try { micP.disconnect(); } catch (e) {} micP = null; }
    if (micStr) { micStr.getTracks().forEach(function (t) { t.stop(); }); micStr = null; }
    if (micCtx) { try { micCtx.close(); } catch (e) {} micCtx = null; }
  }

  function toggleMute() {
    muted = !muted;
    var btn = g('vai-mutebtn');
    var mon = g('vai-mon'); var mof = g('vai-mof');
    if (btn) btn.className = 'vai-callshow' + (muted ? ' on' : '');
    if (mon) mon.style.display = muted ? 'none' : '';
    if (mof) mof.style.display = muted ? '' : 'none';
  }

  /* ── Portal detection ────────────────────────────────────────────────── */
  function detectPortal() {
    try {
      var m = (window.location.pathname || '').toLowerCase().match(/^\/(sp|esc)(\/|$)/);
      if (m) return m[1];
      if (window.ZEVOX_PORTAL) return String(window.ZEVOX_PORTAL);
    } catch (e) {}
    return '';
  }

  function getSnUserId() {
    try {
      if (window.g_user && window.g_user.userID) return window.g_user.userID;
      if (window.NOW && window.NOW.user && window.NOW.user.userID) return window.NOW.user.userID;
    } catch (e) {}
    return '';
  }

  /* ── Call lifecycle ──────────────────────────────────────────────────── */
  async function startCall() {
    if (active) return;
    active = true; muted = false;
    messages = []; suggestions = [];
    var chat = g('vai-chat'); if (chat) chat.innerHTML = '';
    var sl = g('vai-sug-list'); if (sl) sl.innerHTML = '';
    var sp = g('vai-sug-panel'); if (sp) sp.classList.remove('has-items');
    setInterim('');
    setCallingMode(true);
    setSt('Connecting…', '');
    setWave(false);

    await initAudio();

    try {
      var wsUrl = wsBase + '/incident-agent?token=' + encodeURIComponent(TK);
      var uid = getSnUserId();
      if (uid) wsUrl += '&user=' + encodeURIComponent(uid);

      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = function () {
        var ctx = readIncidentContext();
        ws.send(JSON.stringify({
          type: 'start',
          incidentContext: ctx,
          originPortal: detectPortal()
        }));
        startMic().catch(function () { setSt('Mic unavailable', ''); });
      };

      ws.onmessage = function (ev) {
        if (ev.data instanceof ArrayBuffer) { feedAudio(ev.data); return; }
        var m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }

        if (m.type === 'ready') {
          setSt('Listening…', 'ok'); setWave(true);
          var trbtn = g('vai-trbtn');
          if (trbtn) { trbtn.disabled = false; trbtn.innerHTML = I.glob + ' Translate'; }
        } else if (m.type === 'state') {
          if (m.state === 'listening')   { setSt('Listening…', 'ok');  setWave(true);  }
          else if (m.state === 'speaking')   { setSt('Speaking…', 'ok');   setWave(true);  }
          else if (m.state === 'processing') { setSt('Thinking…', '');     setWave(false); }
        } else if (m.type === 'transcript') {
          if (m.isFinal) setInterim(''); else setInterim(m.text || '');
        } else if (m.type === 'user_message') {
          setInterim(''); addMessage('user', m.text || '');
        } else if (m.type === 'agent_message') {
          addMessage('agent', m.text || '');
        } else if (m.type === 'barge_in') {
          clearAudio();
        } else if (m.type === 'form_update') {
          if (m.applyNow) {
            // User explicitly commanded an update — apply directly, no click needed
            var ok = applyFormUpdate(m.field, m.value);
            if (ok) {
              renderDetails();
              addToast('✓ ' + fl(m.field) + ' updated to "' + (m.valueLabel || m.value) + '"');
              addMessage('agent', 'Done — I\'ve updated ' + fl(m.field) + ' to "' + (m.valueLabel || m.value) + '" on the form.');
            }
          } else {
            // Proactive suggestion — show as confirmation button
            addSuggestion({
              type: 'form_update',
              field: m.field,
              value: m.value,
              label: 'Set ' + fl(m.field) + ' → ' + (m.valueLabel || m.value)
            });
          }
        } else if (m.type === 'field_update_pending') {
          // Agent wants to update a field — show Confirm/Cancel inline in chat
          addConfirmPrompt(m.confirmId, m.field, m.valueLabel, m.reason);
        } else if (m.type === 'suggestion') {
          // Emitted by server-side built-in tools suggest_resolution / suggest_reply
          var st = m.sugType === 'resolution' ? 'resolution' : 'reply';
          var lbl = st === 'resolution'
            ? 'Resolution: ' + (m.text || '').substring(0, 42) + (m.text && m.text.length > 42 ? '…' : '')
            : 'Reply: '      + (m.text || '').substring(0, 42) + (m.text && m.text.length > 42 ? '…' : '');
          addSuggestion({ type: st, value: m.text || '', label: lbl });
        } else if (m.type === 'translation') {
          if (pendingTranslateMsgId && m.text) showTranslation(pendingTranslateMsgId, m.text);
          pendingTranslateMsgId = null;
          var trbtn2 = g('vai-trbtn');
          if (trbtn2) { trbtn2.disabled = false; trbtn2.innerHTML = I.glob + ' Translate'; }
        } else if (m.type === 'navigate') {
          // Open navigation URLs from the agent (inherited from widget.js)
          if (m.urls && m.urls.length) {
            m.urls.forEach(function (u) {
              try { window.open(u.url, '_blank', 'noopener'); } catch (e) {}
            });
          }
        } else if (m.type === 'error') {
          setSt((m.message || 'Error'), 'err');
          endCallGraceful();
        } else if (m.type === 'ended') {
          endCallGraceful();
        }
      };

      ws.onerror = function () { setSt('Connection error', 'err'); };
      ws.onclose = function (ev) {
        if (active) {
          if (ev.code !== 1000) setSt('Connection lost', 'err');
          setTimeout(function () { if (active) endCall(); }, 1500);
        }
      };

    } catch (e) {
      setSt('Failed: ' + e.message, 'err');
      setTimeout(endCall, 2000);
    }
  }

  function endCall() {
    try {
      if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ type: 'stop' })); ws.close(); }
    } catch (e) {}
    ws = null; stopMic(); clearAudio();
    active = false; muted = false; pttActive = false;
    setWave(false); setCallingMode(false); setInterim('');
    var mb = g('vai-micbtn'); if (mb) mb.classList.remove('rec');
  }

  function endCallGraceful() {
    if (!active) return;
    active = false;
    stopMic(); setWave(false); setSt('Call ended', '');
    setTimeout(function () {
      try { if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ type: 'stop' })); ws.close(); } } catch (e) {}
      ws = null; clearAudio(); muted = false; pttActive = false; setCallingMode(false);
    }, 5000);
  }

  /* ── Keep translate button state in sync ────────────────────────────── */
  setInterval(function () {
    var trbtn = g('vai-trbtn');
    if (!trbtn) return;
    var hasAgent = messages.some(function (m) { return m.role === 'agent'; });
    if (ws && ws.readyState === 1 && hasAgent && !trbtn.textContent.includes('…')) {
      trbtn.disabled = false;
    }
  }, 1500);

  inject();

  /* ── Global API — called by ServiceNow UI Action client script ────────
   *   window.openVoiceAgentModal()   — open the modal (optionally auto-start)
   *   window.closeVoiceAgentModal()  — close the modal
   */
  window.openVoiceAgentModal = function (opts) {
    openModal();
    if (opts && opts.autoStart && !active) startCall();
  };
  window.closeVoiceAgentModal = closeModal;
})();
