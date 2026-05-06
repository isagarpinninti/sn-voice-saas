/**
 * ZeVox — Incident Voice Agent Widget  (Otto-style UI)
 * Right-side drawer, purple/violet theme, collapsible incident details,
 * SLA bars, attachment list, voice conversation with the AI co-agent.
 *
 * Usage (ServiceNow UI Action):
 *   top.VA_TOKEN = "sk_live_...";
 *   // inject this script
 *   top.openVoiceAgentModal({ autoStart: true });
 */
(function () {
  var sc = document.currentScript || document.querySelector('script[data-va-token]');
  var TK = window.VA_TOKEN || (sc && sc.getAttribute('data-va-token')) || '';
  var GW = (window.VA_GATEWAY ||
    (sc && sc.src ? (function (u) { try { return new URL(u).origin; } catch (e) { return ''; } })(sc.src) : '') || ''
  ).replace(/\/+$/, '');

  if (!TK) { console.error('[ZeVox] No token'); return; }
  if (window.__vaIncident) return;
  window.__vaIncident = true;

  var wsBase = GW.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');

  /* ── g_form helpers ──────────────────────────────────────────────────── */
  function resolveGForm() {
    try { if (top.g_form && typeof top.g_form.getValue === 'function') return top.g_form; } catch (e) {}
    try { if (parent.g_form && typeof parent.g_form.getValue === 'function') return parent.g_form; } catch (e) {}
    try { if (window.g_form && typeof window.g_form.getValue === 'function') return window.g_form; } catch (e) {}
    return null;
  }

  function readIncidentContext() {
    try { var pre = top.VA_INCIDENT_CONTEXT; if (pre && typeof pre === 'object' && pre.number) return pre; } catch (e) {}
    var gf = resolveGForm();
    if (!gf) return {};
    var fields = [
      'number','short_description','description','state','priority','urgency',
      'category','subcategory','assignment_group','assigned_to','caller_id',
      'comments','work_notes','close_notes','close_code','impact','contact_type',
      'opened_at','opened_by','sys_id'
    ];
    var ctx = {};
    fields.forEach(function (f) { try { var v = gf.getValue(f); if (v) ctx[f] = String(v); } catch (e) {} });
    return ctx;
  }

  function applyFormUpdate(field, value) {
    var gf = null;
    try { if (top.VA_GFORM && typeof top.VA_GFORM.setValue === 'function') gf = top.VA_GFORM; } catch (e) {}
    if (!gf) gf = resolveGForm();
    if (!gf) return false;
    try { gf.setValue(field, value); return true; } catch (e) { return false; }
  }

  var FIELD_LABELS = {
    number:'Number', short_description:'Short Description', description:'Description',
    state:'State', priority:'Priority', urgency:'Urgency', category:'Category',
    subcategory:'Subcategory', assignment_group:'Assignment Group', assigned_to:'Assigned To',
    caller_id:'Caller', comments:'Comments', work_notes:'Work Notes',
    close_notes:'Resolution Notes', impact:'Impact', contact_type:'Contact Type',
    opened_at:'Opened', opened_by:'Opened By'
  };
  function fl(f) { return FIELD_LABELS[f] || f; }

  /* ── AudioWorklet ────────────────────────────────────────────────────── */
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
      var url  = URL.createObjectURL(blob);
      await playCtx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      workletNode = new AudioWorkletNode(playCtx, 'va-incident-player');
      workletNode.connect(playCtx.destination);
      workletReady = true;
    } catch (e) { console.error('[ZeVox] AudioWorklet:', e); }
  }

  function feedAudio(buf) {
    if (!workletReady || !workletNode) return;
    if (playCtx.state === 'suspended') playCtx.resume();
    var i16 = new Int16Array(buf);
    var f32 = new Float32Array(i16.length);
    for (var i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
    workletNode.port.postMessage({ type: 'audio', s: f32 });
  }

  function clearAudio() { if (workletNode) workletNode.port.postMessage({ type: 'clear' }); }

  /* ── State ───────────────────────────────────────────────────────────── */
  var ws = null, micCtx = null, micStr = null, micP = null;
  var active = false, muted = false, pttActive = false;
  var messages = [], suggestions = [];
  var pendingTranslateMsgId = null;
  var msgCounter = 0;
  var accOpen = false;

  var LANGS = [
    ['en','English'],['es','Spanish'],['fr','French'],['de','German'],
    ['hi','Hindi'],['ar','Arabic'],['zh','Chinese'],['ja','Japanese'],
    ['pt','Portuguese'],['it','Italian'],['ko','Korean'],['nl','Dutch'],['ru','Russian']
  ];

  /* ── CSS ─────────────────────────────────────────────────────────────── */
  var CSS = ''
  /* --- floating button --- */
  + '#vai-btn{position:fixed;bottom:24px;right:24px;width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;z-index:9998;background:linear-gradient(135deg,#6d28d9,#7c3aed);box-shadow:0 4px 20px rgba(109,40,217,.5);display:flex;align-items:center;justify-content:center;color:#fff;transition:transform .2s,box-shadow .2s;animation:vaiGlow 3s ease-in-out infinite}'
  + '#vai-btn:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(109,40,217,.7)}'
  + '#vai-btn.vai-active{background:linear-gradient(135deg,#dc2626,#b91c1c);animation:vaiActivGlow 1.2s ease-in-out infinite}'
  + '@keyframes vaiGlow{0%,100%{box-shadow:0 4px 20px rgba(109,40,217,.5)}50%{box-shadow:0 4px 32px rgba(109,40,217,.8)}}'
  + '@keyframes vaiActivGlow{0%,100%{box-shadow:0 4px 20px rgba(220,38,38,.5)}50%{box-shadow:0 4px 32px rgba(220,38,38,.8)}}'
  /* --- backdrop --- */
  + '#vai-backdrop{position:fixed;inset:0;background:rgba(15,10,40,.4);z-index:9999;display:none;}'
  + '#vai-backdrop.vai-open{display:block;animation:vaiFadeIn .2s ease}'
  + '@keyframes vaiFadeIn{from{opacity:0}to{opacity:1}}'
  /* --- drawer panel --- */
  + '#vai-panel{position:fixed;top:0;right:0;width:440px;max-width:100vw;height:100vh;background:#fff;z-index:10000;display:flex;flex-direction:column;overflow:hidden;box-shadow:-6px 0 40px rgba(0,0,0,.14);transform:translateX(100%);transition:transform .32s cubic-bezier(.22,1,.36,1);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'
  + '#vai-panel.vai-open{transform:translateX(0)}'
  + '#vai-panel *{box-sizing:border-box}'
  /* --- header --- */
  + '#vai-hdr{background:linear-gradient(135deg,#3b0764 0%,#5b21b6 50%,#7c3aed 100%);color:#fff;padding:14px 14px 10px;flex-shrink:0}'
  + '#vai-hdr-r1{display:flex;align-items:center;gap:10px;margin-bottom:10px}'
  + '#vai-hdr-icon{width:36px;height:36px;border-radius:10px;flex-shrink:0;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center}'
  + '#vai-hdr-text{flex:1;min-width:0}'
  + '#vai-hdr-name{font-size:14px;font-weight:700;letter-spacing:-.01em;line-height:1.2}'
  + '#vai-hdr-tagline{font-size:10px;opacity:.65;margin-top:1px}'
  + '.vai-hdr-btn{width:30px;height:30px;border-radius:8px;border:none;background:rgba(255,255,255,.15);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;flex-shrink:0}'
  + '.vai-hdr-btn:hover{background:rgba(255,255,255,.28)}'
  /* --- header chips --- */
  + '#vai-hdr-r2{display:flex;gap:5px;flex-wrap:wrap;align-items:center}'
  + '.vai-hchip{display:inline-flex;align-items:center;border-radius:20px;padding:3px 9px;font-size:10px;font-weight:700;letter-spacing:.02em}'
  + '.vai-hchip-inc{background:rgba(255,255,255,.18);color:#fff}'
  + '.vai-hchip-p1{background:#fee2e2;color:#b91c1c}'
  + '.vai-hchip-p2{background:#ffedd5;color:#c2410c}'
  + '.vai-hchip-p3{background:#fef9c3;color:#854d0e}'
  + '.vai-hchip-p4{background:#dcfce7;color:#166534}'
  + '.vai-hchip-state{background:rgba(255,255,255,.14);color:#fff}'
  + '.vai-hchip-breach{background:#ef4444;color:#fff}'
  /* --- accordion --- */
  + '#vai-accordion{border-bottom:1px solid #ede9fe;flex-shrink:0}'
  + '#vai-acc-toggle{width:100%;display:flex;align-items:center;gap:8px;padding:9px 14px;border:none;background:#faf8ff;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;color:#5b21b6;text-align:left;transition:background .15s}'
  + '#vai-acc-toggle:hover{background:#f3f0ff}'
  + '.vai-acc-arrow{font-size:9px;transition:transform .2s;display:inline-block}'
  + '.vai-acc-arrow.open{transform:rotate(180deg)}'
  + '#vai-acc-body{max-height:0;overflow:hidden;transition:max-height .3s ease;background:#faf8ff}'
  + '#vai-acc-body.open{max-height:320px;overflow-y:auto;padding:10px 14px 12px}'
  /* --- detail fields --- */
  + '.vai-f{margin-bottom:9px}'
  + '.vai-fl{font-size:9px;color:#a78bfa;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}'
  + '.vai-fv{font-size:12px;color:#1c1917;font-weight:500;line-height:1.4;word-break:break-word}'
  + '.vai-fv.trunc{max-height:48px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}'
  + '.vai-badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}'
  + '.vai-s-new{background:#dbeafe;color:#1d4ed8}.vai-s-prog{background:#fef3c7;color:#92400e}'
  + '.vai-s-res{background:#dcfce7;color:#166534}.vai-s-cls{background:#f3f4f6;color:#6b7280}'
  + '.vai-p1{background:#fee2e2;color:#dc2626}.vai-p2{background:#ffedd5;color:#c2410c}'
  + '.vai-p3{background:#fef9c3;color:#854d0e}.vai-p4{background:#dcfce7;color:#166534}'
  /* --- SLA bars --- */
  + '#vai-sla-panel,#vai-att-panel{margin-top:10px;display:none}'
  + '#vai-sla-panel h3,#vai-att-panel h3{font-size:9px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.06em;margin:0 0 7px}'
  + '.vai-sla-row{display:flex;align-items:center;gap:7px;margin-bottom:6px}'
  + '.vai-sla-name{flex:1;font-size:11px;color:#374151;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  + '.vai-sla-track{width:64px;height:4px;background:#e5e7eb;border-radius:2px;flex-shrink:0}'
  + '.vai-sla-fill{height:100%;border-radius:2px;transition:width .6s}'
  + '.vai-sla-fill.ok{background:#10b981}.vai-sla-fill.warn{background:#f59e0b}.vai-sla-fill.crit{background:#ef4444}'
  + '.vai-sla-left{font-size:10px;color:#6b7280;white-space:nowrap;flex-shrink:0}'
  + '.vai-sla-breach{font-size:9px;font-weight:700;color:#fff;background:#ef4444;border-radius:3px;padding:1px 6px;flex-shrink:0}'
  /* --- attachments --- */
  + '.vai-att-chip{display:inline-flex;align-items:center;gap:4px;border-radius:20px;border:1px solid #ddd6fe;background:#faf5ff;padding:3px 9px;margin:0 5px 5px 0;font-size:11px;color:#5b21b6;font-weight:500}'
  + '.vai-att-chips{display:flex;flex-wrap:wrap;margin-top:2px}'
  /* --- refresh button --- */
  + '#vai-refresh{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#a78bfa;cursor:pointer;border:none;background:none;padding:6px 0 0;font-family:inherit;transition:color .15s}'
  + '#vai-refresh:hover{color:#7c3aed}'
  /* --- chat --- */
  + '#vai-chat{flex:1;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}'
  + '#vai-chat:empty::after{content:"Voice agent is ready. Click Start to begin.";display:block;text-align:center;color:#c4b5fd;font-size:13px;margin-top:90px;font-style:italic}'
  /* --- messages --- */
  + '.vai-msg{display:flex;gap:8px;max-width:94%}'
  + '.vai-msg.user{flex-direction:row-reverse;align-self:flex-end}'
  + '.vai-msg.agent{align-self:flex-start}'
  + '.vai-ico{width:28px;height:28px;border-radius:9px;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-top:1px}'
  + '.vai-msg.agent .vai-ico{background:linear-gradient(135deg,#5b21b6,#7c3aed);color:#fff}'
  + '.vai-msg.user .vai-ico{background:#ede9fe;color:#7c3aed}'
  + '.vai-bubble{padding:9px 12px;border-radius:14px;font-size:13px;line-height:1.55;word-break:break-word}'
  + '.vai-msg.agent .vai-bubble{background:#f5f3ff;color:#1c1917;border-radius:14px 14px 14px 3px}'
  + '.vai-msg.user .vai-bubble{background:#4c1d95;color:#fff;border-radius:14px 14px 3px 14px}'
  + '.vai-tl-btn{font-size:10px;color:#a78bfa;border:1px solid #ede9fe;background:#fff;border-radius:5px;padding:2px 7px;cursor:pointer;font-family:inherit;margin-top:5px;display:inline-flex;align-items:center;gap:3px;transition:all .15s}'
  + '.vai-tl-btn:hover{border-color:#7c3aed;color:#7c3aed}'
  + '.vai-tl-out{font-size:11px;color:#7c3aed;font-style:italic;margin-top:5px;border-top:1px solid #ede9fe;padding-top:5px}'
  /* --- confirm buttons --- */
  + '.vai-confirm-wrap{margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}'
  + '.vai-confirm-lbl{font-size:10px;color:#9ca3af;width:100%;margin-bottom:2px}'
  + '.vai-cfbtn{padding:5px 14px;border-radius:20px;border:1.5px solid;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s}'
  + '.vai-cfbtn.yes{background:#dcfce7;border-color:#86efac;color:#166534}'
  + '.vai-cfbtn.yes:hover:not(:disabled){background:#bbf7d0}'
  + '.vai-cfbtn.no{background:#fee2e2;border-color:#fca5a5;color:#dc2626}'
  + '.vai-cfbtn.no:hover:not(:disabled){background:#fecaca}'
  + '.vai-cfbtn:disabled{opacity:.4;cursor:default}'
  /* --- interim --- */
  + '#vai-interim{padding:2px 14px;font-size:12px;color:#a78bfa;font-style:italic;min-height:18px;flex-shrink:0}'
  /* --- suggestions --- */
  + '#vai-sug-panel{border-top:1px solid #ede9fe;padding:8px 12px;background:#faf8ff;flex-shrink:0;display:none;max-height:110px;overflow-y:auto}'
  + '#vai-sug-panel.has-items{display:block}'
  + '#vai-sug-label{font-size:9px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.06em;margin:0 0 6px}'
  + '#vai-sug-list{display:flex;flex-wrap:wrap;gap:5px}'
  + '.vai-sug{display:inline-flex;align-items:center;gap:4px;border-radius:20px;border:1.5px solid;padding:5px 11px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;max-width:250px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}'
  + '.vai-sug.fu{background:#ede9fe;border-color:#c4b5fd;color:#5b21b6}'
  + '.vai-sug.fu:hover{background:#ddd6fe}'
  + '.vai-sug.rn{background:#f0fdf4;border-color:#bbf7d0;color:#166534}'
  + '.vai-sug.rn:hover{background:#dcfce7}'
  + '.vai-sug.rp{background:#faf5ff;border-color:#ddd6fe;color:#7c3aed}'
  + '.vai-sug.rp:hover{background:#f3e8ff}'
  + '.vai-sug.done{opacity:.4;cursor:default;pointer-events:none;text-decoration:line-through}'
  /* --- controls bar --- */
  + '#vai-ctrl{display:flex;align-items:center;gap:7px;padding:10px 12px;border-top:1px solid #f3f0ff;flex-shrink:0;background:#fff;position:relative}'
  + '#vai-wave{display:flex;gap:2px;align-items:center;height:18px;opacity:.25}'
  + '#vai-wave.on{opacity:1}'
  + '#vai-wave span{display:block;width:3px;border-radius:2px;background:#7c3aed;transform-origin:center;transform:scaleY(.3)}'
  + '#vai-wave.on span{animation:vaiWv 1.2s ease-in-out infinite}'
  + '#vai-wave span:nth-child(1){height:7px;animation-delay:-.2s}'
  + '#vai-wave span:nth-child(2){height:12px;animation-delay:-.5s}'
  + '#vai-wave span:nth-child(3){height:18px;animation-delay:-.8s}'
  + '#vai-wave span:nth-child(4){height:20px;animation-delay:0s}'
  + '#vai-wave span:nth-child(5){height:18px;animation-delay:-.3s}'
  + '#vai-wave span:nth-child(6){height:12px;animation-delay:-.6s}'
  + '#vai-wave span:nth-child(7){height:7px;animation-delay:-.9s}'
  + '@keyframes vaiWv{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}'
  + '#vai-st{font-size:12px;color:#9ca3af;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  + '#vai-st.ok{color:#7c3aed;font-weight:600}'
  + '#vai-st.err{color:#dc2626}'
  /* --- translate wrap --- */
  + '#vai-trwrap{display:flex;align-items:stretch;border:1.5px solid #ddd6fe;border-radius:7px;overflow:hidden}'
  + '#vai-langsel{padding:4px 5px;border:none;border-right:1px solid #ddd6fe;background:#fff;font-size:11px;color:#5b21b6;outline:none;max-width:84px;cursor:pointer}'
  + '#vai-trbtn{display:flex;align-items:center;gap:3px;padding:4px 9px;border:none;background:#fff;color:#7c3aed;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;white-space:nowrap;transition:background .15s}'
  + '#vai-trbtn:hover:not(:disabled){background:#f5f3ff}'
  + '#vai-trbtn:disabled{opacity:.4;cursor:default}'
  /* --- round icon buttons --- */
  + '.vai-rb{width:36px;height:36px;border-radius:50%;border:1.5px solid #ddd6fe;background:#fff;color:#6b7280;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}'
  + '.vai-rb:hover:not(:disabled){background:#f5f3ff;border-color:#c4b5fd;color:#7c3aed}'
  + '.vai-rb.rec{background:#fef2f2;border-color:#ef4444;color:#dc2626;animation:vaiMicP 1.4s ease-in-out infinite}'
  + '.vai-rb.muted{background:#ef4444;border-color:#ef4444;color:#fff}'
  + '.vai-rb:disabled{opacity:.4;cursor:default}'
  + '@keyframes vaiMicP{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.25)}50%{box-shadow:0 0 0 5px rgba(239,68,68,0)}}'
  /* --- start / end buttons --- */
  + '#vai-startprompt{display:flex;align-items:center;gap:8px;flex:1}'
  + '#vai-startbtn{display:flex;align-items:center;gap:6px;padding:9px 20px;border-radius:22px;border:none;background:linear-gradient(135deg,#5b21b6,#7c3aed);color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:opacity .15s;box-shadow:0 2px 12px rgba(109,40,217,.35)}'
  + '#vai-startbtn:hover{opacity:.9}'
  + '#vai-hint{font-size:11px;color:#c4b5fd}'
  + '#vai-endbtn{display:flex;align-items:center;gap:5px;padding:7px 14px;border-radius:20px;border:1.5px solid #ddd6fe;background:#fff;color:#374151;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s;flex-shrink:0}'
  + '#vai-endbtn:hover{background:#fef2f2;border-color:#fca5a5;color:#dc2626}'
  + '.vai-callshow{display:none!important}'
  + '.vai-incall .vai-callshow{display:flex!important}'
  + '.vai-incall #vai-startprompt{display:none!important}'
  /* --- toast --- */
  + '.vai-toast{position:absolute;bottom:58px;left:50%;transform:translateX(-50%);background:#1c1917;color:#fff;font-size:12px;font-weight:500;padding:7px 15px;border-radius:20px;white-space:nowrap;pointer-events:none;animation:vaiToast 2.8s ease forwards;z-index:10}'
  + '@keyframes vaiToast{0%{opacity:0;transform:translateX(-50%) translateY(6px)}12%{opacity:1;transform:translateX(-50%) translateY(0)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-4px)}}';

  /* ── SVG icons ───────────────────────────────────────────────────────── */
  var I = {
    // 4-point sparkle (Otto-style AI icon)
    sparkle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2 7h7l-5.7 4.1 2.2 6.9L12 16l-5.5 4 2.2-6.9L3 9h7z"/><circle cx="20" cy="5" r="1.6" opacity=".7"/><circle cx="4" cy="19" r="1.2" opacity=".5"/></svg>',
    sparkle_sm: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2 7h7l-5.7 4.1 2.2 6.9L12 16l-5.5 4 2.2-6.9L3 9h7z"/></svg>',
    mic:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>',
    mute_on:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>',
    mute_off: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .34-.03.67-.08 1"/></svg>',
    end:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 18v3a2 2 0 01-2.18 2A19.79 19.79 0 013.07 9.18 2 2 0 014.11 7h3a2 2 0 011.72 1.83 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11l-1.4 1.36z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    glob:  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
    ref:   '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>',
    edit:  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>',
    doc:   '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    msg:   '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    user:  '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    down:  '▼'
  };

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function g(id)  { return document.getElementById(id); }

  function stateBadge(state) {
    var m = {'1':['New','s-new'],'2':['In Progress','s-prog'],'3':['On Hold','s-prog'],'6':['Resolved','s-res'],'7':['Closed','s-cls'],'8':['Canceled','s-cls']};
    var info = m[String(state)];
    return info ? '<span class="vai-badge vai-' + info[1] + '">' + info[0] + '</span>' : esc(state || '');
  }
  function prioBadge(p) {
    var m = {'1':['1 - Critical','p1'],'2':['2 - High','p2'],'3':['3 - Moderate','p3'],'4':['4 - Low','p4']};
    var info = m[String(p)];
    return info ? '<span class="vai-badge vai-' + info[1] + '">' + info[0] + '</span>' : esc(p || '');
  }
  function prioChipCls(p) { return {'1':'p1','2':'p2','3':'p3','4':'p4'}[String(p)] || 'p3'; }

  function buildLangOpts() {
    return LANGS.map(function (l) { return '<option value="' + l[0] + '"' + (l[0]==='en'?' selected':'') + '>' + l[1] + '</option>'; }).join('');
  }

  /* ── Build DOM ───────────────────────────────────────────────────────── */
  function inject() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Floating button
    var btn = document.createElement('button');
    btn.id = 'vai-btn';
    btn.title = 'AI Voice Agent';
    btn.innerHTML = I.sparkle;
    document.body.appendChild(btn);
    btn.addEventListener('click', openPanel);

    // Backdrop
    var bd = document.createElement('div');
    bd.id = 'vai-backdrop';
    document.body.appendChild(bd);
    bd.addEventListener('click', closePanel);

    // Drawer panel
    var panel = document.createElement('div');
    panel.id = 'vai-panel';
    panel.innerHTML = ''
      /* header */
      + '<div id="vai-hdr">'
      +   '<div id="vai-hdr-r1">'
      +     '<div id="vai-hdr-icon">' + I.sparkle + '</div>'
      +     '<div id="vai-hdr-text">'
      +       '<div id="vai-hdr-name">AI Voice Agent</div>'
      +       '<div id="vai-hdr-tagline">Incident Co-Agent &bull; Powered by AI</div>'
      +     '</div>'
      +     '<button class="vai-hdr-btn" id="vai-close" type="button" title="Close">&#215;</button>'
      +   '</div>'
      +   '<div id="vai-hdr-r2"></div>'
      + '</div>'
      /* details accordion */
      + '<div id="vai-accordion">'
      +   '<button id="vai-acc-toggle" type="button">'
      +     '<span class="vai-acc-arrow" id="vai-acc-arrow">&#9650;</span>'
      +     '<span id="vai-acc-label">Incident Details</span>'
      +     '<span id="vai-acc-sla-warn" style="display:none;margin-left:6px;font-size:9px;background:#fee2e2;color:#dc2626;padding:1px 6px;border-radius:10px;font-weight:700;">SLA Risk</span>'
      +     '<span style="flex:1"></span>'
      +     '<button id="vai-refresh" type="button" title="Refresh details">' + I.ref + ' Refresh</button>'
      +   '</button>'
      +   '<div id="vai-acc-body">'
      +     '<div id="vai-details-list"></div>'
      +     '<div id="vai-sla-panel"></div>'
      +     '<div id="vai-att-panel"></div>'
      +   '</div>'
      + '</div>'
      /* chat */
      + '<div id="vai-chat"></div>'
      + '<div id="vai-interim"></div>'
      /* suggestions */
      + '<div id="vai-sug-panel">'
      +   '<div id="vai-sug-label">Suggested Actions</div>'
      +   '<div id="vai-sug-list"></div>'
      + '</div>'
      /* controls */
      + '<div id="vai-ctrl">'
      +   '<div id="vai-startprompt">'
      +     '<button id="vai-startbtn" type="button">' + I.sparkle_sm + ' Start Voice Session</button>'
      +     '<span id="vai-hint">Ask the AI about this incident</span>'
      +   '</div>'
      +   '<div id="vai-wave" class="vai-callshow"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>'
      +   '<span id="vai-st" class="vai-callshow">Connecting&hellip;</span>'
      +   '<div id="vai-trwrap">'
      +     '<select id="vai-langsel">' + buildLangOpts() + '</select>'
      +     '<button id="vai-trbtn" type="button" disabled>' + I.glob + ' Translate</button>'
      +   '</div>'
      +   '<button class="vai-rb vai-callshow" id="vai-mutebtn" type="button" title="Mute"><span id="vai-mon">' + I.mute_on + '</span><span id="vai-mof" style="display:none">' + I.mute_off + '</span></button>'
      +   '<button class="vai-rb vai-callshow" id="vai-micbtn" type="button" title="Microphone">' + I.mic + '</button>'
      +   '<button id="vai-endbtn" class="vai-callshow" type="button">' + I.end + ' End</button>'
      + '</div>';
    document.body.appendChild(panel);

    // Events
    g('vai-close').addEventListener('click', closePanel);
    g('vai-startbtn').addEventListener('click', startCall);
    g('vai-endbtn').addEventListener('click', endCall);
    g('vai-mutebtn').addEventListener('click', toggleMute);
    g('vai-micbtn').addEventListener('click', togglePTT);
    g('vai-trbtn').addEventListener('click', translateLastAgentMsg);
    g('vai-refresh').addEventListener('click', function (e) { e.stopPropagation(); renderDetails(); });
    g('vai-acc-toggle').addEventListener('click', function (e) {
      if (e.target === g('vai-refresh') || g('vai-refresh').contains(e.target)) return;
      toggleAccordion();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && g('vai-panel').classList.contains('vai-open')) closePanel();
    });
  }

  /* ── Accordion ───────────────────────────────────────────────────────── */
  function toggleAccordion(forceOpen) {
    accOpen = forceOpen !== undefined ? forceOpen : !accOpen;
    var body  = g('vai-acc-body');
    var arrow = g('vai-acc-arrow');
    if (body)  body.classList[accOpen ? 'add' : 'remove']('open');
    if (arrow) arrow.classList[accOpen ? 'add' : 'remove']('open');
  }

  /* ── Incident details panel ──────────────────────────────────────────── */
  function renderDetails() {
    var ctx   = readIncidentContext();
    var list  = g('vai-details-list');
    var hdr2  = g('vai-hdr-r2');

    // Update header chips
    if (hdr2) {
      var chips = '';
      if (ctx.number)   chips += '<span class="vai-hchip vai-hchip-inc">' + esc(ctx.number) + '</span>';
      if (ctx.priority) chips += '<span class="vai-hchip vai-hchip-' + prioChipCls(ctx.priority) + '">' + esc({'1':'Critical','2':'High','3':'Moderate','4':'Low'}[ctx.priority] || ctx.priority) + '</span>';
      if (ctx.state)    chips += '<span class="vai-hchip vai-hchip-state">' + esc({'1':'New','2':'In Progress','3':'On Hold','6':'Resolved','7':'Closed','8':'Canceled'}[ctx.state] || ctx.state) + '</span>';
      hdr2.innerHTML = chips;
    }

    if (!list) return;
    var order = ['short_description','description','state','priority','urgency','caller_id','category','subcategory','assignment_group','assigned_to','comments','work_notes'];
    var html  = '';
    order.forEach(function (f) {
      var v = ctx[f]; if (!v) return;
      var rendered;
      if (f === 'state') rendered = stateBadge(v);
      else if (f === 'priority') rendered = prioBadge(v);
      else rendered = '<div class="vai-fv' + (v.length > 80 ? ' trunc' : '') + '">' + esc(v) + '</div>';
      html += '<div class="vai-f"><div class="vai-fl">' + fl(f) + '</div>' + rendered + '</div>';
    });
    list.innerHTML = html || '<div style="font-size:12px;color:#a78bfa;padding:4px 0">No incident data captured.</div>';
  }

  /* ── Enriched context (SLAs + attachments pushed from server) ────────── */
  function renderEnrichedContext(data) {
    // SLA panel
    var slaEl = g('vai-sla-panel');
    var hasBreached = false;
    if (slaEl && data.slas && data.slas.length) {
      var html = '<h3>SLAs</h3>';
      data.slas.forEach(function (s) {
        var pct  = Math.min(100, Math.max(0, s.percentage || 0));
        var cls  = s.breached ? 'crit' : pct >= 80 ? 'crit' : pct >= 60 ? 'warn' : 'ok';
        if (s.breached) hasBreached = true;
        var left = s.timeLeft ? s.timeLeft + ' left' : (s.stage ? s.stage : '');
        html += '<div class="vai-sla-row">'
          + '<span class="vai-sla-name" title="' + esc(s.name) + '">' + esc(s.name) + '</span>'
          + '<div class="vai-sla-track"><div class="vai-sla-fill ' + cls + '" style="width:' + pct + '%"></div></div>'
          + '<span class="vai-sla-left">' + esc(left) + '</span>'
          + (s.breached ? '<span class="vai-sla-breach">BREACHED</span>' : '')
          + '</div>';
      });
      slaEl.innerHTML = html;
      slaEl.style.display = '';
    }

    // Show SLA risk chip in accordion toggle
    var warnChip = g('vai-acc-sla-warn');
    if (warnChip) warnChip.style.display = hasBreached ? '' : 'none';
    // Also show breach chip in header
    if (hasBreached) {
      var hdr2 = g('vai-hdr-r2');
      if (hdr2 && !hdr2.querySelector('.vai-hchip-breach')) {
        var bc = document.createElement('span');
        bc.className = 'vai-hchip vai-hchip-breach';
        bc.textContent = '⚠ SLA Breached';
        hdr2.appendChild(bc);
      }
    }

    // Attachments panel
    var attEl = g('vai-att-panel');
    if (attEl && data.attachments && data.attachments.length) {
      var ahtml = '<h3>Attachments (' + data.attachments.length + ')</h3><div class="vai-att-chips">';
      data.attachments.forEach(function (a) {
        var ext  = (a.name || '').split('.').pop().toLowerCase();
        var icon = ['jpg','jpeg','png','gif'].indexOf(ext) >= 0 ? '🖼' :
                   ext === 'pdf' ? '📄' :
                   ['log','txt','csv','md'].indexOf(ext) >= 0 ? '📋' : '📎';
        ahtml += '<span class="vai-att-chip">' + icon + ' <span title="' + esc(a.name) + '" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.name) + '</span> <span style="opacity:.5;font-size:9px">' + (a.sizeKb || 0) + 'KB</span></span>';
      });
      ahtml += '</div>';
      attEl.innerHTML = ahtml;
      attEl.style.display = '';
    }

    // Related CI badge
    if (data.related && data.related.ci) {
      var hdr2b = g('vai-hdr-r2');
      if (hdr2b && !hdr2b.dataset.ci) {
        hdr2b.dataset.ci = '1';
        var cs = document.createElement('span');
        cs.className = 'vai-hchip';
        cs.style.cssText = 'background:rgba(255,255,255,.14);color:#fff';
        cs.textContent = '⬡ ' + data.related.ci;
        hdr2b.appendChild(cs);
      }
    }

    // Auto-open accordion to show SLAs/attachments
    if (!accOpen) toggleAccordion(true);
  }

  /* ── Open / close ────────────────────────────────────────────────────── */
  function openPanel() {
    renderDetails();
    g('vai-panel').classList.add('vai-open');
    g('vai-backdrop').classList.add('vai-open');
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    g('vai-panel').classList.remove('vai-open');
    g('vai-backdrop').classList.remove('vai-open');
    document.body.style.overflow = '';
  }

  /* ── Toast ───────────────────────────────────────────────────────────── */
  function addToast(text) {
    var panel = g('vai-panel');
    if (!panel) return;
    var t = document.createElement('div');
    t.className = 'vai-toast';
    t.textContent = text;
    panel.style.position = 'relative';
    panel.appendChild(t);
    setTimeout(function () { try { panel.removeChild(t); } catch (e) {} }, 3000);
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
      ? '<div class="vai-ico">' + I.sparkle_sm + '</div>'
      : '<div class="vai-ico">' + I.user + '</div>';
    var tlBtn = role === 'agent'
      ? '<div><button class="vai-tl-btn">' + I.glob + ' Translate</button></div>'
      : '';
    div.innerHTML = ico + '<div><div class="vai-bubble">' + esc(text) + '</div>' + tlBtn + '</div>';
    if (role === 'agent') {
      var tlb = div.querySelector('.vai-tl-btn');
      if (tlb) {
        (function (mid, mtxt) { tlb.addEventListener('click', function () { translateMessage(mid, mtxt); }); })(id, text);
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
    var ico = '<div class="vai-ico">' + I.sparkle_sm + '</div>';
    var txt = 'Set <strong>' + esc(fl(field)) + '</strong> to <strong>' + esc(valueLabel) + '</strong>?';
    var reasonHtml = reason ? '<div class="vai-bubble" style="margin-bottom:5px;font-size:12px;color:#6b7280">' + esc(reason) + '</div>' : '';
    div.innerHTML = ico + '<div>'
      + reasonHtml
      + '<div class="vai-bubble">' + txt + '</div>'
      + '<div class="vai-confirm-wrap">'
      +   '<span class="vai-confirm-lbl">Say "yes" or "no", or tap a button:</span>'
      +   '<button class="vai-cfbtn yes" type="button">Confirm</button>'
      +   '<button class="vai-cfbtn no" type="button">Cancel</button>'
      + '</div></div>';
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    var btnY = div.querySelector('.vai-cfbtn.yes');
    var btnN = div.querySelector('.vai-cfbtn.no');
    function disable() { if (btnY) btnY.disabled = true; if (btnN) btnN.disabled = true; }
    if (btnY) btnY.addEventListener('click', function () { disable(); if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'field_confirm', confirmId: confirmId, confirmed: true })); });
    if (btnN) btnN.addEventListener('click', function () { disable(); if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'field_confirm', confirmId: confirmId, confirmed: false })); });
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

  function translateLastAgentMsg() {
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'agent') { translateMessage(messages[i].id, messages[i].text); return; }
    }
  }

  function showTranslation(msgId, text) {
    var el = g(msgId);
    if (!el) return;
    var existing = el.querySelector('.vai-tl-out');
    if (existing) { existing.textContent = text; return; }
    var bubble = el.querySelector('.vai-bubble');
    if (bubble) { var d = document.createElement('div'); d.className = 'vai-tl-out'; d.textContent = text; bubble.appendChild(d); }
  }

  /* ── Suggestions ─────────────────────────────────────────────────────── */
  function addSuggestion(sug) { suggestions.push(sug); renderSuggestions(); }

  function renderSuggestions() {
    var panel = g('vai-sug-panel'); var list = g('vai-sug-list');
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
      if (!s.applied) { (function (i) { btn.addEventListener('click', function () { applySuggestion(i); }); })(idx); }
      list.appendChild(btn);
    });
  }

  function applySuggestion(idx) {
    var s = suggestions[idx]; if (!s || s.applied) return;
    var targetField = s.type === 'form_update' ? s.field : s.type === 'resolution' ? 'close_notes' : 'comments';
    var ok = applyFormUpdate(targetField, s.value);
    if (ok) {
      s.applied = true; renderSuggestions(); renderDetails();
      if (s.type === 'form_update')  addMessage('agent', 'Updated ' + fl(s.field) + ' on the form.');
      else if (s.type === 'resolution') addMessage('agent', 'Resolution notes added to the form.');
      else addMessage('agent', 'Reply added to the Comments field.');
    }
  }

  /* ── Status helpers ──────────────────────────────────────────────────── */
  function setSt(msg, cls) { var el = g('vai-st'); if (el) { el.textContent = msg; el.className = 'vai-callshow' + (cls ? ' ' + cls : ''); } }
  function setWave(on) { var w = g('vai-wave'); if (w) w.className = on ? 'vai-callshow on' : 'vai-callshow'; }
  function setCallingMode(on) {
    var panel = g('vai-panel'); if (panel) panel.classList[on ? 'add' : 'remove']('vai-incall');
    var btn   = g('vai-btn');   if (btn)   btn.classList[on ? 'add' : 'remove']('vai-active');
    var trbtn = g('vai-trbtn'); if (trbtn) trbtn.disabled = true;
  }

  /* ── Mic ─────────────────────────────────────────────────────────────── */
  function togglePTT() {
    pttActive = !pttActive;
    var mb = g('vai-micbtn');
    if (mb) mb.classList[pttActive ? 'add' : 'remove']('rec');
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
      src.connect(micP); micP.connect(micCtx.destination);
    });
  }

  function stopMic() {
    if (micP)   { try { micP.disconnect(); } catch (e) {} micP = null; }
    if (micStr) { micStr.getTracks().forEach(function (t) { t.stop(); }); micStr = null; }
    if (micCtx) { try { micCtx.close(); } catch (e) {} micCtx = null; }
  }

  function toggleMute() {
    muted = !muted;
    var btn = g('vai-mutebtn');
    var mon = g('vai-mon'); var mof = g('vai-mof');
    if (btn) btn.className = 'vai-rb vai-callshow' + (muted ? ' muted' : '');
    if (mon) mon.style.display = muted ? 'none' : '';
    if (mof) mof.style.display = muted ? '' : 'none';
  }

  /* ── Portal / user helpers ───────────────────────────────────────────── */
  function detectPortal() {
    try { var m = (window.location.pathname || '').toLowerCase().match(/^\/(sp|esc)(\/|$)/); if (m) return m[1]; } catch (e) {}
    return '';
  }

  function getSnUserId() {
    try { if (window.g_user && window.g_user.userID) return window.g_user.userID; } catch (e) {}
    try { if (window.NOW && window.NOW.user && window.NOW.user.userID) return window.NOW.user.userID; } catch (e) {}
    return '';
  }

  /* ── Call lifecycle ──────────────────────────────────────────────────── */
  async function startCall() {
    if (active) return;
    active = true; muted = false; pttActive = false;
    messages = []; suggestions = [];
    var chat = g('vai-chat'); if (chat) chat.innerHTML = '';
    var sl = g('vai-sug-list'); if (sl) sl.innerHTML = '';
    var sp = g('vai-sug-panel'); if (sp) sp.classList.remove('has-items');
    setInterim(''); setCallingMode(true); setSt('Connecting…', ''); setWave(false);

    await initAudio();

    try {
      var wsUrl = wsBase + '/incident-agent?token=' + encodeURIComponent(TK);
      var uid = getSnUserId();
      if (uid) wsUrl += '&user=' + encodeURIComponent(uid);

      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = function () {
        var ctx = readIncidentContext();
        ws.send(JSON.stringify({ type: 'start', incidentContext: ctx, originPortal: detectPortal() }));
        startMic().catch(function () { setSt('Mic unavailable', ''); });
      };

      ws.onmessage = function (ev) {
        if (ev.data instanceof ArrayBuffer) { feedAudio(ev.data); return; }
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }

        if (m.type === 'ready') {
          setSt('Listening…', 'ok'); setWave(true);
          var trbtn = g('vai-trbtn'); if (trbtn) { trbtn.disabled = false; trbtn.innerHTML = I.glob + ' Translate'; }
        } else if (m.type === 'state') {
          if      (m.state === 'listening')  { setSt('Listening…', 'ok');  setWave(true);  }
          else if (m.state === 'speaking')   { setSt('Speaking…', 'ok');   setWave(true);  }
          else if (m.state === 'processing') { setSt('Thinking…', '');     setWave(false); }
          else if (m.state === 'loading')    { setSt('Loading incident details…', ''); setWave(false); }
        } else if (m.type === 'context_enriched') {
          renderEnrichedContext(m);
        } else if (m.type === 'transcript') {
          if (m.isFinal) setInterim(''); else setInterim(m.text || '');
        } else if (m.type === 'user_message') {
          setInterim(''); addMessage('user', m.text || '');
        } else if (m.type === 'agent_message') {
          addMessage('agent', m.text || '');
        } else if (m.type === 'barge_in') {
          clearAudio();
        } else if (m.type === 'field_update_pending') {
          addConfirmPrompt(m.confirmId, m.field, m.valueLabel, m.reason);
        } else if (m.type === 'form_update') {
          if (m.applyNow) {
            var ok = applyFormUpdate(m.field, m.value);
            if (ok) {
              renderDetails();
              addToast('✓ ' + fl(m.field) + ' → "' + (m.valueLabel || m.value) + '"');
              addMessage('agent', 'Done — updated ' + fl(m.field) + ' to "' + (m.valueLabel || m.value) + '".');
            }
          } else {
            addSuggestion({ type: 'form_update', field: m.field, value: m.value, label: 'Set ' + fl(m.field) + ' → ' + (m.valueLabel || m.value) });
          }
        } else if (m.type === 'suggestion') {
          var st = m.sugType === 'resolution' ? 'resolution' : 'reply';
          var lbl = (st === 'resolution' ? 'Resolution: ' : 'Reply: ') + (m.text || '').substring(0, 44) + ((m.text || '').length > 44 ? '…' : '');
          addSuggestion({ type: st, value: m.text || '', label: lbl });
        } else if (m.type === 'translation') {
          if (pendingTranslateMsgId && m.text) showTranslation(pendingTranslateMsgId, m.text);
          pendingTranslateMsgId = null;
          var trbtn2 = g('vai-trbtn'); if (trbtn2) { trbtn2.disabled = false; trbtn2.innerHTML = I.glob + ' Translate'; }
        } else if (m.type === 'error') {
          setSt(m.message || 'Error', 'err'); endCallGraceful();
        } else if (m.type === 'ended') {
          endCallGraceful();
        }
      };

      ws.onerror = function () { setSt('Connection error', 'err'); };
      ws.onclose = function (ev) { if (active) { if (ev.code !== 1000) setSt('Connection lost', 'err'); setTimeout(function () { if (active) endCall(); }, 1500); } };

    } catch (e) { setSt('Failed: ' + e.message, 'err'); setTimeout(endCall, 2000); }
  }

  function endCall() {
    try { if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ type: 'stop' })); ws.close(); } } catch (e) {}
    ws = null; stopMic(); clearAudio();
    active = false; muted = false; pttActive = false;
    setWave(false); setCallingMode(false); setInterim('');
    var mb = g('vai-micbtn'); if (mb) mb.classList.remove('rec');
  }

  function endCallGraceful() {
    if (!active) return;
    active = false; stopMic(); setWave(false); setSt('Session ended', '');
    setTimeout(function () {
      try { if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ type: 'stop' })); ws.close(); } } catch (e) {}
      ws = null; clearAudio(); muted = false; pttActive = false; setCallingMode(false);
    }, 4000);
  }

  /* ── Keep translate button in sync ──────────────────────────────────── */
  setInterval(function () {
    var trbtn = g('vai-trbtn'); if (!trbtn) return;
    var hasAgent = messages.some(function (m) { return m.role === 'agent'; });
    if (ws && ws.readyState === 1 && hasAgent && !trbtn.textContent.includes('…')) trbtn.disabled = false;
  }, 1500);

  inject();

  /* ── Global API ──────────────────────────────────────────────────────── */
  window.openVoiceAgentModal  = function (opts) { openPanel(); if (opts && opts.autoStart && !active) startCall(); };
  window.closeVoiceAgentModal = closePanel;
})();
