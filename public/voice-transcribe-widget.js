/**
 * ZeVox — Voice Transcribe Widget
 * Now Assist–style banner: gradient border, sparkle icon, mic + translate.
 */
(function () {
  var sc = document.currentScript;
  var TK = window.VA_TOKEN || (sc && sc.getAttribute('data-va-token')) || '';
  var GW = (window.VA_GATEWAY || (sc && sc.src
    ? (function (u) { try { return new URL(u).origin; } catch (e) { return ''; } })(sc.src)
    : '') || '').replace(/\/+$/, '');

  if (!TK) { console.error('[VA Widget] No token.'); return; }
  if (document.getElementById('va-wrap')) return;

  var wsBase = GW.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
  var WS_URL = wsBase + '/transcribe?token=' + encodeURIComponent(TK);

  /* ── Styles ─────────────────────────────────────────────────────────── */
  var CSS = [
    /* Gradient border container — mirrors Now Assist banner */
    '#va-wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 14px;border-radius:6px;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(90deg,#34d399,#60a5fa) border-box;border:1.5px solid transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-sizing:border-box;width:60%;margin: 0 auto;margin-top: 2rem;}',

    /* Connecting: animated gradient border shimmer */
    '#va-wrap.va-connecting{background:linear-gradient(#fff,#fff) padding-box,linear-gradient(90deg,#34d399,#60a5fa,#34d399) border-box;background-size:200% 100%;animation:vashine 2s linear infinite}',
    '@keyframes vashine{0%{background-position:0% 0%,0% 0%}100%{background-position:0% 0%,200% 0%}}',

    /* Left: icon + label + status dot */
    '#va-left{display:flex;align-items:center;gap:8px;min-width:0}',
    '#va-sparkle{flex-shrink:0;color:#10b981}',
    '#va-label{font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap}',
    '#va-dot{width:7px;height:7px;border-radius:50%;background:#94a3b8;flex-shrink:0;margin-left:2px;transition:background .3s}',
    '#va-dot.dot-ok{background:#10b981}',
    '#va-dot.dot-rec{background:#ef4444;animation:dotrec 1s ease-in-out infinite}',
    '#va-dot.dot-err{background:#ef4444}',
    '@keyframes dotrec{0%,100%{opacity:1}50%{opacity:.3}}',
    '#va-status{font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#va-status.va-ok{color:#059669;font-weight:500}',
    '#va-status.va-err{color:#dc2626}',

    /* Right: buttons */
    '#va-right{display:flex;align-items:center;gap:8px;flex-shrink:0}',

    /* Mic button — outlined green like "Summarize" when idle, filled red when recording */
    '#va-mic-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:5px;border:1.5px solid #10b981;background:#fff;color:#059669;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;line-height:1;transition:background .15s,color .15s}',
    '#va-mic-btn:hover:not([disabled]){background:#f0fdf4;border-color:#059669}',
    '#va-mic-btn[disabled]{opacity:.4;cursor:default}',
    '#va-mic-btn.recording{background:#fee2e2;border-color:#ef4444;color:#dc2626;animation:vamicpulse 1.4s ease-in-out infinite}',
    '@keyframes vamicpulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.25)}50%{box-shadow:0 0 0 4px rgba(239,68,68,0)}}',

    /* Translate group */
    '#va-trans-wrap{display:inline-flex;align-items:stretch;border-radius:5px;overflow:hidden;border:1.5px solid #60a5fa}',
    '#va-lang-sel{padding:4px 6px;border:none;border-right:1px solid #60a5fa;background:#fff;font-size:11px;color:#1e3a5f;cursor:pointer;outline:none;max-width:94px}',
    '#va-trans-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:none;background:#fff;color:#2563eb;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;line-height:1;transition:background .15s}',
    '#va-trans-btn:hover:not([disabled]){background:#eff6ff}',
    '#va-trans-btn[disabled]{opacity:.35;cursor:default}',

    '.va-hidden{display:none!important}',
  ].join('');

  /* ── Icons ───────────────────────────────────────────────────────────── */
  var IC_SPARKLE = '<svg id="va-sparkle" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-1.8L12 2z"/></svg>';
  var IC_MIC     = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>';
  var IC_STOP    = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';
  var IC_GLOB    = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

  /* ── Inject ──────────────────────────────────────────────────────────── */
  var root = document.getElementById('va-root');
  if (!root) { console.error('[VA Widget] #va-root not found.'); return; }

  var styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  root.innerHTML = '<div id="va-wrap">'
    /* Left */
    + '<div id="va-left">'
    +   IC_SPARKLE
    +   '<span id="va-label">ZeVox Voice Transcribe</span>'
    +   '<span id="va-dot"></span>'
    +   '<span id="va-status">Connecting…</span>'
    + '</div>'
    /* Right */
    + '<div id="va-right">'
    +   '<button id="va-mic-btn" type="button" disabled>' + IC_MIC + ' Start</button>'
    +   '<span id="va-trans-wrap" class="va-hidden">'
    +     '<select id="va-lang-sel">'
    +       '<option value="en">English</option>'
    +       '<option value="es">Spanish</option>'
    +       '<option value="fr">French</option>'
    +       '<option value="de">German</option>'
    +       '<option value="hi">Hindi</option>'
    +       '<option value="ar">Arabic</option>'
    +       '<option value="zh">Chinese</option>'
    +       '<option value="ja">Japanese</option>'
    +       '<option value="pt">Portuguese</option>'
    +       '<option value="it">Italian</option>'
    +       '<option value="ko">Korean</option>'
    +       '<option value="nl">Dutch</option>'
    +       '<option value="ru">Russian</option>'
    +     '</select>'
    +     '<button id="va-trans-btn" type="button" disabled>' + IC_GLOB + ' Translate</button>'
    +   '</span>'
    + '</div>'
    + '</div>';

  /* ── State ───────────────────────────────────────────────────────────── */
  var ws = null, audioCtx = null, processor = null, mediaStream = null;
  var recording = false;
  var origFinals = '', origInterim = '';
  var insertTimer = null;

  var wrapEl    = document.getElementById('va-wrap');
  var micBtn    = document.getElementById('va-mic-btn');
  var dotEl     = document.getElementById('va-dot');
  var statusEl  = document.getElementById('va-status');
  var transWrap = document.getElementById('va-trans-wrap');
  var transBtn  = document.getElementById('va-trans-btn');
  var langSel   = document.getElementById('va-lang-sel');

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function setStatus(msg, dotCls, statusCls) {
    if (statusEl) { statusEl.textContent = msg; statusEl.className = statusCls ? 'va-' + statusCls : ''; }
    if (dotEl)    dotEl.className = dotCls ? 'dot-' + dotCls : '';
    if (wrapEl)   { if (dotCls === 'connecting') wrapEl.classList.add('va-connecting'); else wrapEl.classList.remove('va-connecting'); }
  }

  function commentsHasText() {
    var gf = window.g_form;
    return gf && typeof gf.getValue === 'function' && !!(gf.getValue('comments') || '').trim();
  }

  function refreshTranslateBtn() {
    if (transBtn) transBtn.disabled = !commentsHasText();
  }

  function appendToComments(text) {
    if (!text || !text.trim()) return false;
    var gf = window.g_form;
    if (!gf || typeof gf.getValue !== 'function') { setStatus('g_form not available', 'err', 'err'); return false; }
    var cur = gf.getValue('comments') || '';
    gf.setValue('comments', (cur ? cur + '\n\n' : '') + text.trim());
    return true;
  }

  /* ── Insert after stop ───────────────────────────────────────────────── */
  function onTranscriptReady() {
    insertTimer = null;
    var ok = appendToComments(origFinals.trim());
    if (ok) {
      setStatus('Added to Comments ✓', 'ok', 'ok');
      if (transWrap) transWrap.classList.remove('va-hidden');
      refreshTranslateBtn();
    } else {
      setStatus('Ready — click Start', '', '');
    }
    if (micBtn) micBtn.disabled = false;
  }

  /* ── Recording ───────────────────────────────────────────────────────── */
  function startRec() {
    if (insertTimer) { clearTimeout(insertTimer); insertTimer = null; }
    origFinals = ''; origInterim = '';
    if (transWrap) transWrap.classList.add('va-hidden');

    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      video: false
    })
    .then(function (stream) {
      mediaStream = stream;
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      var src = audioCtx.createMediaStreamSource(stream);
      processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = function (e) {
        if (!recording || !ws || ws.readyState !== 1) return;
        var f32 = e.inputBuffer.getChannelData(0);
        var i16 = new Int16Array(f32.length);
        for (var i = 0; i < f32.length; i++) {
          var v = Math.max(-1, Math.min(1, f32[i]));
          i16[i] = v < 0 ? v * 32768 : v * 32767;
        }
        ws.send(i16.buffer);
      };
      src.connect(processor);
      processor.connect(audioCtx.destination);
      return audioCtx.resume();
    })
    .then(function () {
      recording = true;
      if (micBtn) { micBtn.innerHTML = IC_STOP + ' Stop'; micBtn.classList.add('recording'); }
      setStatus('Recording… click Stop when done', 'rec', '');
    })
    .catch(function (err) { setStatus('Mic error: ' + err.message, 'err', 'err'); });
  }

  function stopRec() {
    recording = false;
    if (processor)   { try { processor.disconnect(); }  catch (_) {} processor = null; }
    if (audioCtx)    { try { audioCtx.close(); }        catch (_) {} audioCtx  = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(function (t) { t.stop(); }); mediaStream = null; }
    origInterim = '';
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'flush' }));
    if (micBtn) { micBtn.innerHTML = IC_MIC + ' Start'; micBtn.classList.remove('recording'); micBtn.disabled = true; }
    setStatus('Processing…', '', '');
    insertTimer = setTimeout(onTranscriptReady, 1500);
  }

  if (micBtn) {
    micBtn.addEventListener('click', function () {
      if (!ws || ws.readyState !== 1) return;
      if (recording) stopRec(); else startRec();
    });
  }

  /* ── Translate ───────────────────────────────────────────────────────── */
  if (transBtn) {
    transBtn.addEventListener('click', function () {
      var text = origFinals.trim();
      if (!text || !ws || ws.readyState !== 1) return;
      var targetLang = langSel ? langSel.value : 'en';
      transBtn.disabled = true;
      transBtn.innerHTML = IC_GLOB + ' …';
      ws.send(JSON.stringify({ type: 'translate', text: text, sourceLang: '', targetLang: targetLang }));
    });
  }

  /* ── WebSocket ───────────────────────────────────────────────────────── */
  setStatus('Connecting…', 'connecting', '');

  try { ws = new WebSocket(WS_URL); } catch (e) { setStatus('Connection error', 'err', 'err'); return; }

  ws.onopen = function () { setStatus('Connecting…', 'connecting', ''); };

  ws.onmessage = function (ev) {
    var msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }

    if (msg.type === 'ready') {
      setStatus('Click Start to record', 'ok', '');
      if (micBtn) micBtn.disabled = false;
      // Show translate group if comments already has text
      if (commentsHasText()) {
        if (transWrap) transWrap.classList.remove('va-hidden');
        refreshTranslateBtn();
      }

    } else if (msg.type === 'transcript') {
      if (msg.isFinal) {
        if (msg.text) origFinals += (origFinals ? ' ' : '') + msg.text;
        origInterim = '';
      } else {
        origInterim = msg.text || '';
      }

    } else if (msg.type === 'translation') {
      if (msg.text) {
        var tgtLabel = langSel ? langSel.options[langSel.selectedIndex].text : 'English';
        appendToComments('[' + tgtLabel + ']\n' + msg.text.trim());
        setStatus('Translation added ✓', 'ok', 'ok');
      }
      if (transBtn) { transBtn.innerHTML = IC_GLOB + ' Translate'; refreshTranslateBtn(); }

    } else if (msg.type === 'error') {
      setStatus('Error: ' + (msg.message || 'unknown'), 'err', 'err');
      if (transBtn) { transBtn.innerHTML = IC_GLOB + ' Translate'; refreshTranslateBtn(); }
    }
  };

  ws.onerror = function () { setStatus('Connection error', 'err', 'err'); };

  ws.onclose = function (ev) {
    if (recording) stopRec();
    var code = ev && ev.code;
    setStatus(code === 4003 ? 'Invalid token' : code === 4001 ? 'Token required' : 'Disconnected', 'err', 'err');
    if (micBtn) micBtn.disabled = true;
  };
})();
